import { Loader2 } from "lucide-react";
import type { ReactNode } from "react";

export function ActionLabel({ busy, pending, children, compact = false }: {
  busy: boolean; pending: string; children: ReactNode; compact?: boolean;
}) {
  return busy ? <span role="status" aria-label={pending} className="inline-flex items-center justify-center gap-2">
    <Loader2 aria-hidden className="size-4 shrink-0 animate-spin motion-reduce:animate-none" />
    <span className={compact ? "sr-only" : undefined}>{pending}</span>
  </span> : children;
}
