import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = await readFile(new URL("../lib/listing-amount-reconciliation.ts", import.meta.url), "utf8");
const javascript = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const { reconcileListingAmounts } = await import(`data:text/javascript;base64,${Buffer.from(javascript).toString("base64")}`);

function listing(overrides = {}) {
  return {
    listingId: "1234567",
    url: "https://sa.aqar.fm/أراضي-للبيع/الرياض/أرض-1234567",
    title: "أرض للبيع",
    city: "الرياض",
    neighborhood: "",
    propertyType: "أرض",
    price: null,
    area: null,
    sqmPrice: null,
    apartments: null,
    housingUnits: null,
    commercialShops: null,
    rooms: null,
    totalRooms: null,
    bedrooms: null,
    majlis: 0,
    maqlat: 0,
    meters: null,
    floors: null,
    street: null,
    age: null,
    income: null,
    incomeKind: "unknown",
    yieldPct: null,
    density: null,
    warnings: [],
    status: "بيانات ناقصة",
    score: 0,
    nearEligible: true,
    description: "",
    ...overrides,
  };
}

test("يعامل السعر الصريح للمتر كسعر متر لا كسعر إجمالي دون الاعتماد على رقم الإعلان", () => {
  const html = `
    <h1>أرض للبيع في مدينة الرياض</h1>
    <div>1,350 ﷼</div><div>استكشف خيارات التمويل</div>
    <p>سعر المتر 1,350 ريال. مساحة الأرض 400 م².</p>
    <h3>تفاصيل الإعلان</h3><p>المساحة 400 م²</p>
  `;
  const item = reconcileListingAmounts(html, listing({ price: 1_350, area: 400, sqmPrice: 3.375 }));
  assert.equal(item.sqmPrice, 1_350);
  assert.equal(item.price, 540_000);
  assert.equal(item.area, 400);
});

test("يفهم صيغة السعر للمتر ولو جاء الرقم قبل عبارة للمتر", () => {
  const html = `
    <h1>أرض للبيع</h1>
    <p>المساحة حسب الصك 376 متر مربع، السعر 2,100 ريال للمتر.</p>
  `;
  const item = reconcileListingAmounts(html, listing({ price: 2_100, area: 376 }));
  assert.equal(item.sqmPrice, 2_100);
  assert.equal(item.price, 789_600);
  assert.equal(item.area, 376);
});

test("تتقدم مساحة الأرض الصريحة على رقم مساحة جانبي مختلف", () => {
  const html = `
    <h1>أرض للبيع</h1>
    <div>1,000,000 ريال</div><div>استكشف خيارات التمويل</div>
    <p>يوجد مبنى قائم بمسطحات 520 م². مساحة الأرض: 376 م².</p>
    <h3>تفاصيل الإعلان</h3><p>المساحة 520 م²</p>
  `;
  const item = reconcileListingAmounts(html, listing({ price: 1_000_000, area: 520, sqmPrice: 1_000_000 / 520 }));
  assert.equal(item.area, 376);
  assert.equal(item.price, 1_000_000);
  assert.ok(Math.abs(item.sqmPrice - 1_000_000 / 376) < 1e-9);
});

test("إذا تغيرت المساحة وكان السعر الإجمالي مشتقًا من سعر المتر يعاد اشتقاقه من المساحة الصحيحة", () => {
  const html = `
    <h1>أرض للبيع</h1>
    <p>سعر المتر: 1,500 ريال. مساحة الأرض: 376 م².</p>
    <h3>تفاصيل الإعلان</h3><p>المساحة 400 م²</p>
  `;
  const item = reconcileListingAmounts(html, listing({
    price: 600_000,
    area: 400,
    sqmPrice: 1_500,
    warnings: ["حُسب السعر الإجمالي من سعر المتر الصريح والمساحة"],
  }));
  assert.equal(item.area, 376);
  assert.equal(item.sqmPrice, 1_500);
  assert.equal(item.price, 564_000);
});

test("لا يغير السعر الإجمالي الصريح لمجرد وجود مساحة صحيحة", () => {
  const html = `
    <h1>عمارة للبيع</h1>
    <div>2,000,000 ريال</div><div>استكشف خيارات التمويل</div>
    <p>السعر المطلوب 2,000,000 ريال. مساحة الأرض 500 م².</p>
  `;
  const item = reconcileListingAmounts(html, listing({ propertyType: "عمارة", price: 2_000_000, area: 500, sqmPrice: 4_000 }));
  assert.equal(item.price, 2_000_000);
  assert.equal(item.area, 500);
  assert.equal(item.sqmPrice, 4_000);
});
