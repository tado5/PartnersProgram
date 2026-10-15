import { NextResponse } from "next/server";

import { privacyReceiptSchema } from "@/lib/privacy";
import { hasSameOrigin, parseUserId, readJson } from "@/server/auth/http";
import { isAuthContext, requireCompanyRole, lockCompanyContext, withCompanyErrors } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { appendPrivacyReceipt, listPrivacyReceipts, withPrivacyReceiptErrors } from "@/server/privacy-receipts";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Context) {
  const context = await requireCompanyRole(["admin"]);
  if (!isAuthContext(context)) return context;
  const id = parseUserId((await params).id);
  const partner = id && id <= BigInt("9223372036854775807")
    ? await prisma.partner.findFirst({ where: { id, companyId: context.companyId }, select: { id: true } }) : null;
  if (!partner) return missing();
  return NextResponse.json({ items: await listPrivacyReceipts(context.companyId, partner.id) }, {
    headers: { "Cache-Control": "no-store" },
  });
}

export const POST = withCompanyErrors(withPrivacyReceiptErrors(async (request: Request, { params }: Context) => {
  if (!hasSameOrigin(request)) return NextResponse.json(
    { error: { code: "INVALID_ORIGIN", message: "Neplatný pôvod požiadavky." } }, { status: 403 },
  );
  const context = await requireCompanyRole(["admin"]);
  if (!isAuthContext(context)) return context;
  if (context.user.role !== "admin") return NextResponse.json(
    { error: { code: "FORBIDDEN", message: "Poskytnutie informácií môže zaznamenať iba admin danej firmy." } }, { status: 403 },
  );
  const id = parseUserId((await params).id);
  if (!id || id > BigInt("9223372036854775807")) return missing();
  const parsed = await readJson(request, privacyReceiptSchema);
  if ("response" in parsed) return parsed.response;
  return prisma.$transaction(async (tx) => {
    await lockCompanyContext(tx, context);
    const partner = await tx.partner.findFirst({ where: { id, companyId: context.companyId }, select: { id: true } });
    if (!partner) return missing();
    const receipt = await appendPrivacyReceipt(tx, context, id, parsed.data);
    return NextResponse.json({ id: receipt.id.toString() }, { status: 201, headers: { "Cache-Control": "no-store" } });
  });
}));

function missing() {
  return NextResponse.json({ error: { code: "NOT_FOUND", message: "Partner sa nenašiel." } }, { status: 404 });
}
