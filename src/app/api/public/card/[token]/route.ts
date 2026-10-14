import { NextResponse } from "next/server";

import { getPublicCard } from "@/server/public-card";

type RouteContext = { params: Promise<{ token: string }> };

export async function GET(request: Request, { params }: RouteContext) {
  const { token } = await params;
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) {
    return notFound();
  }

  const requestedPage = new URL(request.url).searchParams.get("page");
  const page = requestedPage === null ? 1 : Number(requestedPage);
  if (!Number.isInteger(page) || page < 1 || page > 10000) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "Neplatná stránka." } },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  const card = await getPublicCard(token, page);
  if (!card) return notFound();
  return NextResponse.json(card, { headers: { "Cache-Control": "no-store" } });
}

function notFound() {
  return NextResponse.json(
    { error: { code: "NOT_FOUND", message: "Karta sa nenašla." } },
    { status: 404, headers: { "Cache-Control": "no-store" } },
  );
}
