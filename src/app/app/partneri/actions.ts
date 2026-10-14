"use server";

import { revalidatePath } from "next/cache";

import { requireCompanyPage } from "@/server/auth/session";

export async function refreshPartnerViews(companyId: string, selectionId: string) {
  const context = await requireCompanyPage(["admin"]);
  if (context.companyId.toString() !== companyId || context.selectionId !== selectionId) {
    return { error: "Obnovte prihlásenie na načítanie aktuálnych údajov partnerov." };
  }

  // A Server Action also invalidates the client navigation cache, unlike an API handler.
  revalidatePath("/app/partneri", "layout");
  return { error: null };
}
