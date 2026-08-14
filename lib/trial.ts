import { getD1 } from "@/db";

export const TRIAL_BROWSER_LIMIT = 25;
export const TRIAL_GLOBAL_LIMIT = 1000;
const TRIAL_TOKEN_TTL_MS = 6 * 60 * 60 * 1000;

type TrialSummaryRow = {
  globalUsed: number;
  browserUsed: number;
};

export type TrialStatus = {
  limit: number;
  used: number;
  remaining: number;
  globalLimit: number;
  globalUsed: number;
  globalRemaining: number;
  canStart: boolean;
};

async function readSummary(browserId: string): Promise<TrialSummaryRow> {
  const row = await getD1().prepare(`
    SELECT
      COUNT(*) AS globalUsed,
      SUM(CASE WHEN browser_id = ? THEN 1 ELSE 0 END) AS browserUsed
    FROM trial_searches
  `).bind(browserId).first<TrialSummaryRow>();
  return row ?? { globalUsed: 0, browserUsed: 0 };
}

function toStatus(summary: TrialSummaryRow): TrialStatus {
  const used = Number(summary.browserUsed) || 0;
  const globalUsed = Number(summary.globalUsed) || 0;
  const remaining = Math.max(0, TRIAL_BROWSER_LIMIT - used);
  const globalRemaining = Math.max(0, TRIAL_GLOBAL_LIMIT - globalUsed);
  return {
    limit: TRIAL_BROWSER_LIMIT,
    used,
    remaining,
    globalLimit: TRIAL_GLOBAL_LIMIT,
    globalUsed,
    globalRemaining,
    canStart: remaining > 0 && globalRemaining > 0,
  };
}

export async function getTrialStatus(browserId: string): Promise<TrialStatus> {
  return toStatus(await readSummary(browserId));
}

export async function reserveTrialSearch(browserId: string, now = Date.now()) {
  const token = crypto.randomUUID();
  const inserted = await getD1().prepare(`
    INSERT INTO trial_searches (token, browser_id, started_at_ms, expires_at_ms)
    SELECT ?, ?, ?, ?
    WHERE (SELECT COUNT(*) FROM trial_searches) < ?
      AND (SELECT COUNT(*) FROM trial_searches WHERE browser_id = ?) < ?
    RETURNING token
  `).bind(
    token,
    browserId,
    now,
    now + TRIAL_TOKEN_TTL_MS,
    TRIAL_GLOBAL_LIMIT,
    browserId,
    TRIAL_BROWSER_LIMIT,
  ).first<{ token: string }>();

  if (!inserted) return { token: null, status: await getTrialStatus(browserId) };
  return { token, status: await getTrialStatus(browserId) };
}

export async function isTrialTokenValid(token: string | null, browserId: string | null, now = Date.now()) {
  if (!token || !browserId) return false;
  const row = await getD1().prepare(`
    SELECT token
    FROM trial_searches
    WHERE token = ? AND browser_id = ? AND expires_at_ms >= ?
    LIMIT 1
  `).bind(token, browserId, now).first<{ token: string }>();
  return Boolean(row);
}
