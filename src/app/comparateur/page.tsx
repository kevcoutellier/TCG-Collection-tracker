import { GitCompareArrows, Info, X } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { type ReactNode, Suspense } from "react";
import { CardImage } from "@/components/card-image";
import { cardHref } from "@/components/card-tile";
import { IndexedMomentumChart } from "@/components/charts";
import { ComparePicker } from "@/components/compare-picker";
import { Delta } from "@/components/delta";
import { EmptyState, PageHeader } from "@/components/page-header";
import { ScoreRing, SignalBadge } from "@/components/score";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  analyzeCard,
  type CardAnalysis,
  momentum,
  pct,
  type PopularityTier,
  type RarityTier,
  setAgeYears,
} from "@/lib/analysis";
import { type CompareRef, compareHref, parseCompareIds } from "@/lib/compare";
import { DISCLAIMER } from "@/lib/constants";
import { dateText, eur } from "@/lib/format";
import { gradeQuote } from "@/lib/graded-model";
import { loadCardTracking } from "@/lib/portfolio";
import { cardVariants, primaryVariant } from "@/lib/pricing";
import { getCard, getSet, getUsdToEur } from "@/lib/tcgdex";
import type { CardDetail, CardVariant } from "@/lib/types";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Comparateur" };

const LANG_LABEL = { fr: "Français", en: "Anglais", ja: "Japonais" } as const;
const POPULARITY_LABEL: Record<PopularityTier, string> = { S: "Très recherché", A: "Populaire", B: "Standard" };
const RARITY_LABEL: Record<RarityTier, string> = { top: "Haut de gamme", high: "Élevée", mid: "Moyenne", low: "Commune", unknown: "—" };

const SUGGESTIONS: { label: string; ids: string }[] = [
  { label: "Dracaufeu : set de base vs 151 vs Flammes Obsidiennes", ids: "base1-4,sv03.5-199,sv03-223" },
  { label: "Noctali VMAX alternatif vs Noctali ex Évolutions Prismatiques", ids: "swsh7-215,sv08.5-161" },
  { label: "Lugia vs Rayquaza (Épée et Bouclier)", ids: "swsh12-186,swsh7-218" },
];

export default function ComparePage({ searchParams }: PageProps<"/comparateur">) {
  return (
    <>
      <PageHeader
        eyebrow="Comparateur"
        title="Comparateur de cartes"
        description="Jusqu'à 4 cartes côte à côte : cotes Cardmarket et TCGplayer, dynamique récente, score d'investissement et potentiel gradé. L'adresse de la page se partage telle quelle."
      />
      <Suspense fallback={<Skeleton className="h-96 rounded-xl" />}>
        <CompareContent searchParams={searchParams} />
      </Suspense>
    </>
  );
}

interface Compared {
  ref: CompareRef;
  card: CardDetail;
  releaseDate: string | null;
  variants: CardVariant[];
  primary: CardVariant;
  analysis: CardAnalysis;
  ageYears: number | null;
  psa10: number | null;
  owned: { qty: number; cost: number };
  target: number | null;
}

async function loadCompared(ref: CompareRef, fx: number, now: Date): Promise<Compared | null> {
  const card = await getCard(ref.id, ref.lang).catch(() => null);
  if (!card) return null;
  const [set, tracking] = await Promise.all([getSet(card.set.id, ref.lang).catch(() => null), loadCardTracking(card.id)]);
  const variants = cardVariants(card, fx);
  const primary = primaryVariant(variants);
  const releaseDate = set?.releaseDate ?? null;
  const ageYears = setAgeYears(releaseDate, now);
  return {
    ref,
    card,
    releaseDate,
    variants,
    primary,
    analysis: analyzeCard({ name: card.name, rarity: card.rarity, releaseDate, price: primary.price }, now),
    ageYears,
    psa10: gradeQuote("PSA", "10", primary.price.price, ageYears, null).price,
    owned: {
      qty: tracking.owned.reduce((a, h) => a + h.quantity, 0),
      cost: tracking.owned.reduce((a, h) => a + h.quantity * h.purchasePrice, 0),
    },
    target: tracking.watch?.targetPrice ?? null,
  };
}

function first(v: string | string[] | undefined) {
  return Array.isArray(v) ? v[0] : v;
}

/** Indices des meilleures valeurs d'une ligne (aucun si moins de deux valeurs comparables ou si toutes sont égales). */
function bestOf(values: (number | null)[], dir: "max" | "min" = "max"): Set<number> {
  const valid = values.filter((v): v is number => v != null);
  if (valid.length < 2 || valid.every((v) => Math.abs(v - valid[0]) < 1e-9)) return new Set();
  const target = dir === "max" ? Math.max(...valid) : Math.min(...valid);
  return new Set(values.flatMap((v, i) => (v === target ? [i] : [])));
}

