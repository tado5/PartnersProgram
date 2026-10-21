import { z } from "zod";

const mysqlUrl = z.url().refine((value) => value.startsWith("mysql://"), {
  message: "Must be a mysql:// URL.",
});

const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    APP_BASE_URL: z.url().default("http://localhost:3000"),
    DATABASE_URL: mysqlUrl,
    MIGRATE_DATABASE_URL: mysqlUrl.optional(),
    SHADOW_DATABASE_URL: mysqlUrl.optional(),
    TEST_DATABASE_URL: mysqlUrl.optional(),
    AUTH_SECRET: z.string().min(32).optional(),
    TOKEN_ENCRYPTION_KEY: z.preprocess(
      (value) => value === "" ? undefined : value,
      z.string().regex(/^[a-fA-F0-9]{64}$/).optional(),
    ),
    AUTH_URL: z.url().optional(),
    AUTH_TRUST_HOST: z.stringbool().default(false),
    LOCAL_QUICK_LOGIN_ENABLED: z
      .stringbool()
      .default(process.env.NODE_ENV === "development"),
    SESSION_SELLER_IDLE_MINUTES: z.coerce.number().int().positive().default(60),
    SESSION_SELLER_MAX_HOURS: z.coerce.number().int().positive().default(10),
    SESSION_ADMIN_IDLE_MINUTES: z.coerce.number().int().positive().default(30),
    SESSION_ADMIN_MAX_HOURS: z.coerce.number().int().positive().default(8),
    SEED_ADMIN_EMAIL: z.preprocess(
      (value) => (value === "" ? undefined : value),
      z.email().optional(),
    ),
    SEED_SUPERADMIN_EMAIL: z.preprocess(
      (value) => (value === "" ? undefined : value), z.email().optional(),
    ),
    SEED_SUPERADMIN_PASSWORD: z.preprocess(
      (value) => (value === "" ? undefined : value), z.string().min(12).max(128).optional(),
    ),
    SEED_ADMIN_PASSWORD: z.preprocess(
      (value) => (value === "" ? undefined : value),
      z.string().min(12).max(128).optional(),
    ),
    SEED_SELLER_EMAIL: z.preprocess(
      (value) => (value === "" ? undefined : value),
      z.email().optional(),
    ),
    SEED_SELLER_PASSWORD: z.preprocess(
      (value) => (value === "" ? undefined : value),
      z.string().min(12).max(128).optional(),
    ),
    RATE_LIMIT_PUBLIC_PER_MIN: z.coerce.number().int().positive().default(30),
    RATE_LIMIT_LOGIN_PER_MIN: z.coerce.number().int().positive().default(10),
    BADGE_CRON_SECRET: z.preprocess(
      (value) => value === "" ? undefined : value,
      z.string().min(32).optional(),
    ),
    APP_TIMEZONE: z.string().default("Europe/Bratislava"),
    NEXT_TELEMETRY_DISABLED: z.stringbool().default(true),
  })
  .superRefine((values, context) => {
    for (const prefix of ["SEED_ADMIN", "SEED_SUPERADMIN"] as const) {
      if (Boolean(values[`${prefix}_EMAIL`]) !== Boolean(values[`${prefix}_PASSWORD`])) {
        context.addIssue({ code: "custom", message: `${prefix}_EMAIL and ${prefix}_PASSWORD must be set together.`, path: [`${prefix}_PASSWORD`] });
      }
    }
    if (
      Boolean(values.SEED_SELLER_EMAIL) !==
      Boolean(values.SEED_SELLER_PASSWORD)
    ) {
      context.addIssue({
        code: "custom",
        message: "SEED_SELLER_EMAIL and SEED_SELLER_PASSWORD must be set together.",
        path: ["SEED_SELLER_PASSWORD"],
      });
    }

    if (values.NODE_ENV === "production" && !values.AUTH_SECRET) {
      context.addIssue({
        code: "custom",
        message: "AUTH_SECRET is required in production.",
        path: ["AUTH_SECRET"],
      });
    }

    if (values.NODE_ENV === "production" && values.LOCAL_QUICK_LOGIN_ENABLED) {
      context.addIssue({
        code: "custom",
        message: "LOCAL_QUICK_LOGIN_ENABLED is only allowed in development.",
        path: ["LOCAL_QUICK_LOGIN_ENABLED"],
      });
    }

    if (
      values.NODE_ENV === "production" &&
      (values.APP_BASE_URL.includes("localhost") ||
        !values.APP_BASE_URL.startsWith("https://"))
    ) {
      context.addIssue({
        code: "custom",
        message: "APP_BASE_URL must use HTTPS and cannot be localhost in production.",
        path: ["APP_BASE_URL"],
      });
    }
  });

export const env = envSchema.parse(process.env);
