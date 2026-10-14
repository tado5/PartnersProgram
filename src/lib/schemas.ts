import { z } from "zod";

const optionalText = (max: number) =>
  z.preprocess(
    (value) =>
      typeof value === "string" && value.trim() === "" ? undefined : value,
    z.string().trim().max(max).optional(),
  );

const slovakPhoneSchema = optionalText(40)
  .transform((value) => {
    if (!value) {
      return undefined;
    }

    const digits = value.replace(/\D/g, "");
    const nationalNumber = digits.startsWith("00421")
      ? digits.slice(5)
      : digits.startsWith("421")
        ? digits.slice(3)
        : digits.startsWith("0")
          ? digits.slice(1)
          : digits;

    return `+421${nationalNumber}`;
  })
  .pipe(z.string().regex(/^\+421\d{9}$/).optional());

export const userCreateSchema = z.strictObject({
  email: z.email().transform((email) => email.trim().toLowerCase()),
  name: z.string().trim().min(2).max(150),
  temporaryPassword: z.string().min(10).max(128),
  role: z.enum(["admin", "seller"]),
});

export const userUpdateSchema = z
  .strictObject({
    name: z.string().trim().min(2).max(150).optional(),
    role: z.enum(["admin", "seller"]).optional(),
    isActive: z.boolean().optional(),
  })
  .refine((values) => Object.values(values).some((value) => value !== undefined));

export const passwordChangeSchema = z.strictObject({
  currentPassword: z.string().min(1).max(128),
  newPassword: z.string().min(10).max(128),
});

export const passwordResetSchema = z.strictObject({
  temporaryPassword: z.string().min(10).max(128),
});

export const partnerCreateSchema = z.strictObject({
  type: z.enum(["installer", "company", "referrer"]),
  displayName: z.string().trim().min(2).max(100),
  phone: slovakPhoneSchema,
  email: z.preprocess(
    (value) =>
      typeof value === "string" && value.trim() === "" ? undefined : value,
    z.email().transform((email) => email.trim().toLowerCase()).optional(),
  ),
  contactPerson: optionalText(100),
  ico: z.preprocess(
    (value) =>
      typeof value === "string" && value.trim() === "" ? undefined : value,
    z.string().regex(/^\d{8}$/).optional(),
  ),
  internalNote: optionalText(1000),
  confirmDuplicates: z.boolean().optional(),
});

export const partnerUpdateSchema = partnerCreateSchema
  .partial()
  .extend({
    phone: z.union([slovakPhoneSchema, z.null()]).optional(),
    email: z.union([partnerCreateSchema.shape.email, z.null()]).optional(),
    contactPerson: z.union([optionalText(100), z.null()]).optional(),
    ico: z.union([partnerCreateSchema.shape.ico, z.null()]).optional(),
    internalNote: z.union([optionalText(1000), z.null()]).optional(),
  })
  .refine((values) =>
    Object.entries(values).some(
      ([key, value]) => key !== "confirmDuplicates" && value !== undefined,
    ),
  );

export const partnerDeactivateSchema = z.strictObject({
  reason: z.string().trim().min(1).max(255),
});

const amountInputSchema = z
  .union([
    z.string().trim().regex(/^\d{1,6}(?:[.,]\d{1,2})?$/),
    z
      .number()
      .finite()
      .refine(
        (amount) =>
          amount > 0 &&
          amount <= 999999.99 &&
          Math.abs(Math.round(amount * 100) - amount * 100) < 1e-8,
      )
      .transform(String),
  ])
  .transform((amount) => {
    const [whole, fraction = ""] = amount.replace(",", ".").split(".");
    return `${whole}.${fraction.padEnd(2, "0")}`;
  })
  .refine((amount) => {
    const [whole, fraction] = amount.split(".");
    const cents = BigInt(whole) * BigInt(100) + BigInt(fraction);
    return cents > BigInt(0) && cents <= BigInt(99999999);
  }, {
    message: "Suma musí byť väčšia ako 0 a najviac 999 999,99 €.",
  });

const purchaseConfirmationLimitSchema = z.preprocess(
  (value) => value === "" ? null : value,
  amountInputSchema.nullable(),
);

const monthlyTurnoverThresholdSchema = z.preprocess(
  (value) => value === "" ? null : value,
  z.union([
    z.string().trim().regex(/^\d{1,8}(?:[.,]\d{1,2})?$/),
    z.number().finite()
      .refine((amount) =>
        amount > 0 && amount <= 99999999.99 &&
        Math.abs(Math.round(amount * 100) - amount * 100) < 1e-8,
      )
      .transform(String),
  ])
    .transform((amount) => {
      if (typeof amount !== "string") return amount;
      const [whole, fraction = ""] = amount.replace(",", ".").split(".");
      return `${whole}.${fraction.padEnd(2, "0")}`;
    })
    .nullable(),
).refine((amount) => {
  if (amount === null) return true;
  const [whole, fraction] = amount.split(".");
  const cents = BigInt(whole) * BigInt(100) + BigInt(fraction);
  return cents > BigInt(0) && cents <= BigInt(9999999999);
}, { message: "Hranica musí byť väčšia ako 0 a najviac 99 999 999,99 €." });

const monthlyBadgeThresholdsShape = {
  bronzeMonthlyTurnoverEur: monthlyTurnoverThresholdSchema,
  silverMonthlyTurnoverEur: monthlyTurnoverThresholdSchema,
  goldMonthlyTurnoverEur: monthlyTurnoverThresholdSchema,
};

