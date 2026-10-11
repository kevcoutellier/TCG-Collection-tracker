import { ArrowDownRight, ArrowRight, ArrowUpRight } from "lucide-react";
import { pctText, signedEur } from "@/lib/format";
import { cn } from "@/lib/utils";

function tone(value: number | null | undefined, threshold = 0.005) {
  if (value == null) return "text-muted-foreground";
  if (value > threshold) return "text-gain";
  if (value < -threshold) return "text-loss";
  return "text-muted-foreground";
}

/** Variation en % colorée avec flèche. */
export function Delta({
  value,
  className,
  icon = true,
}: {
  value: number | null | undefined;
  className?: string;
  icon?: boolean;
}) {
  const Icon = value == null || Math.abs(value) <= 0.005 ? ArrowRight : value > 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={cn("num inline-flex items-center gap-0.5 font-medium", tone(value), className)}>
      {icon && value != null && <Icon className="size-3.5 shrink-0" />}
      {pctText(value)}
    </span>
  );
}

/** Montant signé coloré (plus/moins-value). */
export function MoneyDelta({ value, className }: { value: number | null | undefined; className?: string }) {
  return <span className={cn("num font-medium", tone(value, 0.004), className)}>{signedEur(value)}</span>;
}
