import { getTrialStatus, reserveTrialSearch } from "@/lib/trial";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json(await getTrialStatus(), {
    headers: { "cache-control": "no-store" },
  });
}

export async function POST() {
  const reservation = await reserveTrialSearch();
  if (reservation.token) {
    return Response.json(reservation, {
      status: 201,
      headers: { "cache-control": "no-store" },
    });
  }

  const exhausted = reservation.status.remaining === 0;
  return Response.json({
    ...reservation,
    error: exhausted
      ? "انتهت المحاولات التجريبية المتاحة للمجموعة."
      : `يلزم الانتظار ${Math.max(1, Math.ceil(reservation.status.retryAfterSeconds / 60))} دقيقة قبل بدء بحث جديد.`,
  }, {
    status: exhausted ? 403 : 429,
    headers: {
      "cache-control": "no-store",
      ...(exhausted ? {} : { "retry-after": String(reservation.status.retryAfterSeconds) }),
    },
  });
}
