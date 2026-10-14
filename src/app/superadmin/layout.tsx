import type { ReactNode } from "react";
import { SessionActivity } from "@/components/auth/session-activity";
import { AppShell, type ShellNavItem } from "@/components/app-shell";
import { ClearCompanyContext } from "@/components/companies/company-controls";
import { requireSuperadminPage } from "@/server/auth/superadmin";

export const instant = false;

const items: ShellNavItem[] = [
  { href: "/superadmin/firmy", label: "Firmy", icon: "companies", document: true },
  { href: "/superadmin/audit", label: "Audit", icon: "audit" },
  { href: "/change-password", label: "Zmeniť heslo", icon: "password" },
];

export default async function SuperadminLayout({ children }: { children: ReactNode }) {
  const context = await requireSuperadminPage();
  return <>
    <SessionActivity />
    <AppShell
      brandHref="/superadmin/firmy"
      brandSuffix="Superadmin"
      items={items}
      userName={context.user.name}
      userRole="Superadmin"
      footerExtra={<ClearCompanyContext />}
    >
      {children}
    </AppShell>
  </>;
}
