import { verify, hash } from "@node-rs/argon2";
import { NextResponse } from "next/server";

import {
  passwordChangeSchema,
} from "@/lib/schemas";
import { record } from "@/server/audit";
import { prisma } from "@/server/db";
import { hasSameOrigin, readJson } from "@/server/auth/http";
import { isAuthContext, requireRole } from "@/server/auth/session";

const passwordHashOptions = {
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const;

export async function POST(request: Request) {
  if (!hasSameOrigin(request)) {
    return NextResponse.json(
      { error: { code: "INVALID_ORIGIN", message: "Neplatný pôvod požiadavky." } },
      { status: 403 },
    );
  }

  const authorization = await requireRole(["superadmin", "admin", "seller"], {
    allowPasswordChange: true,
  });
  if (!isAuthContext(authorization)) {
    return authorization;
  }

  const parsed = await readJson(request, passwordChangeSchema);
  if ("response" in parsed) {
    return parsed.response;
  }

  if (!(await verify(authorization.user.passwordHash, parsed.data.currentPassword))) {
    return NextResponse.json(
      {
        error: {
          code: "CURRENT_PASSWORD_INVALID",
          message: "Súčasné heslo nie je správne.",
        },
      },
      { status: 400 },
    );
  }

  const passwordHash = await hash(parsed.data.newPassword, passwordHashOptions);
  const now = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: authorization.user.id },
      data: {
        passwordHash,
        mustChangePassword: false,
        passwordChangedAt: now,
        failedLoginCount: 0,
        lockedUntil: null,
      },
    });
    await record(
      {
        userId: authorization.user.id,
        companyId: authorization.user.companyId,
        action: "user.password_change",
        entityType: "user",
        entityId: authorization.user.id,
        newValues: { mustChangePassword: false },
      },
      tx,
    );
  });

  return NextResponse.json({ mustSignInAgain: true });
}
