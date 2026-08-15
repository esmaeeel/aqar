export const CITY_NAMES = [
  "الرياض", "جدة", "مكة المكرمة", "المدينة المنورة", "الدمام", "الخبر", "الظهران",
  "الجبيل", "القطيف", "الأحساء", "الهفوف", "الطائف", "تبوك", "بريدة", "عنيزة",
  "حائل", "أبها", "خميس مشيط", "جازان", "نجران", "الباحة", "ينبع", "الخرج",
  "الدرعية", "المجمعة", "الزلفي", "شقراء", "الدوادمي", "القويعية", "وادي الدواسر",
  "رابغ", "الليث", "القنفذة", "رأس تنورة", "بقيق", "الخفجي", "حفر الباطن",
  "سيهات", "صفوى", "عفيف", "عرعر", "سكاكا", "القريات", "بيشة", "محايل عسير",
];

export const NEIGHBORHOODS_BY_CITY: Record<string, string[]> = {
  "الرياض": ["الشفا", "العوالي", "الملقا", "الياسمين", "النرجس", "الرمال", "قرطبة", "اليرموك", "الروضة", "النسيم الشرقي", "النسيم الغربي", "العزيزية", "طويق", "ظهرة لبن", "السويدي", "سلطانة", "بدر", "الدار البيضاء", "الحزم", "المهدية", "القيروان", "العارض", "حطين", "الصحافة", "الندى", "التعاون", "الربيع", "المصيف", "الغدير", "الوادي", "النخيل", "الرحمانية", "العليا", "السليمانية", "الملز", "الربوة", "الجزيرة", "الفيحاء", "المنار", "السلام", "الخليج", "النهضة", "إشبيلية", "الروابي", "القدس", "غرناطة", "الصفا", "المونسية", "الجنادرية", "سدرة", "الملك فهد", "الملك عبدالله", "الملك سلمان", "الازدهار", "الفلاح", "النفل", "المروج", "الورود", "المحمدية", "المرسلات", "المغرزات", "النزهة", "الأندلس", "ظهرة البديعة", "الزهرة", "العريجاء الغربي", "ظهرة نمار", "نمار", "عكاظ", "الحائر"],
  "جدة": ["الصفا", "الروضة", "السلامة", "الحمدانية", "النعيم", "البوادي", "الفيصلية", "المروة", "الزهراء", "الشاطئ", "المحمدية", "الرحاب", "العزيزية", "مشرفة", "النسيم", "السامر", "المنار", "الواحة", "بريمان", "طيبة", "الأجواد", "السنابل", "الياقوت", "اللؤلؤ", "أبحر الشمالية", "أبحر الجنوبية", "الكوثر", "الريان", "الصالحية", "الحمراء", "الصواري", "الشراع", "الفردوس", "الأمواج", "الأصالة"],
  "مكة المكرمة": ["العوالي", "الشرائع", "الشوقية", "بطحاء قريش", "ولي العهد", "الراشدية", "العزيزية", "النوارية", "الزاهر", "العمرة الجديدة", "التنعيم", "الكعكية", "النسيم", "العكيشية", "الخضراء", "البحيرات"],
  "المدينة المنورة": ["العاقول", "العزيزية", "شوران", "الدفاع", "الرانوناء", "الخالدية", "الملك فهد", "الهجرة", "قربان", "العريض", "مذينب", "الخضراء", "الجرف", "السلام", "طيبة"],
  "الدمام": ["الشاطئ الشرقي", "الشاطئ الغربي", "الفيصلية", "المنار", "النور", "بدر", "أحد", "طيبة", "ضاحية الملك فهد", "الفرسان", "الشعلة", "الأمانة", "الندى", "الجامعيين", "المزروعية", "المحمدية", "البادية", "العدامة", "الفيحاء", "غرناطة", "الحمراء", "الخليج", "الزهور", "السيف", "الأمل", "الشرق", "النهضة", "الروضة", "عبدالله فؤاد"],
  "الخبر": ["الثقبة", "العقربية", "الخبر الشمالية", "الخبر الجنوبية", "الراكة الشمالية", "الراكة الجنوبية", "العليا", "الحزام الأخضر", "الحزام الذهبي", "الجسر", "البحيرة", "الكورنيش", "البندرية", "الخزامى", "التحلية", "الأمواج", "الصواري", "اللؤلؤ", "الشراع", "العقيق", "الحمراء"],
  "الظهران": ["الدوحة الجنوبية", "الدوحة الشمالية", "الدانة", "القصور", "الجامعة", "هجر", "القشلة", "أجيال", "تهامة", "غرناطة"],
  "الجبيل": ["الفناتير", "الدانة", "الحويلات", "الجبيل البلد", "الروضة", "الخالدية", "طيبة", "الصفا", "المروج", "الأحساء", "جلمودة", "الفردوس"],
  "القطيف": ["الناصرة", "المجيدية", "التركية", "الشاطئ", "الرضا", "القديح", "العوامية", "الجارودية", "أم الحمام", "سنابس"],
  "الطائف": ["شهار", "الحوية", "الوسام", "الرحاب", "الفيصلية", "الروضة", "النسيم", "الشفا", "السيل الصغير", "القيم الأعلى", "جبرة", "الحلقة الشرقية"],
  "بريدة": ["الريان", "النهضة", "الروضة", "الفايزية", "الأفق", "الرحاب", "الخليج", "الصفاء", "النخيل", "الشقة", "الصفراء"],
  "أبها": ["المحالة", "المنسك", "المروج", "الروضة", "شمسان", "الضباب", "ذرة", "مدينة سلطان", "العزيزية", "النسيم"],
  "خميس مشيط": ["الراصة", "الوسام", "الشرفية", "الربيع", "عتود", "ضمك", "الموسى", "النسيم", "الخالدية", "الواحة"],
  "تبوك": ["المروج", "الروضة", "الريان", "النهضة", "الفيصلية الشمالية", "الفيصلية الجنوبية", "المصيف", "الورود", "القادسية", "الأخضر"],
};

