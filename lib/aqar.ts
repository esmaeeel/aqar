import { canonicalCity, neighborhoodsMatch } from "@/lib/locations";

export const AQAR_ORIGIN = "https://sa.aqar.fm";
const NEAR_TOLERANCE = 0.20;
export const ROOM_TYPES = new Set(["فيلا", "شقة", "دور"]);
export const CATEGORIES: Record<string, Record<string, string[]>> = {
  "عمارة": { sale: ["عمائر-للبيع"], rent: ["عمائر-للإيجار"] },
  "فيلا": { sale: ["فلل-للبيع"], rent: ["فلل-للإيجار"] },
  "شقة": { sale: ["شقق-للبيع"], rent: ["شقق-للإيجار"] },
  "دور": { sale: ["دور-للبيع"], rent: ["دور-للإيجار"] },
  "أرض": { sale: ["أراضي-للبيع"], rent: ["أراضي-للإيجار"] },
  "ورشة": {
    sale: ["ورش-للبيع", "مستودعات-للبيع", "محلات-للبيع", "أراضي-للبيع"],
    rent: ["ورش-للإيجار", "مستودع-للإيجار", "محلات-للإيجار", "أراضي-للإيجار"],
  },
};

export type Location = { city: string; neighborhoods: string[] };
export type Filters = {
  propertyType: string; purpose: "sale" | "rent"; locations: Location[];
  keywords: string[]; mode: "strict" | "near"; maxPages: number; maxListings: number;
  priceMin: number; priceMax: number; yieldMin: number; minMeters: number;
  minCount: number; minFloors: number; minStreet: number; areaMin: number;
  areaMax: number; minDensity: number; sqmMin: number; sqmMax: number;
};

export type Listing = {
  listingId: string; url: string; title: string; city: string; neighborhood: string;
  propertyType: string; price: number | null; area: number | null; sqmPrice: number | null;
  apartments: number | null; housingUnits: number | null; commercialShops: number | null; rooms: number | null; totalRooms: number | null; bedrooms: number | null;
  majlis: number; maqlat: number; meters: number | null; floors: number | null;
  street: number | null; age: string | null; income: number | null;
  incomeKind: "actual" | "expected" | "unknown"; yieldPct: number | null;
  density: number | null; warnings: string[]; status: "مطابقة" | "قريبة" | "بيانات ناقصة";
  score: number; nearEligible: boolean; description: string;
};

