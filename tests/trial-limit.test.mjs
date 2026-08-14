import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = path => readFile(new URL(path, root), "utf8");

test("limits each browser to 25 searches and the group to 1000 without a cooldown", async () => {
  const [trial, schema, initialMigration, browserMigration] = await Promise.all([
    read("lib/trial.ts"),
    read("db/schema.ts"),
    read("drizzle/0002_redundant_warbound.sql"),
    read("drizzle/0003_solid_maestro.sql"),
  ]);

  assert.match(trial, /TRIAL_BROWSER_LIMIT\s*=\s*25/);
  assert.match(trial, /TRIAL_GLOBAL_LIMIT\s*=\s*1000/);
  assert.doesNotMatch(trial, /TRIAL_COOLDOWN_MS|MAX\(started_at_ms\)/);
  assert.match(trial, /COUNT\(\*\)\s+FROM trial_searches\)\s*<\s*\?/s);
  assert.match(trial, /COUNT\(\*\)\s+FROM trial_searches WHERE browser_id = \?\)\s*<\s*\?/s);
  assert.match(trial, /RETURNING token/);
  assert.match(schema, /sqliteTable\("trial_searches"/);
  assert.match(schema, /browserId: text\("browser_id"\)\.notNull\(\)/);
  assert.match(initialMigration, /CREATE TABLE `trial_searches`/);
  assert.match(browserMigration, /ADD `browser_id` text DEFAULT 'legacy' NOT NULL/);
  assert.match(browserMigration, /CREATE INDEX `trial_searches_browser_started_idx`/);
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
  assert.match(page, /يمكن بدء بحث جديد الآن دون مهلة انتظار/);
  assert.doesNotMatch(page, /cooldownSeconds|nextAllowedAt|retryAfterSeconds/);

  const tokenCheck = searchRoute.indexOf("isTrialTokenValid");
  const externalFetch = searchRoute.indexOf("const searchHtml = await fetchAqar");
  assert.ok(tokenCheck >= 0 && tokenCheck < externalFetch);
  assert.match(searchRoute, /request\.headers\.get\("x-aqar-device-id"\)/);
});