const vatRatePercentSchema = z.union([
  z.string().trim().regex(/^\d{1,3}(?:[.,]\d{1,2})?$/),
  z.number().finite()
    .refine((rate) => rate >= 0 && rate <= 100 &&
      Math.abs(Math.round(rate * 100) - rate * 100) < 1e-8)
    .transform(String),
])
  .transform((rate) => {
    const [whole, fraction = ""] = rate.replace(",", ".").split(".");
    return `${whole}.${fraction.padEnd(2, "0")}`;
  })
  .refine((rate) => {
    const [whole, fraction] = rate.split(".");
    return BigInt(whole) * BigInt(100) + BigInt(fraction) <= BigInt(10000);
  }, { message: "Sadzba DPH musí byť od 0 do 100 %." });

function hasAscendingMonthlyBadgeThresholds(
  values: {
    bronzeMonthlyTurnoverEur?: string | null;
    silverMonthlyTurnoverEur?: string | null;
    goldMonthlyTurnoverEur?: string | null;
  },
) {
  const enabled = [
    values.bronzeMonthlyTurnoverEur,
    values.silverMonthlyTurnoverEur,
    values.goldMonthlyTurnoverEur,
  ].filter((value): value is string => value !== undefined && value !== null);
  return enabled.every((value, index) => index === 0 || decimalCents(enabled[index - 1]) < decimalCents(value));
}

function decimalCents(value: string) {
  const [whole, fraction] = value.split(".");
  return BigInt(whole) * BigInt(100) + BigInt(fraction);
}

const positiveIdSchema = z.union([
  z.number().int().positive().safe().transform(BigInt),
  z.string().regex(/^[1-9]\d{0,19}$/).transform(BigInt)
    .refine((value) => value <= BigInt("18446744073709551615")),
]);

export const purchaseCreateSchema = z.strictObject({
  partnerId: positiveIdSchema,
  amount: amountInputSchema,
  partnerPresent: z.boolean(),
  note: optionalText(500),
  source: z.enum(["qr", "nfc", "manual"]),
  tokenId: positiveIdSchema.optional(),
  purchasedAt: z.coerce.date().optional(),
  idempotencyKey: z.uuid(),
  highAmountConfirmed: z.boolean().default(false),
}).refine((values) =>
  values.source === "manual" ? values.tokenId === undefined : values.tokenId !== undefined,
  { path: ["tokenId"], message: "Zdroj QR/NFC vyžaduje platný token." },
);

export const purchaseUpdateSchema = z.strictObject({
  partnerId: positiveIdSchema.optional(),
  amount: amountInputSchema.optional(),
  partnerPresent: z.boolean().optional(),
  note: z.preprocess(
    (value) => value === "" ? null : value,
    z.string().trim().max(500).nullable(),
  ).optional(),
  purchasedAt: z.coerce.date().optional(),
  reason: z.string().trim().min(1).max(255),
}).refine((values) =>
  Object.keys(values).some((key) => key !== "reason"),
);

export const purchaseDeleteSchema = z.strictObject({
  reason: z.string().trim().min(1).max(255),
});

export const tokenCreateSchema = z.strictObject({
  type: z.enum(["qr", "nfc"]),
  label: optionalText(80),
  deactivateTokenIds: z
    .array(z.string().regex(/^[1-9]\d{0,19}$/)
      .refine((value) => /^[1-9]\d{0,19}$/.test(value) && BigInt(value) <= BigInt("18446744073709551615"))
      .transform(BigInt))
    .max(100)
    .refine((ids) => new Set(ids).size === ids.length)
    .optional(),
  deactivationReason: z.string().trim().min(1).max(255).optional(),
}).refine(
  (values) =>
    !values.deactivateTokenIds?.length || Boolean(values.deactivationReason),
  { path: ["deactivationReason"], message: "Pri deaktivácii tokenov je dôvod povinný." },
);

export const tokenValueSchema = z.strictObject({
  token: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
});

export const tokenDeactivateSchema = z.strictObject({
  reason: z.string().trim().min(1).max(255),
});

export const auditLogCreateSchema = z.object({
  action: z.string().trim().min(1).max(64),
  entityType: z.string().trim().min(1).max(32),
  entityId: z.bigint().positive().optional(),
  partnerId: z.bigint().positive().optional(),
  oldValues: z.record(z.string(), z.unknown()).optional(),
  newValues: z.record(z.string(), z.unknown()).optional(),
  reason: optionalText(255),
  ipAddress: z.ipv4().or(z.ipv6()).optional(),
  userAgent: optionalText(255),
});

export const companyCreateSchema = z.strictObject({
  name: z.string().trim().min(2).max(100),
  slug: z.string().min(1).max(80).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  ico: z.string().regex(/^\d{8}$/).optional(),
  admin: userCreateSchema.omit({ role: true }),
});

export const companyUpdateSchema = z.strictObject({
  name: z.string().trim().min(2).max(100).optional(),
  ico: z.string().regex(/^\d{8}$/).nullable().optional(),
})
  .refine((value) => Object.values(value).some((item) => item !== undefined));

export const companySettingsUpdateSchema = z.strictObject({
  vatRatePercent: vatRatePercentSchema,
  purchaseConfirmAboveEur: purchaseConfirmationLimitSchema,
  ...monthlyBadgeThresholdsShape,
}).refine(hasAscendingMonthlyBadgeThresholds, {
  path: ["bronzeMonthlyTurnoverEur"],
  message: "Aktívne hranice odznakov musia byť v rastúcom poradí.",
});

export const companyContextSchema = z.strictObject({
  companyId: z.string().regex(/^[1-9]\d{0,19}$/)
    .refine((value) => /^[1-9]\d{0,19}$/.test(value) && BigInt(value) <= BigInt("18446744073709551615")),
});
