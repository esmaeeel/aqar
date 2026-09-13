import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const helperSource = await readFile(new URL("../lib/commercial-filter.ts", import.meta.url), "utf8");
const pageSource = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
const routeSource = await readFile(new URL("../app/api/search/route.ts", import.meta.url), "utf8");
const javascript = ts.transpileModule(helperSource, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const { applyCommercialOnlyToAqarUrl } = await import(`data:text/javascript;base64,${Buffer.from(javascript).toString("base64")}`);

test("يضيف مرشح تصنيف عقار التجاري إلى رابط المصدر فقط عند اختياره", () => {
  const url = "https://sa.aqar.fm/%D8%A3%D8%B1%D8%A7%D8%B6%D9%8A-%D9%84%D9%84%D8%A8%D9%8A%D8%B9/%D8%A7%D9%84%D8%B1%D9%8A%D8%A7%D8%B6";
  assert.equal(applyCommercialOnlyToAqarUrl(url, false), url);
  assert.equal(applyCommercialOnlyToAqarUrl(url, true), `${url}?type=eq%2C2`);
  assert.equal(applyCommercialOnlyToAqarUrl(`${url}?page=2`, true), `${url}?page=2&type=eq%2C2`);
});

test("يضع زر تجاري بين نوع العقار وكلمات البحث ويحفظه ضمن الشروط", () => {
  const typeIndex = pageSource.indexOf("نوع العقار<select");
  const commercialIndex = pageSource.indexOf('className="commercialOnlyToggle"');
  const keywordsIndex = pageSource.indexOf("كلمات للبحث<input");
  assert.ok(typeIndex >= 0 && commercialIndex > typeIndex && keywordsIndex > commercialIndex);
  assert.match(pageSource, /commercialOnly:false/);
  assert.match(pageSource, /aria-pressed=\{filters\.commercialOnly\}/);
  assert.match(pageSource, /JSON\.stringify\(\{name,filters\}\)/);
  assert.match(pageSource, /const loaded=\{\.\.\.defaults,\.\.\.saved/);
});

test("يبقي بحث الكلمات مستقلًا ويطبق تصنيف تجاري في مسار البحث", () => {
  assert.match(routeSource, /applyCommercialOnlyToAqarUrl\(locationUrl/);
  assert.match(routeSource, /Boolean\(filters\.commercialOnly\)/);
  assert.match(routeSource, /if \(filters\.keywords\?\.length\)/);
  assert.match(routeSource, /keywordMatches\(k, searchable\)/);
  assert.match(pageSource, /!clean\.commercialOnly&&!generalSearchHasRequiredKeywords/);
});
