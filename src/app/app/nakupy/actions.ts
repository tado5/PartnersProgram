"use server";

import { revalidatePath } from "next/cache";

import { requireCompanyPage } from "@/server/auth/session";

export async function refreshPurchaseViews(companyId: string, selectionId: string) {
  const context = await requireCompanyPage(["admin", "seller"]);
  if (context.companyId.toString() !== companyId || context.selectionId !== selectionId) {
    return { error: "Obnovte stránku na načítanie aktuálnych údajov nákupov." };
  }
  revalidatePath("/app", "layout");
  return { error: null };
}
