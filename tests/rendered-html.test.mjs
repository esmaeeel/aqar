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
  assert.match(html, /<title>باحث عقار<\/title>/i);
  assert.doesNotMatch(html, /التجربة المرتبطة بالمتصفح|متبقّي لهذا المتصفح/);
  assert.match(html, /المتبقي 100 من 100 عملية بحث/);
  assert.doesNotMatch(html, /المتبقي الإجمالي|الحد الإجمالي 1000 عملية بحث/);
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
  assert.doesNotMatch(page, /className="runActions"/);
  assert.match(page, /className="resultPanelActions"/);
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
  assert.doesNotMatch(page, /عدّل المواصفات ثم اضغط/);
  assert.doesNotMatch(page, /<h3>الشروط الرقمية<\/h3>/);
  assert.doesNotMatch(page, /ابحث في إعلانات عقار، واحسب العائد والكثافة تلقائيًا/);
  assert.doesNotMatch(page, /نسخة الجوال المستقلة/);
  assert.match(page, /key:"minAge",label:"أقل عمر"/);
  assert.match(page, /key:"maxAge",label:"أقصى عمر"/);
  assert.match(page, /key:"minCommercialShops",label:"أقل محلات"/);
  assert.ok(page.indexOf('key:"minAge",label:"أقل عمر"') < page.indexOf('key:"maxAge",label:"أقصى عمر"'));
  assert.doesNotMatch(page, /أقصى عمر العقار|\(سنة\)/);
  assert.doesNotMatch(page, /<h2>مواصفات البحث<\/h2>/);
  assert.doesNotMatch(page, /تبدأ المدينة بـ«الرياض» وبقية الحقول فارغة عند كل فتح/);
  assert.doesNotMatch(page, /المتبقي الإجمالي|الحد الإجمالي 1000 عملية بحث/);
  assert.match(page, /\{message&&<div className="status">\{message\}<\/div>\}/);
  assert.match(page, /value=\{keywordDraft\}/);
  assert.match(page, /changeKeywordDraft\(e\.target\.value\)/);
  assert.match(page, /const keywords=keywordsFromDraft\(value\);update\("keywords",keywords\)/);
  assert.match(page, /split\(\/\[،,\]\//);
  assert.match(page, /عند اختيار «عام»/);
  assert.match(page, /setGeneralKeywordError\(true\);setMessage\("عند اختيار «عام»/);
  assert.match(page, /className=\{generalKeywordError\?"generalKeywordError":undefined\}/);
  assert.match(page, /aria-invalid=\{generalKeywordError\}/);
  assert.match(page, /className="propertyKeywordsRow"/);
  assert.match(page, />كلمات للبحث<input/);
  assert.match(page, /placeholder="مثل: تجاري، دوبلكس، مكيف، موقف"/);
  assert.match(page, /ابدأ الكتابة: الروضة…/);
  assert.doesNotMatch(page, /ابدأ الكتابة: الشف…/);
  assert.doesNotMatch(page, />المدن والأحياء</);
  assert.match(page, /onAdd=\{index===filters\.locations\.length-1\?addLocation:undefined\}/);
  assert.match(page, /aria-label="إضافة مدينة" title="إضافة مدينة" className="icon locationAddIcon"/);
  assert.doesNotMatch(page, /\+ إضافة مدينة/);
  assert.match(styles, /\.location\{grid-template-columns:minmax\(86px,\.72fr\) minmax\(0,1\.45fr\) 34px;gap:5px\}/);
  assert.match(styles, /\.locationHasAdd\{grid-template-columns:minmax\(78px,\.68fr\) minmax\(0,1\.35fr\) 34px 34px\}/);
  assert.match(styles, /\.location button\{grid-column:auto;grid-row:auto;align-self:end;height:34px\}/);
  assert.doesNotMatch(page, /كلمات مطلوبة/);
  assert.match(styles, /\.propertyKeywordsRow\{display:grid;grid-template-columns:/);
  assert.match(styles, /\.searchPanel input\.generalKeywordError,\.searchPanel select\.generalKeywordError\{[^}]*border-color:#bf3030/);
  assert.match(styles, /\.choiceRow\{display:grid;grid-template-columns:minmax\(105px,\.72fr\) minmax\(0,1\.45fr\)\}/);
  assert.doesNotMatch(page, /value=\{filters\.keywords\.join/);
  assert.match(layout, /title:\s*"باحث عقار"/);
  assert.doesNotMatch(layout, /Starter Project|codex-preview|_sites-preview/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
  assert.match(styles, /input\[type="number"\].*appearance:textfield/);
  assert.match(styles, /::-webkit-inner-spin-button/);
  assert.match(page, /className="numericCompactGrid"/);
  const priceRangeIndex = page.indexOf('["السعر","priceMin","priceMax"]');
  const sqmRangeIndex = page.indexOf('["سعر المتر","sqmMin","sqmMax"]');
  const areaRangeIndex = page.indexOf('["المساحة","areaMin","areaMax"]');
  assert.ok(priceRangeIndex >= 0 && sqmRangeIndex > priceRangeIndex && areaRangeIndex > sqmRangeIndex);
  assert.match(page, /className="numericRangesHeader"/);
  assert.match(page, /<span>من<\/span><span>إلى<\/span>/);
  assert.match(page, /\{key:"minRooms",label:"غرف"\}/);
  assert.match(page, /\{key:"minApartments",label:"شقق"\}/);
  assert.match(page, /\{key:"minCommercialShops",label:"محلات"\}/);
  assert.doesNotMatch(page, /أقل شقق \/ غرف/);
  assert.ok(page.indexOf('{key:"minRooms",label:"غرف"}') < page.indexOf('{key:"minMeters",label:"عدادات"}'));
  assert.match(page, /ageCompanionItems:[^=]+=\[\s*\{key:"yieldMin",label:"عائد%"\},\{key:"minDensity",label:"شقق\/100م²"\}\s*\]/);
  assert.match(page, /savedPropertyType==="عام"\|\|ROOM_TYPES\.has\(savedPropertyType\)\?0:legacyCount/);
  assert.match(page, /savedPropertyType==="عام"\|\|!ROOM_TYPES\.has\(savedPropertyType\)\?0:legacyCount/);
  assert.match(styles, /\.numericCompactRowWith2Companions\{grid-template-columns:minmax\(0,1fr\) minmax\(0,1fr\) minmax\(0,2fr\)\}/);
  assert.match(styles, /\.numericInlineField\{[^}]*grid-template-columns:max-content minmax\(0,1fr\)/);
  assert.match(page, /fromLabel\?"numericFromField":""/);
  assert.match(page, /numericVerticalLabel \$\{verticalLabelSize\(label\)\}/);
  assert.match(page, /numericRangeTitle \$\{verticalLabelSize\(title\)\}/);
  assert.match(styles, /\.numericRangeTitle>span,\.numericVerticalLabel>span\{[^}]*rotate\(-90deg\)[^}]*white-space:nowrap/);
  assert.match(styles, /\.numericInlineField\.numericFromField\{grid-template-columns:18px minmax\(0,1fr\)/);
  assert.match(styles, /\.numericRangesRow>input,\.numericInlineField>input,\.numericMinimumField>input,\.runListingLimit input\{[^}]*padding-inline:0[^}]*direction:ltr/);
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
  assert.match(styles, /resultsTableWrap\{[^}]*overscroll-behavior-x:contain[^}]*overscroll-behavior-y:auto/);
  assert.doesNotMatch(styles, /resultsTableWrap\{[^}]*overscroll-behavior:contain/);
  assert.match(styles, /columnDragHandle\{[^}]*touch-action:none/);
});

test("keeps visible results savable during a running search and shows mobile feedback", async () => {
  const [page, styles] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  assert.match(page, /saveDisabled=\{!results\.length\|\|savingResults\}/);
  assert.doesNotMatch(page, /saveDisabled=\{!results\.length\|\|busy\}/);
  assert.match(page, /searchBusy&&rows\.length\?"حفظ النتائج الحالية"/);
  assert.match(page, /aria-busy=\{saving\}/);
  assert.match(page, /className=\{`resultSaveStatus \$\{saveFeedback\.tone\}`\}/);
  assert.match(page, /جارٍ حفظ \$\{savedCount\} نتيجة/);
  assert.match(styles, /resultSave\{[^}]*min-height:44px[^}]*touch-action:manipulation/);
});

test("shows saved result groups beneath the results panel", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const resultsIndex = page.indexOf("<Results rows={results}");
  const savedGroupsIndex = page.indexOf('id="saved-results"');
  assert.ok(resultsIndex >= 0);
  assert.ok(savedGroupsIndex > resultsIndex);
  assert.match(page, /setTab\("saved"\);setTimeout\(\(\)=>document\.getElementById\("saved-results"\)\?\.scrollIntoView/);
  assert.match(page, /tab==="saved"&&<section className="panel saved" id="saved-results">/);
});

test("places all result actions in one row above the result key", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const styles = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  const componentIndex = page.indexOf("function Results(");
  const toolbarIndex = page.indexOf("resultsToolbar");
  const actionsIndex = page.indexOf('<div className="resultPanelActions">');
  const resultKeyIndex = page.indexOf('<div className="resultKey"');
  const tableToolsIndex = page.indexOf('<div className="tableTools">');
  assert.ok(componentIndex >= 0);
  assert.ok(toolbarIndex > componentIndex);
  assert.ok(actionsIndex > componentIndex);
  assert.ok(resultKeyIndex > actionsIndex);
  assert.ok(tableToolsIndex > resultKeyIndex);
  const actionsMarkup = page.slice(actionsIndex, resultKeyIndex);
  assert.match(actionsMarkup, /className="save resultSave"/);
  assert.match(actionsMarkup, /نتائج محفوظة/);
  assert.match(actionsMarkup, /المؤرشفة/);
  assert.match(actionsMarkup, /المفضلة/);
  assert.match(actionsMarkup, /تصدير Excel/);
  assert.match(styles, /resultPanelActions\{[^}]*grid-template-columns:1\.2fr 1\.2fr 1fr 1\.2fr 1fr/);
  assert.match(page, /FAVORITE_LISTINGS_KEY/);
  assert.match(page, /VIEWED_LISTING_IDS_KEY/);
  assert.match(page, /className="rowActionMenu"/);
  assert.match(page, /viewedListingIds\.includes\(r\.listingId\)\?"viewedRow"/);
  assert.match(styles, /\.resultsTable tbody tr\.viewedRow td,\.resultsTable tbody tr\.viewedRow td:first-child\{background:#fff\}/);
  assert.match(styles, /\.legend button\.near\{background:#ead4bb;color:#815529\}/);
  assert.match(styles, /\.resultsTable tbody tr\.near td\{background:#f3e1cf;color:var\(--ink\)\}/);
  assert.match(styles, /tr:has\(\.rowActionMenu\[open\]\)/);
  assert.match(styles, /\.rowActionMenuList\{[^}]*inset-inline-start:0;inset-inline-end:auto/);
  assert.doesNotMatch(styles, /\.resultsTable th:first-child,\.resultsTable td:first-child\{position:sticky/);
  assert.match(page, /separateResultsSummary=rows\.length>=100\|\|displayCities\.length>3\|\|resultCityText\.length>42/);
  assert.match(page, /resultsToolbar \$\{separateResultsSummary\?"separateSummary":"compactSummary"\}/);
  assert.match(styles, /resultsToolbar\{[^}]*grid-template-columns:minmax\(105px,\.8fr\) minmax\(0,2\.2fr\)/);
  assert.match(styles, /resultsToolbar\.separateSummary\{[^}]*grid-template-columns:1fr/);
  assert.match(page, /onShowSaved=\{loadSets\} onExport=\{exportExcel\} exportingExcel=\{exportingExcel\}/);
});

test("syncs viewed, archived, and favorite listings through a shared link", async () => {
  const [page, route, schema, migration, drizzleMigration] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/sync-state/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../db/schema.ts", import.meta.url), "utf8"),
    readFile(new URL("../migrations/0006_synced_listing_state.sql", import.meta.url), "utf8"),
    readFile(new URL("../drizzle/0006_synced_listing_state.sql", import.meta.url), "utf8"),
  ]);
  assert.match(page, /SYNC_SPACE_KEY/);
  assert.match(page, /CLOUD_SYNC_ORIGIN/);
  assert.match(page, /archived:archivedRowsRef\.current,favorites:favoriteRowsRef\.current,viewedIds:viewedListingIdsRef\.current/);
  assert.match(page, /setInterval\(\(\)=>void pull\(false\),10_000\)/);
  assert.match(route, /Access-Control-Allow-Origin/);
  assert.match(route, /ON CONFLICT\(space_id\) DO UPDATE SET/);
  assert.match(schema, /sqliteTable\("synced_listing_state"/);
  assert.equal(migration, drizzleMigration);
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

test("exports visible results as a real Excel workbook", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const excel = await readFile(new URL("../lib/excel-export.ts", import.meta.url), "utf8");
  assert.match(page, /import\("write-excel-file\/browser"\)/);
  assert.match(page, /تصدير Excel/);
  assert.match(page, /\.xlsx`/);
  assert.doesNotMatch(page, /تصدير CSV|\.csv`/);
  assert.match(excel, /rightToLeft:true/);
  assert.match(excel, /stickyRowsCount:1/);
});

test("refreshes from a deliberate downward pull without stealing horizontal table swipes", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const styles = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(page, /PULL_REFRESH_THRESHOLD = 72/);
  assert.match(page, /window\.scrollY>0/);
  assert.match(page, /Math\.abs\(deltaX\)>Math\.abs\(deltaY\)/);
  assert.match(page, /addEventListener\("touchmove",move,\{passive:false\}\)/);
  assert.match(page, /event\.preventDefault\(\)/);
  assert.match(page, /window\.location\.reload\(\)/);
  assert.match(page, /أفلت للتحديث/);
  assert.match(styles, /\.pullRefreshIndicator\{/);
  assert.match(styles, /html,body\{overscroll-behavior-y:auto\}/);
  assert.match(styles, /@media \(hover:none\),\(pointer:coarse\)\{html,body\{overscroll-behavior-y:none\}\.pullRefreshRoot\{will-change:transform\}\}/);
});
