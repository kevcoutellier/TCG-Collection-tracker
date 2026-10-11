"use client";

import { Award, Info } from "lucide-react";
import { useState } from "react";
import { Field } from "@/components/forms/field";
import { NativeSelect } from "@/components/native-select";
import { dateText, eur } from "@/lib/format";
import {
  GRADING_COMPANIES,
  GRADING_SCALES,
  type GradeQuote,
  gradeQuote,
  isGradingCompany,
  type SalesByGrade,
} from "@/lib/graded-model";
import { cn } from "@/lib/utils";

export interface GradedVariantOption {
  key: string;
  label: string;
  /** Cote brute de la variante (EUR). */
  price: number | null;
  sales: SalesByGrade | null;
}

export function scaleOf(company: string): readonly string[] {
  return isGradingCompany(company) ? GRADING_SCALES[company] : ["10", "9.5", "9", "8.5", "8", "7", "6", "5"];
}

export function QuoteSource({ quote, className }: { quote: GradeQuote; className?: string }) {
  if (quote.source === "sales") {
    return (
      <span className={cn("text-xs text-gain", className)}>
        Ventes réelles{quote.count ? ` · ${quote.count} ventes` : ""}
        {quote.lastSale ? ` · dernière le ${dateText(quote.lastSale)}` : ""}
      </span>
    );
  }
  if (quote.source === "estimate") return <span className={cn("text-xs text-muted-foreground", className)}>Estimation</span>;
  return <span className={cn("text-xs text-muted-foreground", className)}>Cote brute inconnue</span>;
}

/** Société + note avec la cote correspondante (champs de formulaire `gradingCompany` et `grade`). */
export function GradeFields({
  raw,
  ageYears,
  sales,
  defaultCompany = "PSA",
  defaultGrade = "10",
  onQuoteChange,
}: {
  raw: number | null;
  ageYears: number | null;
  sales: SalesByGrade | null;
  defaultCompany?: string;
  defaultGrade?: string;
  onQuoteChange?: (q: GradeQuote) => void;
}) {
  const [company, setCompany] = useState(defaultCompany);
  const [grade, setGrade] = useState(defaultGrade);
  const quote = gradeQuote(company, grade, raw, ageYears, sales);

  return (
    <div className="grid grid-cols-2 gap-3">
      <Field label="Société de gradation" htmlFor="gradingCompany">
        <NativeSelect
          id="gradingCompany"
          name="gradingCompany"
          value={company}
          onChange={(e) => {
            const c = e.target.value;
            const scale = scaleOf(c);
            const g = scale.includes(grade) ? grade : scale[0];
            setCompany(c);
            setGrade(g);
            onQuoteChange?.(gradeQuote(c, g, raw, ageYears, sales));
          }}
        >
          {GRADING_COMPANIES.map((c) => (
            <option key={c}>{c}</option>
          ))}
          <option value="Autre">Autre</option>
        </NativeSelect>
      </Field>
      <Field label="Note" htmlFor="grade">
        <NativeSelect
          id="grade"
          name="grade"
          value={grade}
          onChange={(e) => {
            setGrade(e.target.value);
            onQuoteChange?.(gradeQuote(company, e.target.value, raw, ageYears, sales));
          }}
        >
          {scaleOf(company).map((g) => (
            <option key={g}>{g}</option>
          ))}
        </NativeSelect>
      </Field>
      <div className="col-span-2 flex items-baseline justify-between rounded-lg bg-muted/60 px-3 py-2">
        <span className="text-xs text-muted-foreground">
          Cote {company} {grade}
        </span>
        <span className="flex items-baseline gap-2">
          <QuoteSource quote={quote} />
          <span className="num font-semibold">{eur(quote.price)}</span>
        </span>
      </div>
    </div>
  );
}

/** Panneau « prix gradé » de la fiche carte : variante, société et note au choix. */
export function GradedPricePanel({
  variants,
  ageYears,
  salesConfigured,
}: {
  variants: GradedVariantOption[];
  ageYears: number | null;
  salesConfigured: boolean;
}) {
  const [variantKey, setVariantKey] = useState(variants[0]?.key);
  const [company, setCompany] = useState<string>("PSA");
  const [grade, setGrade] = useState("10");
  const variant = variants.find((v) => v.key === variantKey) ?? variants[0];
  if (!variant) return null;
  const quote = gradeQuote(company, grade, variant.price, ageYears, variant.sales);
  const scale = scaleOf(company);

  return (
    <div className="space-y-4">
      {variants.length > 1 && (
        <NativeSelect value={variant.key} onChange={(e) => setVariantKey(e.target.value)} aria-label="Variante">
          {variants.map((v) => (
            <option key={v.key} value={v.key}>
              {v.label} — brut {eur(v.price)}
            </option>
          ))}
        </NativeSelect>
      )}
      <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Société de gradation">
        {GRADING_COMPANIES.map((c) => (
          <button
            key={c}
            type="button"
            role="radio"
            aria-checked={company === c}
            onClick={() => {
              setCompany(c);
              if (!scaleOf(c).includes(grade)) setGrade(scaleOf(c)[0]);
            }}
            className={cn(
              "rounded-full border px-3 py-1 text-xs font-medium transition-colors hover:bg-accent",
              company === c && "border-primary/60 bg-primary/15 text-primary",
            )}
          >
            {c}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="w-36">
          <NativeSelect value={grade} onChange={(e) => setGrade(e.target.value)} aria-label="Note">
            {scale.map((g) => (
              <option key={g} value={g}>
                Note {g}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="text-right">
          <div className="flex items-center justify-end gap-1.5 text-xs text-muted-foreground">
            <Award className="size-3.5 text-primary" />
            {company} {grade}
          </div>
          <div className="num text-3xl font-semibold tracking-tight">{eur(quote.price)}</div>
          <QuoteSource quote={quote} />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {scale.slice(0, 8).map((g) => {
          const q = gradeQuote(company, g, variant.price, ageYears, variant.sales);
          return (
            <button
              key={g}
              type="button"
              onClick={() => setGrade(g)}
              className={cn(
                "rounded-lg border px-2 py-1.5 text-left transition-colors hover:bg-accent",
                g === grade && "border-primary/50 bg-primary/10",
              )}
            >
              <div className="text-[11px] text-muted-foreground">{g}</div>
              <div className={cn("num text-sm font-medium", q.source === "sales" && "text-gain")}>{eur(q.price, { compact: true })}</div>
            </button>
          );
        })}
      </div>

      <p className="flex gap-1.5 text-[11px] leading-relaxed text-muted-foreground">
        <Info className="mt-0.5 size-3 shrink-0" />
        {salesConfigured
          ? "En vert : médiane des ventes eBay récentes (PokemonPriceTracker). Les autres notes sont estimées à partir de la cote brute."
          : "Estimation à partir de la cote brute, de l'ancienneté de la carte et des écarts habituels entre sociétés. Pour des ventes réelles, ajoutez une clé POKEMONPRICETRACKER_API_KEY (gratuite) dans .env.local."}
      </p>
    </div>
  );
}
