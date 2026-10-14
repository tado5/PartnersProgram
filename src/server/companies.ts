import { hash } from "@node-rs/argon2";
import { Prisma, type Company } from "@prisma/client";
import { z } from "zod";

import { companyCreateSchema, companyUpdateSchema } from "@/lib/schemas";
import { record } from "./audit";
import { prisma } from "./db";
import { lockCompanyContext, type AuthContext, type CompanyContext } from "./auth/session";

export class CompanyError extends Error {
  constructor(public code: string, message: string, public status = 409) {
    super(message);
  }
}

export function companyResponse(company: Company) {
  return {
    id: company.id.toString(), name: company.name, slug: company.slug, ico: company.ico,
    vatRatePercent: company.vatRatePercent.toFixed(2),
    purchaseConfirmAboveEur: company.purchaseConfirmAboveEur?.toFixed(2) ?? null,
    bronzeMonthlyTurnoverEur: company.bronzeMonthlyTurnoverEur?.toFixed(2) ?? null,
    silverMonthlyTurnoverEur: company.silverMonthlyTurnoverEur?.toFixed(2) ?? null,
    goldMonthlyTurnoverEur: company.goldMonthlyTurnoverEur?.toFixed(2) ?? null,
    isActive: company.isActive, deactivatedAt: company.deactivatedAt,
    createdAt: company.createdAt, updatedAt: company.updatedAt,
  };
}

async function assertSuperadmin(tx: Prisma.TransactionClient, context: AuthContext) {
  await tx.$queryRaw`SELECT id FROM users WHERE id = ${context.user.id} FOR UPDATE`;
  const actor = await tx.user.findUnique({ where: { id: context.user.id } });
  if (!actor || actor.role !== "superadmin" || actor.companyId !== null ||
      !actor.isActive || actor.mustChangePassword ||
      (actor.passwordChangedAt?.getTime() ?? 0) !== (context.user.passwordChangedAt?.getTime() ?? 0)) {
    throw new CompanyError("FORBIDDEN", "Operácia vyžaduje aktívneho superadmina.", 403);
  }
}

export async function listCompanies({
  q = "", active = "all", page = 1, pageSize = 20,
}: { q?: string; active?: string; page?: number; pageSize?: number }) {
  if (!["all", "true", "false"].includes(active) ||
      !Number.isInteger(page) || page < 1 || page > 10000 ||
      !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) {
    throw new CompanyError("VALIDATION_ERROR", "Neplatné filtre.", 400);
  }
  const where: Prisma.CompanyWhereInput = {
    ...(active === "all" ? {} : { isActive: active === "true" }),
    ...(q ? { OR: [{ name: { contains: q } }, { slug: { contains: q } }, { ico: { contains: q } }] } : {}),
  };
  const [companies, total] = await Promise.all([
    prisma.company.findMany({
      where, orderBy: [{ name: "asc" }, { id: "asc" }],
      skip: (page - 1) * pageSize, take: pageSize,
      include: { _count: { select: { users: true, partners: true } } },
    }),
    prisma.company.count({ where }),
  ]);
  return { items: companies.map((company) => ({ ...companyResponse(company), counts: company._count })), total, page, pageSize };
}

export async function companyDetails(id: bigint) {
  const company = await prisma.company.findUnique({
    where: { id },
    include: { users: {
      where: { role: "admin" },
      select: { id: true, name: true, email: true, isActive: true, mustChangePassword: true },
      orderBy: { id: "asc" },
    }, _count: { select: { users: true, partners: true } } },
  });
  if (!company) throw new CompanyError("NOT_FOUND", "Firma sa nenašla.", 404);
  return {
    ...companyResponse(company), counts: company._count,
    admins: company.users.map((user) => ({ ...user, id: user.id.toString() })),
  };
}

