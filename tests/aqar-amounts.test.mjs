import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = await readFile(new URL("../lib/aqar.ts", import.meta.url), "utf8");
const javascript = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const { evaluate, parseListing } = await import(`data:text/javascript;base64,${Buffer.from(javascript).toString("base64")}`);

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
  assert.equal(listing.apartments, 12);
  assert.equal(listing.meters, 13);
  assert.equal(listing.floors, 4);
  assert.equal(listing.street, 20);
  assert.equal(listing.age, "7 سنة");
  assert.equal(listing.income, 300_000);
  for (const label of ["السعر", "المساحة", "عدد الشقق", "عدد العدادات", "عدد الأدوار", "عرض الشارع", "عمر العقار", "الدخل السنوي"])
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

test("يتجاهل شروط الاستثمار المخفية في إيجار السكن", () => {
  const listing = parseListing(
    `<h1>شقة للإيجار في مدينة الرياض، حي الشفا</h1><p>الإيجار السنوي 30,000 ريال</p>`,
    "https://sa.aqar.fm/شقق-للإيجار/الرياض/حي-الشفا/شقة-7654322",
    "شقة",
  );
  const filters = {propertyType:"شقة",purpose:"rent",locations:[],keywords:[],mode:"strict",maxPages:2,maxListings:40,priceMin:0,priceMax:0,yieldMin:99,minMeters:0,minCount:0,minFloors:0,minStreet:0,areaMin:0,areaMax:0,minDensity:99,sqmMin:99_999,sqmMax:100_000};
  assert.equal(evaluate(listing, filters).status, "مطابقة");
});
