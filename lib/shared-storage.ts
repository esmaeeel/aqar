const LOCAL_ORIGINS = new Set(["http://127.0.0.1:8768", "http://localhost:8768"]);
const SYNC_SPACE_PATTERN = /^[a-z0-9-]{20,80}$/i;

export function storedUserId(request: Request) {
  const space = new URL(request.url).searchParams.get("sync") || "";
  if (SYNC_SPACE_PATTERN.test(space)) return `sync:${space}`;
  const signed = request.headers.get("oai-authenticated-user-id");
  const device = request.headers.get("x-aqar-device-id") || "";
  return signed || (/^[a-f0-9-]{20,64}$/i.test(device) ? `device:${device}` : "device:anonymous");
}

export function storedDataHeaders(request: Request) {
  const origin = request.headers.get("origin") || "";
  const headers = new Headers({ "Cache-Control": "no-store", Vary: "Origin" });
  if (LOCAL_ORIGINS.has(origin)) headers.set("Access-Control-Allow-Origin", origin);
  return headers;
}

export function storedDataJson(request: Request, body: unknown, init: ResponseInit = {}) {
  const headers = storedDataHeaders(request);
  headers.set("Content-Type", "application/json; charset=utf-8");
  new Headers(init.headers).forEach((value, key) => headers.set(key, value));
  return new Response(JSON.stringify(body), { ...init, headers });
}

export function storedDataOptions(request: Request) {
  const headers = storedDataHeaders(request);
  headers.set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  headers.set("Access-Control-Allow-Headers", "content-type, x-aqar-device-id");
  headers.set("Access-Control-Max-Age", "86400");
  return new Response(null, { status: 204, headers });
}
