import { hash } from "@node-rs/argon2";
import { NextResponse } from "next/server";

import { passwordResetSchema } from "@/lib/schemas";
import { record } from "@/server/audit";
import { prisma } from "@/server/db";
import {
  hasSameOrigin,
  invalidUserIdResponse,
  parseUserId,
  readJson,
} from "@/server/auth/http";
import { isAuthContext, requireCompanyRole, lockCompanyContext, withCompanyErrors } from "@/server/auth/session";

type RouteContext = { params: Promise<{ id: string }> };

const passwordHashOptions = {
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const;

export const POST = withCompanyErrors(resetPassword);

async function resetPassword(request: Request, { params }: RouteContext) {
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
  if (authorization.user.id === userId) {
    return NextResponse.json(
      {
        error: {
          code: "USE_SELF_PASSWORD_CHANGE",
          message: "Na zmenu vlastného hesla použite možnosť zmeny hesla.",
        },
      },
      { status: 409 },
    );
  }
  const parsed = await readJson(request, passwordResetSchema);
  if ("response" in parsed) {
    return parsed.response;
  }

  const target = await prisma.user.findFirst({
    where: { id: userId, companyId: authorization.companyId },
    select: { id: true },
  });
  if (!target) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "Používateľ sa nenašiel." } },
      { status: 404 },
    );
  }

  const passwordHash = await hash(parsed.data.temporaryPassword, passwordHashOptions);
  const now = new Date();
  await prisma.$transaction(async (tx) => {
    await lockCompanyContext(tx, authorization);
    await tx.user.update({
      where: { id: userId, companyId: authorization.companyId },
      data: {
        passwordHash,
        passwordChangedAt: now,
        mustChangePassword: true,
        failedLoginCount: 0,
        lockedUntil: null,
      },
    });
    await record(
      {
        userId: authorization.user.id,
        companyId: authorization.companyId,
        action: "user.password_reset",
        entityType: "user",
        entityId: userId,
        newValues: { mustChangePassword: true },
      },
      tx,
    );
  });

  return NextResponse.json({ mustChangePassword: true });
}
