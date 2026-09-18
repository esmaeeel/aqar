import { evaluate, Filters, generalSearchHasRequiredKeywords, keywordMatches, listingKeywordSearchableText, listingLinks, listingMatchesRequestedLocation, locationUrl, parseListing, propertyTypeFromListingUrl, requestedPropertyTypeMatches, searchCategoriesFor } from "@/lib/aqar";
import { reconcileListingAmounts } from "@/lib/listing-amount-reconciliation";
import { isTrialTokenValid } from "@/lib/trial";
import { shouldStopForSourceProtection } from "@/lib/source-protection";
import { applyCommercialOnlyToAqarUrl } from "@/lib/commercial-filter";

export const dynamic = "force-dynamic";

function errorMessage(status: number) {
  if (status === 429) return "أوقف موقع عقار القراءة مؤقتًا بسبب كثرة الطلبات (429). توقف البحث دون تجاوز الحماية.";
  if (status === 401 || status === 403) return `منع موقع عقار القراءة الآلية مؤقتًا (${status}). لن تحاول الأداة تجاوز الحماية.`;
  return `تعذر قراءة موقع عقار (${status}).`;
}
const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const AQAR_TRANSIENT_RETRY_MS = 1_400;
const transientRequestPatternError = (error: unknown) => error instanceof Error
  && /the string did not match the expected pattern/i.test(error.message);

async function fetchAqar(url: string) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await fetch(url, { headers: { "Accept": "text/html,application/xhtml+xml", "Accept-Language": "ar-SA,ar;q=0.9", "User-Agent": "Mozilla/5.0 (compatible; AqarResearchTool/1.0; respectful batch reader)" }, redirect: "follow" });
      if (!response.ok) throw new Error(errorMessage(response.status));
      const html = await response.text();
      if (/captcha|تحقق أنك لست روبوت|سجل الدخول للمتابعة/i.test(html)) throw new Error("طلب موقع عقار تحققًا أو تسجيل دخول؛ توقف الجمع دون تجاوز الحماية.");
      return html;
    } catch (error) {
      if (attempt === 0 && transientRequestPatternError(error)) {
        await pause(AQAR_TRANSIENT_RETRY_MS);
        continue;
      }
      if (transientRequestPatternError(error)) throw new Error("تعذر الاتصال مؤقتًا بمنصة عقار بعد إعادة المحاولة.");
      throw error;
    }
  }
  throw new Error("تعذر الاتصال مؤقتًا بمنصة عقار بعد إعادة المحاولة.");
}

export async function POST(request: Request) {
  try {
    if (!await isTrialTokenValid(request.headers.get("x-aqar-trial-token"), request.headers.get("x-aqar-device-id"))) {
      return Response.json({ error: "ابدأ البحث من الصفحة للحصول على محاولة تجريبية صالحة." }, { status: 403 });
    }
    const body = await request.json() as { filters: Filters & { commercialOnly?: boolean }; city: string; neighborhood?: string; category: string; page: number; remaining: number; excludeListingIds?: string[] };
    const { filters, city, category } = body; const neighborhood = body.neighborhood || "";
    if (!searchCategoriesFor(filters.propertyType, filters.purpose, filters.keywords).includes(category)) return Response.json({ error: "نوع البحث غير صالح." }, { status: 400 });
    if (!filters.commercialOnly && !generalSearchHasRequiredKeywords(filters.propertyType, filters.keywords)) return Response.json({ error: "عند اختيار «عام»، اكتب نوع العقار أو وصفه في «كلمات مطلوبة» أولًا، أو فعّل «تجاري»." }, { status: 400 });
    const sourceUrl = applyCommercialOnlyToAqarUrl(locationUrl(category, city, neighborhood, Math.max(1, Math.min(25, Number(body.page)||1))), Boolean(filters.commercialOnly));
    const searchHtml = await fetchAqar(sourceUrl); const allLinks = listingLinks(searchHtml, category, city, neighborhood, filters.purpose); const excluded = new Set(body.excludeListingIds || []); const links = allLinks.filter(link => !excluded.has(link.listingId)).slice(0, Math.max(1, Math.min(20, Number(body.remaining)||20)));
    const results = []; const warnings: string[] = []; const checkedListingIds: string[] = [];
    for (let i=0;i<links.length;i++) {
      checkedListingIds.push(links[i].listingId);
      try {
        if (i) await pause(350);
        const parsedPropertyType = filters.propertyType === "عام" ? propertyTypeFromListingUrl(links[i].url) : filters.propertyType;
        const listingHtml = await fetchAqar(links[i].url);
        const parsed = reconcileListingAmounts(listingHtml, parseListing(listingHtml, links[i].url, parsedPropertyType));
        const item = evaluate(parsed, filters);
        item.purpose = filters.purpose;
        if (filters.commercialOnly) item.sourceCommercialOnly = true;
        if (!listingMatchesRequestedLocation(item.city, item.neighborhood, city, neighborhood)) {
          continue;
        }
        item.city ||= city; item.neighborhood ||= neighborhood;
        const searchable = listingKeywordSearchableText(item);
        if (!requestedPropertyTypeMatches(filters.propertyType, searchable)) continue;
        if (filters.keywords?.length) {
          const matched = filters.keywords.filter(k => keywordMatches(k, searchable));
          if (!matched.length) continue;
          item.warnings.push(`طابقت كلمات الوصف: ${matched.join("، ")}`);
        }
        if (filters.mode === "strict" ? item.status === "مطابقة" : item.nearEligible) results.push(item);
      } catch (error) {
        const message = error instanceof Error ? error.message : "تعذر قراءة إعلان"; warnings.push(`${links[i].listingId}: ${message}`);
        if (shouldStopForSourceProtection(message)) break;
      }
    }
    return Response.json({ results, discovered: allLinks.length, checkedListingIds, warnings, sourceUrl });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "تعذر إكمال البحث." }, { status: 502 });
  }
}
