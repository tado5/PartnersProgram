import type { DefaultSession } from "next-auth";
import type { UserRole } from "@prisma/client";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: UserRole;
      companyId: string | null;
      mustChangePassword: boolean;
      passwordChangedAt: number;
      loginAt: number;
      lastActivityAt: number;
      isSessionValid: boolean;
    } & DefaultSession["user"];
  }

  interface User {
    role: UserRole;
    companyId: string | null;
    mustChangePassword: boolean;
    passwordChangedAt: number;
  }
}

declare module "@auth/core/jwt" {
  interface JWT {
    userId?: string;
    role?: UserRole;
    companyId?: string | null;
    tenantVersion?: number;
    mustChangePassword?: boolean;
    passwordChangedAt?: number;
    loginAt?: number;
    lastActivityAt?: number;
    isSessionValid?: boolean;
  }
}
