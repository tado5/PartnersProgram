import { hash } from "@node-rs/argon2";
import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";

import { userCreateSchema } from "@/lib/schemas";
import { record } from "@/server/audit";
import { prisma } from "@/server/db";
import { hasSameOrigin, readJson, userResponse } from "@/server/auth/http";
import { isAuthContext, requireCompanyRole, lockCompanyContext, withCompanyErrors } from "@/server/auth/session";

const passwordHashOptions = {
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const;

export async function GET() {
  const authorization = await requireCompanyRole(["admin"]);
  if (!isAuthContext(authorization)) {
    return authorization;
  }

  const users = await prisma.user.findMany({
    where: { companyId: authorization.companyId, role: { in: ["admin", "seller"] } },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      isActive: true,
      mustChangePassword: true,
      lastLoginAt: true,
      createdAt: true,
    },
  });

  return NextResponse.json({ users: users.map(userResponse) }, { headers: { "Cache-Control": "no-store" } });
}

export const POST = withCompanyErrors(createUser);

async function createUser(request: Request) {
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

  const parsed = await readJson(request, userCreateSchema);
  if ("response" in parsed) {
    return parsed.response;
  }

  const passwordHash = await hash(parsed.data.temporaryPassword, passwordHashOptions);
  try {
    const user = await prisma.$transaction(async (tx) => {
      await lockCompanyContext(tx, authorization);
      const created = await tx.user.create({
        data: {
          companyId: authorization.companyId,
          email: parsed.data.email,
          name: parsed.data.name,
          role: parsed.data.role,
          passwordHash,
          isActive: true,
          mustChangePassword: true,
        },
      });
      await record(
        {
          userId: authorization.user.id,
          companyId: authorization.companyId,
          action: "user.create",
          entityType: "user",
          entityId: created.id,
          newValues: {
            email: created.email,
            name: created.name,
            role: created.role,
            isActive: created.isActive,
          },
        },
        tx,
      );
      return created;
    });

    return NextResponse.json({ user: userResponse(user) }, { status: 201 });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return NextResponse.json(
        { error: { code: "CONFLICT", message: "Používateľ s týmto e-mailom už existuje." } },
        { status: 409 },
      );
    }
    throw error;
  }
}
