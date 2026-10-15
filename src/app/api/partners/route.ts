import { PartnerType, Prisma } from "@prisma/client";
import { NextResponse } from "next/server";

import { partnerCreateSchema } from "@/lib/schemas";
import { record } from "@/server/audit";
import { hasSameOrigin, readJson } from "@/server/auth/http";
import { isAuthContext, requireCompanyRole, withCompanyErrors } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { requirePublishedPrivacy, withPrivacyReceiptErrors } from "@/server/privacy-receipts";
import { createPartner as createPartnerRecord } from "@/server/repositories/partners";
import {
  findDuplicatePartners,
  generatePartnerCode,
  normalizePartnerSearch,
  partnerResponse,
} from "@/server/partners";

const PAGE_SIZE = 20;

export async function GET(request: Request) {
  const authorization = await requireCompanyRole(["admin", "seller"]);
  if (!isAuthContext(authorization)) return authorization;

  const searchParams = new URL(request.url).searchParams;
  const query = searchParams.get("q")?.trim() ?? "";
  const typeInput = searchParams.get("type");
  const activeInput = searchParams.get("active") ?? "all";
  const privacyInput = searchParams.get("privacy") ?? "all";
  const page = Number(searchParams.get("page") ?? "1");
  if (
    (typeInput && !Object.values(PartnerType).includes(typeInput as PartnerType)) ||
    !["all", "true", "false"].includes(activeInput) ||
    !["all", "missing", "recorded"].includes(privacyInput) ||
    !Number.isInteger(page) ||
    page < 1 ||
    page > 10_000
  ) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "Neplatné filtre vyhľadávania." } },
      { status: 400 },
    );
  }

  const where: Prisma.PartnerWhereInput = {
    companyId: authorization.companyId,
    ...(typeInput ? { type: typeInput as PartnerType } : {}),
    ...(activeInput === "all" ? {} : { isActive: activeInput === "true" }),
    ...(privacyInput === "all" ? {} : { privacyReceipts: privacyInput === "missing" ? { none: {} } : { some: {} } }),
  };
  if (authorization.user.role === "seller") {
    if (privacyInput !== "all") return NextResponse.json(
      { error: { code: "FORBIDDEN", message: "Filter informovania je dostupný iba administrácii." } }, { status: 403 },
    );
    where.isActive = true;
  }

  if (query) {
    const normalized = normalizePartnerSearch(query);
    where.OR = [
      { displayName: { contains: normalized.query } },
      { code: { contains: normalized.codeSearch } },
      ...(normalized.codeFragment
        ? [{ code: { contains: normalized.codeFragment } }]
        : []),
      ...(normalized.phoneSearch
        ? [{ phone: { contains: normalized.phoneSearch } }]
        : []),
      ...(normalized.icoSearch
        ? [{ ico: { contains: normalized.icoSearch } }]
        : []),
    ];
  }

  const [partners, total] = await Promise.all([
    prisma.partner.findMany({
      where,
      orderBy: [{ displayName: "asc" }, { id: "asc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: { _count: { select: { privacyReceipts: true } } },
    }),
    prisma.partner.count({ where }),
  ]);

  return NextResponse.json(
    {
      items: partners.map((partner) =>
        ({ ...partnerResponse(partner, authorization.user.role !== "seller"),
          ...(authorization.user.role !== "seller" ? { privacyRecorded: partner._count.privacyReceipts > 0 } : {}) }),
      ),
      page,
      pageSize: PAGE_SIZE,
      total,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export const POST = withCompanyErrors(withPrivacyReceiptErrors(createPartner));

async function createPartner(request: Request) {
  if (!hasSameOrigin(request)) {
    return NextResponse.json(
      { error: { code: "INVALID_ORIGIN", message: "Neplatný pôvod požiadavky." } },
      { status: 403 },
    );
  }
  const authorization = await requireCompanyRole(["admin"]);
  if (!isAuthContext(authorization)) return authorization;
  await requirePublishedPrivacy(authorization.companyId);

  const parsed = await readJson(request, partnerCreateSchema);
  if ("response" in parsed) return parsed.response;

  const duplicates = await findDuplicatePartners(authorization.companyId, parsed.data);
  if (duplicates.length && !parsed.data.confirmDuplicates) {
    return NextResponse.json(
      {
        error: {
          code: "DUPLICATE_WARNING",
          message: "Partner s rovnakým telefónom alebo IČO už existuje.",
          matches: duplicates,
        },
      },
      { status: 409 },
    );
  }
  const data = { ...parsed.data };
  delete data.confirmDuplicates;
  const { privacy, ...partnerData } = data;

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = generatePartnerCode();
    try {
      const partner = await prisma.$transaction(async (tx) => {
        const created = await createPartnerRecord(authorization, { ...partnerData, code }, tx, privacy);
        await record(
          {
            userId: authorization.user.id,
            companyId: authorization.companyId,
            action: "partner.create",
            entityType: "partner",
            entityId: created.id,
            partnerId: created.id,
            newValues: {
              code: created.code,
              type: created.type,
              displayName: created.displayName,
              phone: created.phone,
              email: created.email,
              contactPerson: created.contactPerson,
              ico: created.ico,
              internalNote: created.internalNote,
            },
          },
          tx,
        );
        return created;
      });
      return NextResponse.json(
        { partner: partnerResponse(partner, true) },
        { status: 201 },
      );
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002" &&
        attempt < 4
      ) {
        continue;
      }
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        return NextResponse.json(
          { error: { code: "CODE_GENERATION_FAILED", message: "Kód partnera sa nepodarilo prideliť. Skúste to znova." } },
          { status: 503 },
        );
      }
      throw error;
    }
  }
  throw new Error("Unreachable partner code generation state");
}
