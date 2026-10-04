import { isTrialTokenValid } from "@/lib/trial";

export const dynamic = "force-dynamic";

const AQAR_ORIGIN = "https://sa.aqar.fm";
const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

function validAqarUrl(raw: unknown) {
  if (typeof raw !== "string" || raw.length > 800) return null;
  try {
    const url = new URL(raw);
    if (url.origin !== AQAR_ORIGIN || url.username || url.password || url.hash) return null;
    if (url.search && (url.searchParams.size !== 1 || url.searchParams.get("type") !== "eq,2")) return null;
    const parts = url.pathname.split("/").filter(Boolean).map(decodeURIComponent);
    if (parts.length < 1 || parts.length > 6) return null;
    if (parts[0] !== "عقارات" && !/^[\p{Script=Arabic}-]+-لل(?:بيع|إيجار)$/u.test(parts[0])) return null;
    if (parts.some(part => !part || part.length > 180 || /[/\\?#]/.test(part))) return null;
    return url.href;
  } catch { return null; }
}

function sourceError(status: number) {
  if (status === 429) return "أوقف موقع عقار القراءة مؤقتًا بسبب كثرة الطلبات (429).";
  if (status === 401 || status === 403) return `منع موقع عقار القراءة الآلية مؤقتًا (${status}). لن تحاول الأداة تجاوز الحماية.`;
  return `تعذر قراءة موقع عقار (${status}).`;
}

export async function POST(request: Request) {
  if (!await isTrialTokenValid(request.headers.get("x-aqar-trial-token"), request.headers.get("x-aqar-device-id"))) {
    return Response.json({ error: "ابدأ البحث من الصفحة للحصول على محاولة تجريبية صالحة." }, { status: 403 });
  }
  const input = await request.json().catch(() => ({})) as { url?: string };
  const url = validAqarUrl(input.url);
  if (!url) return Response.json({ error: "مصدر الإعلان غير صالح." }, { status: 400 });
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const upstream = await fetch(url, { headers: { "Accept": "text/html,application/xhtml+xml", "Accept-Language": "ar-SA,ar;q=0.9", "User-Agent": "Mozilla/5.0 (compatible; AqarResearchTool/1.0; respectful batch reader)" }, redirect: "follow" });
      if (!upstream.ok) return Response.json({ error: sourceError(upstream.status) }, { status: 502 });
      const finalUrl = validAqarUrl(upstream.url || url);
      if (!finalUrl) return Response.json({ error: "أعاد موقع عقار مصدرًا خارج نطاق البحث." }, { status: 502 });
      return new Response(upstream.body, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-aqar-final-url": encodeURIComponent(finalUrl) } });
    } catch (error) {
      if (error instanceof Error && /the string did not match the expected pattern/i.test(error.message)) {
        if (attempt === 0) { await pause(1_400); continue; }
        return Response.json({ error: "تعذر اتصال خادم البحث بمنصة عقار بعد إعادة المحاولة." }, { status: 502 });
      }
      return Response.json({ error: error instanceof Error ? error.message : "تعذر قراءة موقع عقار." }, { status: 502 });
    }
  }
  return Response.json({ error: "تعذر قراءة موقع عقار." }, { status: 502 });
}
