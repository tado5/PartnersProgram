import { CompanyForm } from "@/components/companies/company-controls";
import { requireSuperadminPage } from "@/server/auth/superadmin";

export default async function NewCompanyPage() {
  await requireSuperadminPage();
  return <section><h1 className="mb-6 text-3xl font-bold text-white sm:text-4xl">Nová firma a prvý admin</h1><CompanyForm /></section>;
}
