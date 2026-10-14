import { notFound } from "next/navigation";
import { CompanyControls, CompanyForm } from "@/components/companies/company-controls";
import { parseUserId } from "@/server/auth/http";
import { requireSuperadminPage } from "@/server/auth/superadmin";
import { companyDetails, CompanyError } from "@/server/companies";

export default async function CompanyDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireSuperadminPage();
  const id = parseUserId((await params).id);
  if (!id) notFound();
  let company;
  try { company = await companyDetails(id); } catch (error) {
    if (error instanceof CompanyError && error.status === 404) notFound();
    throw error;
  }
  return <section>
    <h1 className="text-3xl font-semibold">{company.name}</h1>
    <p className="mt-2 text-stone-600">{company.slug} · {company.isActive ? "Aktívna" : "Neaktívna"} · {company.counts.users} používateľov · {company.counts.partners} partnerov</p>
    <CompanyControls companyId={company.id} isActive={company.isActive} />
    <h2 className="mb-4 text-xl font-semibold">Údaje firmy</h2>
    <CompanyForm company={{ id: company.id, name: company.name, ico: company.ico }} />
    <h2 className="mb-2 mt-8 text-xl font-semibold">Nastavenia programu firmy</h2>
    <p className="mb-4 max-w-2xl text-sm text-stone-600">
      Tieto hodnoty nastavuje iba admin danej firmy v menu Nastavenia. Superadmin ich vidí len na čítanie.
    </p>
    <dl className="grid max-w-xl gap-3 rounded-xl border border-stone-200 bg-white p-5 text-sm sm:grid-cols-2">
      <SettingValue label="Sadzba DPH" value={`${company.vatRatePercent} %`} />
      <SettingValue label="Potvrdenie nákupu od" value={money(company.purchaseConfirmAboveEur)} />
      <SettingValue label="Bronzový partner od (bez DPH)" value={money(company.bronzeMonthlyTurnoverEur)} />
      <SettingValue label="Strieborný partner od (bez DPH)" value={money(company.silverMonthlyTurnoverEur)} />
      <SettingValue label="Zlatý partner od (bez DPH)" value={money(company.goldMonthlyTurnoverEur)} />
    </dl>
    <h2 className="mb-4 mt-8 text-xl font-semibold">Admini</h2>
    <ul className="space-y-2">{company.admins.map((admin) => <li key={admin.id}>
      {admin.name} · {admin.email} · {admin.isActive ? "Aktívny" : "Neaktívny"}
      {admin.mustChangePassword ? " · Čaká na zmenu hesla" : ""}
    </li>)}</ul>
  </section>;
}

function money(value: string | null) {
  return value === null ? "vypnuté" : `${value} €`;
}

function SettingValue({ label, value }: { label: string; value: string }) {
  return <div>
    <dt className="text-stone-500">{label}</dt>
    <dd className="font-semibold text-stone-900">{value}</dd>
  </div>;
}
