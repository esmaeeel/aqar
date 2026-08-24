import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";

const previewRoot = new URL("../app/_sites-preview/", import.meta.url);

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("server-renders the Arabic property search site and browser limits", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>باحث العقارات<\/title>/i);
  assert.match(html, /التجربة المرتبطة بالمتصفح/);
  assert.match(html, /حد هذا المتصفح 100 عملية بحث/);
  assert.match(html, /الحد الإجمالي 1000 عملية بحث/);
  assert.match(html, /جدول مقارنة نتائج العقارات/);
  assert.match(html, /مستودع/);
  for (const propertyType of ["استراحة", "شاليه", "محل", "مكتب", "استوديو", "غرفة", "عام"])
    assert.match(html, new RegExp(propertyType));
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape|Building your site/i);
});

test("removes the disposable starter preview from the finished site", async () => {
  const [page, layout, packageJson] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);

  assert.doesNotMatch(page, /SkeletonPreview|_sites-preview|codex-preview/);
  assert.match(page, /maxListings:\s*200/);
  assert.match(page, /value=\{filters\.maxListings\|\|""\}/);
  assert.match(page, /className="runActions"/);
  assert.doesNotMatch(page, /className="topActions"/);
  assert.match(page, /"ابدأ البحث"/);
  assert.doesNotMatch(page, /ابدأ البحث في عقار/);
  assert.match(page, /propertyType:\s*"عام"/);
  assert.match(page, /mode:\s*"strict"/);
  assert.match(page, /> جميع الشروط<\/label>/);
  assert.doesNotMatch(page, /جميع الشروط تمامًا/);
  assert.match(page, /value=\{keywordDraft\}/);
  assert.match(page, /changeKeywordDraft\(e\.target\.value\)/);
  assert.match(page, /update\("keywords",keywordsFromDraft\(value\)\)/);
  assert.match(page, /split\(\/\[،,\]\//);
  assert.match(page, /عند اختيار «عام»/);
  assert.match(page, /مثل: مكيف، موقف، سيارة\. أو نوع العقار: مزرعة فندق/);
  assert.doesNotMatch(page, /value=\{filters\.keywords\.join/);
  assert.match(layout, /title:\s*"باحث العقارات"/);
  assert.doesNotMatch(layout, /Starter Project|codex-preview|_sites-preview/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
  assert.deepEqual(await readdir(previewRoot), []);
});

test("keeps a short header click for sorting and captures the pointer only after dragging", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const beginStart = page.indexOf("function beginPointerDrag");
  const moveStart = page.indexOf("function continuePointerDrag");
  const endStart = page.indexOf("function endPointerDrag");
  assert.ok(beginStart >= 0 && moveStart > beginStart && endStart > moveStart);
  assert.doesNotMatch(page.slice(beginStart, moveStart), /setPointerCapture/);
  assert.match(page.slice(moveStart, endStart), /drag\.moved=true;.*setPointerCapture/);
  assert.match(page, /className="sortHeader" onClick=\{\(\)=>sortBy\(column\.key\)\}/);
});
