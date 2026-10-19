import { z } from "zod";
import { hasPrivacyTemplatePlaceholders } from "./privacy-template";

const nullableText = (max: number) => z.string().trim().max(max)
  .nullable().optional().transform((value) => value || null);

export const privacyDraftSchema = z.strictObject({
  controllerName: z.string().trim().max(150),
  controllerAddress: z.string().trim().max(500),
  controllerIco: nullableText(8),
  contactEmail: z.string().trim().max(191),
  dpoContact: nullableText(500),
  body: z.string().trim().max(20_000),
});

export const privacyNoticeSchema = privacyDraftSchema.extend({
  controllerName: z.string().trim().min(1).max(150),
  controllerAddress: z.string().trim().min(1).max(500),
  controllerIco: nullableText(8).refine((value) => value === null || /^\d{8}$/.test(value)),
  contactEmail: z.string().trim().max(191).pipe(z.email()),
  body: z.string().trim().min(100).max(20_000)
    .refine((value) => Array.from(value).length >= 100, "Text musí mať aspoň 100 znakov.")
    .refine((value) => !hasPrivacyTemplatePlaceholders(value), "Pred publikovaním nahraďte všetky časti [DOPLNIŤ: …] konkrétnymi informáciami firmy."),
});

export const privacyPublishSchema = z.strictObject({
  expectedUpdatedAt: z.iso.datetime(),
});

export const privacyReceiptSchema = z.strictObject({
  noticeId: z.string().regex(/^\d{1,20}$/).refine((value) =>
    /^\d{1,20}$/.test(value) &&
    BigInt(value) > BigInt(0) && BigInt(value) <= BigInt("18446744073709551615")),
  providedAt: z.iso.datetime(),
  method: z.enum(["in_person", "printed", "email"]),
  reason: nullableText(255).refine((value) => value === null || value.length >= 2, "Dôvod musí mať aspoň 2 znaky."),
});

export type PrivacyDraftInput = z.infer<typeof privacyDraftSchema>;
export type PrivacyReceiptInput = z.infer<typeof privacyReceiptSchema>;
export type PrivacyPublishInput = z.infer<typeof privacyPublishSchema>;

export function privacyNoticeResponse(notice: {
  id: bigint;
  version: number;
  controllerName: string;
  controllerAddress: string;
  controllerIco: string | null;
  contactEmail: string;
  dpoContact: string | null;
  body: string;
  publishedAt: Date;
}) {
  return {
    id: notice.id.toString(),
    version: notice.version,
    controllerName: notice.controllerName,
    controllerAddress: notice.controllerAddress,
    controllerIco: notice.controllerIco,
    contactEmail: notice.contactEmail,
    dpoContact: notice.dpoContact,
    body: notice.body,
    publishedAt: notice.publishedAt.toISOString(),
  };
}

export type PrivacyNoticeSnapshot = ReturnType<typeof privacyNoticeResponse>;