async function CompareContent({ searchParams }: Pick<PageProps<"/comparateur">, "searchParams">) {
  const sp = await searchParams;
  // Analyse dépendante de la date du jour et du suivi en base : rendu à la requête.
  await connection();
  const raw = first(sp.ids);
  const refs = parseCompareIds(raw);
  const now = new Date();
  const fx = await getUsdToEur();
  const loaded = await Promise.all(refs.map((r) => loadCompared(r, fx, now)));
  const items = loaded.filter((c): c is Compared => c !== null);
  const missing = refs.length - items.length;

  return (
    <div className="space-y-6">
      <ComparePicker selected={items.map((c) => c.ref)} explicit={raw !== undefined} />
      {missing > 0 && <p className="text-sm text-muted-foreground">{missing} carte(s) introuvable(s) ont été ignorées.</p>}
      {items.length ? <CompareTable items={items} fx={fx} /> : <CompareEmpty />}
    </div>
  );
}

function CompareEmpty() {
  return (
    <EmptyState
      icon={<GitCompareArrows />}
      title="Choisissez des cartes à comparer"
      description="Recherchez une carte ci-dessus, ou utilisez le bouton « Comparer » depuis la fiche d'une carte. Quelques idées :"
    >
      {SUGGESTIONS.map((s) => (
        <Link key={s.ids} href={`/comparateur?ids=${s.ids}`} className="rounded-full border bg-card px-3 py-1 text-sm transition-colors hover:border-primary/40 hover:bg-accent">
          {s.label}
        </Link>
      ))}
    </EmptyState>
  );
}

