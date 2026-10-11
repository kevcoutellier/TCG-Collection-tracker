"use client";

import { useId } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { dateText, eur } from "@/lib/format";

const PALETTE = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)", "var(--muted-foreground)", "var(--electric)"];

const axis = {
  stroke: "var(--muted-foreground)",
  fontSize: 11,
  tickLine: false,
  axisLine: false,
} as const;

function compactEur(n: number) {
  if (Math.abs(n) >= 10000) return `${Math.round(n / 1000)} k€`;
  if (Math.abs(n) >= 1000) return `${(n / 1000).toFixed(1).replace(".", ",")} k€`;
  return `${Math.round(n)} €`;
}

function useGradientId(prefix: string) {
  return `${prefix}-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
}

type TooltipEntry = { name?: string | number; value?: number | string; color?: string; dataKey?: string | number };

function ChartTooltip({
  active,
  payload,
  label,
  labelFormatter = (l: string) => dateText(l),
}: {
  active?: boolean;
  payload?: TooltipEntry[];
  label?: string | number;
  labelFormatter?: (label: string) => string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 text-xs shadow-lg">
      <div className="mb-1 font-medium">{labelFormatter(String(label))}</div>
      {payload.map((p) => (
        <div key={String(p.dataKey)} className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <span className="size-2 rounded-full" style={{ background: p.color }} />
            {p.name}
          </span>
          <span className="num font-medium">{typeof p.value === "number" ? eur(p.value) : "—"}</span>
        </div>
      ))}
    </div>
  );
}

/** Historique des relevés de prix d'une carte, une courbe par variante (clés `s0`, `s1`…). */
export function PriceHistoryChart({
  data,
  series,
  height = 240,
}: {
  data: Record<string, string | number | null>[];
  series: { key: string; label: string }[];
  height?: number;
}) {
  const gid = useGradientId("price");
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.35} />
            <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke="var(--border)" vertical={false} />
        <XAxis dataKey="day" tickFormatter={(d: string) => dateText(d, { short: true })} minTickGap={28} {...axis} />
        <YAxis tickFormatter={compactEur} width={56} domain={["auto", "auto"]} {...axis} />
        <Tooltip content={<ChartTooltip />} cursor={{ stroke: "var(--border)" }} />
        {series.map((sr, i) => (
          <Area
            isAnimationActive={false}
            key={sr.key}
            type="monotone"
            dataKey={sr.key}
            name={sr.label}
            stroke={PALETTE[i % PALETTE.length]}
            strokeWidth={2}
            fill={i === 0 ? `url(#${gid})` : "none"}
            connectNulls
            dot={data.length < 3}
          />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  );
}

/** Valeur du portefeuille vs capital investi. */
export function PortfolioChart({ data, height = 260 }: { data: { day: string; value: number; cost: number }[]; height?: number }) {
  const gid = useGradientId("portfolio");
  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.35} />
            <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke="var(--border)" vertical={false} />
        <XAxis dataKey="day" tickFormatter={(d: string) => dateText(d, { short: true })} minTickGap={32} {...axis} />
        <YAxis tickFormatter={compactEur} width={60} domain={["auto", "auto"]} {...axis} />
        <Tooltip content={<ChartTooltip />} cursor={{ stroke: "var(--border)" }} />
        <Area isAnimationActive={false} type="monotone" dataKey="value" name="Valeur" stroke="var(--chart-1)" strokeWidth={2} fill={`url(#${gid})`} />
        <Line isAnimationActive={false} type="stepAfter" dataKey="cost" name="Investi" stroke="var(--muted-foreground)" strokeDasharray="4 4" strokeWidth={1.5} dot={false} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

/** Répartition en anneau avec légende. */
export function AllocationChart({ data, height = 180 }: { data: { name: string; value: number }[]; height?: number }) {
  const total = data.reduce((a, d) => a + d.value, 0);
  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row">
      <div className="w-full max-w-[180px] shrink-0">
        <ResponsiveContainer width="100%" height={height}>
          <PieChart>
            <Pie isAnimationActive={false} data={data} dataKey="value" nameKey="name" innerRadius="62%" outerRadius="95%" paddingAngle={2} stroke="none">
              {data.map((_, i) => (
                <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
              ))}
            </Pie>
            <Tooltip content={<ChartTooltip labelFormatter={() => "Valeur"} />} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <ul className="w-full space-y-1.5 text-sm">
        {data.map((d, i) => (
          <li key={d.name} className="flex items-center justify-between gap-3">
            <span className="flex min-w-0 items-center gap-2">
              <span className="size-2.5 shrink-0 rounded-sm" style={{ background: PALETTE[i % PALETTE.length] }} />
              <span className="truncate">{d.name}</span>
            </span>
            <span className="num shrink-0 text-muted-foreground">
              {total > 0 ? `${Math.round((d.value / total) * 100)} %` : "—"}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Moyennes de ventes Cardmarket (30 j → 7 j → 24 h → tendance) : la dynamique récente en un coup d'œil. */
export function MomentumChart({ data, height = 180 }: { data: { label: string; value: number | null }[]; height?: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid stroke="var(--border)" vertical={false} />
        <XAxis dataKey="label" {...axis} />
        <YAxis tickFormatter={compactEur} width={56} {...axis} />
        <Tooltip content={<ChartTooltip labelFormatter={(l) => l} />} cursor={{ fill: "var(--accent)", opacity: 0.4 }} />
        <Bar isAnimationActive={false} dataKey="value" name="Prix" radius={[6, 6, 0, 0]} maxBarSize={56}>
          {data.map((_, i) => (
            <Cell key={i} fill={i === data.length - 1 ? "var(--chart-1)" : "var(--chart-2)"} fillOpacity={i === data.length - 1 ? 1 : 0.55 + i * 0.12} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Projection de capital (valeur vs versements cumulés). */
export function ProjectionChart({ data, height = 220 }: { data: { year: number; invested: number; value: number }[]; height?: number }) {
  const gid = useGradientId("projection");
  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--chart-3)" stopOpacity={0.35} />
            <stop offset="100%" stopColor="var(--chart-3)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke="var(--border)" vertical={false} />
        <XAxis dataKey="year" tickFormatter={(y: number) => `${y} an${y > 1 ? "s" : ""}`} {...axis} />
        <YAxis tickFormatter={compactEur} width={60} {...axis} />
        <Tooltip content={<ChartTooltip labelFormatter={(l) => `Année ${l}`} />} cursor={{ stroke: "var(--border)" }} />
        <Area isAnimationActive={false} type="monotone" dataKey="value" name="Valeur projetée" stroke="var(--chart-3)" strokeWidth={2} fill={`url(#${gid})`} />
        <Line isAnimationActive={false} type="monotone" dataKey="invested" name="Versements" stroke="var(--muted-foreground)" strokeDasharray="4 4" dot={false} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
