import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { setHref } from "@/components/card-tile";
import { PageHeader } from "@/components/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { dateText } from "@/lib/format";
import { getJapaneseSets, type JapaneseSet } from "@/lib/japan";
import { getSeriesWithSets } from "@/lib/tcgdex";
import { parseLang } from "@/lib/types";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Extensions" };

export default function SetsPage({ searchParams }: PageProps<"/sets">) {
  return (
    <>
      <PageHeader
        title="Extensions"
        description="Toutes les extensions du JCC Pokémon, internationales et japonaises, de la plus récente à la plus ancienne. Ouvrez-en une pour voir toutes ses cartes et leur cote."
      />
      <Suspense fallback={<Skeleton className="h-96 rounded-xl" />}>
        <SetsContent searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function SetsContent({ searchParams }: Pick<PageProps<"/sets">, "searchParams">) {
  const lang = parseLang((await searchParams).lang);
  const japanese = lang === "ja";
  return (
    <div className="space-y-8">
      <div className="inline-flex rounded-lg border bg-card p-1" role="tablist">
        {[
          { href: "/sets", label: "Internationales (FR / EN)", active: !japanese },
          { href: "/sets?lang=ja", label: "Japonaises", active: japanese },
        ].map((t) => (
          <Link
            key={t.href}
            href={t.href}
            role="tab"
            aria-selected={t.active}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm transition-colors",
              t.active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
          </Link>
        ))}
      </div>
      <Suspense key={lang} fallback={<SetsSkeleton japanese={japanese} />}>
        {japanese ? <JapaneseSetsList /> : <SetsList />}
      </Suspense>
    </div>
  );
}

function SetTile({ href, logo, symbol, title, subtitle, meta }: { href: string; logo?: string; symbol?: string; title: string; subtitle?: string | null; meta: string }) {
  return (
    <Link
      href={href}
      className="flex flex-col items-center gap-2 rounded-xl border bg-card p-3 text-center transition-colors hover:border-primary/40 hover:bg-accent/40"
    >
      <div className="flex h-12 w-full items-center justify-center">
        {logo ? (
          // eslint-disable-next-line @next/next/no-img-element -- logo distant TCGdex
          <img src={`${logo}.webp`} alt="" className="max-h-12 max-w-full object-contain" loading="lazy" />
        ) : symbol ? (
          // eslint-disable-next-line @next/next/no-img-element -- symbole distant TCGdex
          <img src={`${symbol}.webp`} alt="" className="size-8 object-contain opacity-80" loading="lazy" />
        ) : null}
      </div>
      <div className="line-clamp-2 text-sm font-medium">{title}</div>
      {subtitle && <div className="line-clamp-1 text-xs text-muted-foreground">{subtitle}</div>}
      <div className="text-xs text-muted-foreground">{meta}</div>
    </Link>
  );
}

async function SetsList() {
  await connection();
  const series = await getSeriesWithSets("fr");
  return (
    <div className="space-y-10">
      <nav className="flex flex-wrap gap-2" aria-label="Séries">
        {series.map((s) => (
          <a key={s.id} href={`#${s.id}`} className="rounded-full border bg-card px-3 py-1 text-xs hover:bg-accent">
            {s.name}
          </a>
        ))}
      </nav>
      {series.map((serie) => (
        <section key={serie.id} id={serie.id} className="scroll-mt-20">
          <div className="mb-3 flex items-baseline justify-between gap-2">
            <h2 className="text-lg font-semibold">{serie.name}</h2>
            {serie.releaseDate && <span className="text-xs text-muted-foreground">depuis {dateText(serie.releaseDate)}</span>}
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
            {serie.sets.map((set) => (
              <SetTile key={set.id} href={setHref(set.id)} logo={set.logo} symbol={set.symbol} title={set.name} meta={`${set.cardCount.total} cartes`} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

async function JapaneseSetsList() {
  await connection();
  const sets = await getJapaneseSets();
  const groups: { id: string; label: string; sets: JapaneseSet[] }[] = [];
  for (const s of sets) {
    let g = groups.find((x) => x.id === s.serieId);
    if (!g) groups.push((g = { id: s.serieId, label: s.serieLabel, sets: [] }));
    g.sets.push(s);
  }
  return (
    <div className="space-y-10">
      <p className="text-sm text-muted-foreground">
        {sets.length} extensions japonaises · cotes Cardmarket des versions japonaises · nom anglais indiqué quand il existe.
      </p>
      <nav className="flex flex-wrap gap-2" aria-label="Séries japonaises">
        {groups.map((g) => (
          <a key={g.id} href={`#ja-${g.id}`} className="rounded-full border bg-card px-3 py-1 text-xs hover:bg-accent">
            {g.label}
          </a>
        ))}
      </nav>
      {groups.map((g) => (
        <section key={g.id} id={`ja-${g.id}`} className="scroll-mt-20">
          <h2 className="mb-3 text-lg font-semibold">{g.label}</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
            {g.sets.map((set) => (
              <SetTile
                key={set.id}
                href={setHref(set.id, "ja")}
                logo={set.logo}
                symbol={set.symbol}
                title={set.englishName ?? set.name}
                subtitle={set.englishName ? set.name : set.id}
                meta={`${set.id} · ${set.cardCount.total} cartes${set.releaseDate ? ` · ${set.releaseDate.slice(0, 4)}` : ""}`}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function SetsSkeleton({ japanese }: { japanese: boolean }) {
  return (
    <div className="space-y-4">
      {japanese && (
        <p className="text-sm text-muted-foreground">
          Premier chargement des extensions japonaises (correspondance avec les noms anglais) : quelques secondes…
        </p>
      )}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
        {Array.from({ length: 12 }, (_, i) => (
          <Skeleton key={i} className="h-32 rounded-xl" />
        ))}
      </div>
    </div>
  );
}
