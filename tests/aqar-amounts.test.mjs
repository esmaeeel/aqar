import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = await readFile(new URL("../lib/aqar.ts", import.meta.url), "utf8");
const locationsSource = await readFile(new URL("../lib/locations.ts", import.meta.url), "utf8");
const pageSource = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
const excelExportSource = await readFile(new URL("../lib/excel-export.ts", import.meta.url), "utf8");
const locationsJavascript = ts.transpileModule(locationsSource, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const locationsUrl = `data:text/javascript;base64,${Buffer.from(locationsJavascript).toString("base64")}`;
const javascript = ts.transpileModule(source.replace('"@/lib/locations"', JSON.stringify(locationsUrl)), {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const { CATEGORIES, PRICE_PER_SQM_TYPES, evaluate, generalSearchHasRequiredKeywords, hiddenNumericFilterKeys, hiddenResultColumnKeys, keywordMatches, listingKeywordSearchableText, listingLinks, listingMatchesRequestedLocation, parseListing, propertyTypeFromListingUrl, requestedPropertyTypeMatches, searchCategoriesFor } = await import(`data:text/javascript;base64,${Buffer.from(javascript).toString("base64")}`);

function priceFrom(description) {
  const html = `<h1>عمارة للبيع في مدينة الرياض، حي العوالي</h1><p>${description}</p>`;
  return parseListing(html, "https://sa.aqar.fm/عمائر-للبيع/الرياض/حي-العوالي/عمارة-123456", "عمارة").price;
}

test("يتعرف على مشتقات الكلمات المطلوبة دون خلط الكلمات المختلفة", () => {
  assert.equal(keywordMatches("مكيف", "الفيلا مجهزة بالمكيفات"), true);
  assert.equal(keywordMatches("موقف سيارة", "يتوفر بها مواقف سيارات"), true);
  assert.equal(keywordMatches("فندق", "شقق فندقية راقية"), true);
  assert.equal(keywordMatches("موقف", "موقع مميز"), false);
  assert.equal(keywordMatches("موقف", "العقار موقوف مؤقتًا"), false);
});

test("يوجه البحث العام إلى مصادر النوع المعروف ويقبل النوع المستنتج من الرابط", () => {
  assert.deepEqual(searchCategoriesFor("عام", "sale", ["ورش"]), CATEGORIES["ورشة"].sale);
  assert.deepEqual(searchCategoriesFor("عام", "sale", ["مكيف"]), ["عقارات"]);
  const searchable = listingKeywordSearchableText({propertyType:"ورشة",title:"عقار صناعي للبيع",description:"موقع مميز"});
  assert.equal(keywordMatches("ورش", searchable), true);
});

test("يضيف المستودع كنوع مستقل للبيع والتأجير", () => {
  assert.deepEqual(CATEGORIES["مستودع"].sale, ["مستودعات-للبيع"]);
  assert.deepEqual(CATEGORIES["مستودع"].rent, ["مستودع-للإيجار"]);
  assert.match(pageSource, /Object\.keys\(CATEGORIES\)/);
});

test("يفهم اختصار مليون و500 على أنه مليون و500 ألف", () => {
  assert.equal(priceFrom("السعر مليون و500"), 1_500_000);
  assert.equal(priceFrom("السعر 2 مليون و100"), 2_100_000);
});

test("يفهم صيغة المثنى مليونين ولا يكتفي بجزء الآلاف", () => {
  assert.equal(priceFrom("سعر البيع: مليونين و ٢٥٠ ألف"), 2_250_000);
  assert.equal(priceFrom("سعر البيع: مليونان و250 ألف"), 2_250_000);
  assert.equal(priceFrom("سعر البيع: مليونين و250"), 2_250_000);
});

test("يبقي صيغ السعر الصريحة صحيحة", () => {
  assert.equal(priceFrom("السعر مليون و500 ألف"), 1_500_000);
  assert.equal(priceFrom("السعر 1,500,000"), 1_500_000);
});

test("يفهم نصف المليون ويوسع السعر المختصر بمقارنته برأس الإعلان", () => {
  assert.equal(priceFrom("السعر المطلوب 6 ونص مليون"), 6_500_000);
  const html = `
    <h1>عمارة للبيع في مدينة الدمام، حي البادية</h1>
    <div>500,000 § 400,000 § خصم 20%</div>
    <div>استكشف خيارات التمويل</div>
    <p>الدخل 45 ألف - السعر: 400 قابل للتفاوض</p>
  `;
  const listing = parseListing(html, "https://sa.aqar.fm/عمائر-للبيع/الدمام/حي-البادية/عمارة-6454481", "عمارة");
  assert.equal(listing.price, 400_000);
  assert.equal(listing.yieldPct, 11.25);
});

test("لا يخلط نسبة العائد بالسعر ويختار السعر الحالي بعد الخصم", () => {
  const html = `
    <h1>عمارة للبيع في شارع ضبا، حي الثقبة، مدينة الخبر</h1>
    <div>3,800,000 § 3,650,000 § خصم4%</div>
    <p>الدخل السنوي: 350,000 ريال - نسبة الدخل إلى السعر: 10%</p>
  `;
  const listing = parseListing(
    html,
    "https://sa.aqar.fm/عمائر-للبيع/الخبر/حي-الثقبة/عمارة-6768026",
    "عمارة",
  );
  assert.equal(listing.price, 3_650_000);
  assert.equal(listing.income, 350_000);
});

test("يعتمد سعر البيع الرئيسي ولا يلتقط مبلغًا جانبيًا في إعلان 6646436", () => {
  const html = `
    <h1>مستودعات للبيع في مدينة الرياض، حي المروة</h1>
    <div>رسوم خدمة 1,000 ريال</div>
    <div>6,000,000 §</div>
    <div>استكشف خيارات التمويل</div>
    <p>تم تأجير كامل المستودعين بمبلغ 400 ألف ريال دفعه واحده بعقد واحد</p>
    <h2>تفاصيل الإعلان</h2>
    <div>المساحة 1,771 م²</div>
  `;
  const listing = parseListing(html, "https://sa.aqar.fm/مستودعات-للبيع/الرياض/حي-المروة/مستودعات-6646436", "مستودع");
  assert.equal(listing.price, 6_000_000);
  assert.equal(listing.income, 400_000);
});

test("يحصر بيانات 6771562 في الإعلان نفسه ولا يخلطها باقتراح مشابه", () => {
  const html = `
    <header>بطاقة مقترحة: 2,500,000 ريال — المساحة 3,927 م²</header>
    <h1>ورشة للبيع في مدينة الرياض، حي بدر</h1>
    <div>2,160,000 ﷼</div><div>استكشف خيارات التمويل</div>
    <p>ورشة للبيع 720 متر بحي بدر. مؤجرة بعقود سنوية ب (84,000) ريال.</p>
    <h3>تفاصيل الإعلان</h3><div>المساحة 720 م²</div><div>رقم الإعلان 6771562</div>
    <section>إعلانات مشابهة: 2,500,000 ريال — المساحة 3,927 م² — الدخل 660,500 ريال</section>
  `;
  const listing = parseListing(html, "https://sa.aqar.fm/ورش-للبيع/الرياض/حي-بدر/ورشة-6771562", "ورشة");
  assert.equal(listing.price, 2_160_000);
  assert.equal(listing.area, 720);
  assert.equal(listing.income, 84_000);
});

test("يرفض النتيجة إن خالفت هوية صفحة الإعلان رابطها", () => {
  const html = `<h1>ورشة للبيع في مدينة الرياض، حي بدر</h1><div>2,160,000 ﷼</div><div>رقم الإعلان 9999999</div>`;
  assert.throws(() => parseListing(html, "https://sa.aqar.fm/ورش-للبيع/الرياض/حي-بدر/ورشة-6771562", "ورشة"), /تعذر التحقق من هوية الإعلان/);
});

test("يعتمد سعر 6828963 الظاهر قبل التمويل ومساحته الإجمالية", () => {
  const html = `<h1>ورشة للبيع في مدينة الرياض، حي النور</h1><div>8,024,212 ﷼</div><div>استكشف خيارات التمويل</div><p>ثلاث ورش للبيع. تفاصيل المساحات: الورشة الأولى 1,265.79 م²، الورشة الثانية 800 م²، الورشة الثالثة 800 م². إجمالي المساحة: 2,865.79 م². مبلغ لاحق 25,000 ريال</p><h3>تفاصيل الإعلان</h3><div>رقم الإعلان 6828963</div>`;
  const listing = parseListing(html, "https://sa.aqar.fm/ورش-للبيع/الرياض/ورشة-6828963", "ورشة");
  assert.equal(listing.price, 8_024_212);
  assert.equal(listing.area, 2_865.79);
});

test("لا يعامل سعر المتر المصرح به في بيان 6750240 كسعر إجمالي", () => {
  const html = `<h1>ورشة للبيع في مدينة الرياض</h1><p>السعر: 2,500 ﷼ للمتر. المساحة 900 م²</p><h3>تفاصيل الإعلان</h3><div>رقم الإعلان 6750240</div>`;
  const listing = parseListing(html, "https://sa.aqar.fm/ورش-للبيع/الرياض/ورشة-6750240", "ورشة");
  assert.equal(listing.price, null);
  assert.equal(listing.sqmPrice, 2_500);
});

test("يقدم وصف المعلن على قائمة التفاصيل عند ثبوت التعارض", () => {
  const html = `
    <h1>عمارة للبيع في مدينة الخبر، حي الثقبة</h1>
    <div>3,650,000 §</div>
    <div>استكشف خيارات التمويل</div>
    <p>
      السعر المطلوب: 3,500,000 ريال
      مساحة الأرض: 400 م²
      عدد الشقق: 11
      عدد الوحدات السكنية: 12
      عدد العدادات: 13
      عدد الأدوار: 4
      عرض الشارع: 20 م
      عمر العقار: 7 سنوات
      الدخل السنوي: 300,000 ريال
    </p>
    <h3>تفاصيل الإعلان</h3>
    <p>
      السعر: 3,650,000 ريال
      المساحة حسب الصك: 325 م²
      عدد الشقق: 10
      عدد العدادات: 10
      عدد الأدوار: 3
      عرض الشارع: 15 م
      عمر العقار: 5 سنوات
      الدخل السنوي: 280,000 ريال
    </p>
  `;
  const listing = parseListing(html, "https://sa.aqar.fm/عمائر-للبيع/الخبر/حي-الثقبة/عمارة-7654321", "عمارة");
  assert.equal(listing.price, 3_500_000);
  assert.equal(listing.area, 400);
  assert.equal(listing.apartments, 11);
  assert.equal(listing.housingUnits, 12);
  assert.equal(listing.meters, 13);
  assert.equal(listing.floors, 4);
  assert.equal(listing.street, 20);
  assert.equal(listing.age, "7 سنة");
  assert.equal(listing.income, 300_000);
  for (const label of ["السعر", "المساحة", "عدد العدادات", "عدد الأدوار", "عرض الشارع", "عمر العقار", "الدخل السنوي"])
    assert.ok(listing.warnings.some(w => w.startsWith(`${label} مختلف`)), label);
});

test("لا يلتقط مساحة العقار عددًا للعدادات عندما تكون العدادات مسروقة", () => {
  const html = `
    <h1>عمارة للبيع في حي العدامة، مدينة الدمام</h1>
    <div>استكشف خيارات التمويل</div>
    <p>عدادات الكهرباء مسروقة، مساحة 297 متر، الدخل المتوقع 180 ألف.</p>
  `;
  const listing = parseListing(html, "https://sa.aqar.fm/عمائر-للبيع/الدمام/عمارة-6571021", "عمارة");
  assert.equal(listing.area, 297);
  assert.equal(listing.meters, null);
  assert.ok(listing.warnings.includes("عدد العدادات غير مذكور"));
});

test("يتجاهل حد المساحات ويعتمد المساحة الصريحة في شرح المعلن", () => {
  const html = `
    <h1>ورشة للإيجار في حي الصناعية الجنوبية، مدينة الدمام</h1>
    <div>استكشف خيارات التمويل</div>
    <p>للإيجار ورشة بمساحة 12,000 متر مربع. لا توجد مساحات دون 1000 م².</p>
    <h3>تفاصيل الإعلان</h3><p>المساحة 12,184 م²</p>
  `;
  const listing = parseListing(html, "https://sa.aqar.fm/ورش-للإيجار/الدمام/ورشة-7654341", "ورشة");
  assert.equal(listing.area, 12_000);
});

test("يعرض مساحة واحدة ويرجح الأقرب إلى السعر الصريح", () => {
  const html = `
    <h1>ورشة للإيجار في حي الصناعية الجنوبية، مدينة الدمام</h1>
    <div>148,000 ﷼</div>
    <div>استكشف خيارات التمويل</div>
    <p>للإيجار مستودعات وورش مساحات 411 م² ومساحات 424 م²، سعر المتر 350 ريال.</p>
    <h3>تفاصيل الإعلان</h3><p>المساحة 3,229 م²</p>
  `;
  const listing = parseListing(html, "https://sa.aqar.fm/ورش-للإيجار/الدمام/ورشة-7654342", "ورشة");
  assert.equal(listing.price, 148_000);
  assert.equal(listing.area, 424);
  assert.ok(Math.abs(listing.sqmPrice - 148_000 / 424) < 0.0001);
});

test("يضيف الأنواع الجديدة وخيار البحث العام بمساراتهما الصحيحة", () => {
  const expected = {
    "استراحة": {sale:["استراحة-للبيع"],rent:["استراحة-للإيجار"]},
    "شاليه": {sale:["استراحة-للبيع"],rent:["شاليه-للإيجار"]},
    "محل": {sale:["محلات-للبيع"],rent:["محلات-للإيجار"]},
    "مكتب": {sale:["مكاتب-للبيع"],rent:["مكتب-تجاري-للإيجار"]},
    "استوديو": {sale:["استوديوهات-للبيع"],rent:["استوديوهات-للإيجار"]},
    "غرفة": {sale:["غرف-للبيع"],rent:["غرف-للإيجار"]},
    "عام": {sale:["عقارات"],rent:["عقارات"]},
  };
  for (const [propertyType, categories] of Object.entries(expected)) assert.deepEqual(CATEGORIES[propertyType], categories);
  assert.equal(requestedPropertyTypeMatches("شاليه", "شاليهات فاخرة للبيع"), true);
  assert.equal(requestedPropertyTypeMatches("شاليه", "استراحة عائلية للبيع"), false);
});

test("البحث العام يلزم كلمات مطلوبة ويحتفظ بغرض البيع أو التأجير", () => {
  assert.equal(generalSearchHasRequiredKeywords("عام", []), false);
  assert.equal(generalSearchHasRequiredKeywords("عام", ["مزرعة"]), true);
  assert.equal(generalSearchHasRequiredKeywords("فيلا", []), true);
  const html = `
    <a href="/مزارع-للبيع/الرياض/حي-العوالي/مزرعة-123456">بيع</a>
    <a href="/فنادق-للإيجار/الرياض/حي-العوالي/فندق-234567">إيجار</a>`;
  assert.deepEqual(listingLinks(html, "عقارات", "الرياض", "العوالي", "sale").map(item => item.listingId), ["123456"]);
  assert.deepEqual(listingLinks(html, "عقارات", "الرياض", "العوالي", "rent").map(item => item.listingId), ["234567"]);
  assert.equal(propertyTypeFromListingUrl("https://sa.aqar.fm/استوديوهات-للبيع/جدة/استوديو-123456"), "استوديو");
  assert.equal(propertyTypeFromListingUrl("https://sa.aqar.fm/مزارع-للبيع/الرياض/مزرعة-123456"), "عام");
  assert.match(pageSource, /generalSearchHasRequiredKeywords\(clean\.propertyType,clean\.keywords\)/);
});

test("يستخدم سعر المتر الصريح فقط عند تعذر حسابه ويتركه فارغًا عند غياب المصدرين", () => {
  const explicit = parseListing(
    `<h1>أرض للبيع في مدينة الرياض</h1><p>سعر المتر 2,500 ريال، المساحة 400 م²</p>`,
    "https://sa.aqar.fm/أراضي-للبيع/الرياض/أرض-7654390",
    "أرض",
  );
  const missing = parseListing(
    `<h1>أرض للبيع في مدينة الرياض</h1><p>المساحة 400 م²</p>`,
    "https://sa.aqar.fm/أراضي-للبيع/الرياض/أرض-7654391",
    "أرض",
  );
  assert.equal(explicit.price, null);
  assert.equal(explicit.sqmPrice, 2_500);
  assert.equal(missing.sqmPrice, null);
});

test("لا يهمل المساحة الصريحة عند التصاق كلمة متر بما بعدها", () => {
  const html = `
    <h1>ورشة للإيجار في صناعية الخبر</h1>
    <div>استكشف خيارات التمويل</div>
    <p>ورشة في صناعية الخبر المساحة 250 مترالمستودع</p>
    <h3>تفاصيل الإعلان</h3><p>عرض الشارع 30 م، المساحة 945 م²</p>
  `;
  const listing = parseListing(html, "https://sa.aqar.fm/ورش-للإيجار/الخبر/ورشة-7654343", "ورشة");
  assert.equal(listing.area, 250);
});

test("لا يعتبر اختلاف التنسيق أو فرق المساحة الطفيف تعارضًا", () => {
  const html = `
    <h1>عمارة للبيع في مدينة الخبر، حي الثقبة</h1>
    <div>استكشف خيارات التمويل</div>
    <p>السعر: 3 مليون و500 ألف ريال - مساحة الأرض: 325 م²</p>
    <h3>تفاصيل الإعلان</h3>
    <p>السعر: 3,500,000 ريال - المساحة حسب الصك: 325.58 م²</p>
  `;
  const listing = parseListing(html, "https://sa.aqar.fm/عمائر-للبيع/الخبر/حي-الثقبة/عمارة-7654322", "عمارة");
  assert.equal(listing.price, 3_500_000);
  assert.equal(listing.area, 325);
  assert.ok(!listing.warnings.some(w => w.startsWith("السعر مختلف")));
  assert.ok(!listing.warnings.some(w => w.startsWith("المساحة مختلفة")));
});

test("لا يلتقط السعر أو المساحة عمرًا عند غياب قيمة العمر", () => {
  const missingAgeHtml = `
    <h1>شقة للبيع في مدينة الخبر، حي الثقبة</h1>
    <div>450,000 §</div>
    <div>استكشف خيارات التمويل</div>
    <h3>تفاصيل الإعلان</h3>
    <p>العمر<br>غير مذكور<br>المساحة<br>137 م²<br>السعر<br>450000 ريال</p>
  `;
  const missingAge = parseListing(missingAgeHtml, "https://sa.aqar.fm/شقق-للبيع/الخبر/حي-الثقبة/شقة-7654330", "شقة");
  assert.equal(missingAge.age, null);

  const impossibleAgeHtml = `
    <h1>شقة للبيع في مدينة الخبر، حي الثقبة</h1>
    <div>450,000 §</div>
    <div>استكشف خيارات التمويل</div>
    <h3>تفاصيل الإعلان</h3>
    <p>عمر العقار: 137 سنة</p>
  `;
  const impossibleAge = parseListing(impossibleAgeHtml, "https://sa.aqar.fm/شقق-للبيع/الخبر/حي-الثقبة/شقة-7654331", "شقة");
  assert.equal(impossibleAge.age, null);
});

test("يقبل العمر الرقمي المحصور في حقل العمر", () => {
  const html = `
    <h1>شقة للبيع في مدينة الخبر، حي الثقبة</h1>
    <div>450,000 §</div>
    <div>استكشف خيارات التمويل</div>
    <h3>تفاصيل الإعلان</h3>
    <div>عمر العقار</div><div>10</div>
  `;
  const listing = parseListing(html, "https://sa.aqar.fm/شقق-للبيع/الخبر/حي-الثقبة/شقة-7654332", "شقة");
  assert.equal(listing.age, "10 سنة");
});

test("يقرأ عمر العقار الجديد من بيانات Next المضمّنة كما في الإعلان 6817902", () => {
  const html = `
    <h1>شقة للبيع في مدينة الخبر، حي الحمراء</h1>
    <div>620,000 §</div>
    <p>إعلان لا يذكر العمر في وصف المعلن.</p>
    <h3>تفاصيل الإعلان</h3><div>غرف النوم</div><div>6</div>
    <script>self.__next_f.push([1,"{\\"listing\\":{\\"id\\":6817902,\\"details\\":[{\\"name\\":\\"age\\",\\"label\\":\\"عمر العقار\\",\\"dictionary\\":{\\"0\\":{\\"ar\\":\\"جديد\\"},\\"graterThan\\":{\\"value\\":10,\\"ar\\":\\"أكثر من 10 سنوات\\"}},\\"value\\":\\"جديد\\"},{\\"name\\":\\"area\\",\\"label\\":\\"المساحة\\",\\"value\\":\\"157\\"}]}}"])</script>
  `;
  const listing = parseListing(html, "https://sa.aqar.fm/شقق-للبيع/الخبر/حي-الحمراء/شقة-6817902", "شقة");
  assert.equal(listing.age, "جديد");
  assert.equal(listing.rooms, 6);
});

test("لا يفسر عدد نتائج الصفحة على أنه عدد غرف", () => {
  const html = `
    <h1>شقة للبيع في مدينة الخبر، حي الحمراء</h1>
    <div>620,000 §</div>
    <p>إعلان لا يذكر عدد الغرف في وصف المعلن.</p>
    <h3>تفاصيل الإعلان</h3>
    <div>غرف النوم — عدد نتائج البحث 222</div>
  `;
  const listing = parseListing(html, "https://sa.aqar.fm/شقق-للبيع/الخبر/حي-الحمراء/شقة-6817904", "شقة");
  assert.equal(listing.rooms, null);
});

test("لا يأخذ كلمة جديد من قاموس العمر إذا كانت قيمة الحقل غير موجودة", () => {
  const html = `
    <h1>شقة للبيع في مدينة الخبر، حي الحمراء</h1>
    <div>620,000 §</div>
    <script>self.__next_f.push([1,"{\\"details\\":[{\\"name\\":\\"age\\",\\"label\\":\\"عمر العقار\\",\\"dictionary\\":{\\"0\\":{\\"ar\\":\\"جديد\\"}}},{\\"name\\":\\"area\\",\\"label\\":\\"المساحة\\",\\"value\\":\\"157\\"}]}"])</script>
  `;
  const listing = parseListing(html, "https://sa.aqar.fm/شقق-للبيع/الخبر/حي-الحمراء/شقة-6817903", "شقة");
  assert.equal(listing.age, null);
});

test("يفهم صيغ الآحاد والعشرات والمئات والآلاف والملايين المكتوبة بالكلمات", () => {
  assert.equal(priceFrom("سعر البيع: مئتان وخمسون ألف ريال"), 250_000);
  assert.equal(priceFrom("سعر البيع: مليون ومئتي ألف ريال"), 1_200_000);
  assert.equal(priceFrom("سعر البيع: مليونان ومئتان وخمسون ألف ريال"), 2_250_000);
  assert.equal(priceFrom("سعر البيع: ثلاثة ملايين ومئتا ألف ريال"), 3_200_000);
  assert.equal(priceFrom("سعر البيع: عشرة ملايين وعشرون ألف ريال"), 10_020_000);
  assert.equal(priceFrom("سعر البيع: سبعمائة وخمسة وعشرون ألف ريال"), 725_000);
});

test("يذكر إجمالي غرف العمارة عندما يورده المعلن صراحة", () => {
  const html = `
    <h1>عمارة للبيع في مدينة الدمام، حي البادية</h1>
    <p>عدد الشقق: 8 - إجمالي عدد الغرف: 32 - كل شقة فيها مجلس</p>
  `;
  const listing = parseListing(html, "https://sa.aqar.fm/عمائر-للبيع/الدمام/حي-البادية/عمارة-7654321", "عمارة");
  assert.equal(listing.apartments, 8);
  assert.equal(listing.totalRooms, 32);
});

test("يفصل عشرين وحدة سكنية في الإعلان 6665449 عن عدد الشقق", () => {
  const html = `
    <h1>عمارة للبيع في مدينة الدمام، حي البادية</h1>
    <p>مواصفات العمارة:\n* 20 وحدة\n* 4 أدوار</p>
  `;
  const listing = parseListing(html, "https://sa.aqar.fm/عمائر-للبيع/الدمام/حي-البادية/عمارة-6665449", "عمارة");
  assert.equal(listing.apartments, null);
  assert.equal(listing.housingUnits, 20);
});

test("يفصل عدد المحلات التجارية عن الشقق والوحدات السكنية", () => {
  const html = `
    <h1>عمارة للبيع في مدينة الدمام، حي البادية</h1>
    <p>عدد الشقق: 4\n* 20 وحدة\nعدد المحلات التجارية: 6</p>
  `;
  const listing = parseListing(html, "https://sa.aqar.fm/عمائر-للبيع/الدمام/حي-البادية/عمارة-6665450", "عمارة");
  assert.equal(listing.apartments, 4);
  assert.equal(listing.housingUnits, 20);
  assert.equal(listing.commercialShops, 6);
});

test("يعرض رأسي عمودي الوحدة السكنية والمحلات قبل وجود نتائج", () => {
  assert.match(pageSource, /label:\"وحدة سكنية\"/);
  assert.match(pageSource, /label:\"المحلات\"/);
  assert.match(pageSource, /emptyTableCell/);
});

test("يعتبر مبلغ مؤجر به دخلا لا سعر البيع", () => {
  const html = `
    <h1>عمارة للبيع في مدينة الدمام، حي البادية</h1>
    <div>﷼ 23,000,000</div>
    <div>استكشف خيارات التمويل</div>
    <p>مؤجر بـ ١٬٦٠٠٬٠٠٠ ريال لمدة سبع سنين</p>
    <h3>تفاصيل الإعلان</h3><p>المساحة 2,000 م²</p>
  `;
  const listing = parseListing(html, "https://sa.aqar.fm/عمائر-للبيع/الدمام/حي-البادية/عمارة-7654324", "عمارة");
  assert.equal(listing.price, 23_000_000);
  assert.equal(listing.income, 1_600_000);
  assert.equal(listing.incomeKind, "actual");
  assert.ok(Math.abs(listing.yieldPct - (1_600_000 / 23_000_000 * 100)) < 1e-9);
  assert.ok(!listing.warnings.includes("الدخل السنوي غير مذكور"));
});

test("يقرأ دخل الإعلان 6556674 المكتوب بصيغة مؤجرة سنوين", () => {
  const html = `<h1>عمارة للبيع في مدينة الرياض</h1><div>2,000,000 ﷼</div><div>استكشف خيارات التمويل</div><p>مؤجرة سنوين بمبلغ 200 الف ريال</p>`;
  const listing = parseListing(html, "https://sa.aqar.fm/عمائر-للبيع/الرياض/عمارة-6556674", "عمارة");
  assert.equal(listing.income, 200_000);
  assert.equal(listing.incomeKind, "actual");
  assert.equal(listing.yieldPct, 10);
  assert.ok(!listing.warnings.includes("الدخل السنوي غير مذكور"));
});

test("لا يخترع دخلا من عبارة غير مؤجر", () => {
  const html = `<h1>عمارة للبيع في مدينة الدمام، حي البادية</h1><div>23,000,000 ﷼</div><div>استكشف خيارات التمويل</div><p>العقار غير مؤجر، السعر المطلوب 23 مليون</p>`;
  const listing = parseListing(html, "https://sa.aqar.fm/عمائر-للبيع/الدمام/حي-البادية/عمارة-7654325", "عمارة");
  assert.equal(listing.price, 23_000_000);
  assert.equal(listing.income, null);
});

test("لا ينسب سعر البيع إلى الدخل عندما تكون عبارة الدخل بلا رقم", () => {
  const html = `<h1>عمارة للبيع في مدينة الخبر، حي الخبر الجنوبية</h1><div>1,600,000 ﷼</div><div>استكشف خيارات التمويل</div><p>الدخل ضعيف<br>المطلوب مليون و600</p>`;
  const listing = parseListing(html, "https://sa.aqar.fm/عمائر-للبيع/الخبر/حي-الخبر-الجنوبية/عمارة-6636763", "عمارة");
  assert.equal(listing.price, 1_600_000);
  assert.equal(listing.income, null);
  assert.equal(listing.yieldPct, null);
});

test("يقرأ قيمة الدخل الصحيحة إذا وردت في السطر التالي", () => {
  const html = `<h1>عمارة للبيع في مدينة الخبر، حي الخبر الجنوبية</h1><div>2,000,000 ﷼</div><div>استكشف خيارات التمويل</div><p>الدخل السنوي:<br>120,000 ريال</p>`;
  const listing = parseListing(html, "https://sa.aqar.fm/عمائر-للبيع/الخبر/حي-الخبر-الجنوبية/عمارة-7654326", "عمارة");
  assert.equal(listing.income, 120_000);
  assert.equal(listing.yieldPct, 6);
});

test("لا يحسب عائدا بنسبة مئة بالمئة من سعر إعلان التأجير نفسه", () => {
  const html = `<h1>ورشة للإيجار في مدينة الدمام</h1><div>250,000 ﷼</div><div>استكشف خيارات التمويل</div><p>الإيجار السنوي 250,000 ريال</p>`;
  const listing = parseListing(html, "https://sa.aqar.fm/ورش-للإيجار/الدمام/ورشة-7654327", "ورشة");
  assert.equal(listing.price, 250_000);
  assert.equal(listing.income, 250_000);
  assert.equal(listing.yieldPct, null);
  assert.match(excelExportSource, /options\.purpose!=="rent"\)fields\.push\(numberField\("income","الدخل السنوي"/);
  assert.match(pageSource, /!\["income","yieldPct"\]\.includes\(column\.key\)/);
});

test("يتجاهل الشروط غير المناسبة للشقة المؤجرة", () => {
  const listing = parseListing(
    `<h1>شقة للإيجار في مدينة الرياض، حي الشفا</h1><p>الإيجار السنوي 30,000 ريال</p>`,
    "https://sa.aqar.fm/شقق-للإيجار/الرياض/حي-الشفا/شقة-7654322",
    "شقة",
  );
  const filters = {propertyType:"شقة",purpose:"rent",locations:[],keywords:[],mode:"strict",maxPages:2,maxListings:40,priceMin:0,priceMax:0,yieldMin:99,minMeters:99,minCount:0,minFloors:99,minStreet:0,areaMin:0,areaMax:0,minDensity:99,sqmMin:0,sqmMax:0};
  assert.equal(evaluate(listing, filters).status, "مطابقة");
});

test("يتجاهل شرط العائد في تأجير الورش", () => {
  const listing = parseListing(
    `<h1>ورشة للإيجار في مدينة الدمام</h1><div>250,000 ﷼</div><p>الإيجار السنوي 250,000 ريال</p>`,
    "https://sa.aqar.fm/ورش-للإيجار/الدمام/ورشة-7654328",
    "ورشة",
  );
  const filters = {propertyType:"ورشة",purpose:"rent",locations:[],keywords:[],mode:"strict",maxPages:2,maxListings:40,priceMin:0,priceMax:0,yieldMin:99,minMeters:0,minCount:0,minFloors:0,minStreet:0,areaMin:0,areaMax:0,minDensity:0,sqmMin:0,sqmMax:0};
  assert.equal(evaluate(listing, filters).status, "مطابقة");
});

test("يعامل الشفا والشفاء كحي واحد عند التحقق النهائي", () => {
  assert.equal(listingMatchesRequestedLocation("الرياض", "الشفاء", "الرياض", "الشفا"), true);
  assert.equal(listingMatchesRequestedLocation("الرياض", "العوالي", "الرياض", "الشفا"), false);
});

test("يطبق شرط سعر المتر على جميع أنواع العقارات", () => {
  const listing = parseListing(
    `<h1>عقار للبيع في مدينة الرياض، حي الشفا</h1><p>السعر 500,000 ريال - المساحة 500 م²</p>`,
    "https://sa.aqar.fm/أراضي-للبيع/الرياض/حي-الشفا/أرض-7654323",
    "أرض",
  );
  const filters = {propertyType:"عمارة",purpose:"sale",locations:[],keywords:[],mode:"strict",maxPages:2,maxListings:40,priceMin:0,priceMax:0,yieldMin:0,minMeters:0,minCount:0,minFloors:0,minStreet:0,areaMin:0,areaMax:0,minDensity:0,sqmMin:2_000,sqmMax:0};
  for (const propertyType of PRICE_PER_SQM_TYPES)
    assert.equal(evaluate({...listing}, {...filters, propertyType}).status, "قريبة", propertyType);
});

test("يعرض عمود سعر المتر لجميع أنواع العقارات في البيع والتأجير", () => {
  assert.deepEqual([...PRICE_PER_SQM_TYPES], ["عمارة", "فيلا", "شقة", "دور", "أرض", "مستودع", "ورشة", "استراحة", "شاليه", "محل", "مكتب", "استوديو", "غرفة", "عام"]);
  assert.match(excelExportSource, /options\.includeSquareMeterPrice\)fields\.push\(numberField\("sqmPrice","سعر المتر"/);
  assert.match(pageSource, /PRICE_PER_SQM_TYPES\.has\(propertyType\)\|\|column\.key!=="sqmPrice"/);
  assert.match(pageSource, /r\.sqmPrice==null\?"":fmt\(r\.sqmPrice,2\)/);
});

test("يخفي الشروط الرقمية غير المناسبة بحسب نوع العقار والعائد في كل تأجير", () => {
  assert.deepEqual([...hiddenNumericFilterKeys("عمارة", "sale")], []);
  assert.deepEqual([...hiddenNumericFilterKeys("عام", "sale")], []);
  assert.deepEqual([...hiddenNumericFilterKeys("فيلا", "sale")].sort(), ["minApartments", "minCommercialShops", "minDensity", "minMeters"]);
  assert.deepEqual([...hiddenNumericFilterKeys("شقة", "sale")].sort(), ["minApartments", "minCommercialShops", "minDensity", "minFloors", "minMeters"]);
  assert.deepEqual([...hiddenNumericFilterKeys("دور", "sale")].sort(), ["minApartments", "minCommercialShops", "minDensity", "minFloors", "minMeters"]);
  for (const propertyType of ["استراحة", "شاليه"])
    assert.deepEqual([...hiddenNumericFilterKeys(propertyType, "sale")].sort(), ["minApartments", "minCommercialShops", "minDensity", "minMeters"]);
  assert.deepEqual([...hiddenNumericFilterKeys("أرض", "sale")].sort(), ["maxAge", "minAge", "minApartments", "minCommercialShops", "minDensity", "minFloors", "minMeters", "minRooms", "yieldMin"]);
  for (const propertyType of ["مستودع", "ورشة", "محل", "مكتب", "استوديو", "غرفة"])
    assert.deepEqual([...hiddenNumericFilterKeys(propertyType, "sale")].sort(), ["minApartments", "minCommercialShops", "minDensity", "minFloors", "minMeters", "minRooms"]);
  for (const propertyType of PRICE_PER_SQM_TYPES)
    assert.ok(hiddenNumericFilterKeys(propertyType, "rent").has("yieldMin"), propertyType);
});

test("يفصل الحد الأدنى للشقق عن الحد الأدنى للغرف", () => {
  const listing = {
    id:"separate-counts",url:"https://sa.aqar.fm/عمائر-للبيع/الرياض/عمارة-7654399",title:"عمارة",propertyType:"عمارة",city:"الرياض",neighborhood:"",location:"الرياض",
    price:1_000_000,area:500,sqmPrice:2_000,apartments:6,housingUnits:6,commercialShops:null,rooms:null,totalRooms:20,bedrooms:null,majlis:0,maqlat:0,meters:null,floors:null,street:null,age:null,income:null,
    incomeKind:"unknown",yieldPct:null,density:1.2,warnings:[],status:"بيانات ناقصة",score:0,nearEligible:true,description:"",
  };
  const filters = {propertyType:"عمارة",purpose:"sale",locations:[],keywords:[],mode:"strict",maxPages:2,maxListings:40,priceMin:0,priceMax:0,yieldMin:0,minMeters:0,minApartments:6,minRooms:20,minCommercialShops:0,minFloors:0,minStreet:0,areaMin:0,areaMax:0,minAge:0,maxAge:0,minDensity:0,sqmMin:0,sqmMax:0};
  assert.equal(evaluate({...listing}, filters).status, "مطابقة");
  assert.equal(evaluate({...listing,apartments:5}, filters).status, "قريبة");
  assert.equal(evaluate({...listing,totalRooms:19}, filters).status, "قريبة");
});

test("يطابق أعمدة النتائج الشروط الظاهرة لكل نوع عقار", () => {
  assert.deepEqual([...hiddenResultColumnKeys("عمارة", "sale")], []);
  assert.deepEqual([...hiddenResultColumnKeys("عام", "sale")], []);
  assert.deepEqual([...hiddenResultColumnKeys("فيلا", "sale")].sort(), ["commercialShops", "density", "meters"]);
  assert.deepEqual([...hiddenResultColumnKeys("شقة", "sale")].sort(), ["commercialShops", "density", "floors", "meters"]);
  assert.deepEqual([...hiddenResultColumnKeys("دور", "sale")].sort(), ["commercialShops", "density", "floors", "meters"]);
  for (const propertyType of ["استراحة", "شاليه"])
    assert.deepEqual([...hiddenResultColumnKeys(propertyType, "sale")].sort(), ["commercialShops", "density", "meters"]);
  assert.deepEqual([...hiddenResultColumnKeys("أرض", "sale")].sort(), ["age", "commercialShops", "count", "density", "floors", "meters", "yieldPct"]);
  for (const propertyType of ["مستودع", "ورشة", "محل", "مكتب", "استوديو", "غرفة"])
    assert.deepEqual([...hiddenResultColumnKeys(propertyType, "sale")].sort(), ["commercialShops", "count", "density", "floors", "meters"]);
  for (const propertyType of PRICE_PER_SQM_TYPES)
    assert.ok(hiddenResultColumnKeys(propertyType, "rent").has("yieldPct"), propertyType);
  assert.match(pageSource, /!hiddenColumns\.has\(column\.key\)/);
});

test("يطبق أقل محلات تجارية على العمائر فقط وبسماحية القريب", () => {
  const listing = {
    listingId:"shops",url:"",title:"",city:"",neighborhood:"",propertyType:"عمارة",price:null,area:null,sqmPrice:null,
    apartments:null,housingUnits:null,commercialShops:5,rooms:null,totalRooms:null,bedrooms:null,majlis:0,maqlat:0,meters:null,floors:null,street:null,age:null,income:null,
    incomeKind:"unknown",yieldPct:null,density:null,warnings:[],status:"بيانات ناقصة",score:0,nearEligible:true,description:"",
  };
  const filters = {propertyType:"عمارة",purpose:"sale",locations:[],keywords:[],mode:"near",maxPages:2,maxListings:40,priceMin:0,priceMax:0,yieldMin:0,minMeters:0,minCount:0,minCommercialShops:5,minFloors:0,minStreet:0,areaMin:0,areaMax:0,minAge:0,maxAge:0,minDensity:0,sqmMin:0,sqmMax:0};
  assert.equal(evaluate({...listing}, filters).status, "مطابقة");
  assert.equal(evaluate({...listing,commercialShops:4}, filters).nearEligible, true);
  assert.equal(evaluate({...listing,commercialShops:3}, filters).nearEligible, false);
  assert.equal(evaluate({...listing,commercialShops:null}, filters).status, "بيانات ناقصة");
  assert.equal(evaluate({...listing,propertyType:"فيلا",commercialShops:null}, {...filters,propertyType:"فيلا"}).status, "مطابقة");
});

test("يستخدم البحث العام عدد الشقق للعمارة وعدد الغرف للشقة", () => {
  const listing = {
    listingId:"general-count",url:"",title:"",city:"",neighborhood:"",propertyType:"عمارة",price:null,area:null,sqmPrice:null,
    apartments:4,housingUnits:null,commercialShops:null,rooms:3,totalRooms:null,bedrooms:3,majlis:0,maqlat:0,meters:null,floors:null,street:null,age:null,income:null,
    incomeKind:"unknown",yieldPct:null,density:null,warnings:[],status:"بيانات ناقصة",score:0,nearEligible:true,description:"",
  };
  const filters = {propertyType:"عام",purpose:"sale",locations:[],keywords:["عقار"],mode:"strict",maxPages:2,maxListings:40,priceMin:0,priceMax:0,yieldMin:0,minMeters:0,minCount:4,minCommercialShops:0,minFloors:0,minStreet:0,areaMin:0,areaMax:0,minAge:0,maxAge:0,minDensity:0,sqmMin:0,sqmMax:0};
  assert.equal(evaluate({...listing}, filters).status, "مطابقة");
  assert.equal(evaluate({...listing,propertyType:"شقة"}, filters).status, "قريبة");
  assert.equal(evaluate({...listing,propertyType:"شقة",rooms:4}, filters).status, "مطابقة");
});

test("يحصر النتائج القريبة في عشرين بالمئة", () => {
  const listing = {
    listingId:"1",url:"",title:"",city:"",neighborhood:"",propertyType:"عمارة",price:1_000_000,area:500,sqmPrice:2_000,
    apartments:10,rooms:null,totalRooms:null,bedrooms:null,majlis:0,maqlat:0,meters:10,floors:3,street:20,age:null,income:100_000,
    incomeKind:"actual",yieldPct:10,density:2,warnings:[],status:"بيانات ناقصة",score:0,nearEligible:true,description:"",
  };
  const filters = {propertyType:"عمارة",purpose:"sale",locations:[],keywords:[],mode:"near",maxPages:2,maxListings:40,priceMin:0,priceMax:0,yieldMin:0,minMeters:0,minCount:10,minFloors:0,minStreet:0,areaMin:0,areaMax:0,minDensity:0,sqmMin:0,sqmMax:0};
  const boundary = evaluate({...listing,apartments:8}, filters);
  const outside = evaluate({...listing,apartments:7}, filters);
  assert.equal(boundary.status, "قريبة");
  assert.equal(boundary.nearEligible, true);
  assert.equal(outside.status, "قريبة");
  assert.equal(outside.nearEligible, false);
});

test("لا يمنح مطابق إلا بعد اجتياز كل شرط مفعّل", () => {
  const listing = {
    listingId:"2",url:"",title:"",city:"",neighborhood:"",propertyType:"عمارة",price:1_000_000,area:500,sqmPrice:2_000,
    apartments:10,rooms:null,totalRooms:null,bedrooms:null,majlis:0,maqlat:0,meters:10,floors:3,street:20,age:null,income:100_000,
    incomeKind:"actual",yieldPct:10,density:2,warnings:[],status:"بيانات ناقصة",score:0,nearEligible:true,description:"",
  };
  const filters = {propertyType:"عمارة",purpose:"sale",locations:[],keywords:[],mode:"strict",maxPages:2,maxListings:40,priceMin:900_000,priceMax:1_100_000,yieldMin:9,minMeters:10,minCount:10,minFloors:3,minStreet:20,areaMin:450,areaMax:550,minDensity:2,sqmMin:0,sqmMax:0};
  assert.equal(evaluate({...listing}, filters).status, "مطابقة");
  assert.equal(evaluate({...listing,apartments:9}, filters).status, "قريبة");
  assert.equal(evaluate({...listing,street:null}, filters).status, "بيانات ناقصة");
});

test("يطبق أقل وأقصى عمر ويعامل الجديد كعمر صفر", () => {
  const listing = {
    listingId:"3",url:"",title:"",city:"",neighborhood:"",propertyType:"عمارة",price:null,area:null,sqmPrice:null,
    apartments:null,rooms:null,totalRooms:null,bedrooms:null,majlis:0,maqlat:0,meters:null,floors:null,street:null,age:"10 سنة",income:null,
    incomeKind:"unknown",yieldPct:null,density:null,warnings:[],status:"بيانات ناقصة",score:0,nearEligible:true,description:"",
  };
  const filters = {propertyType:"عمارة",purpose:"sale",locations:[],keywords:[],mode:"near",maxPages:2,maxListings:40,priceMin:0,priceMax:0,yieldMin:0,minMeters:0,minCount:0,minFloors:0,minStreet:0,areaMin:0,areaMax:0,minAge:0,maxAge:10,minDensity:0,sqmMin:0,sqmMax:0};
  assert.equal(evaluate({...listing}, filters).status, "مطابقة");
  assert.equal(evaluate({...listing,age:"12 سنة"}, filters).nearEligible, true);
  assert.equal(evaluate({...listing,age:"13 سنة"}, filters).nearEligible, false);
  assert.equal(evaluate({...listing,age:"جديد"}, filters).status, "مطابقة");
  assert.equal(evaluate({...listing,age:null}, filters).status, "بيانات ناقصة");
  assert.equal(evaluate({...listing,age:"أكثر من 10 سنوات"}, filters).status, "قريبة");
  assert.equal(evaluate({...listing,age:"أكثر من 10 سنوات"}, {...filters,maxAge:20}).status, "بيانات ناقصة");
  const minimum = {...filters,minAge:10,maxAge:0};
  assert.equal(evaluate({...listing,age:"10 سنة"}, minimum).status, "مطابقة");
  assert.equal(evaluate({...listing,age:"8 سنة"}, minimum).status, "قريبة");
  assert.equal(evaluate({...listing,age:"7 سنة"}, minimum).nearEligible, false);
  assert.equal(evaluate({...listing,age:"جديد"}, minimum).status, "قريبة");
  assert.equal(evaluate({...listing,age:null}, minimum).status, "بيانات ناقصة");
  assert.equal(evaluate({...listing,age:"أكثر من 10 سنوات"}, minimum).status, "مطابقة");
  assert.equal(evaluate({...listing,age:"أكثر من 10 سنوات"}, {...minimum,minAge:12}).status, "بيانات ناقصة");
  assert.match(pageSource, /key:"minAge",label:"أقل عمر"/);
  assert.match(pageSource, /key:"maxAge",label:"أقصى عمر"/);
});
