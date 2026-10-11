import { Activity, Minus, TrendingDown, TrendingUp, Zap } from "lucide-react";
import type { SignalKind } from "@/lib/analysis";
import { cn } from "@/lib/utils";

/** Jauge circulaire du score d'attractivité (0-100). */
export function ScoreRing({ score, size = 88, className }: { score: number; size?: number; className?: string }) {
  const r = 40;
  const c = 2 * Math.PI * r;
  const color = score >= 70 ? "var(--gain)" : score >= 45 ? "var(--primary)" : "var(--loss)";
  return (
    <div className={cn("relative shrink-0", className)} style={{ width: size, height: size }}>
      <svg viewBox="0 0 100 100" className="size-full -rotate-90">
        <circle cx="50" cy="50" r={r} fill="none" stroke="var(--muted)" strokeWidth="9" />
        <circle
          cx="50"
          cy="50"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="9"
          strokeLinecap="round"
          strokeDasharray={`${(score / 100) * c} ${c}`}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="num text-2xl leading-none font-semibold">{score}</span>
        <span className="text-[10px] text-muted-foreground">/ 100</span>
      </div>
    </div>
  );
}

const SIGNAL_STYLE: Record<SignalKind, { className: string; icon: typeof Activity }> = {
  bullish: { className: "bg-gain/15 text-gain ring-gain/30", icon: TrendingUp },
  opportunity: { className: "bg-primary/15 text-primary ring-primary/30", icon: Zap },
  bearish: { className: "bg-loss/15 text-loss ring-loss/30", icon: TrendingDown },
  neutral: { className: "bg-muted text-muted-foreground ring-border", icon: Minus },
  unknown: { className: "bg-muted text-muted-foreground ring-border", icon: Activity },
};

export function SignalBadge({ kind, label, className }: { kind: SignalKind; label: string; className?: string }) {
  const { className: style, icon: Icon } = SIGNAL_STYLE[kind];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset",
        style,
        className,
      )}
    >
      <Icon className="size-3" />
      {label}
    </span>
  );
}
