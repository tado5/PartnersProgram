"use client";

import { createContext, useCallback, useContext, useEffect, type ReactNode } from "react";

type ClientCompany = { companyId: string; selectionId: string };
const CompanyContext = createContext<ClientCompany | null>(null);

export function DocumentLink({ href, className, children }: {
  href: string; className?: string; children: ReactNode;
}) {
  return <a href={href} className={className} onClick={(event) => {
    if (href.startsWith("/superadmin/firmy") && window.location.pathname.startsWith("/app") &&
        !window.confirm("Odchodom z programu sa zahodia rozpísané formuláre. Pokračovať?")) {
      event.preventDefault();
    }
  }}>{children}</a>;
}

export function CompanyProvider({
  value, children,
}: { value: ClientCompany; children: ReactNode }) {
  useEffect(() => {
    const reload = (event: PageTransitionEvent) => {
      if (event.persisted) window.location.reload();
    };
    const switched = () => window.location.replace("/superadmin/firmy");
    const storage = (event: StorageEvent) => {
      if (event.key === "company-context-change") switched();
    };
    window.addEventListener("pageshow", reload);
    window.addEventListener("storage", storage);
    return () => {
      window.removeEventListener("pageshow", reload);
      window.removeEventListener("storage", storage);
    };
  }, []);
  return <CompanyContext.Provider value={value}>{children}</CompanyContext.Provider>;
}

export function useCompanyApi() {
  const context = useContext(CompanyContext);
  if (!context) throw new Error("Missing company provider.");
  const companyFetch = useCallback(async (url: string, options?: RequestInit) => {
    const headers = new Headers(options?.headers);
    headers.set("X-Company-Id", context.companyId);
    if (context.selectionId) headers.set("X-Company-Selection", context.selectionId);
    const response = await fetch(url, { ...options, headers, cache: "no-store" });
    if (response.status === 409) {
      const body = await response.clone().json().catch(() => null);
      if (body?.error?.code === "COMPANY_CONTEXT_CHANGED") {
        window.location.replace("/superadmin/firmy");
      }
    }
    return response;
  }, [context.companyId, context.selectionId]);
  return { companyFetch, companyId: context.companyId, selectionId: context.selectionId };
}
