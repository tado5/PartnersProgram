"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  BarChart3, Building2, ClipboardList, FileDown, KeyRound, LayoutDashboard, LogOut, Menu, PanelLeftClose,
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
  exports: FileDown,
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
  brandHref, brandSuffix, companyName, logoUrl, items, userName, userRole, footerExtra, banner, children,
}: {
  brandHref: string;
  brandSuffix?: string;
  companyName?: string;
  logoUrl?: string | null;
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
  const mobileMenuRef = useRef<HTMLElement>(null);
  const mobileTriggerRef = useRef<HTMLButtonElement>(null);
  const currentItem = items
    .filter((item) => pathname === item.href || pathname.startsWith(`${item.href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0];

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(COLLAPSED_KEY) === "1");
    } catch {}
  }, []);

  useEffect(() => setMobileOpen(false), [pathname]);

  useEffect(() => {
    if (!mobileOpen) return;
    const previouslyFocused = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const trigger = mobileTriggerRef.current;
    const firstFocusable = mobileMenuRef.current?.querySelector<HTMLElement>(
      'a[href], button:not([disabled])',
    );
    firstFocusable?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMobileOpen(false);
        return;
      }
      if (event.key !== "Tab" || !mobileMenuRef.current) return;
      const focusable = Array.from(
        mobileMenuRef.current.querySelectorAll<HTMLElement>('a[href], button:not([disabled])'),
      );
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKey);
      if (previouslyFocused?.isConnected) previouslyFocused.focus();
      else trigger?.focus();
    };
  }, [mobileOpen]);

  function toggleCollapsed() {
    setCollapsed((value) => {
      try { localStorage.setItem(COLLAPSED_KEY, value ? "0" : "1"); } catch {}
      return !value;
    });
  }

  const brand = companyName ? (
    <span className="flex min-w-0 flex-col justify-center gap-0.5">
      {logoUrl ? <Image unoptimized src={logoUrl} alt={`Logo ${companyName}`} width={176} height={32}
        className="h-8 w-full max-w-44 object-contain object-left" />
        : <span className="block max-w-44 truncate font-bold tracking-tight text-stone-950" title={companyName}>{companyName}</span>}
      <span className="text-[10px] font-semibold leading-none tracking-wide text-white/65">PartnersProgram</span>
    </span>
  ) : (
    <span className="font-bold tracking-tight text-white">
      Partners<span className="text-primary">Program</span>
      {brandSuffix ? <span className="ml-1 text-xs font-medium text-white/65">{brandSuffix}</span> : null}
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
              ? "border-l-2 border-primary bg-primary/15 text-white"
              : item.highlight
                ? "text-white hover:bg-white/10 hover:text-white"
                : "text-white/75 hover:bg-white/10 hover:text-white",
          ].join(" ");
          const content = <>
            <Icon aria-hidden className={`size-5 shrink-0 ${active || item.highlight ? "text-primary" : ""}`} />
            <span className={compact ? "sr-only" : "truncate"}>{item.label}</span>
          </>;
          return item.document ? (
            <DocumentLink key={item.href} href={item.href} className={className}>{content}</DocumentLink>
          ) : (
            <Link key={item.href} href={item.href} className={className} onClick={() => setMobileOpen(false)}
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
          ref={mobileTriggerRef}
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
    <div className="min-h-[100dvh]">
      {/* Desktop sidebar */}
      <aside
        className={`glass-surface fixed inset-y-0 left-0 z-30 hidden flex-col border-r border-white/15 transition-[width] duration-200 lg:flex ${collapsed ? "w-[4.5rem]" : "w-64"}`}
      >
        <div className={`flex h-16 items-center border-b border-white/15 px-4 ${collapsed ? "justify-center" : "justify-between"}`}>
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
      <header className="glass-surface sticky top-0 z-[100] flex h-14 items-center gap-3 border-b border-white/15 px-4 lg:hidden">
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          aria-label="Otvoriť menu"
          aria-expanded={mobileOpen}
          aria-controls="mobile-menu"
          className="-ml-2 rounded-md p-2 text-stone-700 hover:bg-white/10"
        >
          <Menu className="size-6" />
        </button>
        <Link href={brandHref}>{brand}</Link>
      </header>

      {/* Mobile drawer */}
      {mobileOpen ? (
        <div className="fixed inset-0 z-[var(--z-overlay)] lg:hidden" role="dialog" aria-modal="true" aria-label="Menu navigácie" id="mobile-menu">
          <button
            type="button"
            aria-label="Zavrieť menu"
            className="absolute inset-0 bg-stone-950/50"
            onClick={() => setMobileOpen(false)}
          />
          <aside ref={mobileMenuRef} className="glass-surface relative flex h-full w-72 max-w-[85vw] flex-col border-r border-white/15">
            <div className="flex h-14 items-center justify-between border-b border-white/15 px-4">
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
        <div className="glass-surface sticky top-0 z-[100] hidden h-16 items-center justify-between border-x-0 border-t-0 px-6 lg:flex">
          <nav aria-label="Drobečková navigácia" className="flex min-w-0 items-center gap-2 text-sm">
            <Link href={brandHref} className="shrink-0 text-white/65 transition hover:text-white">
              {brandSuffix ?? "Pracovný priestor"}
            </Link>
            {currentItem && currentItem.href !== brandHref ? (
              <>
                <span aria-hidden="true" className="text-white/40">/</span>
                <span aria-current="page" className="truncate font-medium text-white">
                  {currentItem.label}
                </span>
              </>
            ) : null}
          </nav>
          <div className="ml-6 flex min-w-0 items-center gap-3 text-right">
            <span aria-hidden="true" className="flex size-9 shrink-0 items-center justify-center rounded-full border border-white/20 bg-white/10 text-sm font-semibold text-white">
              {userName.trim().slice(0, 1).toLocaleUpperCase()}
            </span>
            <span className="min-w-0">
              <span className="block max-w-48 truncate text-sm font-semibold text-white">{userName}</span>
              <span className="block text-xs text-white/65">{userRole}</span>
            </span>
          </div>
        </div>
        <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 sm:py-8">{children}</main>
      </div>
    </div>
  );
}
