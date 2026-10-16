import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { SessionActivity } from "@/components/auth/session-activity";
import { AppShell, type ShellNavItem } from "@/components/app-shell";
import { requireCompanyPage } from "@/server/auth/session";
import { CompanyProvider, DocumentLink } from "@/components/company-context";
import { companyLogoDataUrl } from "@/lib/company-logo";

export const instant = false;

const roleLabels: Record<string, string> = {
  superadmin: "Superadmin",
  admin: "Administrátor",
  seller: "Predavač",
};

export default async function AppLayout({
  children,
}: {
  children: ReactNode;
}) {
  const context = await requireCompanyPage();
  if (!context) {
    redirect("/login");
  }
  if (context.user.mustChangePassword) {
    redirect("/change-password");
  }

  const items: ShellNavItem[] = [
    { href: "/app", label: "Prehľad", icon: "dashboard", exact: true },
    { href: "/app/sken", label: "Skenovať", icon: "scan", highlight: true },
    { href: "/app/nakupy", label: "Nákupy", icon: "purchases" },
    ...(context.user.role !== "seller"
      ? [
          { href: "/app/partneri", label: "Partneri", icon: "partners" },
          { href: "/app/users", label: "Používatelia", icon: "users" },
          { href: "/app/reporty", label: "Reporty", icon: "reports" },
          { href: "/app/audit", label: "Audit log", icon: "audit" },
          { href: "/app/exporty", label: "Exporty CSV", icon: "exports" },
          { href: "/app/nastavenia", label: "Nastavenia", icon: "settings" },
        ] satisfies ShellNavItem[]
      : [{ href: "/app/partneri", label: "Vyhľadať partnera", icon: "search" }] satisfies ShellNavItem[]),
    { href: "/change-password", label: "Zmeniť heslo", icon: "password" },
  ];

  return (
    <CompanyProvider key={`${context.companyId}:${context.selectionId}`} value={{
      companyId: context.companyId.toString(), selectionId: context.selectionId,
    }}>
    <SessionActivity />
    <AppShell
      brandHref="/app"
      companyName={context.company.name}
      logoUrl={companyLogoDataUrl(context.company.logoData)}
      items={items}
      userName={context.user.name}
      userRole={roleLabels[context.user.role]}
      footerExtra={
        <>
          {!context.company.isActive ? (
            <p className="mb-2 text-xs text-amber-700">Program firmy je pozastavený.</p>
          ) : null}
          {context.user.role === "superadmin" ? (
            <DocumentLink href="/superadmin/firmy" className="text-sm underline">
              Späť na firmy / zmeniť firmu
            </DocumentLink>
          ) : null}
        </>
      }
    >
      {children}
    </AppShell>
    </CompanyProvider>
  );
}
