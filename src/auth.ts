import { verify, hash } from "@node-rs/argon2";
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { z } from "zod";

import { env } from "@/lib/env";
import { localTestUsers } from "@/lib/local-test-users";
import { record } from "@/server/audit";
import { prisma } from "@/server/db";
import { allowLoginAttempt, getClientIp } from "@/server/auth/rate-limit";
import type { UserRole } from "@prisma/client";

const passwordHashOptions = {
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const;

const credentialsSchema = z.object({
  email: z.email().transform((email) => email.trim().toLowerCase()),
  password: z.string().min(1).max(128),
});

const maxFailedAttempts = 5;
const lockDurationMs = 15 * 60_000;
const activityRefreshMs = 5 * 60_000;

function isUserRole(value: unknown): value is UserRole {
  return value === "admin" || value === "seller" || value === "superadmin";
}

function numberClaim(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) ? value : null;
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: env.AUTH_TRUST_HOST,
  secret: env.AUTH_SECRET,
  cookies: {
    sessionToken: {
      name:
        env.NODE_ENV === "production"
          ? "__Secure-authjs.session-token"
          : "authjs.session-token",
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: env.NODE_ENV === "production",
      },
    },
  },
  session: {
    strategy: "jwt",
    maxAge: env.SESSION_SELLER_MAX_HOURS * 60 * 60,
  },
  pages: {
    signIn: "/login",
  },
  providers: [
    Credentials({
      credentials: {
        email: { label: "E-mail", type: "email" },
        password: { label: "Heslo", type: "password" },
        testRole: { label: "Lokálna testovacia rola", type: "text" },
      },
      async authorize(credentials, request) {
        const testRole = credentials?.testRole;
        if (testRole === "superadmin" || testRole === "admin" || testRole === "seller") {
          const originHeader = request.headers.get("origin");
          const requestUrl = new URL(request.url);
          const localHostnames = new Set(["localhost", "127.0.0.1", "[::1]"]);
          const isLocalRequest =
            localHostnames.has(requestUrl.hostname) &&
            originHeader === requestUrl.origin;

          if (env.NODE_ENV !== "development" || !env.LOCAL_QUICK_LOGIN_ENABLED || !isLocalRequest) {
            return null;
          }

          const testUser = localTestUsers[testRole];
          const user = await prisma.user.findUnique({
            where: { email: testUser.email },
            include: { company: true },
          });
          if (!user?.isActive || user.role !== testRole ||
              (testRole === "superadmin"
                ? user.companyId !== null
                : !user.company?.isActive)) {
            return null;
          }

          const now = new Date();
          await prisma.$transaction(async (tx) => {
            await tx.user.update({
              where: { id: user.id },
              data: {
                failedLoginCount: 0,
                lockedUntil: null,
                lastLoginAt: now,
              },
            });
            await record(
              {
                userId: user.id,
                companyId: user.companyId,
                action: "auth.login",
                entityType: "user",
                entityId: user.id,
                newValues: { method: "local_quick_login" },
              },
              tx,
            );
          });

          return {
            id: user.id.toString(),
            name: user.name,
            email: user.email,
            role: user.role,
            companyId: user.companyId?.toString() ?? null,
            mustChangePassword: user.mustChangePassword,
            passwordChangedAt: user.passwordChangedAt?.getTime() ?? 0,
          };
        }

        const parsed = credentialsSchema.safeParse(credentials);
        const ipAddress = getClientIp(request.headers);

        if (!allowLoginAttempt(ipAddress)) {
          await record({
            action: "auth.login_failed",
            entityType: "user",
            newValues: { reason: "rate_limited" },
            ipAddress,
            userAgent: request.headers.get("user-agent")?.slice(0, 255),
          });
          return null;
        }

        if (!parsed.success) {
          await record({
            action: "auth.login_failed",
            entityType: "user",
            newValues: { reason: "invalid_credentials" },
            ipAddress,
            userAgent: request.headers.get("user-agent")?.slice(0, 255),
          });
          return null;
        }

        const { email, password } = parsed.data;
        const user = await prisma.user.findUnique({ where: { email }, include: { company: true } });
        const passwordMatches = user
          ? await verify(user.passwordHash, password)
          : (await hash(password, passwordHashOptions), false);
        const now = new Date();
        const isLocked = Boolean(user?.lockedUntil && user.lockedUntil > now);

        if (!user || !user.isActive || isLocked || !passwordMatches ||
            (user.role !== "superadmin" && !user.company?.isActive)) {
          const nextFailedCount = (user?.failedLoginCount ?? 0) + 1;
          const shouldLock = Boolean(
            user?.isActive && !isLocked && nextFailedCount >= maxFailedAttempts,
          );

          await prisma.$transaction(async (tx) => {
            if (user?.isActive && !isLocked) {
              await tx.user.update({
                where: { id: user.id },
                data: {
                  failedLoginCount: { increment: 1 },
                  ...(shouldLock
                    ? { lockedUntil: new Date(now.getTime() + lockDurationMs) }
                    : {}),
                },
              });
            }
            await record(
              {
                userId: user?.id,
                companyId: user?.companyId,
                action: "auth.login_failed",
                entityType: "user",
                entityId: user?.id,
                newValues: {
                  reason: "invalid_credentials",
                  locked: shouldLock,
                },
                ipAddress,
                userAgent: request.headers.get("user-agent")?.slice(0, 255),
              },
              tx,
            );
          });
          return null;
        }

        await prisma.$transaction(async (tx) => {
          await tx.user.update({
            where: { id: user.id },
            data: {
              failedLoginCount: 0,
              lockedUntil: null,
              lastLoginAt: now,
            },
          });
          await record(
            {
              userId: user.id,
              companyId: user.companyId,
              action: "auth.login",
              entityType: "user",
              entityId: user.id,
              ipAddress,
              userAgent: request.headers.get("user-agent")?.slice(0, 255),
            },
            tx,
          );
        });

        return {
          id: user.id.toString(),
          name: user.name,
          email: user.email,
          role: user.role,
          companyId: user.companyId?.toString() ?? null,
          mustChangePassword: user.mustChangePassword,
          passwordChangedAt: user.passwordChangedAt?.getTime() ?? 0,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        const now = Date.now();
        token.userId = user.id;
        token.role = user.role;
        token.companyId = user.companyId;
        token.tenantVersion = 1;
        token.mustChangePassword = user.mustChangePassword;
        token.passwordChangedAt = user.passwordChangedAt;
        token.loginAt = now;
        token.lastActivityAt = now;
        token.isSessionValid = true;
        return token;
      }

      if (!token.userId || token.tenantVersion !== 1) {
        return { ...token, isSessionValid: false };
      }

      const userIdClaim = typeof token.userId === "string" ? token.userId : "";
      const roleClaim = isUserRole(token.role) ? token.role : null;
      const loginAt = numberClaim(token.loginAt);
      const lastActivityAt = numberClaim(token.lastActivityAt);
      const passwordChangedAt = numberClaim(token.passwordChangedAt);
      if (
        !/^\d+$/.test(userIdClaim) ||
        !roleClaim ||
        loginAt === null ||
        lastActivityAt === null ||
        passwordChangedAt === null
      ) {
        return { ...token, isSessionValid: false };
      }

      const userId = BigInt(userIdClaim);
      const databaseUser = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          isActive: true,
          role: true,
          companyId: true,
          company: { select: { isActive: true } },
          mustChangePassword: true,
          passwordChangedAt: true,
        },
      });
      const now = Date.now();
      const isValid =
        Boolean(databaseUser?.isActive) &&
        databaseUser?.role === roleClaim &&
        (databaseUser?.companyId?.toString() ?? null) === token.companyId &&
        (databaseUser?.passwordChangedAt?.getTime() ?? 0) === passwordChangedAt &&
        now - loginAt <=
          (roleClaim !== "seller"
            ? env.SESSION_ADMIN_MAX_HOURS
            : env.SESSION_SELLER_MAX_HOURS) *
            3_600_000 &&
        now - lastActivityAt <=
          (roleClaim !== "seller"
            ? env.SESSION_ADMIN_IDLE_MINUTES
            : env.SESSION_SELLER_IDLE_MINUTES) *
            60_000;

      if (!isValid) {
        return { ...token, isSessionValid: false };
      }

      return {
        ...token,
        mustChangePassword: databaseUser?.mustChangePassword ?? true,
        ...(now - lastActivityAt >= activityRefreshMs
          ? { lastActivityAt: now }
          : {}),
        isSessionValid: true,
      };
    },
    async session({ session, token }) {
      if (token.isSessionValid !== true) {
        session.user.id = "";
        session.user.name = "";
        session.user.email = "";
        session.user.role = "seller";
        session.user.companyId = null;
        session.user.mustChangePassword = true;
        session.user.passwordChangedAt = 0;
        session.user.loginAt = 0;
        session.user.lastActivityAt = 0;
        session.user.isSessionValid = false;
        return session;
      }

      session.user.id =
        typeof token.userId === "string" ? token.userId : "";
      session.user.role = isUserRole(token.role) ? token.role : "seller";
      session.user.companyId = typeof token.companyId === "string" ? token.companyId : null;
      session.user.mustChangePassword = token.mustChangePassword === true;
      session.user.passwordChangedAt = numberClaim(token.passwordChangedAt) ?? 0;
      session.user.loginAt = numberClaim(token.loginAt) ?? 0;
      session.user.lastActivityAt = numberClaim(token.lastActivityAt) ?? 0;
      session.user.isSessionValid = token.isSessionValid === true;
      return session;
    },
  },
});
