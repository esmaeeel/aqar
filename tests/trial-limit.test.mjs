import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = path => readFile(new URL(path, root), "utf8");

test("limits the shared trial to 100 searches with a ten-minute global cooldown", async () => {
  const [trial, schema, migration] = await Promise.all([
    read("lib/trial.ts"),
    read("db/schema.ts"),
    read("drizzle/0002_redundant_warbound.sql"),
  ]);

  assert.match(trial, /TRIAL_SEARCH_LIMIT\s*=\s*100/);
  assert.match(trial, /TRIAL_COOLDOWN_MS\s*=\s*10\s*\*\s*60\s*\*\s*1000/);
  assert.match(trial, /COUNT\(\*\)\s+FROM trial_searches\)\s*<\s*\?/s);
  assert.match(trial, /MAX\(started_at_ms\).*<=\s*\?/s);
  assert.match(trial, /RETURNING token/);
  assert.match(schema, /sqliteTable\("trial_searches"/);
  assert.match(migration, /CREATE TABLE `trial_searches`/);
});

test("requires one reservation before the search requests are sent", async () => {
  const [page, searchRoute] = await Promise.all([
    read("app/page.tsx"),
    read("app/api/search/route.ts"),
  ]);

  const reservation = page.indexOf('fetch("/api/trial",{method:"POST"})');
  const sourceLoop = page.indexOf("for(let i=0;i<allSources.length");
  assert.ok(reservation >= 0 && reservation < sourceLoop);
  assert.match(page, /"x-aqar-trial-token":trialToken/);

  const tokenCheck = searchRoute.indexOf("isTrialTokenValid");
  const externalFetch = searchRoute.indexOf("const searchHtml = await fetchAqar");
  assert.ok(tokenCheck >= 0 && tokenCheck < externalFetch);
});