const CITY_ALIASES: Record<string, string> = {
  "مكه": "مكة المكرمة",
  "مكه المكرمه": "مكة المكرمة",
  "المدينه": "المدينة المنورة",
  "المدينه المنوره": "المدينة المنورة",
  "الاحسا": "الأحساء",
};

// هذه المسميات مقصودة لكل مدينة على حدة حتى لا يندمج حيان متشابهان في مدينتين مختلفتين.
export const NEIGHBORHOOD_ALIASES_BY_CITY: Record<string, Record<string, string>> = {
  "الرياض": {
    "الشفاء": "الشفا",
    "لبن": "ظهرة لبن",
    "حي لبن": "ظهرة لبن",
  },
  "جدة": {
    "أبحر الشمال": "أبحر الشمالية",
    "شمال أبحر": "أبحر الشمالية",
    "أبحر الجنوب": "أبحر الجنوبية",
    "جنوب أبحر": "أبحر الجنوبية",
  },
  "الدمام": {
    "ضاحية الملك فهد بالدمام": "ضاحية الملك فهد",
    "الضاحية": "ضاحية الملك فهد",
    "عبد الله فؤاد": "عبدالله فؤاد",
  },
  "الخبر": {
    "شمال الخبر": "الخبر الشمالية",
    "جنوب الخبر": "الخبر الجنوبية",
    "الراكة شمال": "الراكة الشمالية",
    "شمال الراكة": "الراكة الشمالية",
    "الراكة جنوب": "الراكة الجنوبية",
    "جنوب الراكة": "الراكة الجنوبية",
  },
};

export function placeKey(value: string) {
  return value.trim().replace(/^حي[\s-]+/u, "").replace(/ـ/g, "")
    .replace(/[\u064b-\u065f\u0670]/g, "").replace(/[أإآ]/g, "ا")
    .replace(/ى/g, "ي").replace(/ة/g, "ه").replace(/[ؤئ]/g, "ء")
    .replace(/ء$/g, "").replace(/\s+/g, " ").toLowerCase();
}

function neighborhoodKey(value: string) {
  return placeKey(value)
    .replace(/\b(?:الشمالي|الشماليه|شمالي)\b/g, "شمال")
    .replace(/\b(?:الجنوبي|الجنوبيه|جنوبي)\b/g, "جنوب")
    .replace(/\b(?:الشرقي|الشرقيه|شرقي)\b/g, "شرق")
    .replace(/\b(?:الغربي|الغربيه|غربي)\b/g, "غرب")
    .replace(/\s+/g, " ")
    .trim();
}

export function canonicalPlace(value: string, options: string[], aliases: Record<string, string> = {}) {
  const key = placeKey(value);
  if (!key) return "";
  const alias = Object.entries(aliases).find(([name]) => placeKey(name) === key)?.[1];
  if (alias) return alias;
  const exact = options.find(option => placeKey(option) === key);
  if (exact) return exact;
  const starts = options.filter(option => placeKey(option).startsWith(key));
  return key.length >= 2 && starts.length === 1 ? starts[0] : value.trim();
}

export function canonicalCity(value: string) {
  return canonicalPlace(value, CITY_NAMES, CITY_ALIASES);
}

export function cityNeighborhoods(city: string) {
  return NEIGHBORHOODS_BY_CITY[canonicalCity(city)] || [];
}

export function canonicalNeighborhood(city: string, value: string) {
  const canonical = canonicalCity(city);
  return canonicalPlace(value, cityNeighborhoods(canonical), NEIGHBORHOOD_ALIASES_BY_CITY[canonical] || {});
}

export function neighborhoodsMatch(city: string, left: string, right: string) {
  if (!left.trim() || !right.trim()) return false;
  return neighborhoodKey(canonicalNeighborhood(city, left)) === neighborhoodKey(canonicalNeighborhood(city, right));
}

export function placeSuggestions(value: string, options: string[], limit = 8) {
  const key = placeKey(value);
  if (!key) return options.slice(0, limit);
  return options.map(option => {
    const optionKey = placeKey(option);
    return { option, rank: optionKey === key ? 0 : optionKey.startsWith(key) ? 1 : optionKey.includes(key) ? 2 : 9 };
  }).filter(item => item.rank < 9).sort((a, b) => a.rank - b.rank || a.option.localeCompare(b.option, "ar")).slice(0, limit).map(item => item.option);
}

export function neighborhoodSuggestions(city: string, value: string, limit = 8) {
  const canonical = canonicalCity(city);
  const options = cityNeighborhoods(canonical);
  const aliases = NEIGHBORHOOD_ALIASES_BY_CITY[canonical] || {};
  const key = neighborhoodKey(value);
  if (!key) return options.slice(0, limit);
  const ranked = new Map<string, number>();
  for (const option of options) {
    const optionKey = neighborhoodKey(option);
    const rank = optionKey === key ? 0 : optionKey.startsWith(key) ? 1 : optionKey.includes(key) ? 3 : 9;
    if (rank < 9) ranked.set(option, Math.min(ranked.get(option) ?? 9, rank));
  }
  for (const [alias, option] of Object.entries(aliases)) {
    const aliasKey = neighborhoodKey(alias);
    const rank = aliasKey === key ? 0 : aliasKey.startsWith(key) ? 1 : aliasKey.includes(key) ? 2 : 9;
    if (rank < 9) ranked.set(option, Math.min(ranked.get(option) ?? 9, rank));
  }
  return [...ranked].sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0], "ar")).slice(0, limit).map(([option]) => option);
}
