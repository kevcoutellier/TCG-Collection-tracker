"use client";

import { useState } from "react";
import { ProjectionChart } from "@/components/charts";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { breakEvenPrice, gradingSimulation, netFromSale, projectGrowth } from "@/lib/analysis";
import { eur, pctText, signedEur } from "@/lib/format";
import { cn } from "@/lib/utils";

function num(v: string) {
  const n = Number(v.replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

function NumField({
  id,
  label,
  value,
  onChange,
  suffix,
  step = "0.01",
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  suffix?: string;
  step?: string;
}) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id} className="text-xs text-muted-foreground">
        {label}
      </Label>
      <div className="relative">
        <Input
          id={id}
          type="number"
          inputMode="decimal"
          min={0}
          step={step}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={suffix ? "pr-8" : undefined}
        />
        {suffix && (
          <span className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-xs text-muted-foreground">
            {suffix}
          </span>
        )}
      </div>
    </div>
  );
}

function Result({ label, value, tone }: { label: string; value: string; tone?: "gain" | "loss" }) {
  return (
    <div className="rounded-lg bg-muted/50 p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={cn("num mt-0.5 font-semibold", tone === "gain" && "text-gain", tone === "loss" && "text-loss")}>{value}</div>
    </div>
  );
}

/** Revente : ce que l'on encaisse réellement après commission et envoi. */
export function SaleCalculator() {
  const [cost, setCost] = useState("80");
  const [price, setPrice] = useState("120");
  const [rate, setRate] = useState("5");
  const [shipping, setShipping] = useState("1.5");
  const r = num(rate) / 100;
  const net = netFromSale(num(price), r, num(shipping));
  const profit = net - num(cost);
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <NumField id="sale-cost" label="Prix de revient" value={cost} onChange={setCost} suffix="€" />
        <NumField id="sale-price" label="Prix de vente" value={price} onChange={setPrice} suffix="€" />
        <NumField id="sale-rate" label="Commission" value={rate} onChange={setRate} suffix="%" step="0.5" />
        <NumField id="sale-ship" label="Envoi à votre charge" value={shipping} onChange={setShipping} suffix="€" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Result label="Encaissé net" value={eur(net)} />
        <Result label="Plus-value nette" value={signedEur(profit)} tone={profit >= 0 ? "gain" : "loss"} />
        <Result label="Rendement" value={pctText(num(cost) > 0 ? profit / num(cost) : null)} tone={profit >= 0 ? "gain" : "loss"} />
        <Result label="Prix de vente minimum" value={eur(breakEvenPrice(num(cost), r, num(shipping)))} />
      </div>
      <p className="text-xs text-muted-foreground">
        Repères : Cardmarket ≈ 5 % pour un particulier, eBay ≈ 11-13 % frais de paiement inclus. Envoi : lettre suivie
        ~1,5 €, colis assuré pour les cartes de valeur.
      </p>
    </div>
  );
}

