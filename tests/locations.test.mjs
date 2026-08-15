import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = await readFile(new URL("../lib/locations.ts", import.meta.url), "utf8");
const javascript = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const locations = await import(`data:text/javascript;base64,${Buffer.from(javascript).toString("base64")}`);

test("يصحح اختلافات كتابة المدن إلى الاسم المعتمد", () => {
  assert.equal(locations.canonicalCity("جده"), "جدة");
  assert.equal(locations.canonicalCity("مكه"), "مكة المكرمة");
});

test("يقترح تكملة المدينة والحي أثناء الكتابة", () => {
  assert.ok(locations.placeSuggestions("جد", locations.CITY_NAMES).includes("جدة"));
  assert.equal(locations.placeSuggestions("الشف", locations.cityNeighborhoods("الرياض"))[0], "الشفا");
});

test("يصحح الشفاء إلى الشفا داخل الرياض", () => {
  assert.equal(locations.canonicalNeighborhood("الرياض", "الشفاء"), "الشفا");
  assert.equal(locations.neighborhoodsMatch("الرياض", "حي الشفاء", "الشفا"), true);
});

test("يعتمد المسميات البديلة داخل المدينة الصحيحة فقط", () => {
  assert.equal(locations.canonicalNeighborhood("الرياض", "لبن"), "ظهرة لبن");
  assert.equal(locations.canonicalNeighborhood("جدة", "شمال أبحر"), "أبحر الشمالية");
  assert.equal(locations.canonicalNeighborhood("الدمام", "عبد الله فؤاد"), "عبدالله فؤاد");
  assert.equal(locations.canonicalNeighborhood("الخبر", "الراكة شمال"), "الراكة الشمالية");
  assert.equal(locations.canonicalNeighborhood("جدة", "لبن"), "لبن");
});

test("يفهم صيغ الاتجاه دون توسيع المطابقة إلى أحياء مختلفة", () => {
  assert.equal(locations.neighborhoodsMatch("جدة", "أبحر الشمال", "أبحر الشمالية"), true);
  assert.equal(locations.neighborhoodsMatch("الخبر", "الراكة جنوب", "الراكة الجنوبية"), true);
  assert.equal(locations.neighborhoodsMatch("الرياض", "نمار", "ظهرة نمار"), false);
  assert.equal(locations.neighborhoodsMatch("جدة", "الصفا", "الشفا"), false);
});

test("تعيد اقتراح الاسم المعتمد عند الكتابة بالاسم البديل", () => {
  assert.equal(locations.neighborhoodSuggestions("جدة", "شمال أبحر")[0], "أبحر الشمالية");
  assert.equal(locations.neighborhoodSuggestions("الخبر", "الراكة شمال")[0], "الراكة الشمالية");
});
