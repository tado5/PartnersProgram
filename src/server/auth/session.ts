import { auth } from "@/auth";
import { env } from "@/lib/env";
import type { Session } from "next-auth";
import type { Company, Prisma, User } from "@prisma/client";
import { NextResponse } from "next/server";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";

import { prisma } from "../db";
import { companyCookieName, readCompanySelection } from "./company-cookie";

export type AuthContext = {
  session: Session;
  user: User;
};

export async function getAuthenticatedUser(): Promise<AuthContext | null> {
  const session = await auth();
  const sessionUser = session?.user;

  if (
    !session ||
    !sessionUser?.id ||
    !sessionUser.isSessionValid ||
    !sessionUser.loginAt ||
    !sessionUser.lastActivityAt
  ) {
    return null;
  }

  const now = Date.now();
  const idleMinutes =
    sessionUser.role !== "seller"
      ? env.SESSION_ADMIN_IDLE_MINUTES
      : env.SESSION_SELLER_IDLE_MINUTES;
  const maximumHours =
    sessionUser.role !== "seller"
      ? env.SESSION_ADMIN_MAX_HOURS
      : env.SESSION_SELLER_MAX_HOURS;

  if (
    now - sessionUser.lastActivityAt > idleMinutes * 60_000 ||
    now - sessionUser.loginAt > maximumHours * 3_600_000
  ) {
    return null;
  }

  let userId: bigint;
  try {
    userId = BigInt(sessionUser.id);
  } catch {
    return null;
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (
    !user ||
    !user.isActive ||
    user.role !== sessionUser.role ||
    (user.companyId?.toString() ?? null) !== sessionUser.companyId ||
    (user.passwordChangedAt?.getTime() ?? 0) !==
      (sessionUser.passwordChangedAt ?? 0)
  ) {
    return null;
  }

  return { session, user };
}

export async function requireRole(
  allowedRoles: readonly User["role"][],
  options: { allowPasswordChange?: boolean } = {},
): Promise<AuthContext | Response> {
  const context = await getAuthenticatedUser();
  if (!context) {
    return NextResponse.json(
      { error: { code: "UNAUTHENTICATED", message: "Prihlásenie vypršalo." } },
      { status: 401 },
    );
  }

  if (!allowedRoles.includes(context.user.role)) {
    return NextResponse.json(
      { error: { code: "FORBIDDEN", message: "Na túto operáciu nemáte oprávnenie." } },
      { status: 403 },
    );
  }

  if (context.user.mustChangePassword && !options.allowPasswordChange) {
    return NextResponse.json(
      {
        error: {
          code: "PASSWORD_CHANGE_REQUIRED",
          message: "Pred pokračovaním si zmeňte dočasné heslo.",
        },
      },
      { status: 403 },
    );
  }

  return context;
}

export function isAuthContext(value: AuthContext | Response): value is AuthContext {
  return !(value instanceof Response);
}

export type CompanyContext = AuthContext & {
  company: Company;
  companyId: bigint;
  selectionId: string;
};

export function contextError(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message } }, {
    status, headers: { "Cache-Control": "no-store" },
  });
}

