import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";

import { userUpdateSchema } from "@/lib/schemas";
import { record } from "@/server/audit";
import { prisma } from "@/server/db";
import {
  hasSameOrigin,
  invalidUserIdResponse,
  parseUserId,
  readJson,
  userResponse,
} from "@/server/auth/http";
import { isAuthContext, requireCompanyRole, lockCompanyContext, withCompanyErrors } from "@/server/auth/session";

type RouteContext = { params: Promise<{ id: string }> };

export const PATCH = withCompanyErrors(updateUser);

async function updateUser(request: Request, { params }: RouteContext) {
  if (!hasSameOrigin(request)) {
    return NextResponse.json(
      { error: { code: "INVALID_ORIGIN", message: "Neplatný pôvod požiadavky." } },
      { status: 403 },
    );
  }

  const authorization = await requireCompanyRole(["admin"]);
  if (!isAuthContext(authorization)) {
    return authorization;
  }

  const { id } = await params;
  const userId = parseUserId(id);
  if (!userId) {
    return invalidUserIdResponse();
  }
  const parsed = await readJson(request, userUpdateSchema);
  if ("response" in parsed) {
    return parsed.response;
  }

  const currentUser = await prisma.user.findFirst({ where: { id: userId, companyId: authorization.companyId } });
  if (!currentUser) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "Používateľ sa nenašiel." } },
      { status: 404 },
    );
  }

  try {
    const updated = await prisma.$transaction(async (tx) => {
      const company = await lockCompanyContext(tx, authorization);
      const current = await tx.user.findFirst({ where: { id: userId, companyId: authorization.companyId } });
      if (!current) return null;
      const removesActiveAdmin = current.role === "admin" && current.isActive &&
        ((parsed.data.role !== undefined && parsed.data.role !== "admin") ||
          parsed.data.isActive === false);
      if (removesActiveAdmin && company.isActive) {
        const activeAdmins = await tx.$queryRaw<Array<{ id: bigint }>>`
          SELECT id FROM users
          WHERE company_id = ${authorization.companyId} AND role = 'admin' AND is_active = 1
          FOR UPDATE
        `;
        if (activeAdmins.filter((admin) => admin.id !== userId).length === 0) {
          return null;
        }
      }

      const user = await tx.user.update({
        where: { id: userId, companyId: authorization.companyId },
        data: parsed.data,
      });
      await record(
        {
          userId: authorization.user.id,
          companyId: authorization.companyId,
          action: "user.update",
          entityType: "user",
          entityId: user.id,
          oldValues: {
            name: current.name,
            role: current.role,
            isActive: current.isActive,
          },
          newValues: {
            name: user.name,
            role: user.role,
            isActive: user.isActive,
          },
        },
        tx,
      );
      return user;
    });
    if (!updated) {
      return NextResponse.json(
        {
          error: {
            code: "LAST_ACTIVE_ADMIN",
            message: "Posledného aktívneho admina nemožno deaktivovať ani zmeniť jeho rolu.",
          },
        },
        { status: 409 },
      );
    }
    return NextResponse.json({ user: userResponse(updated) });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2025"
    ) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Používateľ sa nenašiel." } },
        { status: 404 },
      );
    }
    throw error;
  }
}
