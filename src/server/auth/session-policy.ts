import type { UserRole } from "@prisma/client";
import { env } from "@/lib/env";

export const rememberedSessionSeconds = 7 * 24 * 60 * 60;

export function sessionLimits(role: UserRole, rememberLogin = false) {
  return rememberLogin
    ? { idleMs: rememberedSessionSeconds * 1000, maximumMs: rememberedSessionSeconds * 1000 }
    : {
      idleMs: (role === "seller" ? env.SESSION_SELLER_IDLE_MINUTES : env.SESSION_ADMIN_IDLE_MINUTES) * 60_000,
      maximumMs: (role === "seller" ? env.SESSION_SELLER_MAX_HOURS : env.SESSION_ADMIN_MAX_HOURS) * 3_600_000,
    };
}
