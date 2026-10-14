import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

import { env } from "@/lib/env";
import { allowPublicRequest, getClientIp } from "@/server/auth/rate-limit";
import { closeMonthlyBadges } from "@/server/monthly-badges";

export async function POST(request: Request) {
  if (!allowPublicRequest(getClientIp(request.headers))) {
    return NextResponse.json(
      { error: { code: "RATE_LIMITED", message: "Príliš veľa požiadaviek. Skúste neskôr." } },
      { status: 429, headers: { "Cache-Control": "no-store" } },
    );
  }
  if (!env.BADGE_CRON_SECRET) {
    return NextResponse.json(
      { error: { code: "NOT_CONFIGURED", message: "Mesačné uzatváranie nie je nakonfigurované." } },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  const authorization = request.headers.get("authorization") ?? "";
  const expected = Buffer.from(`Bearer ${env.BADGE_CRON_SECRET}`);
  const supplied = Buffer.from(authorization);
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
    return NextResponse.json(
      { error: { code: "UNAUTHENTICATED", message: "Neplatná autorizácia." } },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }

  const result = await closeMonthlyBadges();
  return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
}
