import { randomInt } from "node:crypto";
import type { Partner, Prisma } from "@prisma/client";

import { prisma, type DbClient } from "./db";

const PARTNER_CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTVWXYZ";

export function generatePartnerCode() {
  let suffix = "";
  for (let index = 0; index < 5; index += 1) {
    suffix += PARTNER_CODE_ALPHABET[randomInt(PARTNER_CODE_ALPHABET.length)];
  }
  return `EP-${suffix}`;
}

export function partnerResponse(partner: Partner, includePrivate = false) {
  return {
    id: partner.id.toString(),
    code: partner.code,
    type: partner.type,
    displayName: partner.displayName,
    phone: includePrivate ? partner.phone : maskPhone(partner.phone),
    ...(includePrivate
      ? {
          email: partner.email,
          contactPerson: partner.contactPerson,
          ico: partner.ico,
          internalNote: partner.internalNote,
        }
      : {}),
    isActive: partner.isActive,
    deactivatedAt: partner.deactivatedAt,
    createdAt: partner.createdAt,
    updatedAt: partner.updatedAt,
  };
}

export function maskPhone(phone: string | null) {
  return phone ? `*** *** ${phone.slice(-3)}` : null;
}

export async function findDuplicatePartners(
  companyId: bigint,
  values: { phone?: string | null; ico?: string | null },
  excludeId?: bigint,
  db: DbClient = prisma,
) {
  const or: Prisma.PartnerWhereInput[] = [];
  if (values.phone) or.push({ phone: values.phone });
  if (values.ico) or.push({ ico: values.ico });
  if (!or.length) return [];

  const partners = await db.partner.findMany({
    where: {
      companyId,
      ...(excludeId ? { id: { not: excludeId } } : {}),
      OR: or,
    },
    select: { id: true, code: true, displayName: true, phone: true, ico: true },
    orderBy: [{ displayName: "asc" }, { id: "asc" }],
    take: 10,
  });
  return partners.map((partner) => ({
    id: partner.id.toString(),
    code: partner.code,
    displayName: partner.displayName,
    matchesPhone: Boolean(values.phone && values.phone === partner.phone),
    matchesIco: Boolean(values.ico && values.ico === partner.ico),
  }));
}

export function normalizePartnerSearch(value: string) {
  const query = value.trim();
  const code = query.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
  const codeSearch = code.startsWith("EP") ? `EP-${code.slice(2)}` : `EP-${code}`;
  const digits = query.replace(/\D/g, "");
  const normalizedDigits = digits.startsWith("00421")
    ? digits.slice(5)
    : digits.startsWith("421")
      ? digits.slice(3)
      : digits.startsWith("0")
        ? digits.slice(1)
        : digits;

  return {
    query,
    codeSearch,
    codeFragment: code.startsWith("EP") ? code.slice(2) : code,
    phoneSearch: normalizedDigits ? `+421${normalizedDigits}` : "",
    icoSearch: digits,
  };
}
