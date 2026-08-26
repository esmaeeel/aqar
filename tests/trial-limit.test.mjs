import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = path => readFile(new URL(path, root), "utf8");

test("supports a server-side per-browser override while keeping 100 as the default and 1000 globally", async () => {
  const [trial, schema, initialMigration, browserMigration, overrideMigration, browserLimitMigration] = await Promise.all([
    read("lib/trial.ts"),
    read("db/schema.ts"),
    read("drizzle/0002_redundant_warbound.sql"),
    read("drizzle/0003_solid_maestro.sql"),
    read("drizzle/0004_blushing_invisible_woman.sql"),
    read("drizzle/0005_browser-limit-100.sql"),
  ]);

  assert.match(trial, /TRIAL_BROWSER_LIMIT\s*=\s*100/);
  assert.match(trial, /TRIAL_GLOBAL_LIMIT\s*=\s*1000/);
  assert.match(trial, /SELECT search_limit FROM trial_browser_limits WHERE browser_id = \?/);
  assert.match(trial, /Math\.max\(TRIAL_BROWSER_LIMIT, Math\.min\(TRIAL_GLOBAL_LIMIT/);
  assert.doesNotMatch(trial, /TRIAL_COOLDOWN_MS|MAX\(started_at_ms\)/);
  assert.match(trial, /COUNT\(\*\)\s+FROM trial_searches\)\s*<\s*\?/s);
  assert.match(trial, /COUNT\(\*\)\s+FROM trial_searches WHERE browser_id = \?\)\s*<\s*COALESCE/s);
  assert.match(trial, /RETURNING token/);
  assert.match(schema, /sqliteTable\("trial_searches"/);
  assert.match(schema, /browserId: text\("browser_id"\)\.notNull\(\)/);
  assert.match(schema, /sqliteTable\("trial_browser_limits"/);
  assert.match(schema, /searchLimit: integer\("search_limit"\)\.notNull\(\)/);
  assert.match(initialMigration, /CREATE TABLE `trial_searches`/);
  assert.match(browserMigration, /ADD `browser_id` text DEFAULT 'legacy' NOT NULL/);
  assert.match(browserMigration, /CREATE INDEX `trial_searches_browser_started_idx`/);
  assert.match(overrideMigration, /CREATE TABLE `trial_browser_limits`/);
  assert.match(overrideMigration, /`browser_id` text PRIMARY KEY NOT NULL/);
  assert.match(browserLimitMigration, /d56408b2-63ca-414c-a6b5-db165485d509/);
  assert.match(browserLimitMigration, /VALUES \('d56408b2-63ca-414c-a6b5-db165485d509', 100,/);
  assert.match(browserLimitMigration, /ON CONFLICT \(`browser_id`\) DO UPDATE SET/);
});

test("requires one reservation before the search requests are sent", async () => {
  const [page, searchRoute] = await Promise.all([
    read("app/page.tsx"),
    read("app/api/search/route.ts"),
  ]);

  const reservation = page.indexOf('fetch("/api/trial",{method:"POST",headers:deviceHeaders()})');
  const sourceLoop = page.indexOf("for(let i=0;i<allSources.length");
  assert.ok(reservation >= 0 && reservation < sourceLoop);
  assert.match(page, /deviceHeaders\(true\).*"x-aqar-trial-token":trialToken/);
  assert.match(page, /fetch\("\/api\/trial",\{method:"POST",headers:deviceHeaders\(\)\}\)/);
  assert.doesNotMatch(page, /يمكن بدء بحث جديد الآن دون مهلة انتظار/);
  assert.doesNotMatch(page, /نسخ معرّف المتصفح|جارٍ تحديد المتصفح|navigator\.clipboard\.writeText\(browserId\)/);
  assert.doesNotMatch(page, /cooldownSeconds|nextAllowedAt|retryAfterSeconds/);
  assert.match(page, /تبدأ المدينة بـ«الرياض» وبقية الحقول فارغة عند كل فتح/);
  assert.match(page, /locations:\[\{city:"الرياض",neighborhoods:\[\]\}\]/);
  assert.match(page, /function clearFields\(\)\{setFilters\(\{\.\.\.defaults,locations:\[\{city:"",neighborhoods:\[\]\}\]\}\)/);
  assert.match(page, /placeSuggestions\(location\.city,CITY_NAMES\)/);
  assert.match(page, /!cityQuery\|\|CITY_NAMES\.includes\(cityQuery\)\?CITY_NAMES:placeSuggestions/);
  assert.match(page, /cityOpen&&cityMatches\.length>0&&<span id=\{citySuggestionsId\}/);
  assert.match(page, /localStorage\.removeItem\(LEGACY_LAST_FILTERS_KEY\)/);
  assert.doesNotMatch(page, /localStorage\.(?:getItem|setItem)\(LEGACY_LAST_FILTERS_KEY/);

  const tokenCheck = searchRoute.indexOf("isTrialTokenValid");
  const externalFetch = searchRoute.indexOf("const searchHtml = await fetchAqar");
  assert.ok(tokenCheck >= 0 && tokenCheck < externalFetch);
  assert.match(searchRoute, /request\.headers\.get\("x-aqar-device-id"\)/);
});
