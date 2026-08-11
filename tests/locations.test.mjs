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
  assert.equal(locations.canonicalPlace("الشفاء", locations.cityNeighborhoods("الرياض")), "الشفا");
});
