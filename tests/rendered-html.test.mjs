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
  const [page, layout, packageJson, styles, profilesRoute] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../app/api/profiles/route.ts", import.meta.url), "utf8"),
  ]);

  assert.doesNotMatch(page, /SkeletonPreview|_sites-preview|codex-preview/);
  assert.match(page, /maxListings:\s*200/);
  assert.match(page, /value=\{filters\.maxListings\|\|""\}/);
  assert.match(page, /className="runActions"/);
  assert.doesNotMatch(page, /className="topActions"/);
  assert.match(page, /شروط البحث المحفوظة/);
  assert.doesNotMatch(page, /اختر بحثًا محفوظًا/);
  assert.match(page, /className="profileItemActions"/);
  assert.match(page, /onContextMenu=\{event=>\{event\.preventDefault\(\);setContextProfileId\(profile\.id\)\}\}/);
  assert.match(page, />تعديل المسمى<\/button>/);
  assert.match(page, />حذف<\/button>/);
  assert.match(page, /onClick=\{\(\)=>loadProfile\(profile\)\}/);
  assert.match(profilesRoute, /export async function PUT/);
  assert.match(page, /"ابدأ البحث"/);
  assert.doesNotMatch(page, /ابدأ البحث في عقار/);
  assert.match(page, /propertyType:\s*"عام"/);
  assert.match(page, /locations:\[\{city:"الرياض",neighborhoods:\[\]\}\]/);
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
  assert.match(styles, /input\[type="number"\].*appearance:textfield/);
  assert.match(styles, /::-webkit-inner-spin-button/);
  assert.deepEqual(await readdir(previewRoot), []);
});

test("keeps table swiping native and reorders once from a dedicated drag handle", async () => {
  const [page, styles] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  const beginStart = page.indexOf("function beginPointerDrag");
  const moveStart = page.indexOf("function continuePointerDrag");
  const endStart = page.indexOf("function endPointerDrag");
  assert.ok(beginStart >= 0 && moveStart > beginStart && endStart > moveStart);
  assert.match(page.slice(beginStart, moveStart), /setPointerCapture/);
  assert.doesNotMatch(page.slice(moveStart, endStart), /moveColumnTo/);
  assert.match(page.slice(endStart), /moveColumnTo\(drag\.key,drag\.target\)/);
  assert.match(page, /className="columnDragHandle"/);
  assert.match(page, /className="sortHeader" onClick=\{\(\)=>sortBy\(column\.key\)\}/);
  assert.match(styles, /resultsTableWrap\{[^}]*touch-action:pan-x pan-y/);
  assert.match(styles, /columnDragHandle\{[^}]*touch-action:none/);
});

test("shows the neighborhood and keeps resizable result-column widths locally", async () => {
  const [page, styles] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);

  assert.match(page, /key:"neighborhood",label:"الحي"/);
  assert.match(page, /DEFAULT_COLUMN_WIDTHS:Record<ColumnKey,number>/);
  assert.match(page, /MIN_COLUMN_WIDTHS:Record<ColumnKey,number>/);
  assert.match(page, /clampColumnWidth/);
  assert.match(page, /COLUMN_WIDTHS_KEY="aqar-mobile-table-column-widths-v1"/);
  assert.match(page, /localStorage\.setItem\(COLUMN_WIDTHS_KEY,JSON\.stringify\(columnWidths\)\)/);
  assert.match(page, /<colgroup>/);
  assert.match(page, /className="columnResizeHandle"/);
  assert.match(page, /onDoubleClick=\{event=>resetColumnWidth\(event,column\.key\)\}/);
  assert.match(styles, /table-layout:fixed/);
  assert.match(styles, /\.columnResizeHandle\{/);
});
