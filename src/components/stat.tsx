import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Tuile d'indicateur clé (KPI). */
export function Stat({
  label,
  value,
  sub,
  icon,
  className,
  accent = false,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  icon?: ReactNode;
  className?: string;
  accent?: boolean;
}) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-xl border bg-card p-4",
        accent && "border-primary/30 bg-gradient-to-br from-primary/10 via-card to-card",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
        <span>{label}</span>
        {icon && <span className="text-muted-foreground/70 [&_svg]:size-4">{icon}</span>}
      </div>
      <div className="num mt-2 text-2xl font-semibold tracking-tight">{value}</div>
      {sub && <div className="mt-1 text-sm text-muted-foreground">{sub}</div>}
    </div>
  );
}
