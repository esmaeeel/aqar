import { getTrialStatus, reserveTrialSearch } from "@/lib/trial";

export const dynamic = "force-dynamic";

function browserId(request: Request) {
  const value = request.headers.get("x-aqar-device-id") || "";
  return /^[a-f0-9-]{20,64}$/i.test(value) ? value : null;
}

export async function GET(request: Request) {
  const id = browserId(request);
  if (!id) return Response.json({ error: "تعذر التعرّف على هذا المتصفح." }, { status: 400 });
  return Response.json(await getTrialStatus(id), {
    headers: { "cache-control": "no-store" },
  });
}

export async function POST(request: Request) {
  const id = browserId(request);
  if (!id) return Response.json({ error: "تعذر التعرّف على هذا المتصفح." }, { status: 400 });
  const reservation = await reserveTrialSearch(id);
  if (reservation.token) {
    return Response.json(reservation, {
      status: 201,
      headers: { "cache-control": "no-store" },
    });
  }

  const browserExhausted = reservation.status.remaining === 0;
  const globalExhausted = reservation.status.globalRemaining === 0;
  const exhausted = browserExhausted || globalExhausted;
  return Response.json({
    ...reservation,
    error: globalExhausted
      ? "انتهى الحد الإجمالي للتجربة."
      : browserExhausted
        ? "استخدم هذا المتصفح جميع عملياته التجريبية المتاحة."
      : `يلزم الانتظار ${Math.max(1, Math.ceil(reservation.status.retryAfterSeconds / 60))} دقيقة قبل بدء بحث جديد.`,
  }, {
    status: exhausted ? 403 : 429,
    headers: {
      "cache-control": "no-store",
      ...(exhausted ? {} : { "retry-after": String(reservation.status.retryAfterSeconds) }),
    },
  });
}
