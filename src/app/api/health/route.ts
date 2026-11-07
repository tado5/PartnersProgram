import { connection, NextResponse } from "next/server";
import { prisma } from "@/server/db";

const headers = { "Cache-Control": "no-store" };

export async function GET() {
  await connection();

  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    console.error("Database readiness probe failed.");
    return NextResponse.json({ status: "unavailable" }, { status: 503, headers });
  }

  return NextResponse.json({ status: "ok" }, { headers });
}
