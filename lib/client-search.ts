import { evaluate, excludedDetailsUnavailable, excludedKeywordMatches, type Filters, generalSearchHasRequiredKeywords, keywordMatches, listingKeywordSearchableText, listingLinks, listingMatchesRequestedLocation, locationUrl, parseListing, propertyTypeFromListingUrl, requestedPropertyTypeMatches, searchCategoriesFor } from "./aqar";
import { reconcileListingAmounts } from "./listing-amount-reconciliation";
import { shouldStopForSourceProtection } from "./source-protection";
import { applyCommercialOnlyToAqarUrl } from "./commercial-filter";
import { directoryMatchesNeighborhood, directoryPageUrl, discoverNeighborhoodSource, sourceDirectory, SOURCE_UNRESOLVED, type SourceDiscovery, type SourcePage } from "./neighborhood-discovery";

export type ClientSearchPayload = { filters: Filters & { commercialOnly?: boolean }; city: string; neighborhood?: string; category: string; page: number; remaining: number; excludeListingIds?: string[]; sourceDiscovery?: SourceDiscovery; sourceBaseUrl?: string };

const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function readSourcePage(url: string, trialToken: string, deviceId: string): Promise<SourcePage> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await fetch("/api/source-page", { method: "POST", headers: { "content-type": "application/json", "x-aqar-device-id": deviceId, "x-aqar-trial-token": trialToken }, body: JSON.stringify({ url }) });
      if (!response.ok) {
        const body = await response.text();
        try { throw new Error((JSON.parse(body) as { error?: string }).error || `تعذر قراءة موقع عقار (${response.status}).`); }
        catch (error) { if (error instanceof SyntaxError) throw new Error(/Error 1102|Worker exceeded resource limits/i.test(body) ? "تجاوز خادم البحث حد موارد Cloudflare؛ توقف البحث قبل اكتماله." : `تعذر قراءة رد خادم البحث (${response.status}).`); throw error; }
      }
      const html = await response.text();
      if (/captcha|تحقق أنك لست روبوت|سجل الدخول للمتابعة/i.test(html)) throw new Error("طلب موقع عقار تحققًا أو تسجيل دخول؛ توقف الجمع دون تجاوز الحماية.");
      return { html, url: decodeURIComponent(response.headers.get("x-aqar-final-url") || encodeURIComponent(url)) };
    } catch (error) {
      if (error instanceof Error && /the string did not match the expected pattern/i.test(error.message)) {
        if (attempt === 0) { await pause(1_400); continue; }
        throw new Error("تعذر اتصال المتصفح بخادم البحث بعد إعادة المحاولة.");
      }
      throw error;
    }
  }
  throw new Error("تعذر اتصال المتصفح بخادم البحث بعد إعادة المحاولة.");
}

// The browser processes the public HTML only after a Worker hits its CPU limit.
// Every source request still uses the same server-validated trial token.
export async function clientSearchPage(body: ClientSearchPayload, trialToken: string, deviceId: string) {
  const { filters, category } = body;
  const city = (body.city || "").trim(), neighborhood = city ? body.neighborhood || "" : "";
  if (!searchCategoriesFor(filters.propertyType, filters.purpose, filters.keywords).includes(category)
    || !filters.commercialOnly && !generalSearchHasRequiredKeywords(filters.propertyType, filters.keywords)) {
    return { response: Response.json({ error: "نوع البحث غير صالح." }, { status: 400 }), data: { error: "نوع البحث غير صالح." } };
  }
  const scope = { category, city, neighborhood, purpose: filters.purpose };
  const readPage = (url: string) => readSourcePage(url, trialToken, deviceId);
  try {
    let sourceBaseUrl = body.sourceBaseUrl ? sourceDirectory(body.sourceBaseUrl, scope) ?? undefined : undefined;
    if (sourceBaseUrl && !decodeURI(sourceBaseUrl).split("/").at(-1)?.startsWith("حي-")) sourceBaseUrl = undefined;
    if (city && neighborhood && !sourceBaseUrl) {
      const discovery = await discoverNeighborhoodSource(scope, readPage, body.sourceDiscovery);
      if (discovery.sourceDiscovery) return { response: Response.json(discovery), data: discovery };
      sourceBaseUrl = discovery.sourceBaseUrl;
    }
    const sourceUrl = applyCommercialOnlyToAqarUrl(sourceBaseUrl ? directoryPageUrl(sourceBaseUrl, body.page) : locationUrl(category, city, neighborhood, body.page), Boolean(filters.commercialOnly));
    const sourcePage = await readPage(sourceUrl);
    const allLinks = listingLinks(sourcePage.html, category, city, neighborhood, filters.purpose);
    const excluded = new Set(body.excludeListingIds || []);
    const candidates = allLinks.filter(link => !excluded.has(link.listingId));
    const links = candidates.slice(0, Math.max(1, Math.min(3, Number(body.remaining) || 3)));
    if (sourceBaseUrl && !allLinks.length) {
      const actual = new URL(sourcePage.url); actual.search = ""; actual.pathname = actual.pathname.replace(/\/\d+\/?$/, "");
      if (sourceDirectory(actual.href, scope) !== sourceBaseUrl) throw new Error(SOURCE_UNRESOLVED);
    }
    const results = []; const warnings: string[] = []; const checkedListingIds: string[] = [];
    for (let i = 0; i < links.length; i++) {
      checkedListingIds.push(links[i].listingId);
      try {
        if (i) await pause(350);
        const parsedPropertyType = filters.propertyType === "عام" ? propertyTypeFromListingUrl(links[i].url) : filters.propertyType;
        const listingHtml = (await readPage(links[i].url)).html;
        const parsed = reconcileListingAmounts(listingHtml, parseListing(listingHtml, links[i].url, parsedPropertyType));
        const item = evaluate(parsed, filters);
        item.purpose = filters.purpose;
        if (filters.commercialOnly) item.sourceCommercialOnly = true;
        if ((sourceBaseUrl && !directoryMatchesNeighborhood(sourceBaseUrl, scope) && !item.neighborhood)
          || !listingMatchesRequestedLocation(item.city, item.neighborhood, city, neighborhood)) continue;
        item.city ||= city; item.neighborhood ||= neighborhood;
        const searchable = listingKeywordSearchableText(item);
        if (!requestedPropertyTypeMatches(filters.propertyType, searchable)) continue;
        if (filters.keywords?.length) {
          const matched = filters.keywords.filter(keyword => keywordMatches(keyword, searchable));
          if (!matched.length) continue;
          item.warnings.push(`طابقت كلمات الوصف: ${matched.join("، ")}`);
        }
        if (excludedKeywordMatches(filters.excludedKeywords, item) || excludedDetailsUnavailable(filters.excludedKeywords, item)) continue;
        if (filters.mode === "strict" ? item.status === "مطابقة" : item.nearEligible) results.push(item);
      } catch (error) {
        const message = error instanceof Error ? error.message : "تعذر قراءة إعلان";
        warnings.push(`${links[i].listingId}: ${message}`);
        if (shouldStopForSourceProtection(message)) break;
      }
    }
    const data = { results, discovered: allLinks.length, checkedListingIds, hasMore: candidates.length > links.length, warnings, sourceUrl, sourceBaseUrl };
    return { response: Response.json(data), data };
  } catch (error) {
    const message = error instanceof Error ? error.message : "تعذر إكمال البحث.";
    const data = { error: message, ...(message === SOURCE_UNRESOLVED ? { code: "SOURCE_UNRESOLVED" } : {}) };
    return { response: Response.json(data, { status: 502 }), data };
  }
}
