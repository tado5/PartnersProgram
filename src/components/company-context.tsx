"use client";

import { createContext, useCallback, useContext, useEffect, type ReactNode } from "react";

type ClientCompany = { companyId: string; selectionId: string };
const CompanyContext = createContext<ClientCompany | null>(null);
const formBaselines = new WeakMap<Element, string>();

function formElementState(element: Element) {
  if (element instanceof HTMLInputElement) {
    if (element.type === "checkbox" || element.type === "radio") return String(element.checked);
    if (element.type === "file") {
      return Array.from(element.files ?? []).map((file) => `${file.name}:${file.size}:${file.lastModified}`).join("|");
    }
    return element.value;
  }
  if (element instanceof HTMLTextAreaElement) return element.value;
  if (element instanceof HTMLSelectElement) {
    return Array.from(element.options).map((option) => String(option.selected)).join(",");
  }
  return "";
}

export function DocumentLink({ href, className, children }: {
  href: string; className?: string; children: ReactNode;
}) {
  return <a href={href} className={className} onClick={(event) => {
    if (
      href.startsWith("/superadmin/firmy") &&
      window.location.pathname.startsWith("/app") &&
      event.button === 0 &&
      !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey &&
      hasUnsavedFormChanges() &&
      !window.confirm("Odchodom z programu sa zahodia rozpísané formuláre. Pokračovať?")
    ) {
      event.preventDefault();
    }
  }}>{children}</a>;
}

function hasUnsavedFormChanges() {
  return Array.from(document.forms).some((form) =>
    Array.from(form.elements).some((element) => {
      if (!(element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement)) return false;
      if (element.disabled || (element instanceof HTMLInputElement &&
          ["hidden", "submit", "button", "reset", "image"].includes(element.type))) return false;
      const baseline = formBaselines.get(element);
      return baseline !== undefined && formElementState(element) !== baseline;
    }),
  );
}

export function CompanyProvider({
  value, children,
}: { value: ClientCompany; children: ReactNode }) {
  useEffect(() => {
    const captureFormBaseline = (element: Element) => {
      if (!(element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement)) return;
      if (element instanceof HTMLInputElement && element.type === "radio" && element.name) {
        for (const sibling of Array.from(element.form?.elements ?? [])) {
          if (sibling instanceof HTMLInputElement && sibling.type === "radio" && sibling.name === element.name &&
              !formBaselines.has(sibling)) {
            formBaselines.set(sibling, formElementState(sibling));
          }
        }
      } else if (!formBaselines.has(element)) {
        formBaselines.set(element, formElementState(element));
      }
    };
    document.querySelectorAll("input, textarea, select").forEach(captureFormBaseline);
    const rememberFormBaseline = (event: FocusEvent) => {
      if (event.target instanceof Element) captureFormBaseline(event.target);
    };
    const reload = (event: PageTransitionEvent) => {
      if (event.persisted) window.location.reload();
    };
    const switched = () => window.location.replace("/superadmin/firmy");
    const storage = (event: StorageEvent) => {
      if (event.key === "company-context-change") switched();
    };
    window.addEventListener("pageshow", reload);
    window.addEventListener("storage", storage);
    document.addEventListener("focusin", rememberFormBaseline);
    return () => {
      window.removeEventListener("pageshow", reload);
      window.removeEventListener("storage", storage);
      document.removeEventListener("focusin", rememberFormBaseline);
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
