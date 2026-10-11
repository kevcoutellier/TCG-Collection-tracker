import { CheckCircle2, Info, TriangleAlert } from "lucide-react";
import type { Insight } from "@/lib/analysis";

export function InsightItem({ insight }: { insight: Insight }) {
  const Icon = insight.tone === "success" ? CheckCircle2 : insight.tone === "warning" ? TriangleAlert : Info;
  const color = insight.tone === "success" ? "text-gain" : insight.tone === "warning" ? "text-loss" : "text-electric";
  return (
    <div className="flex gap-3 rounded-lg border bg-muted/20 p-3">
      <Icon className={`mt-0.5 size-4 shrink-0 ${color}`} />
      <div>
        <div className="text-sm font-medium">{insight.title}</div>
        <p className="mt-0.5 text-sm text-muted-foreground text-pretty">{insight.body}</p>
      </div>
    </div>
  );
}