/** Grading : espérance de gain d'un envoi PSA/CGC selon les probabilités de note. */
export function GradingCalculator() {
  const [raw, setRaw] = useState("100");
  const [cost, setCost] = useState("25");
  const [shipping, setShipping] = useState("15");
  const [p10, setP10] = useState("35");
  const [p9, setP9] = useState("45");
  const [p8, setP8] = useState("20");
  const [v10, setV10] = useState("350");
  const [v9, setV9] = useState("150");
  const [v8, setV8] = useState("95");
  const [fee, setFee] = useState("5");

  const sim = gradingSimulation({
    rawPrice: num(raw),
    gradingCost: num(cost),
    shippingCost: num(shipping),
    p10: num(p10) / 100,
    p9: num(p9) / 100,
    p8: num(p8) / 100,
    price10: num(v10),
    price9: num(v9),
    price8: num(v8),
    feeRate: num(fee) / 100,
  });
  const totalP = num(p10) + num(p9) + num(p8);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <NumField id="g-raw" label="Valeur brute" value={raw} onChange={setRaw} suffix="€" />
        <NumField id="g-cost" label="Coût du grading" value={cost} onChange={setCost} suffix="€" />
        <NumField id="g-ship" label="Envoi + assurance" value={shipping} onChange={setShipping} suffix="€" />
        <NumField id="g-fee" label="Commission revente" value={fee} onChange={setFee} suffix="%" step="0.5" />
      </div>
      <div className="grid grid-cols-3 gap-3">
        <NumField id="g-p10" label="Chance de 10" value={p10} onChange={setP10} suffix="%" step="1" />
        <NumField id="g-p9" label="Chance de 9" value={p9} onChange={setP9} suffix="%" step="1" />
        <NumField id="g-p8" label="8 ou moins" value={p8} onChange={setP8} suffix="%" step="1" />
        <NumField id="g-v10" label="Prix gradé 10" value={v10} onChange={setV10} suffix="€" />
        <NumField id="g-v9" label="Prix gradé 9" value={v9} onChange={setV9} suffix="€" />
        <NumField id="g-v8" label="Prix gradé 8" value={v8} onChange={setV8} suffix="€" />
      </div>
      {Math.abs(totalP - 100) > 0.5 && (
        <p className="text-xs text-loss">Les probabilités totalisent {totalP} % : elles sont normalisées à 100 %.</p>
      )}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Result label="Valeur gradée espérée" value={eur(sim.expected)} />
        <Result label="Net si gradée" value={eur(sim.netGraded)} />
        <Result label="Net si vendue brute" value={eur(sim.netRaw)} />
        <Result label="Gain du grading" value={signedEur(sim.gain)} tone={sim.gain >= 0 ? "gain" : "loss"} />
      </div>
      <div
        className={cn(
          "rounded-lg border p-3 text-sm",
          sim.gain >= 0 ? "border-gain/30 bg-gain/10" : "border-loss/30 bg-loss/10",
        )}
      >
        {sim.gain >= 0 ? (
          <>
            Grader est rentable en espérance : <strong className="num">{signedEur(sim.gain)}</strong> (rendement de{" "}
            {pctText(sim.roi)} sur les frais de grading).
          </>
        ) : (
          <>
            En espérance, mieux vaut vendre la carte brute. Il faudrait un prix 10 d&apos;au moins{" "}
            <strong className="num">{eur(sim.breakEven10)}</strong> pour que le grading soit neutre.
          </>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        Les probabilités dépendent surtout du centrage, des coins et de la surface : soyez honnête dans votre estimation. Prix
        gradés : consultez les ventes récentes (eBay « objets vendus », PriceCharting).
      </p>
    </div>
  );
}

const SCENARIOS = [
  { label: "Prudent", rate: 3 },
  { label: "Médian", rate: 8 },
  { label: "Optimiste", rate: 15 },
];

/** Projection d'un investissement régulier (DCA) selon un rendement annuel supposé. */
export function ProjectionCalculator() {
  const [initial, setInitial] = useState("500");
  const [monthly, setMonthly] = useState("100");
  const [rate, setRate] = useState("8");
  const [years, setYears] = useState("5");
  const y = Math.min(30, Math.max(1, Math.round(num(years))));
  const data = projectGrowth({ initial: num(initial), monthly: num(monthly), annualRate: num(rate) / 100, years: y });
  const last = data.at(-1)!;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <NumField id="p-init" label="Capital de départ" value={initial} onChange={setInitial} suffix="€" step="10" />
        <NumField id="p-month" label="Versement mensuel" value={monthly} onChange={setMonthly} suffix="€" step="10" />
        <NumField id="p-rate" label="Rendement annuel" value={rate} onChange={setRate} suffix="%" step="0.5" />
        <NumField id="p-years" label="Durée" value={years} onChange={setYears} suffix="ans" step="1" />
      </div>
      <div className="flex flex-wrap gap-2">
        {SCENARIOS.map((s) => (
          <button
            key={s.label}
            type="button"
            onClick={() => setRate(String(s.rate))}
            className={cn(
              "rounded-full border px-3 py-1 text-xs transition-colors hover:bg-accent",
              num(rate) === s.rate && "border-primary/50 bg-primary/10 text-primary",
            )}
          >
            {s.label} · {s.rate} %/an
          </button>
        ))}
      </div>
      <ProjectionChart data={data} />
      <div className="grid grid-cols-3 gap-3">
        <Result label="Total versé" value={eur(last.invested, { compact: true })} />
        <Result label="Valeur projetée" value={eur(last.value, { compact: true })} />
        <Result label="Gain hypothétique" value={signedEur(last.value - last.invested)} tone={last.value >= last.invested ? "gain" : "loss"} />
      </div>
      <p className="text-xs text-muted-foreground">
        Simulation purement hypothétique à rendement constant : les cartes ne produisent aucun revenu et leur prix peut
        baisser. Les performances passées ne préjugent pas des performances futures.
      </p>
    </div>
  );
}
