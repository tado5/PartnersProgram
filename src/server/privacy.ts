import type { CompanyPrivacyDraft, Prisma } from "@prisma/client";
import { NextResponse } from "next/server";

import {
  privacyDraftSchema, privacyNoticeResponse, privacyNoticeSchema,
  type PrivacyDraftInput, type PrivacyPublishInput,
} from "@/lib/privacy";
import { record } from "./audit";
import {
  lockCompanyContext, withCompanyErrors, type CompanyContext,
} from "./auth/session";
import { prisma } from "./db";
import { validationFields } from "@/lib/validation-errors";

export { privacyNoticeResponse } from "@/lib/privacy";

type PrivacyDb = Pick<Prisma.TransactionClient, "company" | "companyPrivacyDraft" | "companyPrivacyNotice">;

export class PrivacyError extends Error {
  constructor(
    public code: string, message: string, public status = 409,
    public fields?: Array<{ field: string; message: string }>,
  ) { super(message); }
}

export function withPrivacyErrors<Args extends unknown[]>(handler: (...args: Args) => Promise<Response>) {
  return withCompanyErrors(async (...args: Args) => {
    try {
      return await handler(...args);
    } catch (error) {
      if (error instanceof PrivacyError) {
        return NextResponse.json({
          error: { code: error.code, message: error.message, ...(error.fields ? { fields: error.fields } : {}) },
        }, { status: error.status, headers: { "Cache-Control": "no-store" } });
      }
      throw error;
    }
  });
}

function draftResponse(draft: CompanyPrivacyDraft) {
  return {
    controllerName: draft.controllerName,
    controllerAddress: draft.controllerAddress,
    controllerIco: draft.controllerIco,
    contactEmail: draft.contactEmail,
    dpoContact: draft.dpoContact,
    body: draft.body,
    updatedAt: draft.updatedAt.toISOString(),
  };
}

export async function currentPrivacyNotice(companyId: bigint, db: PrivacyDb = prisma) {
  return db.companyPrivacyNotice.findFirst({
    where: { companyId }, orderBy: { version: "desc" },
  });
}

export async function getCompanyPrivacy(companyId: bigint, db: PrivacyDb = prisma) {
  const [draft, current] = await Promise.all([
    db.companyPrivacyDraft.findUnique({ where: { companyId } }),
    currentPrivacyNotice(companyId, db),
  ]);
  return {
    draft: draft ? draftResponse(draft) : null,
    current: current ? privacyNoticeResponse(current) : null,
  };
}

export async function getPublicPrivacyNotice(slug: string, version?: number) {
  if (version !== undefined && (!Number.isInteger(version) || version < 1 || version > 4_294_967_295)) {
    return null;
  }
  const company = await prisma.company.findFirst({
    where: { slug, isActive: true },
    select: {
      name: true, slug: true,
      privacyNotices: {
        where: version === undefined ? {} : { version },
        orderBy: { version: "desc" }, take: 1,
      },
    },
  });
  const notice = company?.privacyNotices[0];
  if (!company || !notice) return null;
  return { companyName: company.name, companySlug: company.slug, notice: privacyNoticeResponse(notice) };
}

function assertAdmin(context: CompanyContext) {
  if (context.user.role !== "admin" || context.user.companyId !== context.companyId) {
    throw new PrivacyError("FORBIDDEN", "Oznámenie môže meniť iba admin danej firmy.", 403);
  }
}

export async function saveCompanyPrivacyDraft(context: CompanyContext, input: PrivacyDraftInput) {
  assertAdmin(context);
  const data = privacyDraftSchema.parse(input);
  return prisma.$transaction(async (tx) => {
    await lockCompanyContext(tx, context);
    const previous = await tx.companyPrivacyDraft.findUnique({ where: { companyId: context.companyId } });
    // Preserve the optimistic publishing token even for two writes within one millisecond.
    const updatedAt = new Date(Math.max(Date.now(), (previous?.updatedAt.getTime() ?? 0) + 1));
    const draft = await tx.companyPrivacyDraft.upsert({
      where: { companyId: context.companyId },
      create: { companyId: context.companyId, ...data, updatedAt },
      update: { ...data, updatedAt },
    });
    await record({
      companyId: context.companyId, userId: context.user.id,
      action: "company.privacy_draft_update", entityType: "company", entityId: context.companyId,
      newValues: { updatedAt: draft.updatedAt.toISOString(), bodyLength: data.body.length },
    }, tx);
    return getCompanyPrivacy(context.companyId, tx);
  });
}

export async function publishCompanyPrivacyNotice(context: CompanyContext, input: PrivacyPublishInput) {
  assertAdmin(context);
  return prisma.$transaction(async (tx) => {
    await lockCompanyContext(tx, context);
    const draft = await tx.companyPrivacyDraft.findUnique({ where: { companyId: context.companyId } });
    if (!draft) {
      throw new PrivacyError("PRIVACY_DRAFT_MISSING", "Najskôr uložte návrh oznámenia.");
    }
    if (input.expectedUpdatedAt !== undefined &&
        new Date(input.expectedUpdatedAt).getTime() !== draft.updatedAt.getTime()) {
      throw new PrivacyError("PRIVACY_DRAFT_CHANGED", "Návrh sa zmenil. Obnovte stránku a skontrolujte ho.");
    }
    const parsed = privacyNoticeSchema.safeParse({
      controllerName: draft.controllerName, controllerAddress: draft.controllerAddress,
      controllerIco: draft.controllerIco, contactEmail: draft.contactEmail,
      dpoContact: draft.dpoContact, body: draft.body,
    });
    if (!parsed.success) {
      throw new PrivacyError("VALIDATION_ERROR", "Pred publikovaním doplňte údaje oznámenia.", 400,
        validationFields(parsed.error.issues));
    }
    const current = await currentPrivacyNotice(context.companyId, tx);
    if (current?.version === 4_294_967_295) {
      throw new PrivacyError("PRIVACY_VERSION_LIMIT", "Bol dosiahnutý maximálny počet verzií.");
    }
    const notice = await tx.companyPrivacyNotice.create({ data: {
      ...parsed.data, companyId: context.companyId,
      version: (current?.version ?? 0) + 1, publishedByUserId: context.user.id,
    } });
    // Consume the reviewed revision so a retry cannot publish the same token twice.
    await tx.companyPrivacyDraft.update({
      where: { companyId: context.companyId },
      data: { updatedAt: new Date(Math.max(Date.now(), draft.updatedAt.getTime() + 1)) },
    });
    await record({
      companyId: context.companyId, userId: context.user.id,
      action: "company.privacy_publish", entityType: "company", entityId: context.companyId,
      newValues: { noticeId: notice.id.toString(), version: notice.version },
    }, tx);
    return privacyNoticeResponse(notice);
  });
}
