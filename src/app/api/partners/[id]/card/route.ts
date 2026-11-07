import { createHash } from "node:crypto";
import QRCode from "qrcode";
import { z } from "zod";
import { NextResponse } from "next/server";

import { companyLogoDataUrl } from "@/lib/company-logo";
import { env } from "@/lib/env";
import { hasSameOrigin, MAX_QUERY_ID, parseUserId, readJson } from "@/server/auth/http";
import { isAuthContext, requireCompanyRole, withCompanyErrors } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { record } from "@/server/audit";
import { renderPartnerCardPdf } from "@/server/partner-card-pdf";

const cardSchema = z.object({
  token: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  format: z.enum(["card", "a4"]),
});

export const POST = withCompanyErrors(async (request: Request, { params }: {
  params: Promise<{ id: string }>;
}) => {
  if (!hasSameOrigin(request)) {
    return NextResponse.json({ error: { code: "INVALID_ORIGIN", message: "Neplatný pôvod požiadavky." } }, { status: 403 });
  }
  const authorization = await requireCompanyRole(["admin"]);
  if (!isAuthContext(authorization)) return authorization;
  const partnerId = parseUserId((await params).id);
  if (!partnerId) {
    return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: "Neplatné ID partnera." } }, { status: 400 });
  }
  if (partnerId > MAX_QUERY_ID) {
    return NextResponse.json({ error: { code: "NOT_FOUND", message: "Aktívna karta sa nenašla." } }, { status: 404 });
  }
  const parsed = await readJson(request, cardSchema);
  if ("response" in parsed) return parsed.response;
  const token = await prisma.partnerToken.findFirst({
    where: {
      companyId: authorization.companyId, partnerId,
      type: "qr",
      tokenHash: createHash("sha256").update(parsed.data.token).digest("hex"),
      isActive: true, company: { isActive: true }, partner: { isActive: true },
    },
    select: { partner: { select: { displayName: true, code: true } } },
  });
  if (!token) {
    return NextResponse.json({
      error: { code: "NOT_FOUND", message: "Aktívna karta sa nenašla. QR kód už nemusí byť platný." },
    }, { status: 404 });
  }
  const url = new URL(`/k/${parsed.data.token}`, `${env.APP_BASE_URL.replace(/\/+$/, "")}/`).toString();
  const pdf = await renderPartnerCardPdf({
    companyName: authorization.company.name,
    companyLogoUrl: companyLogoDataUrl(authorization.company.logoData),
    partnerName: token.partner.displayName,
    partnerCode: token.partner.code,
    qrPng: await QRCode.toDataURL(url, { width: 512, margin: 2, errorCorrectionLevel: "H" }),
  }, parsed.data.format);
  await record({
    companyId: authorization.companyId,
    userId: authorization.user.id,
    action: "export.partner_card",
    entityType: "export",
    partnerId,
    newValues: { format: parsed.data.format },
  });
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="partner-card-${parsed.data.format}.pdf"`,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
});
