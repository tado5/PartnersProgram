import Link from "next/link";

import { auditActionLabels, publicAuditFields } from "@/lib/audit";
import { formatDateTime } from "@/lib/format";
import { AuditDateBadges, AuditEntityBadge } from "./audit-badges";

export type AuditEntryItem = {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  partnerId: string | null;
  actorName: string | null;
  reason: string | null;
  createdAt: string;
  oldValues: unknown;
  newValues: unknown;
  partner?: { id: string; code: string; displayName: string } | null;
  targetHref?: string | null;
};

export function AuditEntryList({ items }: { items: AuditEntryItem[] }) {
  if (!items.length) {
    return <p className="rounded-xl border border-stone-200 bg-white px-4 py-3 text-sm text-stone-600">Zatiaľ tu nie sú žiadne auditované udalosti.</p>;
  }

  return (
    <ol className="divide-y divide-stone-200 overflow-hidden rounded-xl border border-stone-200 bg-white">
      {items.map((item) => {
        const oldFields = publicAuditFields(item.oldValues);
        const newFields = publicAuditFields(item.newValues);
        const title = auditActionLabels[item.action] ?? item.action;
        return (
          <li key={item.id} className="px-3 py-3 sm:px-4">
            <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
              <div className="min-w-0">
                <h3 className="text-sm font-semibold text-stone-950">{title}</h3>
                <p className="mt-0.5 break-words text-xs leading-5 text-stone-600">
                  <AuditEntityBadge entityType={item.entityType} />
                  {item.partner ? <> · <Link className="underline" href={`/app/partneri/${item.partner.id}`}>{item.partner.displayName} ({item.partner.code})</Link></> : ""}
                  {!item.partner && item.entityId ? <> · ID {item.entityId}</> : ""}
                  {" · "}{item.actorName ?? "Systém"}
                </p>
              </div>
              <AuditDateBadges value={item.createdAt} />
            </div>
            {item.reason ? <p className="mt-1 break-words text-xs leading-5 text-stone-700"><strong>Dôvod:</strong> {item.reason}</p> : null}
            {oldFields.length || newFields.length || item.targetHref ? (
              <div className="mt-1 flex flex-wrap items-start gap-x-4 gap-y-1">
                {oldFields.length || newFields.length ? (
                  <details className="min-w-0 basis-full">
                    <summary aria-label={`Podrobnosti: ${title}, ${formatDateTime(new Date(item.createdAt))}`} className="w-fit cursor-pointer rounded py-1 text-xs font-medium text-teal-700 hover:text-teal-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-700">
                      Podrobnosti zmeny
                    </summary>
                    <div className="mt-1 grid gap-2 sm:grid-cols-2">
                      <AuditValues title="Pred zmenou" fields={oldFields} />
                      <AuditValues title="Po zmene" fields={newFields} />
                    </div>
                  </details>
                ) : null}
                {item.targetHref ? <Link className="py-1 text-xs text-amber-800 underline" href={item.targetHref}>Otvoriť záznam</Link> : null}
              </div>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

function AuditValues({ title, fields }: { title: string; fields: ReturnType<typeof publicAuditFields> }) {
  return (
    <section className="min-w-0 rounded-lg bg-stone-50 p-3">
      <h4 className="text-xs font-semibold uppercase tracking-wide text-stone-500">{title}</h4>
      {fields.length ? (
        <dl className="mt-2 space-y-1 text-xs">
          {fields.map((field) => (
            <div key={field.key} className="grid grid-cols-2 gap-3">
              <dt className="break-words text-stone-600">{field.label}</dt>
              <dd className="break-all text-right font-medium text-stone-900">{field.value}</dd>
            </div>
          ))}
        </dl>
      ) : <p className="mt-2 text-sm text-stone-500">—</p>}
    </section>
  );
}
