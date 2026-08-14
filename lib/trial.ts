import { getD1 } from "@/db";

export const TRIAL_SEARCH_LIMIT = 100;
export const TRIAL_COOLDOWN_MS = 10 * 60 * 1000;
const TRIAL_TOKEN_TTL_MS = 6 * 60 * 60 * 1000;

type TrialSummaryRow = {
  used: number;
  lastStartedAtMs: number | null;
};

export type TrialStatus = {
  limit: number;
  used: number;
  remaining: number;
  canStart: boolean;
  retryAfterSeconds: number;
  nextAllowedAt: number | null;
};

async function readSummary(): Promise<TrialSummaryRow> {
  const row = await getD1().prepare(`
    SELECT
      COUNT(*) AS used,
      MAX(started_at_ms) AS lastStartedAtMs
    FROM trial_searches
  `).first<TrialSummaryRow>();
  return row ?? { used: 0, lastStartedAtMs: null };
}

function toStatus(summary: TrialSummaryRow, now: number): TrialStatus {
  const used = Number(summary.used) || 0;
  const lastStartedAtMs = summary.lastStartedAtMs == null ? null : Number(summary.lastStartedAtMs);
  const nextAllowedAt = lastStartedAtMs == null ? null : lastStartedAtMs + TRIAL_COOLDOWN_MS;
  const retryAfterSeconds = nextAllowedAt == null ? 0 : Math.max(0, Math.ceil((nextAllowedAt - now) / 1000));
  const remaining = Math.max(0, TRIAL_SEARCH_LIMIT - used);
  return {
    limit: TRIAL_SEARCH_LIMIT,
    used,
    remaining,
    canStart: remaining > 0 && retryAfterSeconds === 0,
    retryAfterSeconds,
    nextAllowedAt,
  };
}

export async function getTrialStatus(now = Date.now()): Promise<TrialStatus> {
  return toStatus(await readSummary(), now);
}

export async function reserveTrialSearch(now = Date.now()) {
  const token = crypto.randomUUID();
  const inserted = await getD1().prepare(`
    INSERT INTO trial_searches (token, started_at_ms, expires_at_ms)
    SELECT ?, ?, ?
    WHERE (SELECT COUNT(*) FROM trial_searches) < ?
      AND COALESCE((SELECT MAX(started_at_ms) FROM trial_searches), 0) <= ?
    RETURNING token
  `).bind(
    token,
    now,
    now + TRIAL_TOKEN_TTL_MS,
    TRIAL_SEARCH_LIMIT,
    now - TRIAL_COOLDOWN_MS,
  ).first<{ token: string }>();

  if (!inserted) return { token: null, status: await getTrialStatus(now) };
  return { token, status: await getTrialStatus(now) };
}

export async function isTrialTokenValid(token: string | null, now = Date.now()) {
  if (!token) return false;
  const row = await getD1().prepare(`
    SELECT token
    FROM trial_searches
    WHERE token = ? AND expires_at_ms >= ?
    LIMIT 1
  `).bind(token, now).first<{ token: string }>();
  return Boolean(row);
}
