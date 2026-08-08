export const AQAR_ORIGIN = "https://sa.aqar.fm";
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
  apartments: number | null; rooms: number | null; bedrooms: number | null;
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
  return normalizeDigits(html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ").replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/<\/(?:p|div|li|h\d)>/gi, "\n").replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ").replace(/&amp;/gi, "&").replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'").replace(/[\t\r ]+/g, " ").replace(/\n\s*\n+/g, "\n").trim());
}
function parseAmount(raw?: string | null, unit = "") {
  if (!raw) return null;
  const n = normalizeText(raw);
  if (n === "مليون") return 1_000_000;
  if (n === "الف") return 1_000;
  const cleaned = normalizeDigits(raw).replace(/\s/g, "").replace(/(?<=\d)\.(?=\d{3}(?:\D|$))/g, "").replace(/,/g, "");
  let value = Number(cleaned);
  if (!Number.isFinite(value)) return null;
  const u = normalizeText(`${unit} ${raw}`);
  if (u.includes("مليون") && value < 100000) value *= 1_000_000;
  else if (u.includes("الف") && value < 100000) value *= 1_000;
  return value;
}
const amount = `([\\d][\\d,.]*|(?:مليون|الف|ألف)(?!\\w))[^\\S\\n]*(مليون|الف|ألف)?(?:[^\\d\\n]{0,8}و[^\\d\\n]{0,8}([\\d][\\d,.]*)[^\\S\\n]*(مليون|الف|ألف)?)?`;
const gap = `[^\\d\\n]{0,40}?(?:\\n[^\\d\\n]{0,24}?)?`;
function matchedAmount(m: RegExpMatchArray) {
  const a = parseAmount(m[1], m[2] || ""), b = m[3] ? parseAmount(m[3], m[4] || "") : null;
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
function allAmounts(text: string, pattern: string) {
  const values: number[] = []; const re = new RegExp(pattern, "gi"); let m: RegExpExecArray | null;
  while ((m = re.exec(text))) { const v = matchedAmount(m); if (v && v > 0) values.push(v); }
  return values;
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
function ageValue(desc: string, structured: string) {
  for (const s of [desc, structured]) { const n = normalizeText(s), labels = `عمر\\s*(?:العقار|العمارة|العماره|الفيلا|الشقة|الشقه|الدور|الورشة|الورشه)|عمرها|عمره|العمر`;
    const m = n.match(new RegExp(`(?:${labels})${gap}([\\d][\\d,.]*)`, "i")); if (m) return /اكثر\s+من|فوق/.test(m[0]) ? `أكثر من ${Number(m[1])} سنوات` : `${Number(m[1])} سنة`;
    if (new RegExp(`(?:${labels})${gap}(?:جديد|جديدة)`).test(n)) return "جديد"; }
  return null;
}
function conflicts(values: number[]) { return values.length > 1 && (Math.max(...values) - Math.min(...values)) / Math.min(...values) > .02; }

export function locationUrl(category: string, city: string, neighborhood: string, page: number) {
  const parts = [category, city.trim().replace(/\s+/g, "-")];
  const hood = neighborhood.trim().replace(/^حي[\s-]+/, ""); if (hood) parts.push(`حي-${hood.replace(/\s+/g, "-")}`); if (page > 1) parts.push(String(page));
  return `${AQAR_ORIGIN}/${parts.map(encodeURIComponent).join("/")}`;
}
export function listingLinks(html: string, category: string) {
  const out = new Map<string, string>(); const decoded = html.replace(/&amp;/g, "&");
  const escaped = category.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); const re = new RegExp(`href=["']([^"']*\\/${escaped}\\/[^"'#?]+-(\\d{5,})(?:\\/${escaped})?)["']`, "gi"); let m;
  while ((m = re.exec(decoded))) { const url = m[1].startsWith("http") ? m[1] : `${AQAR_ORIGIN}${m[1].startsWith("/") ? "" : "/"}${m[1]}`; out.set(m[2], encodeURI(url)); }
  return [...out.entries()].map(([listingId, url]) => ({ listingId, url }));
}

export function parseListing(html: string, url: string, propertyType: string): Listing {
  const text = htmlText(html).split("إعلانات مشابهة", 1)[0]; const { desc, structured } = splitDescription(text);
  const titleHtml = html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1] || html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "إعلان عقار";
  const title = htmlText(titleHtml).replace(/\s*\|\s*تطبيق عقار.*$/, ""); const listingId = url.match(/-(\d{5,})(?:\/[^/?#]*)?(?:[?#]|$)/)?.[1] || "";
  const pricePattern = labeled(`السعر(?:\\s+المطلوب)?|سعر\\s+البيع|المطلوب|الحد`);
  const dp = allAmounts(desc, pricePattern), hp = allAmounts(text.slice(0, 700), `([\\d,.]+)\\s*(?:ر\\.?\\s*س\\.?|ريال|﷼|SAR|§)`), sp = allAmounts(structured, pricePattern);
  const price = (dp.length ? dp : hp.length ? hp : sp)[0] ?? null;
  const areaPatterns = [labeled(`المساحة\\s+حسب\\s+الصك|مساحة\\s+الأرض|المساحة|مساحتها|مساحته`), `([\\d,.]+)[^\\S\\n]*م(?:²|2)`];
  const da = first(desc, areaPatterns).value, sa = first(structured, areaPatterns).value, area = da ?? sa;
  const apartments = preferred(desc, structured, [labeled(`عدد\\s+الشقق|عدد\\s+الوحدات\\s+السكنية`), `([\\d,.]+)\\s*(?:شقة|شقق)(?:\\s|،|\\.|$)`, `([\\d,.]+)\\s*وحد(?:ة|ات)\\s*سكنية`]).value;
  let bedrooms = preferred(desc, structured, [labeled(`عدد\\s+غرف\\s+النوم|عدد\\s+الغرف(?:\\s+النوم)?|غرف\\s+النوم`), `([\\d,.]+)\\s*(?:غرف(?:ة)?(?:\\s+نوم)?|غرفة\\s+نوم)(?!\\w)`]).value;
  if (bedrooms == null) { const n = normalizeText(desc); if (/غرفت(?:ين|ان)/.test(n)) bedrooms = 2; else if (/غرفة\s+(?:نوم|ماستر)/.test(n)) bedrooms = 1; }
  const majlis = countNamed(desc, "مجلس"), maqlat = countNamed(desc, "مقلط"); const rooms = bedrooms == null ? null : bedrooms + majlis + maqlat;
  const meters = preferred(desc, structured, [labeled(`عدد\\s+عدادات\\s+الكهرباء|عدادات\\s+الكهرباء|عدد\\s+العدادات`), `([\\d,.]+)\\s*(?:عدادات|عداد)(?!\\s*مياه)`]).value;
  const floors = preferred(desc, structured, [labeled(`عدد\\s+الأدوار|عدد\\s+الادوار`), `([\\d,.]+)\\s*(?:أدوار|ادوار|طوابق)`]).value;
  const street = preferred(desc, structured, [labeled(`عرض\\s+الشارع`), `شارع(?:ين)?\\s*(?:بعرض|عرض)?\\s*([\\d,.]+)\\s*م`]).value;
  const annual = preferred(desc, structured, [labeled(`الدخل\\s+السنوي(?:\\s+الحالي)?|الدخل\\s+الحالي|الايجار\\s+السنوي|الإيجار\\s+السنوي|صافي\\s+الدخل|الدخل(?:\\s+الصافي|\\s+الإجمالي|\\s+الاجمالي)?|المدخول|مدخول`)]);
  const monthly = annual.value == null ? preferred(desc, structured, [labeled(`(?:إجمالي\\s+)?(?:الدخل|الإيجار)\\s+الشهري(?:\\s+الحالي)?`)]) : { value: null, index: -1, raw: "", source: "" };
  const income = annual.value ?? (monthly.value == null ? null : monthly.value * 12); const match = annual.value != null ? annual : monthly;
  const context = match.index >= 0 ? match.source.slice(Math.max(0, match.index - 55), match.index + match.raw.length + 70) : "";
  const incomeKind = income == null ? "unknown" : /متوقع|المتوقع|يمكن|قابل للزيادة|بعد|يصل|يوصل|تقريبي/.test(context) ? "expected" : "actual";
  const city = title.match(/مدينة\s+([^,،|]+)/)?.[1]?.trim() || "", neighborhood = title.match(/حي\s+([^,،|]+)/)?.[1]?.trim() || "";
  const warnings: string[] = []; if (conflicts([...dp, ...hp, ...sp])) warnings.push("السعر مختلف بين الوصف ورأس الإعلان؛ اعتُمد وصف المعلن");
  if (da != null && sa != null && Math.abs(da - sa) / Math.min(da, sa) > .05) warnings.push("المساحة مختلفة بين الوصف والخصائص؛ اعتُمد وصف المعلن");
  if (monthly.value != null) warnings.push("حُوّل الدخل الشهري إلى سنوي بضربه في 12"); if (incomeKind === "expected") warnings.push("الدخل المذكور متوقع وليس فعليًا مؤكدًا");
  for (const [v, w] of [[price,"السعر غير مذكور بوضوح"],[income,"الدخل السنوي غير مذكور"],[meters,"عدد العدادات غير مذكور"],[floors,"عدد الأدوار غير مذكور"],[street,"عرض الشارع غير مذكور"],[area,"المساحة غير مذكورة"]] as [number|null,string][]) if (v == null) warnings.push(w);
  return { listingId, url, title, city, neighborhood, propertyType, price, area, sqmPrice: price && area ? price / area : null,
    apartments, rooms: ROOM_TYPES.has(propertyType) ? rooms : null, bedrooms, majlis, maqlat, meters, floors, street, age: ageValue(desc, structured), income,
    incomeKind, yieldPct: income && price ? income / price * 100 : null, density: apartments && area ? apartments / area * 100 : null,
    warnings, status: "بيانات ناقصة", score: 0, nearEligible: true, description: desc.slice(0, 2200) };
}

export function evaluate(item: Listing, f: Filters) {
  const count = ROOM_TYPES.has(f.propertyType) ? item.rooms : item.apartments;
  const checks: [boolean, number|null, (x:number)=>boolean, number][] = [
    [f.priceMin>0,item.price,x=>x>=f.priceMin,12],[f.priceMax>0,item.price,x=>x<=f.priceMax,16],
    [f.sqmMin>0,item.sqmPrice,x=>x>=f.sqmMin,8],[f.sqmMax>0,item.sqmPrice,x=>x<=f.sqmMax,8],
    [f.yieldMin>0,item.yieldPct,x=>x>=f.yieldMin&&item.incomeKind==="actual",22],
    [f.minMeters>0,item.meters,x=>x>=f.minMeters,10],[f.minCount>0,count,x=>x>=f.minCount,10],
    [f.minFloors>0,item.floors,x=>x>=f.minFloors,7],[f.minStreet>0,item.street,x=>x>=f.minStreet,8],
    [f.areaMin>0,item.area,x=>x>=f.areaMin,5],[f.areaMax>0,item.area,x=>x<=f.areaMax,5],[f.minDensity>0,item.density,x=>x>=f.minDensity,10],
  ];
  let score=100, failed=false, missing=false; for(const [active,value,pass,weight] of checks){if(!active)continue;if(value==null){missing=true;score-=weight}else if(!pass(value)){failed=true;score-=weight}}
  item.score=Math.max(0,score); item.status=!failed&&!missing?"مطابقة":missing?"بيانات ناقصة":"قريبة";
  let near=true; for(const [v,lo,hi] of [[item.price,f.priceMin,f.priceMax],[item.sqmPrice,f.sqmMin,f.sqmMax],[item.area,f.areaMin,f.areaMax]] as [number|null,number,number][]){if(v==null)continue;if(lo>0&&v<lo*.5)near=false;if(hi>0&&v>hi*1.5)near=false}
  for(const [v,min] of [[item.yieldPct,f.yieldMin],[item.meters,f.minMeters],[count,f.minCount],[item.floors,f.minFloors],[item.street,f.minStreet],[item.density,f.minDensity]] as [number|null,number][]){if(v!=null&&min>0&&v<min*.5)near=false}
  item.nearEligible=near; return item;
}