export async function createCompany(context: AuthContext, data: z.infer<typeof companyCreateSchema>) {
  const passwordHash = await hash(data.admin.temporaryPassword, { memoryCost: 19_456, timeCost: 2, parallelism: 1 });
  try {
    return await prisma.$transaction(async (tx) => {
      await assertSuperadmin(tx, context);
      const company = await tx.company.create({ data: {
        name: data.name, slug: data.slug, ico: data.ico, createdByUserId: context.user.id,
      } });
      const admin = await tx.user.create({ data: {
        companyId: company.id, email: data.admin.email, name: data.admin.name,
        role: "admin", passwordHash, mustChangePassword: true,
      } });
      await record({
        companyId: company.id, userId: context.user.id, action: "company.create",
        entityType: "company", entityId: company.id,
        newValues: {
          name: company.name, slug: company.slug, ico: company.ico,
          vatRatePercent: company.vatRatePercent.toFixed(2), isActive: true,
        },
      }, tx);
      await record({
        companyId: company.id, userId: context.user.id, action: "user.create",
        entityType: "user", entityId: admin.id,
        newValues: { name: admin.name, email: admin.email, role: admin.role, isActive: true },
      }, tx);
      return companyResponse(company);
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new CompanyError("CONFLICT", "Slug alebo e-mail už existuje.");
    }
    throw error;
  }
}

export async function changeCompany(
  context: AuthContext, id: bigint,
  change: { action: "update"; data: z.infer<typeof companyUpdateSchema> } |
    { action: "activate" } | { action: "deactivate"; reason: string },
) {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM companies WHERE id = ${id} FOR UPDATE`;
    await assertSuperadmin(tx, context);
    const current = await tx.company.findUnique({ where: { id } });
    if (!current) throw new CompanyError("NOT_FOUND", "Firma sa nenašla.", 404);
    if (change.action === "activate") {
      const admins = await tx.$queryRaw<Array<{ id: bigint }>>`
        SELECT id FROM users WHERE company_id = ${id} AND role = 'admin' AND is_active = 1 FOR UPDATE
      `;
      if (!admins.length) throw new CompanyError("ACTIVE_ADMIN_REQUIRED", "Firma musí mať aktívneho admina.");
    }
    const updated = await tx.company.update({ where: { id }, data:
      change.action === "update" ? change.data :
        { isActive: change.action === "activate", deactivatedAt: change.action === "activate" ? null : new Date() },
    });
    await record({
      companyId: id, userId: context.user.id, action: `company.${change.action}`,
      entityType: "company", entityId: id,
      oldValues: {
        name: current.name, ico: current.ico,
        vatRatePercent: current.vatRatePercent.toFixed(2),
        purchaseConfirmAboveEur: current.purchaseConfirmAboveEur?.toFixed(2) ?? null,
        bronzeMonthlyTurnoverEur: current.bronzeMonthlyTurnoverEur?.toFixed(2) ?? null,
        silverMonthlyTurnoverEur: current.silverMonthlyTurnoverEur?.toFixed(2) ?? null,
        goldMonthlyTurnoverEur: current.goldMonthlyTurnoverEur?.toFixed(2) ?? null,
        isActive: current.isActive,
      },
      newValues: {
        name: updated.name, ico: updated.ico,
        vatRatePercent: updated.vatRatePercent.toFixed(2),
        purchaseConfirmAboveEur: updated.purchaseConfirmAboveEur?.toFixed(2) ?? null,
        bronzeMonthlyTurnoverEur: updated.bronzeMonthlyTurnoverEur?.toFixed(2) ?? null,
        silverMonthlyTurnoverEur: updated.silverMonthlyTurnoverEur?.toFixed(2) ?? null,
        goldMonthlyTurnoverEur: updated.goldMonthlyTurnoverEur?.toFixed(2) ?? null,
        isActive: updated.isActive,
      },
      ...(change.action === "deactivate" ? { reason: change.reason } : {}),
    }, tx);
    return companyResponse(updated);
  });
}

export async function updateCompanySettings(
  context: CompanyContext,
  settings: {
    vatRatePercent: string;
    purchaseConfirmAboveEur: string | null;
    bronzeMonthlyTurnoverEur: string | null;
    silverMonthlyTurnoverEur: string | null;
    goldMonthlyTurnoverEur: string | null;
  },
) {
  return prisma.$transaction(async (tx) => {
    const current = await lockCompanyContext(tx, context);
    const updated = await tx.company.update({
      where: { id: context.companyId },
      data: settings,
    });
    await record({
      companyId: context.companyId, userId: context.user.id,
      action: "company.update", entityType: "company", entityId: context.companyId,
      oldValues: {
        vatRatePercent: current.vatRatePercent.toFixed(2),
        purchaseConfirmAboveEur: current.purchaseConfirmAboveEur?.toFixed(2) ?? null,
        bronzeMonthlyTurnoverEur: current.bronzeMonthlyTurnoverEur?.toFixed(2) ?? null,
        silverMonthlyTurnoverEur: current.silverMonthlyTurnoverEur?.toFixed(2) ?? null,
        goldMonthlyTurnoverEur: current.goldMonthlyTurnoverEur?.toFixed(2) ?? null,
      },
      newValues: {
        vatRatePercent: updated.vatRatePercent.toFixed(2),
        purchaseConfirmAboveEur: updated.purchaseConfirmAboveEur?.toFixed(2) ?? null,
        bronzeMonthlyTurnoverEur: updated.bronzeMonthlyTurnoverEur?.toFixed(2) ?? null,
        silverMonthlyTurnoverEur: updated.silverMonthlyTurnoverEur?.toFixed(2) ?? null,
        goldMonthlyTurnoverEur: updated.goldMonthlyTurnoverEur?.toFixed(2) ?? null,
      },
    }, tx);
    return companyResponse(updated);
  });
}

// No HTTP endpoint grants or edits global roles. This is the sole administrative service
// for any future global-account deactivation, serialized on the permanent bootstrap firm.
export async function setSuperadminActivity(context: AuthContext, id: bigint, isActive: boolean) {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM companies WHERE slug = 'europodlahy' FOR UPDATE`;
    await assertSuperadmin(tx, context);
    const superadmins = await tx.$queryRaw<Array<{ id: bigint; is_active: number }>>`
      SELECT id, is_active FROM users WHERE role = 'superadmin' ORDER BY id FOR UPDATE
    `;
    if (!superadmins.some((user) => user.id === id)) throw new CompanyError("NOT_FOUND", "Účet sa nenašiel.", 404);
    if (!isActive && !superadmins.some((user) => user.id !== id && user.is_active)) {
      throw new CompanyError("LAST_ACTIVE_SUPERADMIN", "Posledného superadmina nemožno deaktivovať.");
    }
    const user = await tx.user.update({ where: { id, role: "superadmin", companyId: null }, data: { isActive } });
    await record({ userId: context.user.id, action: "user.update", entityType: "user", entityId: id,
      newValues: { isActive } }, tx);
    return user;
  });
}