const arDigits = "٠١٢٣٤٥٦٧٨٩";
export function normalizeDigits(value: string) {
  return value.replace(/[٠-٩]/g, d => String(arDigits.indexOf(d))).replace(/[٬،]/g, ",").replace(/٫/g, ".");
}
export function normalizeText(value: string) {
  return normalizeDigits(value).toLowerCase().replace(/ـ/g, "").replace(/[\u064b-\u065f\u0670]/g, "")
    .replace(/[أإآ]/g, "ا").replace(/ى/g, "ي").replace(/\s+/g, " ").trim();
}
function stripClitic(token: string) {
  for (const p of ["ولل", "فلل", "وال", "فال", "بال", "كال", "لل", "ال"])
    if (token.startsWith(p) && token.length - p.length >= 3) return token.slice(p.length);
  return token;
}
export function keywordMatches(keyword: string, description: string) {
  const k = normalizeText(keyword), d = normalizeText(description);
  if (!k) return false;
  if (d.includes(k)) return true;
  const kt = (k.match(/[\p{L}\p{N}]+/gu) || []).map(stripClitic);
  const dt = (d.match(/[\p{L}\p{N}]+/gu) || []).map(stripClitic);
  return kt.length > 0 && dt.some((_, i) => kt.every((v, j) => dt[i + j] === v));
}
function htmlText(html: string) {
  return normalizeColloquialAmounts(normalizeDigits(html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ").replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/<\/(?:p|div|li|h\d)>/gi, "\n").replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ").replace(/&amp;/gi, "&").replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'"))).replace(/[\t\r ]+/g, " ").replace(/\n\s*\n+/g, "\n").trim();
}
const arabicSmallNumbers: Record<string, number> = {
  "صفر": 0,
  "واحد": 1, "واحده": 1, "احد": 1, "احدي": 1,
  "اثنان": 2, "اثنين": 2, "اثنا": 2, "اثني": 2,
  "اثنتان": 2, "اثنتين": 2, "اثنتا": 2, "اثنتي": 2,
  "ثلاث": 3, "ثلاثه": 3,
  "اربع": 4, "اربعه": 4,
  "خمس": 5, "خمسه": 5,
  "ست": 6, "سته": 6,
  "سبع": 7, "سبعه": 7,
  "ثمان": 8, "ثماني": 8, "ثمانيه": 8,
  "تسع": 9, "تسعه": 9,
  "عشر": 10, "عشره": 10,
  "عشرون": 20, "عشرين": 20,
  "ثلاثون": 30, "ثلاثين": 30,
  "اربعون": 40, "اربعين": 40,
  "خمسون": 50, "خمسين": 50,
  "ستون": 60, "ستين": 60,
  "سبعون": 70, "سبعين": 70,
  "ثمانون": 80, "ثمانين": 80,
  "تسعون": 90, "تسعين": 90,
};
const arabicHundredWords = new Set(["مئه", "مائه", "مائة"]);
const arabicDirectHundreds: Record<string, number> = {
  "مئتان": 200, "مئتين": 200, "مئتا": 200, "مئتي": 200,
  "مائتان": 200, "مائتين": 200, "مائتا": 200, "مائتي": 200,
};
for (const [word, amount] of [["ثلاث", 300], ["اربع", 400], ["خمس", 500], ["ست", 600], ["سبع", 700], ["ثمان", 800], ["تسع", 900]] as const)
  for (const suffix of ["مئه", "مائه", "مائة"]) arabicDirectHundreds[`${word}${suffix}`] = amount;
const arabicMillionForms: Record<string, number> = { "مليون": 1, "مليونان": 2, "مليونين": 2, "مليونا": 2, "مليوني": 2 };
const arabicMillionPlurals = new Set(["ملايين"]);
const arabicThousandForms: Record<string, number> = { "الف": 1, "الفان": 2, "الفين": 2, "الفا": 2, "الفي": 2 };
const arabicThousandPlurals = new Set(["الاف"]);
const arabicAmountWords = new Set([
  ...Object.keys(arabicSmallNumbers), ...arabicHundredWords, ...Object.keys(arabicDirectHundreds),
  ...Object.keys(arabicMillionForms), ...arabicMillionPlurals,
  ...Object.keys(arabicThousandForms), ...arabicThousandPlurals,
]);
const amountWordSpellingPattern = (word: string) => word
  .replaceAll("ا", "[اأإآ]").replaceAll("ي", "[يى]").replaceAll("ه", "[هة]");
const arabicAmountWordPattern = [...arabicAmountWords]
  .sort((a, b) => b.length - a.length).map(amountWordSpellingPattern).join("|");
const arabicWordAmountRe = new RegExp(
  `(?<![\\p{L}\\p{N}_])((?:و?(?:${arabicAmountWordPattern}))(?:[^\\S\\n]+و?(?:${arabicAmountWordPattern})){0,11})(?![\\p{L}\\p{N}_])`,
  "giu",
);
function normalizeColloquialAmounts(value: string) {
  value = value.replace(/(\d[\d,.]*)\s*\u0648\s*(?:\u0646\u0635|\u0646\u0635\u0641)\s*(\u0645\u0644\u064a\u0648\u0646|\u0627\u0644\u0641|\u0623\u0644\u0641)/gi, (_, raw: string, unit: string) => {
    const base = Number(raw.replace(/,/g, ""));
    return `${base + 0.5} ${unit}`;
  });
  const normalizeToken = (raw: string) => {
    const token = normalizeText(raw).replaceAll("ة", "ه");
    if (arabicAmountWords.has(token)) return token;
    if (token.startsWith("و") && arabicAmountWords.has(token.slice(1))) return token.slice(1);
    return null;
  };
  const parseWordAmount = (phrase: string) => {
    const tokens = phrase.split(/\s+/).map(normalizeToken);
    if (tokens.length < 2 || tokens.some(token => token == null)) return null;
    let total = 0, group = 0, sawScale = false;
    for (const token of tokens as string[]) {
      if (token in arabicSmallNumbers) group += arabicSmallNumbers[token];
      else if (arabicHundredWords.has(token)) group = group > 0 && group < 10 ? group * 100 : group + 100;
      else if (token in arabicDirectHundreds) group += arabicDirectHundreds[token];
      else if (token in arabicMillionForms) {
        total += (group || arabicMillionForms[token]) * 1_000_000;
        group = 0; sawScale = true;
      } else if (arabicMillionPlurals.has(token)) {
        if (!group) return null;
        total += group * 1_000_000;
        group = 0; sawScale = true;
      } else if (token in arabicThousandForms) {
        total += (group || arabicThousandForms[token]) * 1_000;
        group = 0; sawScale = true;
      } else if (arabicThousandPlurals.has(token)) {
        if (!group) return null;
        total += group * 1_000;
        group = 0; sawScale = true;
      }
    }
    return sawScale ? total + group : null;
  };
  return value.replace(arabicWordAmountRe, phrase => {
    const parsed = parseWordAmount(phrase);
    return parsed == null ? phrase : String(parsed);
  });
}
function parseAmount(raw?: string | null, unit = "") {
  if (!raw) return null;
  const n = normalizeText(raw);
  if (n === "مليون") return 1_000_000;
  if (n === "مليونين" || n === "مليونان") return 2_000_000;
  if (n === "الف") return 1_000;
  const cleaned = normalizeDigits(raw).replace(/\s/g, "").replace(/(?<=\d)\.(?=\d{3}(?:\D|$))/g, "").replace(/,/g, "");
  let value = Number(cleaned);
  if (!Number.isFinite(value)) return null;
  const u = normalizeText(`${unit} ${raw}`);
  if (u.includes("مليون") && value < 100000) value *= 1_000_000;
  else if (u.includes("الف") && value < 100000) value *= 1_000;
  return value;
}
const amount = `([\\d][\\d,.]*|(?:مليون(?:ين|ان)?|الف|ألف)(?!\\w))[^\\S\\n]*(مليون(?:ين|ان)?|الف|ألف)?(?:[^\\d\\n]{0,8}و[^\\d\\n]{0,8}([\\d][\\d,.]*)[^\\S\\n]*(مليون(?:ين|ان)?|الف|ألف)?)?`;
const gap = `[^\\d\\n]{0,40}?(?:\\n[^\\d\\n]{0,24}?)?`;
function matchedAmount(m: RegExpMatchArray) {
  const firstScale = m[2] || "", secondScale = m[4] || "";
  const a = parseAmount(m[1], firstScale);
  let b = m[3] ? parseAmount(m[3], secondScale) : null;
  const firstHasMillionScale = normalizeText(`${m[1]} ${firstScale}`).includes("مليون");
  if (firstHasMillionScale && !secondScale && b != null && b < 1000) b *= 1000;
  return a == null ? null : a + (b || 0);
}
function labeled(labels: string) { return `(?:${labels})${gap}${amount}`; }
function first(text: string, patterns: string[]) {
  for (const p of patterns) { const m = text.match(new RegExp(p, "i")); if (m) return { value: matchedAmount(m), index: m.index || 0, raw: m[0], source: text }; }
  return { value: null as number | null, index: -1, raw: "", source: text };
}
function preferred(desc: string, structured: string, patterns: string[]) {
  const a = first(desc, patterns); return a.value != null ? a : first(structured, patterns);
}
function allAmounts(text: string, pattern: string, excludePercentages = false) {
  const values: number[] = []; const re = new RegExp(pattern, "gi"); let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (excludePercentages && /^\s*(?:[%٪]|بالمئ(?:ة|ه))/.test(text.slice(re.lastIndex))) continue;
    const v = matchedAmount(m); if (v && v > 0) values.push(v);
  }
  return values;
}
function incomeAmountContext(text: string, start: number, end: number) {
  const lineStart = text.lastIndexOf("\n", start - 1) + 1, nextLine = text.indexOf("\n", end), lineEnd = nextLine < 0 ? text.length : nextLine;
  const before = normalizeText(text.slice(lineStart, start)), after = normalizeText(text.slice(end, lineEnd));
  const incomeLabels = `مؤجر(?:ه)?|ال?ايجار|الدخل|المدخول|مدخول|ريع`;
  const priceLabels = `السعر(?:\\s+المطلوب)?|سعر\\s+البيع|المطلوب|الحد`;
  const lastEnd = (pattern: string) => [...before.matchAll(new RegExp(pattern, "g"))].at(-1)?.index ?? -1;
  if (lastEnd(incomeLabels) > lastEnd(priceLabels)) return true;
  return new RegExp(`^(?:\\s*(?:ر\\.?\\s*س\\.?|ريال|﷼|sar|§))?\\s*(?:${incomeLabels})\\b`, "i").test(after);
}
function unitPriceContext(text: string, start: number) {
  return /(?:سعر\s*(?:المتر|متر)|سعر\s*المتر\s*المربع)[^\d\n]{0,20}$/i.test(text.slice(Math.max(0, start - 50), start));
}
function headerCurrencyAmounts(text: string) {
  const currency = `(?:ر\\.?\\s*س\\.?|ريال|﷼|SAR|§)`, candidates: { index: number; value: number }[] = [];
  for (const pattern of [`${amount}\\s*${currency}`, `${currency}\\s*${amount}`]) {
    const re = new RegExp(pattern, "gi"); let match: RegExpExecArray | null;
    while ((match = re.exec(text))) {
      if (unitPriceContext(text, match.index) || incomeAmountContext(text, match.index, re.lastIndex)) continue;
      const value = matchedAmount(match); if (value && value > 0) candidates.push({ index: match.index, value });
    }
  }
  return candidates.sort((a, b) => a.index - b.index).map(candidate => candidate.value);
}
function splitDescription(text: string) {
  const marker = text.search(/\n\s*(?:المزيد\s*\n\s*)?تفاصيل\s+الإعلان/);
  const before = marker >= 0 ? text.slice(0, marker) : text;
  const structured = marker >= 0 ? text.slice(marker) : "";
  const finance = [...before.matchAll(/استكشف\s+خيارات\s+التمويل/g)];
  return { desc: finance.length ? before.slice((finance.at(-1)?.index || 0) + finance.at(-1)![0].length).trim() : before.trim(), structured };
}
function countNamed(text: string, word: "مجلس" | "مقلط") {
  const n = normalizeText(text); const numeric = [...n.matchAll(new RegExp(`([\\d][\\d,.]*)\\s*(?:ال)?${word}`, "g"))].map(m => Number(m[1].replace(/,/g, "")));
  if (numeric.length) return Math.max(...numeric);
  if (new RegExp(`${word}(?:ين|ان)`).test(n)) return 2;
  if (word === "مجلس") { const types = new Set([...n.matchAll(/مجلس\s+(رجال|نساء|خارجي|داخلي)/g)].map(m => m[1])); if (types.size) return types.size; return /مجلس|مجالس/.test(n) ? 1 : 0; }
  return /مقلط|مقالط/.test(n) ? 1 : 0;
}
function roomCounts(source: string) {
  const patterns = [labeled(`عدد\\s+غرف\\s+النوم|عدد\\s+الغرف(?:\\s+النوم)?|غرف\\s+النوم`), `([\\d,.]+)\\s*(?:غرف(?:ة)?(?:\\s+نوم)?|غرفة\\s+نوم)(?!\\w)`];
  let bedrooms = first(source, patterns).value;
  if (bedrooms == null) { const n = normalizeText(source); if (/غرفت(?:ين|ان)/.test(n)) bedrooms = 2; else if (/غرفة\s+(?:نوم|ماستر)/.test(n)) bedrooms = 1; }
  const majlis = countNamed(source, "مجلس"), maqlat = countNamed(source, "مقلط");
  return { rooms: bedrooms == null ? null : bedrooms + majlis + maqlat, bedrooms, majlis, maqlat };
}
function totalBuildingRooms(source: string) {
  return first(source, [
    labeled(`(?:إجمالي|اجمالي|الإجمالي|الاجمالي|مجموع)\\s+(?:عدد\\s+)?الغرف`),
    labeled(`عدد\\s+الغرف\\s+(?:الإجمالي|الاجمالي|الكلي)`),
    `([\\d,.]+)\\s*(?:غرفة|غرف)\\s*(?:إجمالاً|اجمالا|بالمجموع)`,
  ]).value;
}
function ageFromSource(source: string) {
  const n = normalizeText(source), labels = `عمر\\s*(?:العقار|العمارة|العماره|الفيلا|الشقة|الشقه|الدور|الورشة|الورشه)|عمرها|عمره|العمر`;
  const m = n.match(new RegExp(`(?:${labels})${gap}([\\d][\\d,.]*)`, "i"));
  if (m) { const years = Number(m[1].replace(/,/g, "")); return { years, label: /اكثر\s+من|فوق/.test(m[0]) ? `أكثر من ${years} سنوات` : `${years} سنة` }; }
  if (new RegExp(`(?:${labels})${gap}(?:جديد|جديدة)`).test(n)) return { years: 0, label: "جديد" };
  return { years: null as number | null, label: null as string | null };
}
function conflicts(values: number[], tolerance = .02) {
  if (values.length <= 1 || Math.min(...values) === Math.max(...values)) return false;
  if (tolerance <= 0 || Math.min(...values) <= 0) return true;
  return (Math.max(...values) - Math.min(...values)) / Math.min(...values) > tolerance;
}
function expandAbbreviatedAmount(value: number | undefined, reference: number | undefined) {
  if (value == null || reference == null || value >= 10_000 || reference < 100_000) return value;
  return [value * 1_000, value * 1_000_000].sort((a, b) => Math.abs(a - reference) - Math.abs(b - reference))[0];
}

