"use client";

import { Check, Pencil, X } from "lucide-react";
import { useState } from "react";
import { CardImage } from "@/components/card-image";
import { scaleOf } from "@/components/graded";
import { NativeSelect } from "@/components/native-select";
import { Input } from "@/components/ui/input";
import { CONDITIONS, LANGUAGES } from "@/lib/constants";
import { eur } from "@/lib/format";
import { GRADING_COMPANIES } from "@/lib/graded-model";
import type { CardCandidate } from "@/lib/scan-model";
import type { Lang } from "@/lib/types";
import { cn } from "@/lib/utils";
import { CardSearch } from "./card-search";
import { refreshPrice, type ScanRow, selectedCandidate, withCandidate } from "./rows";

const FINISH_LABEL = { normal: "normale", holo: "holo", reverse: "reverse", unknown: null } as const;
const LANG_LABEL = { fr: "français", en: "anglais", ja: "japonais", other: "autre langue" } as const;

function Confidence({ score }: { score: number }) {
  const [label, style] =
    score >= 0.8 ? ["Sûre", "bg-gain/15 text-gain"] : score >= 0.55 ? ["Probable", "bg-primary/15 text-primary"] : ["À vérifier", "bg-loss/15 text-loss"];
  return (
    <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-medium", style)} title={`Concordance ${Math.round(score * 100)} %`}>
      {label}
    </span>
  );
}