function CompareTable({ items, fx }: { items: Compared[]; fx: number }) {
  const refs = items.map((c) => c.ref);
  const prices = items.map((c) => c.primary.price);
  const usdEur = prices.map((p) => (p.usdMarket != null ? p.usdMarket * fx : null));
  const moms = prices.map((p) => momentum(p));
  const multiples = items.map((c, i) => (c.psa10 != null && prices[i].price ? c.psa10 / prices[i].price! : null));

  const sections: { title: string; rows: { label: string; hint?: string; cells: ReactNode[]; best?: Set<number> }[] }[] = [
    {
      title: "Identité",
      rows: [
        { label: "Extension", cells: items.map((c) => c.card.set.name) },
        {
          label: "Numéro",
          cells: items.map((c) => `${c.card.localId}${c.card.set.cardCount?.official ? ` / ${c.card.set.cardCount.official}` : ""}`),
        },
        { label: "Rareté", cells: items.map((c) => c.card.rarity ?? "—") },
        { label: "Sortie", cells: items.map((c) => dateText(c.releaseDate)) },
        { label: "Langue", cells: items.map((c) => LANG_LABEL[c.ref.lang]) },
        { label: "Variantes", hint: "Les prix ci-dessous concernent la variante de référence", cells: items.map((c) => `${c.variants.length} · réf. ${c.primary.label}`) },
      ],
    },
    {
      title: "Prix",
      rows: [
        { label: "Cote Cardmarket", hint: "Tendance de la variante de référence", cells: prices.map((p) => <b key="p">{eur(p.trend ?? p.price)}</b>) },
        { label: "Annonce la moins chère", hint: "Tous états et langues", cells: prices.map((p) => eur(p.low)) },
        { label: "Moyenne 7 j", cells: prices.map((p) => eur(p.avg7)) },
        { label: "Moyenne 30 j", cells: prices.map((p) => eur(p.avg30)) },
        { label: "TCGplayer (≈ €)", hint: "Prix market américain converti, hors frais d'import", cells: usdEur.map((v) => eur(v)) },
        {
          label: "Écart États-Unis / Europe",
          hint: "Positif : la carte est plus chère aux États-Unis qu'en Europe",
          cells: prices.map((p, i) => <Delta key="d" value={pct(p.price, usdEur[i])} icon={false} />),
        },
      ],
    },
    {
      title: "Dynamique",
      rows: [
        { label: "vs moyenne 30 j", cells: moms.map((m) => <Delta key="d" value={m.vs30} />), best: bestOf(moms.map((m) => m.vs30)) },
        { label: "vs moyenne 7 j", cells: moms.map((m) => <Delta key="d" value={m.vs7} />), best: bestOf(moms.map((m) => m.vs7)) },
        { label: "Ventes 24 h vs 7 j", cells: moms.map((m) => <Delta key="d" value={m.day} />) },
      ],
    },
    {
      title: "Analyse",
      rows: [
        {
          label: "Score d'investissement",
          cells: items.map((c) => <ScoreRing key="s" score={c.analysis.score} size={56} />),
          best: bestOf(items.map((c) => c.analysis.score)),
        },
        { label: "Signal", cells: items.map((c) => <SignalBadge key="s" kind={c.analysis.signal.kind} label={c.analysis.signal.label} />) },
        { label: "Demande", cells: items.map((c) => POPULARITY_LABEL[c.analysis.popularity]) },
        { label: "Rareté (catégorie)", cells: items.map((c) => RARITY_LABEL[c.analysis.rarity]) },
        {
          label: "Ancienneté",
          cells: items.map((c) => (c.ageYears != null ? `${c.ageYears.toFixed(1).replace(".", ",")} an${c.ageYears >= 2 ? "s" : ""}` : "—")),
        },
        { label: "Seuil de revente", hint: "Prix à atteindre pour récupérer la cote actuelle après frais", cells: items.map((c) => eur(c.analysis.breakEven)) },
      ],
    },
    {
      title: "Gradé",
      rows: [
        { label: "PSA 10 (estimation)", cells: items.map((c) => eur(c.psa10)), best: bestOf(items.map((c) => c.psa10)) },
        {
          label: "Multiple PSA 10 / brut",
          hint: "Plus il est élevé, plus le grading peut valoir le coup",
          cells: multiples.map((m) => (m != null ? `× ${m.toFixed(1).replace(".", ",")}` : "—")),
          best: bestOf(multiples),
        },
      ],
    },
    {
      title: "Votre suivi",
      rows: [
        {
          label: "En collection",
          cells: items.map((c) => (c.owned.qty ? `${c.owned.qty} · PRU ${eur(c.owned.cost / c.owned.qty)}` : "—")),
        },
        { label: "Objectif watchlist", cells: items.map((c) => eur(c.target)) },
      ],
    },
  ];

  const chartData = [
    { label: "Moy. 30 j", pick: (p: (typeof prices)[number]) => p.avg30 },
    { label: "Moy. 7 j", pick: (p: (typeof prices)[number]) => p.avg7 },
    { label: "Moy. 24 h", pick: (p: (typeof prices)[number]) => p.avg1 },
    { label: "Tendance", pick: (p: (typeof prices)[number]) => p.trend ?? p.price },
  ].map(({ label, pick }) => {
    const row: Record<string, string | number | null> = { label };
    prices.forEach((p, i) => {
      const v = pick(p);
      row[`c${i}`] = v != null && p.avg30 ? Math.round((v / p.avg30) * 1000) / 10 : null;
    });
    return row;
  });
  const chartable = prices.some((p) => p.avg30 != null);

  return (
    <div className="space-y-6">
      <div className="overflow-x-auto rounded-xl border bg-card">
        <table className="w-full min-w-[640px] table-fixed text-sm">
          <colgroup>
            <col className="w-44" />
            {items.map((c) => (
              <col key={`${c.ref.lang}:${c.ref.id}`} />
            ))}
          </colgroup>
          <thead>
            <tr>
              <th className="sticky left-0 z-10 bg-card" />
              {items.map((c) => (
                <th key={`${c.ref.lang}:${c.ref.id}`} className="px-3 pt-4 pb-3 text-left align-top font-normal">
                  <div className="relative mx-auto w-full max-w-36">
                    <Link href={cardHref(c.card.id, c.ref.lang)}>
                      <CardImage src={c.card.image} alt={c.card.name} />
                    </Link>
                    <Link
                      href={compareHref(refs.filter((r) => r !== c.ref))}
                      aria-label={`Retirer ${c.card.name} de la comparaison`}
                      className="absolute -top-2 -right-2 z-10 rounded-full border bg-background p-1 text-muted-foreground shadow hover:text-foreground"
                    >
                      <X className="size-3.5" />
                    </Link>
                  </div>
                  <Link href={cardHref(c.card.id, c.ref.lang)} className="mt-2 block truncate font-medium hover:underline">
                    {c.card.name}
                  </Link>
                  <div className="truncate text-xs text-muted-foreground">{c.card.set.name}</div>
                </th>
              ))}
            </tr>
          </thead>
          {sections.map((section) => (
            <tbody key={section.title}>
              <tr>
                <th colSpan={items.length + 1} className="bg-muted/40 px-3 py-1.5 text-left text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
                  {section.title}
                </th>
              </tr>
              {section.rows.map((row) => (
                <tr key={row.label} className="border-t">
                  <th scope="row" className="sticky left-0 z-10 bg-card px-3 py-2 text-left align-middle text-xs font-normal text-muted-foreground" title={row.hint}>
                    {row.label}
                  </th>
                  {row.cells.map((cell, i) => (
                    <td
                      key={i}
                      className={cn("num px-3 py-2 align-middle", row.best?.has(i) && "bg-gain/10 font-semibold text-gain")}
                    >
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          ))}
        </table>
      </div>

      {chartable && (
        <Card>
          <CardHeader>
            <CardTitle>Dynamique comparée</CardTitle>
            <CardDescription>Moyennes des ventes Cardmarket, base 100 = moyenne des 30 derniers jours de chaque carte</CardDescription>
          </CardHeader>
          <CardContent>
            <IndexedMomentumChart
              data={chartData}
              series={items.map((c, i) => ({ key: `c${i}`, label: `${c.card.name} · ${c.card.set.name}` }))}
            />
          </CardContent>
        </Card>
      )}

      <p className="flex gap-1.5 text-[11px] text-muted-foreground">
        <Info className="mt-0.5 size-3 shrink-0" />
        Cellules en vert : meilleure valeur de la ligne. Estimation PSA 10 issue du modèle de l&apos;app (multiple de la cote brute selon
        l&apos;époque). {DISCLAIMER}
      </p>
    </div>
  );
}
