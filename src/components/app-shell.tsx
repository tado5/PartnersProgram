"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { useEffect, useState, type ReactNode } from "react";
import {
  BarChart3, Building2, ClipboardList, KeyRound, LayoutDashboard, LogOut, Menu, PanelLeftClose,
  PanelLeftOpen, ScanLine, Search, Settings, ShoppingCart, UserCog, Users, X,
  type LucideIcon,
} from "lucide-react";

import { DocumentLink } from "@/components/company-context";

const icons = {
  dashboard: LayoutDashboard,
  scan: ScanLine,
  purchases: ShoppingCart,
  partners: Users,
  search: Search,
  users: UserCog,
  reports: BarChart3,
  settings: Settings,
  companies: Building2,
  audit: ClipboardList,
  password: KeyRound,
} satisfies Record<string, LucideIcon>;

export type ShellNavItem = {
  href: string;
  label: string;
  icon: keyof typeof icons;
  exact?: boolean;
  /** Full document navigation (needed when leaving the company context). */
  document?: boolean;
  highlight?: boolean;
};

const COLLAPSED_KEY = "app-shell-collapsed";

function isActive(pathname: string, item: ShellNavItem) {
  return item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);
}

export function AppShell({
  brandHref, brandSuffix, items, userName, userRole, footerExtra, banner, children,
}: {
  brandHref: string;
  brandSuffix?: string;
  items: ShellNavItem[];
  userName: string;
  userRole: string;
  footerExtra?: ReactNode;
  banner?: ReactNode;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(COLLAPSED_KEY) === "1");
    } catch {}
  }, []);

  useEffect(() => setMobileOpen(false), [pathname]);

  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setMobileOpen(false); };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [mobileOpen]);

  function toggleCollapsed() {
    setCollapsed((value) => {
      try { localStorage.setItem(COLLAPSED_KEY, value ? "0" : "1"); } catch {}
      return !value;
    });
  }

  const brand = (
    <span className="font-bold tracking-tight text-stone-950">
      europodlahy<span className="text-amber-700">.</span>
      {brandSuffix ? <span className="ml-1 text-xs font-medium text-stone-500">{brandSuffix}</span> : null}
    </span>
  );

  function nav(compact: boolean) {
    return (
      <nav aria-label="Hlavné menu" className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
        {items.map((item) => {
          const Icon = icons[item.icon];
          const active = isActive(pathname, item);
          const className = [
            "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition",
            compact ? "justify-center px-2" : "",
            active
              ? "bg-amber-100 text-amber-950"
              : item.highlight
                ? "text-amber-800 hover:bg-amber-50 hover:text-amber-950"
                : "text-stone-600 hover:bg-stone-100 hover:text-stone-950",
          ].join(" ");
          const content = <>
            <Icon aria-hidden className="size-5 shrink-0" />
            <span className={compact ? "sr-only" : "truncate"}>{item.label}</span>
          </>;
          return item.document ? (
            <DocumentLink key={item.href} href={item.href} className={className}>{content}</DocumentLink>
          ) : (
            <Link key={item.href} href={item.href} className={className}
              aria-current={active ? "page" : undefined} title={compact ? item.label : undefined}>
              {content}
            </Link>
          );
        })}
      </nav>
    );
  }

  function footer(compact: boolean) {
    return (
      <div className="space-y-2 border-t border-stone-200 px-3 py-4">
        {compact ? null : (
          <div className="px-3 text-sm">
            <p className="truncate font-medium text-stone-900">{userName}</p>
            <p className="text-xs text-stone-500">{userRole}</p>
          </div>
        )}
        {footerExtra && !compact ? <div className="px-3">{footerExtra}</div> : null}
        <button
          type="button"
          onClick={() => signOut({ redirectTo: "/login" })}
          title={compact ? "Odhlásiť" : undefined}
          className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-stone-600 transition hover:bg-stone-100 hover:text-stone-950 ${compact ? "justify-center px-2" : ""}`}
        >
          <LogOut aria-hidden className="size-5 shrink-0" />
          <span className={compact ? "sr-only" : ""}>Odhlásiť</span>
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-stone-50">
      {/* Desktop sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-30 hidden flex-col border-r border-stone-200 bg-white transition-[width] duration-200 lg:flex ${collapsed ? "w-[4.5rem]" : "w-64"}`}
      >
        <div className={`flex h-16 items-center border-b border-stone-200 px-4 ${collapsed ? "justify-center" : "justify-between"}`}>
          {collapsed ? null : <Link href={brandHref}>{brand}</Link>}
          <button
            type="button"
            onClick={toggleCollapsed}
            aria-label={collapsed ? "Rozbaliť menu" : "Zbaliť menu"}
            title={collapsed ? "Rozbaliť menu" : "Zbaliť menu"}
            className="rounded-md p-2 text-stone-500 hover:bg-stone-100 hover:text-stone-900"
          >
            {collapsed ? <PanelLeftOpen className="size-5" /> : <PanelLeftClose className="size-5" />}
          </button>
        </div>
        {nav(collapsed)}
        {footer(collapsed)}
      </aside>

      {/* Mobile top bar */}
      <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-stone-200 bg-white px-4 lg:hidden">
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          aria-label="Otvoriť menu"
          aria-expanded={mobileOpen}
          aria-controls="mobile-menu"
          className="-ml-2 rounded-md p-2 text-stone-700 hover:bg-stone-100"
        >
          <Menu className="size-6" />
        </button>
        <Link href={brandHref}>{brand}</Link>
      </header>

      {/* Mobile drawer */}
      {mobileOpen ? (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" id="mobile-menu">
          <button
            type="button"
            aria-label="Zavrieť menu"
            className="absolute inset-0 bg-stone-950/50"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="relative flex h-full w-72 max-w-[85vw] flex-col bg-white shadow-xl">
            <div className="flex h-14 items-center justify-between border-b border-stone-200 px-4">
              <Link href={brandHref}>{brand}</Link>
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                aria-label="Zavrieť menu"
                className="-mr-2 rounded-md p-2 text-stone-500 hover:bg-stone-100"
              >
                <X className="size-6" />
              </button>
            </div>
            {nav(false)}
            {footer(false)}
          </aside>
        </div>
      ) : null}

      <div className={`transition-[padding] duration-200 ${collapsed ? "lg:pl-[4.5rem]" : "lg:pl-64"}`}>
        {banner}
        <main className="mx-auto max-w-6xl px-4 py-6 sm:px-8 sm:py-8">{children}</main>
      </div>
    </div>
  );
}