export async function requireCompanyRole(
  roles: readonly User["role"][],
): Promise<CompanyContext | Response> {
  const authorization = await requireRole([...roles, "superadmin"]);
  if (!isAuthContext(authorization)) return authorization;
  const requestHeaders = await headers();
  const suppliedId = requestHeaders.get("x-company-id");
  const selection = readCompanySelection((await cookies()).get(companyCookieName)?.value);
  let companyId = authorization.user.companyId;
  let selectionId = "";
  if (authorization.user.role === "superadmin") {
    if (
      selection?.userId === authorization.user.id.toString() &&
      selection.loginAt === authorization.session.user.loginAt
    ) selectionId = selection.selectionId;
    if (!suppliedId || !/^[1-9]\d{0,19}$/.test(suppliedId) ||
        BigInt(suppliedId) > BigInt("18446744073709551615")) {
      return contextError("COMPANY_CONTEXT_REQUIRED", "Vyberte firmu.", 400);
    }
    companyId = BigInt(suppliedId);
    const marker = requestHeaders.get("x-company-selection");
    if (marker && (marker !== selectionId || suppliedId !== selection?.companyId)) {
      return contextError("COMPANY_CONTEXT_CHANGED", "Firma sa zmenila. Obnovte stránku.", 409);
    }
  } else if (suppliedId && suppliedId !== companyId?.toString()) {
    return contextError("FORBIDDEN", "Kontext firmy nemožno zmeniť.", 403);
  }
  if (!companyId) return contextError("COMPANY_CONTEXT_REQUIRED", "Vyberte firmu.", 400);
  const company = await prisma.company.findUnique({ where: { id: companyId } });
  if (!company) return contextError("NOT_FOUND", "Firma sa nenašla.", 404);
  if (!company.isActive && authorization.user.role !== "superadmin") {
    return contextError("COMPANY_INACTIVE", "Firemný program je pozastavený.", 403);
  }
  return { ...authorization, company, companyId, selectionId };
}

export async function requireCompanyPage(roles: readonly User["role"][] = ["admin", "seller"]) {
  const authorization = await requireRole([...roles, "superadmin"]);
  if (!isAuthContext(authorization)) {
    const authenticated = await getAuthenticatedUser();
    if (!authenticated) redirect("/login");
    if (authenticated.user.mustChangePassword) redirect("/change-password");
    redirect("/app");
  }
  const selection = readCompanySelection((await cookies()).get(companyCookieName)?.value);
  const companyId = authorization.user.role === "superadmin"
    ? selection?.userId === authorization.user.id.toString() &&
      selection.loginAt === authorization.session.user.loginAt
      ? BigInt(selection.companyId) : null
    : authorization.user.companyId;
  if (!companyId) redirect("/superadmin/firmy");
  const company = await prisma.company.findUnique({ where: { id: companyId } });
  if (!company) redirect("/superadmin/firmy");
  if (!company.isActive && authorization.user.role !== "superadmin") redirect("/login?companyInactive=1");
  return {
    ...authorization, company, companyId,
    selectionId: authorization.user.role === "superadmin" ? selection!.selectionId : "",
  };
}

// Company lock serializes deactivation, admin removal and business writes.
export async function lockCompanyContext(
  tx: Prisma.TransactionClient, context: CompanyContext, activeProgram = false,
) {
  await tx.$queryRaw`SELECT id FROM companies WHERE id = ${context.companyId} FOR UPDATE`;
  await tx.$queryRaw`SELECT id FROM users WHERE id = ${context.user.id} FOR UPDATE`;
  const [company, user] = await Promise.all([
    tx.company.findUnique({ where: { id: context.companyId } }),
    tx.user.findUnique({ where: { id: context.user.id } }),
  ]);
  if (!company || !user || !user.isActive || user.mustChangePassword ||
      user.role !== context.user.role || user.companyId !== context.user.companyId ||
      (user.passwordChangedAt?.getTime() ?? 0) !== (context.user.passwordChangedAt?.getTime() ?? 0)) {
    throw new CompanyContextChangedError();
  }
  if (!company.isActive && (activeProgram || user.role !== "superadmin")) {
    throw new CompanyInactiveError(activeProgram ? 409 : 403);
  }
  return company;
}

export class CompanyInactiveError extends Error {
  constructor(public status = 403) { super("Company program is inactive."); }
}

export class CompanyContextChangedError extends Error {}

export function withCompanyErrors<Args extends unknown[]>(
  handler: (...args: Args) => Promise<Response>,
) {
  return async (...args: Args): Promise<Response> => {
    try { return await handler(...args); } catch (error) {
      if (error instanceof CompanyInactiveError) {
        return contextError("COMPANY_INACTIVE", "Firemný program je pozastavený.", error.status);
      }
      if (error instanceof CompanyContextChangedError) {
        return contextError("UNAUTHENTICATED", "Prihlásenie sa zmenilo. Prihláste sa znova.", 401);
      }
      throw error;
    }
  };
}
