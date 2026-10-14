import { Building2, HardHat, Megaphone } from "lucide-react";

export type PartnerTypeValue = "installer" | "company" | "referrer";

const config = {
  installer: { label: "Montážnik", Icon: HardHat, tone: "bg-amber-50 text-amber-800 ring-amber-200" },
  company: { label: "Firma", Icon: Building2, tone: "bg-indigo-50 text-indigo-700 ring-indigo-200" },
  referrer: { label: "Odporúčateľ", Icon: Megaphone, tone: "bg-teal-50 text-teal-700 ring-teal-200" },
} as const;

export function partnerTypeLabel(type: PartnerTypeValue) {
  return config[type].label;
}

export function PartnerTypeBadge({ type }: { type: PartnerTypeValue }) {
  const { label, Icon, tone } = config[type];
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${tone}`}>
      <Icon aria-hidden className="size-3.5" />{label}
    </span>
  );
}
