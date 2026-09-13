import type { Listing } from "@/lib/aqar";

const ARABIC_DIGITS = "٠١٢٣٤٥٦٧٨٩";

function normalizeDigits(value: string) {
  return value
    .replace(/[٠-٩]/g, digit => String(ARABIC_DIGITS.indexOf(digit)))
    .replace(/[٬،]/g, ",")
    .replace(/٫/g, ".");
}

function visibleListingText(html: string) {
  const heading = html.search(/<h1\b/i);
  const listingHtml = heading >= 0 ? html.slice(heading) : html;
  return normalizeDigits(
    listingHtml
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
      .replace(/<br\s*\/?\s*>/gi, "\n")
      .replace(/<\/(?:p|div|li|h\d)>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;|&#160;/gi, " ")
      .replace(/&amp;/gi, "&")
      .replace(/&quot;/gi, '"')
      .replace(/&#39;|&apos;/gi, "'")
      .split("إعلانات مشابهة", 1)[0],
  )
    .replace(/[\t\r ]+/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .trim();
}

function splitListingText(text: string) {
  const marker = text.search(/\n\s*(?:المزيد\s*\n\s*)?تفاصيل\s+الإعلان/);
  const before = marker >= 0 ? text.slice(0, marker) : text;
  const structured = marker >= 0 ? text.slice(marker) : "";
  const finance = [...before.matchAll(/استكشف\s+خيارات\s+التمويل|استأجر\s+الآن/g)].at(-1);
  const financeEnd = finance?.index == null ? -1 : finance.index + finance[0].length;
  return {
    description: financeEnd >= 0 ? before.slice(financeEnd).trim() : before.trim(),
    structured,
  };
}

function parseNumber(raw?: string | null) {
  if (!raw) return null;
  const cleaned = normalizeDigits(raw)
    .replace(/\s/g, "")
    .replace(/(?<=\d)\.(?=\d{3}(?:\D|$))/g, "")
    .replace(/,/g, "");
  const value = Number(cleaned);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function firstArea(source: string) {
  if (!source) return null;
  const number = `([\\d][\\d,.]*)`;
  const strongLabels = [
    `المساحة\\s+حسب\\s+الصك`,
    `مساحة\\s+الأرض`,
    `مساحة\\s+الارض`,
    `مساحة\\s+العقار`,
    `(?:إجمالي|اجمالي)\\s+مساحة\\s+(?:العقار|الأرض|الارض)`,
    `المساحة\\s+(?:الإجمالية|الاجمالية)(?:\\s+(?:للعقار|للأرض|للارض))?`,
  ];
  const ordinaryLabels = [
    `بمساح(?:ة|ه)`,
    `المساح(?:ة|ه)`,
    `مساحت(?:ها|ه)`,
    `مساح(?:ة|ه)`,
  ];
  const read = (labels: string[]) => {
    for (const label of labels) {
      const dimensions = source.match(new RegExp(`(?:${label})(?![ء-يA-Za-z0-9_])[^\\d\\n]{0,18}${number}\\s*(?:[xX×*]|في)\\s*${number}`, "i"));
      if (dimensions) {
        const width = parseNumber(dimensions[1]), depth = parseNumber(dimensions[2]);
        if (width != null && depth != null) return width * depth;
      }
      const match = source.match(new RegExp(`(?:${label})(?![ء-يA-Za-z0-9_])[^\\d\\n]{0,18}${number}`, "i"));
      const value = parseNumber(match?.[1]);
      if (value != null) return value;
    }
    return null;
  };
  return read(strongLabels) ?? read(ordinaryLabels);
}

function structuredArea(source: string) {
  const explicit = firstArea(source);
  if (explicit != null) return explicit;
  const field = source.match(/(?:^|\n)\s*المساحة\s*[:：\-–—]?\s*(?:\n\s*)?([\d][\d,.]*)\s*(?:م(?:²|2)|متر(?:اً|ا)?\s+مربع)?(?=\s*(?:\n|$))/i);
  return parseNumber(field?.[1]);
}

function explicitUnitPrice(source: string) {
  if (!source) return null;
  const number = `([\\d][\\d,.]*)`;
  const currency = `(?:ر\\.?\\s*س\\.?|ريال|﷼|SAR|§)`;
  const patterns = [
    `(?:سعر\\s*(?:ال)?متر(?:\\s+(?:المربع|مربع))?|سعر\\s+المتر\\s*(?:م(?:²|2))?)[^\\d\\n]{0,18}${number}`,
    `${number}\\s*${currency}\\s*(?:\\/\\s*)?(?:م(?:²|2)|متر(?:\\s+مربع)?)(?!\\s*(?:مساحة|عرض|طول))`,
    `${number}\\s*(?:${currency})?\\s*(?:للمتر|لكل\\s+متر)(?:\\s+مربع)?`,
    `${number}\\s*(?:${currency})?\\s*\\/\\s*(?:م(?:²|2)|متر(?:\\s+مربع)?)`,
  ];
  for (const pattern of patterns) {
    const match = source.match(new RegExp(pattern, "i"));
    const value = parseNumber(match?.[1]);
    if (value != null) return value;
  }
  return null;
}

function hasExplicitTotalPrice(source: string) {
  if (!source) return false;
  const labels = `السعر\\s+المطلوب|سعر\\s+البيع|قيمة\\s+العقار|المطلوب|السعر`;
  const matches = [...source.matchAll(new RegExp(`(?:${labels})[^\\d\\n]{0,18}(?:[\\d]|مليون|ألف|الف)`, "gi"))];
  return matches.some(match => {
    const start = match.index ?? 0;
    const lineEnd = source.indexOf("\n", start);
    const context = source.slice(start, lineEnd < 0 ? Math.min(source.length, start + 100) : lineEnd);
    return !/(?:سعر\s*(?:ال)?متر|للمتر|لكل\s+متر|\/\s*(?:م|متر))/i.test(context);
  });
}

function deedArea(source: string) {
  const match = source.match(/المساحة\s+حسب\s+الصك[^\d\n]{0,18}([\d][\d,.]*)/i);
  return parseNumber(match?.[1]);
}

type SchemaAmounts = { price: number | null; area: number | null };

function schemaListingAmounts(html: string, listingId: string): SchemaAmounts | null {
  const scripts = [...html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  for (const script of scripts) {
    try {
      const value = JSON.parse(script[1].replace(/&quot;/gi, '"').replace(/&amp;/gi, "&"));
      const roots = Array.isArray(value) ? value : [value];
      for (const root of roots) {
        if (!root || typeof root !== "object") continue;
        const types = Array.isArray(root["@type"]) ? root["@type"] : [root["@type"]];
        if (!types.some((type: unknown) => type === "RealEstateListing" || type === "Product")) continue;
        const identity = `${root.url ?? ""} ${root["@id"] ?? ""}`;
        if (listingId && !identity.includes(listingId)) continue;
        const offer = Array.isArray(root.offers) ? root.offers[0] : root.offers;
        const offered = offer?.itemOffered ?? root.itemOffered ?? root;
        const floorSize = offered?.floorSize ?? root.floorSize;
        const price = parseNumber(String(offer?.price ?? offer?.priceSpecification?.price ?? ""));
        const area = parseNumber(String(floorSize?.value ?? offered?.area ?? ""));
        if (price != null || area != null) return { price, area };
      }
    } catch {
      // بيانات JSON-LD اختيارية؛ تبقى القيم المرئية هي البديل الآمن عند فسادها.
    }
  }
  return null;
}

function nearlyEqual(a: number, b: number, tolerance = .02) {
  if (a <= 0 || b <= 0) return a === b;
  return Math.abs(a - b) / Math.max(a, b) <= tolerance;
}

function isAbbreviatedVersion(value: number | null, reference: number | null) {
  if (value == null || reference == null || value >= 10_000 || reference < 10_000) return false;
  return nearlyEqual(value * 1_000, reference, .02) || nearlyEqual(value * 1_000_000, reference, .02);
}

function areaConsistentWithPrice(candidates: Array<number | null>, totalPrice: number, unitPrice: number) {
  const areas = [...new Set(candidates.filter((value): value is number => value != null && value > 0))];
  if (!areas.length) return null;
  const best = areas.reduce((current, area) =>
    Math.abs(area * unitPrice - totalPrice) < Math.abs(current * unitPrice - totalPrice) ? area : current);
  return Math.abs(best * unitPrice - totalPrice) / totalPrice <= .05 ? best : null;
}

function pushWarning(item: Listing, warning: string) {
  if (!item.warnings.includes(warning)) item.warnings.push(warning);
}

/**
 * Reconciles price, price-per-square-metre and land area from explicit labels in
 * the listing page. This is deliberately listing-agnostic: no ad IDs or values
 * are special-cased. Explicit semantic labels outrank arithmetic guesses.
 */
export function reconcileListingAmounts(html: string, item: Listing) {
  const text = visibleListingText(html);
  const { description, structured } = splitListingText(text);

  const describedArea = firstArea(description);
  const detailsArea = structuredArea(structured);
  const oldArea = item.area;
  const schema = schemaListingAmounts(html, item.listingId);
  const unitPrice = explicitUnitPrice(description) ?? explicitUnitPrice(structured) ?? explicitUnitPrice(text);
  const priceWasDerived = item.warnings.includes("حُسب السعر الإجمالي من سعر المتر الصريح والمساحة");
  const priceWasUnitPrice = unitPrice != null && item.price != null && nearlyEqual(item.price, unitPrice);
  const descriptionHasTotalPrice = hasExplicitTotalPrice(description);
  const descriptionPriceIsAbbreviated = isAbbreviatedVersion(item.price, schema?.price ?? null);
  const trustedPrice = descriptionHasTotalPrice && !descriptionPriceIsAbbreviated && !priceWasDerived && !priceWasUnitPrice
    ? item.price
    : schema?.price ?? (priceWasDerived || priceWasUnitPrice ? null : item.price);
  const checkedArea = trustedPrice != null && unitPrice != null
    ? areaConsistentWithPrice([deedArea(description), schema?.area ?? null, describedArea, detailsArea, oldArea], trustedPrice, unitPrice)
    : null;
  const explicitArea = checkedArea ?? deedArea(description) ?? schema?.area ?? describedArea ?? detailsArea ?? oldArea;
  const areaChanged = explicitArea != null && (oldArea == null || !nearlyEqual(explicitArea, oldArea, .001));
  if (explicitArea != null) item.area = explicitArea;
  item.price = trustedPrice;

  if (unitPrice != null) {
    if (item.price == null && item.area != null) {
      item.price = unitPrice * item.area;
      pushWarning(item, "حُسب السعر الإجمالي من سعر المتر الصريح والمساحة");
    }
    if (item.price != null && item.area != null && !nearlyEqual(item.price, unitPrice * item.area, .05)) {
      item.sqmPrice = item.price / item.area;
      pushWarning(item, "سعر المتر المصرح به لا يتفق مع السعر الإجمالي والمساحة؛ حُسب سعر المتر من القيمتين المتفقتين");
    } else item.sqmPrice = unitPrice;
  } else if (item.price != null && item.area != null) {
    item.sqmPrice = item.price / item.area;
  }

  if (areaChanged) {
    pushWarning(item, "اعتمدت المساحة المصرح بها صراحة بدل رقم مساحة جانبي في الإعلان");
    if (unitPrice == null && item.price != null && item.area != null) item.sqmPrice = item.price / item.area;
  }

  if (schema?.price != null && item.price != null && nearlyEqual(schema.price, item.price, .02))
    item.warnings = item.warnings.filter(warning => !warning.startsWith("السعر مختلف بين وصف المعلن والقائمة"));

  return item;
}