/** Ce qui a été lu sur la photo, pour vérifier l'identification d'un coup d'œil. */
function readingText(row: ScanRow): string | null {
  const r = row.reading;
  const parts = [
    r.name && `« ${r.name} »`,
    r.number && (r.total ? `${r.number}/${r.total}` : r.number),
    r.language && LANG_LABEL[r.language],
    FINISH_LABEL[r.finish],
    r.firstEdition && "1re édition",
    r.grading && `${r.grading.company} ${r.grading.grade}`,
    r.position,
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : null;
}

export function DetectionRow({
  row,
  lang,
  onChange,
  onRemove,
}: {
  row: ScanRow;
  lang: Lang;
  onChange: (update: (row: ScanRow) => ScanRow) => void;
  onRemove: () => void;
}) {
  const candidate = selectedCandidate(row);
  const [searching, setSearching] = useState(!candidate);
  const others = row.candidates.filter((c) => c.id !== row.candidateId).slice(0, 4);
  const read = readingText(row);
  const companies = row.gradingCompany && !(GRADING_COMPANIES as string[]).includes(row.gradingCompany) ? [...GRADING_COMPANIES, row.gradingCompany] : GRADING_COMPANIES;
  const pick = (c: CardCandidate) => {
    onChange((r) => withCandidate(r, c));
    setSearching(false);
  };

  return (
    <div className={cn("rounded-xl border bg-card p-3 transition-colors", row.include && candidate ? "border-primary/30" : "opacity-90")}>
      <div className="flex gap-3">
        <div className="w-20 shrink-0 sm:w-24">
          <CardImage src={candidate?.image} alt={candidate?.name ?? "Carte non identifiée"} />
        </div>
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              {candidate ? (
                <>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="truncate font-medium">{candidate.name}</span>
                    {row.source !== "manual" && <Confidence score={candidate.score} />}
                  </div>
                  <div className="truncate text-xs text-muted-foreground">
                    {candidate.setName} · n° {candidate.localId}
                    {candidate.total ? `/${candidate.total}` : ""}
                    {candidate.rarity ? ` · ${candidate.rarity}` : ""}
                  </div>
                </>
              ) : (
                <div className="font-medium">Carte non identifiée</div>
              )}
              {read && <div className="mt-0.5 truncate text-[11px] text-muted-foreground">Lu : {read}</div>}
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <label className="flex items-center gap-1.5 rounded-lg border px-2 py-1 text-xs">
                <input
                  type="checkbox"
                  checked={row.include && candidate != null}
                  disabled={!candidate}
                  onChange={(e) => onChange((r) => ({ ...r, include: e.target.checked }))}
                  className="size-3.5 accent-[var(--primary)]"
                />
                Ajouter
              </label>
              <button type="button" onClick={onRemove} className="rounded-lg p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground" aria-label="Retirer cette carte">
                <X className="size-4" />
              </button>
            </div>
          </div>

          {(others.length > 0 || candidate) && !searching && (
            <div className="flex flex-wrap items-center gap-1.5">
              {others.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => pick(c)}
                  title={`${c.name} · ${c.setName} · n° ${c.localId}`}
                  className="w-9 rounded transition-transform hover:scale-105"
                >
                  <CardImage src={c.image} alt={c.name} />
                </button>
              ))}
              <button type="button" onClick={() => setSearching(true)} className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                <Pencil className="size-3" /> {others.length ? "Autre carte…" : "Corriger…"}
              </button>
            </div>
          )}
        </div>
      </div>

      {searching && (
        <div className="mt-3 space-y-2 rounded-lg border border-dashed p-2">
          <CardSearch lang={candidate?.lang ?? lang} initial={row.reading.name ?? candidate?.name ?? ""} onPick={pick} />
          {candidate && (
            <button type="button" onClick={() => setSearching(false)} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
              <Check className="size-3" /> Garder « {candidate.name} »
            </button>
          )}
        </div>
      )}

      {candidate && (
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          <label className="col-span-2 grid gap-1 text-[11px] text-muted-foreground sm:col-span-3 lg:col-span-2">
            Variante
            <NativeSelect value={row.variantKey ?? ""} onChange={(e) => onChange((r) => refreshPrice({ ...r, variantKey: e.target.value }))}>
              {candidate.variants.map((v) => (
                <option key={v.key} value={v.key}>
                  {v.label} — {eur(v.price)}
                </option>
              ))}
            </NativeSelect>
          </label>
          <label className="grid gap-1 text-[11px] text-muted-foreground">
            Quantité
            <Input
              type="number"
              min={1}
              step={1}
              value={row.quantity}
              onChange={(e) => onChange((r) => ({ ...r, quantity: e.target.value }))}
              className="h-8"
            />
          </label>
          <label className="grid gap-1 text-[11px] text-muted-foreground">
            Prix d&apos;achat (€)
            <Input
              type="number"
              min={0}
              step="0.01"
              inputMode="decimal"
              value={row.price}
              onChange={(e) => onChange((r) => ({ ...r, price: e.target.value, priceTouched: true }))}
              className="h-8"
            />
          </label>
          <label className="grid gap-1 text-[11px] text-muted-foreground">
            État
            <NativeSelect value={row.condition} onChange={(e) => onChange((r) => ({ ...r, condition: e.target.value }))}>
              {CONDITIONS.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.value}
                </option>
              ))}
            </NativeSelect>
          </label>
          <label className="grid gap-1 text-[11px] text-muted-foreground">
            Langue
            <NativeSelect value={row.language} onChange={(e) => onChange((r) => ({ ...r, language: e.target.value }))}>
              {LANGUAGES.map((l) => (
                <option key={l.value} value={l.value}>
                  {l.label}
                </option>
              ))}
            </NativeSelect>
          </label>
          <label className="grid gap-1 text-[11px] text-muted-foreground">
            Gradation
            <NativeSelect
              value={row.gradingCompany}
              onChange={(e) => {
                const company = e.target.value;
                onChange((r) => refreshPrice({ ...r, gradingCompany: company, grade: company ? (scaleOf(company).includes(r.grade) ? r.grade : scaleOf(company)[0]) : "" }));
              }}
            >
              <option value="">Non gradée</option>
              {companies.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </NativeSelect>
          </label>
          {row.gradingCompany && (
            <label className="grid gap-1 text-[11px] text-muted-foreground">
              Note
              <NativeSelect value={row.grade} onChange={(e) => onChange((r) => refreshPrice({ ...r, grade: e.target.value }))}>
                {[...new Set([row.grade, ...scaleOf(row.gradingCompany)])].filter(Boolean).map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </NativeSelect>
            </label>
          )}
        </div>
      )}
    </div>
  );
}
