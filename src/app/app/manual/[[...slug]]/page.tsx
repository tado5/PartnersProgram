import { ManualPage } from "@/components/manual/manual-page";
import { requireCompanyPage } from "@/server/auth/session";

export default async function CompanyManualPage({ params }: {
  params: Promise<{ slug?: string[] }>;
}) {
  const context = await requireCompanyPage();
  const { slug } = await params;
  return <ManualPage role={context.user.role} base="/app/manual" slug={slug} companySelected />;
}