export function locationUrl(category: string, city: string, neighborhood: string, page: number) {
  const parts = [category, city.trim().replace(/\s+/g, "-")];
  const hood = neighborhood.trim().replace(/^حي[\s-]+/, ""); if (hood) parts.push(`حي-${hood.replace(/\s+/g, "-")}`); if (page > 1) parts.push(String(page));
  return `${AQAR_ORIGIN}/${parts.map(encodeURIComponent).join("/")}`;
}
function normalizedLocation(value: string, neighborhood = false) {
  let result = normalizeText(value).replace(/ة/g, "ه").replace(/[ؤئ]/g, "ء").replace(/ء$/g, "")
    .replace(/-/g, " ").replace(/\s+/g, " ").trim();
  if (neighborhood) result = result.replace(/^حي\s+/, "");
  return result;
}
export function listingMatchesRequestedLocation(parsedCity: string, parsedNeighborhood: string, city: string, neighborhood = "") {
  const requestedCity = canonicalCity(city);
  if (parsedCity && canonicalCity(parsedCity) !== requestedCity) return false;
  return !(neighborhood && parsedNeighborhood && !neighborhoodsMatch(requestedCity, parsedNeighborhood, neighborhood));
}
function linkInRequestedLocation(url: string, category: string, city: string, neighborhood = "") {
  let parts: string[];
  try { parts = new URL(url).pathname.split("/").filter(Boolean).map(decodeURIComponent); } catch { return false; }
  const index = parts.findIndex(part => normalizedLocation(part) === normalizedLocation(category));
  if (index < 0 || normalizedLocation(parts[index + 1] || "") !== normalizedLocation(city)) return false;
  return !neighborhood || parts.slice(index + 2).some(part => neighborhoodsMatch(city, part, neighborhood));
}
export function listingLinks(html: string, category: string, city: string, neighborhood = "") {
  const out = new Map<string, string>(); const decoded = html.replace(/&amp;/g, "&");
  const escaped = category.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); const re = new RegExp(`href=["']([^"']*\\/${escaped}\\/[^"'#?]+-(\\d{5,})(?:\\/${escaped})?)["']`, "gi"); let m;
  while ((m = re.exec(decoded))) { const url = m[1].startsWith("http") ? m[1] : `${AQAR_ORIGIN}${m[1].startsWith("/") ? "" : "/"}${m[1]}`; if (linkInRequestedLocation(url, category, city, neighborhood)) out.set(m[2], encodeURI(url)); }
  return [...out.entries()].map(([listingId, url]) => ({ listingId, url }));
}

