import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = await readFile(new URL("../lib/aqar.ts", import.meta.url), "utf8");
const locationsSource = await readFile(new URL("../lib/locations.ts", import.meta.url), "utf8");
const pageSource = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
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
const { evaluate, listingMatchesRequestedLocation, parseListing } = await import(`data:text/javascript;base64,${Buffer.from(javascript).toString("base64")}`);

function priceFrom(description) {
  const html = `<h1>عمارة للبيع في مدينة الرياض، حي العوالي</h1><p>${description}</p>`;
  return parseListing(html, "https://sa.aqar.fm/عمائر-للبيع/الرياض/حي-العوالي/عمارة-123456", "عمارة").price;
}

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

test("يقدم وصف المعلن على قائمة التفاصيل عند ثبوت التعارض", () => {
  const html = `
    <h1>عمارة للبيع في مدينة الخبر، حي الثقبة</h1>
    <div>3,650,000 §</div>
    <div>استكشف خيارات التمويل</div>
    <p>
      السعر المطلوب: 3,500,000 ريال
      مساحة الأرض: 400 م²
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
  assert.equal(listing.apartments, 10);
  assert.equal(listing.housingUnits, 12);
  assert.equal(listing.meters, 13);
  assert.equal(listing.floors, 4);
  assert.equal(listing.street, 20);
  assert.equal(listing.age, "7 سنة");
  assert.equal(listing.income, 300_000);
  for (const label of ["السعر", "المساحة", "عدد العدادات", "عدد الأدوار", "عرض الشارع", "عمر العقار", "الدخل السنوي"])
    assert.ok(listing.warnings.some(w => w.startsWith(`${label} مختلف`)), label);
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
    <script>self.__next_f.push([1,"{\\"listing\\":{\\"id\\":6817902,\\"details\\":[{\\"name\\":\\"age\\",\\"label\\":\\"عمر العقار\\",\\"dictionary\\":{\\"0\\":{\\"ar\\":\\"جديد\\"},\\"graterThan\\":{\\"value\\":10,\\"ar\\":\\"أكثر من 10 سنوات\\"}},\\"value\\":\\"جديد\\"},{\\"name\\":\\"area\\",\\"label\\":\\"المساحة\\",\\"value\\":\\"157\\"}]}}"])</script>
  `;
  const listing = parseListing(html, "https://sa.aqar.fm/شقق-للبيع/الخبر/حي-الحمراء/شقة-6817902", "شقة");
  assert.equal(listing.age, "جديد");
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

test("يعرض رأسي عمودي الوحدة السكنية والمحلات التجارية قبل وجود نتائج", () => {
  assert.match(pageSource, /label:\"وحدة سكنية\"/);
  assert.match(pageSource, /label:\"المحلات التجارية\"/);
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

test("لا يخترع دخلا من عبارة غير مؤجر", () => {
  const html = `<h1>عمارة للبيع في مدينة الدمام، حي البادية</h1><div>23,000,000 ﷼</div><div>استكشف خيارات التمويل</div><p>العقار غير مؤجر، السعر المطلوب 23 مليون</p>`;
  const listing = parseListing(html, "https://sa.aqar.fm/عمائر-للبيع/الدمام/حي-البادية/عمارة-7654325", "عمارة");
  assert.equal(listing.price, 23_000_000);
  assert.equal(listing.income, null);
});

test("يتجاهل شروط الاستثمار المخفية في إيجار السكن", () => {
  const listing = parseListing(
    `<h1>شقة للإيجار في مدينة الرياض، حي الشفا</h1><p>الإيجار السنوي 30,000 ريال</p>`,
    "https://sa.aqar.fm/شقق-للإيجار/الرياض/حي-الشفا/شقة-7654322",
    "شقة",
  );
  const filters = {propertyType:"شقة",purpose:"rent",locations:[],keywords:[],mode:"strict",maxPages:2,maxListings:40,priceMin:0,priceMax:0,yieldMin:99,minMeters:0,minCount:0,minFloors:0,minStreet:0,areaMin:0,areaMax:0,minDensity:99,sqmMin:99_999,sqmMax:100_000};
  assert.equal(evaluate(listing, filters).status, "مطابقة");
});

test("يعامل الشفا والشفاء كحي واحد عند التحقق النهائي", () => {
  assert.equal(listingMatchesRequestedLocation("الرياض", "الشفاء", "الرياض", "الشفا"), true);
  assert.equal(listingMatchesRequestedLocation("الرياض", "العوالي", "الرياض", "الشفا"), false);
});

test("يطبق شرط سعر المتر على الأراضي فقط", () => {
  const listing = parseListing(
    `<h1>عقار للبيع في مدينة الرياض، حي الشفا</h1><p>السعر 500,000 ريال - المساحة 500 م²</p>`,
    "https://sa.aqar.fm/أراضي-للبيع/الرياض/حي-الشفا/أرض-7654323",
    "أرض",
  );
  const filters = {propertyType:"عمارة",purpose:"sale",locations:[],keywords:[],mode:"strict",maxPages:2,maxListings:40,priceMin:0,priceMax:0,yieldMin:0,minMeters:0,minCount:0,minFloors:0,minStreet:0,areaMin:0,areaMax:0,minDensity:0,sqmMin:2_000,sqmMax:0};
  assert.equal(evaluate({...listing}, filters).status, "مطابقة");
  assert.equal(evaluate({...listing}, {...filters, propertyType:"أرض"}).status, "قريبة");
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
