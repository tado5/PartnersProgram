import { ManualPage } from "@/components/manual/manual-page";
import { requireSuperadminPage } from "@/server/auth/superadmin";

export default async function SuperadminManualPage({ params }: {
  params: Promise<{ slug?: string[] }>;
}) {
  await requireSuperadminPage();
  const { slug } = await params;
  return <ManualPage role="superadmin" base="/superadmin/manual" slug={slug} companySelected={false} />;
}
