import { redirect } from "next/navigation";

import { PurchaseScanner } from "@/components/purchases/purchase-scanner";
import { requireCompanyPage } from "@/server/auth/session";

export default async function ScanPage() {
  const context = await requireCompanyPage(["admin", "seller"]);
  if (context.user.role !== "admin" && context.user.role !== "seller") redirect("/app");
  return <PurchaseScanner />;
}