export function parseListing(html: string, url: string, propertyType: string): Listing {
  const text = htmlText(html).split("إعلانات مشابهة", 1)[0]; const { desc, structured } = splitDescription(text);
  const titleHtml = html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1] || html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "إعلان عقار";
  const title = htmlText(titleHtml).replace(/\s*\|\s*تطبيق عقار.*$/, ""); const listingId = url.match(/-(\d{5,})(?:\/[^/?#]*)?(?:[?#]|$)/)?.[1] || "";
  const pricePattern = labeled(`السعر(?:\\s+المطلوب)?|سعر\\s+البيع|المطلوب|الحد`);
  const headerText = text.slice(0, 700), hp = headerCurrencyAmounts(headerText);
  const headerPrice = hp.length >= 2 && headerText.includes("خصم") ? Math.min(...hp.slice(0, 2)) : hp[0];
  const dp = allAmounts(desc, pricePattern, true), sp = allAmounts(structured, pricePattern, true);
  const listedPrice = headerPrice ?? sp[0];
  const descriptionPrice = expandAbbreviatedAmount(dp[0], listedPrice);
  const price = descriptionPrice ?? listedPrice ?? null;

  const areaPatterns = [labeled(`المساحة\\s+حسب\\s+الصك|مساحة\\s+الأرض|المساحة|مساحتها|مساحته`), `([\\d,.]+)[^\\S\\n]*م(?:²|2)`];
  const da = first(desc, areaPatterns).value, sa = first(structured, areaPatterns).value, area = da ?? sa;

  const apartmentPatterns = [labeled(`عدد\\s+الشقق`), `([\\d,.]+)\\s*(?:شقة|شقق)(?:\\s|،|\\.|$)`];
  const descriptionApartments = first(desc, apartmentPatterns).value, structuredApartments = first(structured, apartmentPatterns).value;
  const apartments = descriptionApartments ?? structuredApartments;

  const housingUnitPatterns = [labeled(`عدد\\s+الوحدات(?:\\s+السكنية)?`), `([\\d,.]+)\\s*وحد(?:ة|ات)\\s*سكنية`, `(?:^|[\\n*•\\-])\\s*([\\d,.]+)\\s*وحد(?:ة|ات)(?=\\s|،|\\.|$)`];
  const descriptionHousingUnits = first(desc, housingUnitPatterns).value, structuredHousingUnits = first(structured, housingUnitPatterns).value;
  const housingUnits = descriptionHousingUnits ?? structuredHousingUnits;

  const commercialShopPatterns = [labeled(`عدد\\s+المحلات(?:\\s+التجارية)?|المحلات\\s+التجارية`), `([\\d,.]+)\\s*محلات?(?:\\s+تجارية)?(?=\\s|،|\\.|$)`, `([\\d,.]+)\\s*محل(?:\\s+تجاري)?(?=\\s|،|\\.|$)`];
  const descriptionCommercialShops = first(desc, commercialShopPatterns).value, structuredCommercialShops = first(structured, commercialShopPatterns).value;
  const commercialShops = descriptionCommercialShops ?? structuredCommercialShops;

  const descriptionRooms = roomCounts(desc), structuredRooms = roomCounts(structured);
  const selectedRooms = descriptionRooms.rooms != null ? descriptionRooms : structuredRooms;
  const { rooms, bedrooms, majlis, maqlat } = selectedRooms;
  const descriptionTotalRooms = totalBuildingRooms(desc), structuredTotalRooms = totalBuildingRooms(structured);
  const totalRooms = descriptionTotalRooms ?? structuredTotalRooms;

  const meterPatterns = [labeled(`عدد\\s+عدادات\\s+الكهرباء|عدادات\\s+الكهرباء|عدد\\s+العدادات`), `([\\d,.]+)\\s*(?:عدادات|عداد)(?!\\s*مياه)`];
  const descriptionMeters = first(desc, meterPatterns).value, structuredMeters = first(structured, meterPatterns).value;
  const meters = descriptionMeters ?? structuredMeters;

  const floorPatterns = [labeled(`عدد\\s+الأدوار|عدد\\s+الادوار`), `([\\d,.]+)\\s*(?:أدوار|ادوار|طوابق)`];
  const descriptionFloors = first(desc, floorPatterns).value, structuredFloors = first(structured, floorPatterns).value;
  const floors = descriptionFloors ?? structuredFloors;

  const streetPatterns = [labeled(`عرض\\s+الشارع`), `شارع(?:ين)?\\s*(?:بعرض|عرض)?\\s*([\\d,.]+)\\s*م`];
  const descriptionStreet = first(desc, streetPatterns).value, structuredStreet = first(structured, streetPatterns).value;
  const street = descriptionStreet ?? structuredStreet;

  const descriptionAge = ageFromSource(desc), structuredAge = ageFromSource(structured);
  const age = descriptionAge.label ?? structuredAge.label;

  const annualPatterns = [
    labeled(`الدخل\\s+السنوي(?:\\s+الحالي)?|الدخل\\s+الحالي|الايجار\\s+السنوي|الإيجار\\s+السنوي|صافي\\s+الدخل|الدخل(?:\\s+الصافي|\\s+الإجمالي|\\s+الاجمالي)?|المدخول|مدخول`),
    `(?<!غير\\s)(?:العقار\\s+)?مؤجر(?:ة)?(?:\\s+حاليا)?\\s*(?:ب(?:مبلغ|قيمة|(?:ـ|[\\u064b-\\u065f])*))?\\s*[:\\-]?\\s*${amount}`,
  ];
  const monthlyPatterns = [labeled(`(?:إجمالي\\s+)?(?:الدخل|الإيجار)\\s+الشهري(?:\\s+الحالي)?`)];
  const incomeFrom = (source: string) => {
    const annual = first(source, annualPatterns); if (annual.value != null) return { value: annual.value, match: annual, monthly: false };
    const monthly = first(source, monthlyPatterns); return { value: monthly.value == null ? null : monthly.value * 12, match: monthly, monthly: monthly.value != null };
  };
  const descriptionIncome = incomeFrom(desc), structuredIncome = incomeFrom(structured);
  const selectedIncome = descriptionIncome.value != null ? descriptionIncome : structuredIncome;
  const income = selectedIncome.value, match = selectedIncome.match;
  const context = match.index >= 0 ? match.source.slice(Math.max(0, match.index - 55), match.index + match.raw.length + 70) : "";
  const incomeKind = income == null ? "unknown" : /متوقع|المتوقع|يمكن|قابل للزيادة|بعد|يصل|يوصل|تقريبي/.test(context) ? "expected" : "actual";
  const city = title.match(/مدينة\s+([^,،|]+)/)?.[1]?.trim() || "", neighborhood = title.match(/حي\s+([^,،|]+)/)?.[1]?.trim() || "";

  const warnings: string[] = [];
  const addConflict = (label: string, descriptionValue: number | null | undefined, structuredValue: number | null | undefined, tolerance = 0) => {
    if (descriptionValue != null && structuredValue != null && conflicts([descriptionValue, structuredValue], tolerance)) warnings.push(`${label} مختلف بين وصف المعلن والقائمة؛ اعتُمد وصف المعلن`);
  };
  addConflict("السعر", descriptionPrice, listedPrice, .02);
  addConflict("المساحة", da, sa, .05);
  addConflict("عدد الشقق", descriptionApartments, structuredApartments);
  addConflict("عدد الوحدات السكنية", descriptionHousingUnits, structuredHousingUnits);
  addConflict("عدد المحلات التجارية", descriptionCommercialShops, structuredCommercialShops);
  addConflict("عدد الغرف", descriptionRooms.rooms, structuredRooms.rooms);
  addConflict("إجمالي عدد الغرف", descriptionTotalRooms, structuredTotalRooms);
  addConflict("عدد العدادات", descriptionMeters, structuredMeters);
  addConflict("عدد الأدوار", descriptionFloors, structuredFloors);
  addConflict("عرض الشارع", descriptionStreet, structuredStreet);
  addConflict("عمر العقار", descriptionAge.years, structuredAge.years);
  addConflict("الدخل السنوي", descriptionIncome.value, structuredIncome.value, .02);
  if (selectedIncome.monthly) warnings.push("حُوّل الدخل الشهري إلى سنوي بضربه في 12"); if (incomeKind === "expected") warnings.push("الدخل المذكور متوقع وليس فعليًا مؤكدًا");
  for (const [v, w] of [[price,"السعر غير مذكور بوضوح"],[income,"الدخل السنوي غير مذكور"],[meters,"عدد العدادات غير مذكور"],[floors,"عدد الأدوار غير مذكور"],[street,"عرض الشارع غير مذكور"],[area,"المساحة غير مذكورة"]] as [number|null,string][]) if (v == null) warnings.push(w);
  return { listingId, url, title, city, neighborhood, propertyType, price, area, sqmPrice: price && area ? price / area : null,
    apartments, housingUnits, commercialShops, rooms: ROOM_TYPES.has(propertyType) ? rooms : null, totalRooms: propertyType === "عمارة" ? totalRooms : null, bedrooms, majlis, maqlat, meters, floors, street, age, income,
    incomeKind, yieldPct: income && price ? income / price * 100 : null, density: apartments && area ? apartments / area * 100 : null,
    warnings, status: "بيانات ناقصة", score: 0, nearEligible: true, description: desc.slice(0, 2200) };
}

export function evaluate(item: Listing, f: Filters) {
  const count = ROOM_TYPES.has(f.propertyType) ? item.rooms : item.apartments;
  const rentalHousing = f.purpose === "rent" && ["عمارة", "فيلا", "شقة", "دور"].includes(f.propertyType);
  const sqmMin = f.propertyType === "أرض" ? f.sqmMin : 0, sqmMax = f.propertyType === "أرض" ? f.sqmMax : 0;
  const yieldMin = rentalHousing ? 0 : f.yieldMin, minDensity = rentalHousing ? 0 : f.minDensity;
  const checks: [boolean, number|null, (x:number)=>boolean, number][] = [
    [f.priceMin>0,item.price,x=>x>=f.priceMin,12],[f.priceMax>0,item.price,x=>x<=f.priceMax,16],
    [sqmMin>0,item.sqmPrice,x=>x>=sqmMin,8],[sqmMax>0,item.sqmPrice,x=>x<=sqmMax,8],
    [yieldMin>0,item.yieldPct,x=>x>=yieldMin&&item.incomeKind==="actual",22],
    [f.minMeters>0,item.meters,x=>x>=f.minMeters,10],[f.minCount>0,count,x=>x>=f.minCount,10],
    [f.minFloors>0,item.floors,x=>x>=f.minFloors,7],[f.minStreet>0,item.street,x=>x>=f.minStreet,8],
    [f.areaMin>0,item.area,x=>x>=f.areaMin,5],[f.areaMax>0,item.area,x=>x<=f.areaMax,5],[minDensity>0,item.density,x=>x>=minDensity,10],
  ];
  let score=100, failed=false, missing=false; for(const [active,value,pass,weight] of checks){if(!active)continue;if(value==null){missing=true;score-=weight}else if(!pass(value)){failed=true;score-=weight}}
  // «مطابقة» تتطلب اجتياز كل شرط مفعّل بقيمته الفعلية؛ سماحية 20% للنتائج القريبة فقط.
  item.score=Math.max(0,score); item.status=!failed&&!missing?"مطابقة":missing?"بيانات ناقصة":"قريبة";
  let near=true; for(const [v,lo,hi] of [[item.price,f.priceMin,f.priceMax],[item.sqmPrice,sqmMin,sqmMax],[item.area,f.areaMin,f.areaMax]] as [number|null,number,number][]){if(v==null)continue;if(lo>0&&v<lo*(1-NEAR_TOLERANCE))near=false;if(hi>0&&v>hi*(1+NEAR_TOLERANCE))near=false}
  for(const [v,min] of [[item.yieldPct,yieldMin],[item.meters,f.minMeters],[count,f.minCount],[item.floors,f.minFloors],[item.street,f.minStreet],[item.density,minDensity]] as [number|null,number][]){if(v!=null&&min>0&&v<min*(1-NEAR_TOLERANCE))near=false}
  item.nearEligible=near; return item;
}
