import { getD1 } from "@/db";

export const dynamic = "force-dynamic";

type StoredState = {
  archived_json: string;
  favorites_json: string;
  viewed_ids_json: string;
  updated_at_ms: number;
};

const LOCAL_ORIGINS = new Set(["http://127.0.0.1:8768", "http://localhost:8768"]);

function corsHeaders(request: Request) {
  const origin = request.headers.get("origin") || "";
  return LOCAL_ORIGINS.has(origin) ? { "Access-Control-Allow-Origin": origin, Vary: "Origin" } : {};
}

function json(request: Request, body: unknown, init: ResponseInit = {}) {
  return Response.json(body, { ...init, headers: { ...corsHeaders(request), ...(init.headers || {}) } });
}

function spaceId(request: Request) {
  const value = new URL(request.url).searchParams.get("space") || "";
  return /^[a-z0-9-]{20,80}$/i.test(value) ? value : "";
}

function parseArray(value: string) {
  try { const parsed = JSON.parse(value); return Array.isArray(parsed) ? parsed : []; }
  catch { return []; }
}

function listingRows(value: unknown) {
  if (!Array.isArray(value)) return [];
  const rows = value.filter(row => row && typeof row === "object" && typeof row.listingId === "string" && typeof row.url === "string");
  return [...new Map(rows.slice(-2000).map(row => [row.listingId, row])).values()];
}

function viewedIds(value: unknown) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((id): id is string => typeof id === "string" && /^\d{5,}$/.test(id)).slice(-10000))];
}

export async function OPTIONS(request: Request) {
  return new Response(null, { status: 204, headers: { ...corsHeaders(request), "Access-Control-Allow-Methods": "GET, PUT, OPTIONS", "Access-Control-Allow-Headers": "content-type" } });
}

export async function GET(request: Request) {
  const space = spaceId(request);
  if (!space) return json(request, { error: "رابط المزامنة غير صالح." }, { status: 400 });
  const row = await getD1().prepare("SELECT archived_json, favorites_json, viewed_ids_json, updated_at_ms FROM synced_listing_state WHERE space_id = ?").bind(space).first<StoredState>();
  if (!row) return json(request, { exists: false, archived: [], favorites: [], viewedIds: [], version: 0 });
  return json(request, { exists: true, archived: parseArray(row.archived_json), favorites: parseArray(row.favorites_json), viewedIds: parseArray(row.viewed_ids_json), version: row.updated_at_ms });
}

export async function PUT(request: Request) {
  const space = spaceId(request);
  if (!space) return json(request, { error: "رابط المزامنة غير صالح." }, { status: 400 });
  const raw = await request.text();
  if (raw.length > 2_000_000) return json(request, { error: "بيانات المزامنة كبيرة جدًا." }, { status: 413 });
  let body: { archived?: unknown; favorites?: unknown; viewedIds?: unknown };
  try { body = JSON.parse(raw); }
  catch { return json(request, { error: "بيانات المزامنة غير صالحة." }, { status: 400 }); }
  const archived = listingRows(body.archived), favorites = listingRows(body.favorites), viewed = viewedIds(body.viewedIds), now = Date.now();
  await getD1().prepare(`INSERT INTO synced_listing_state (space_id, archived_json, favorites_json, viewed_ids_json, updated_at_ms)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(space_id) DO UPDATE SET
      archived_json = excluded.archived_json,
      favorites_json = excluded.favorites_json,
      viewed_ids_json = excluded.viewed_ids_json,
      updated_at_ms = MAX(synced_listing_state.updated_at_ms + 1, excluded.updated_at_ms)`)
    .bind(space, JSON.stringify(archived), JSON.stringify(favorites), JSON.stringify(viewed), now).run();
  const saved = await getD1().prepare("SELECT updated_at_ms FROM synced_listing_state WHERE space_id = ?").bind(space).first<{ updated_at_ms: number }>();
  return json(request, { ok: true, version: saved?.updated_at_ms || now });
}
