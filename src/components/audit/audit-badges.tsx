import { CalendarDays, Clock3 } from "lucide-react";

import { auditEntityLabels } from "@/lib/audit";
import { formatDateTime } from "@/lib/format";

const badgeClass = "inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset";
const entityTones: Record<string, string> = {
  auth: "bg-teal-50 text-teal-700 ring-teal-200",
  company: "bg-indigo-50 text-indigo-700 ring-indigo-200",
  export: "bg-teal-50 text-teal-700 ring-teal-200",
  partner: "bg-amber-50 text-amber-800 ring-amber-200",
  purchase: "bg-indigo-50 text-indigo-700 ring-indigo-200",
  token: "bg-teal-50 text-teal-700 ring-teal-200",
  user: "bg-amber-50 text-amber-800 ring-amber-200",
};

export function AuditEntityBadge({ entityType }: { entityType: string }) {
  return (
    <span className={`${badgeClass} ${entityTones[entityType] ?? "bg-stone-100 text-stone-700 ring-stone-200"}`}>
      {auditEntityLabels[entityType] ?? entityType}
    </span>
  );
}

export function AuditDateBadges({ value }: { value: string }) {
  const date = new Date(value);
  const day = new Intl.DateTimeFormat("sk-SK", {
    dateStyle: "medium", timeZone: "Europe/Bratislava",
  }).format(date);
  const time = new Intl.DateTimeFormat("sk-SK", {
    timeStyle: "short", timeZone: "Europe/Bratislava",
  }).format(date);

  return (
    <time dateTime={value} aria-label={formatDateTime(date)} className="flex shrink-0 flex-wrap items-center gap-1.5">
      <span className={`${badgeClass} bg-amber-50 text-amber-800 ring-amber-200`}>
        <CalendarDays aria-hidden className="size-3" />{day}
      </span>
      <span className={`${badgeClass} bg-stone-100 text-stone-600 ring-stone-200`}>
        <Clock3 aria-hidden className="size-3" />{time}
      </span>
    </time>
  );
}
