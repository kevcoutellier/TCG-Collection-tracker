import { Check } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { setHref } from "@/components/card-tile";
import { PageHeader } from "@/components/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { requireUser } from "@/lib/auth/session";
import { getCatalogIndex } from "@/lib/catalog";
import type { CatalogSetEntry } from "@/lib/catalog-db";
import { countOfficial } from "@/lib/collection";
import { type OwnedSet, ownedCardsBySet } from "@/lib/collection-db";
import { dateText } from "@/lib/format";
import { parseLang } from "@/lib/types";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Extensions" };

export default function SetsPage({ searchParams }: PageProps<"/sets">) {
  return (
    <>
      <PageHeader
        title="Extensions"
        description="Toutes les extensions du JCC Pokémon, internationales et japonaises, de la plus récente à la plus ancienne. Ouvrez-en une pour cocher les cartes que vous possédez."
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

/** Avancement d'une extension pour sa vignette : cartes officielles possédées, secrètes à part. */
function tileProgress(owned: Map<string, OwnedSet>, set: CatalogSetEntry) {
  const ids = owned.get(set.id)?.cardIds;
  if (!ids?.length) return undefined;
  const official = set.official || set.total;
  return { owned: countOfficial(ids, official, set.total), official };
}

function SetTile({
  href,
  code,
  logo,
  symbol,
  title,
  subtitle,
  meta,
  progress,
}: {
  href: string;
  /** Code de l'extension (« SV03.5 »), affiché comme sur les fiches des cartes. */
  code: string;
  logo: string | null;
  symbol: string | null;
  title: string;
  subtitle?: string | null;
  meta: string;
  progress?: { owned: number; official: number };
}) {
  const pct = progress ? Math.min(100, Math.round((progress.owned / progress.official) * 100)) : 0;
  const complete = progress != null && pct === 100;
  return (
    <Link
      href={href}
      className="group relative flex flex-col overflow-hidden rounded-xl border bg-card shadow-sm transition hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-md focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
    >
      <div className="flex h-20 items-center justify-center border-b bg-muted/50 px-3">
        {logo ? (
          // eslint-disable-next-line @next/next/no-img-element -- logo distant TCGdex
          <img src={`${logo}.webp`} alt="" className="max-h-14 max-w-full object-contain transition group-hover:scale-105" loading="lazy" />
        ) : symbol ? (
          // eslint-disable-next-line @next/next/no-img-element -- symbole distant TCGdex
          <img src={`${symbol}.webp`} alt="" className="size-9 object-contain" loading="lazy" />
        ) : (
          <span className="text-sm font-bold tracking-wide text-muted-foreground">{code}</span>
        )}
      </div>
      {complete && (
        <span className="absolute top-2 right-2 flex items-center gap-1 rounded-full bg-gold px-2 py-0.5 text-[10px] font-bold text-foreground shadow-sm">
          <Check className="size-3" strokeWidth={3} />
          Complète
        </span>
      )}
      <div className="flex flex-1 flex-col gap-1.5 p-3">
        <div className="flex items-center gap-1.5">
          {symbol && logo && (
            // eslint-disable-next-line @next/next/no-img-element -- symbole distant TCGdex
            <img src={`${symbol}.webp`} alt="" className="size-4 object-contain" loading="lazy" />
          )}
          <span className="num rounded bg-secondary px-1.5 py-px text-[10px] font-bold tracking-wide text-muted-foreground">{code}</span>
        </div>
        <div className="line-clamp-2 text-sm leading-snug font-semibold">{title}</div>
        {subtitle && <div className="line-clamp-1 text-xs text-muted-foreground">{subtitle}</div>}
        {progress ? (
          <div className="mt-auto space-y-1 pt-1">
            <div className="num flex justify-between text-xs">
              <span className="font-medium">
                {progress.owned} / {progress.official}
              </span>
              <span className={cn("font-bold", complete ? "text-primary" : "text-muted-foreground")}>{pct} %</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
            </div>
          </div>
        ) : (
          <div className="mt-auto pt-1 text-xs text-muted-foreground">{meta}</div>
        )}
      </div>
    </Link>
  );
}

/** En-tête d'une série : repère rouge, logo, nom et date de début. */
function SerieHeader({ name, logo, since }: { name: string; logo: string | null; since: string | null }) {
  return (
    <div className="mb-4 flex items-center gap-3 border-b pb-2.5">
      <span className="h-8 w-1.5 shrink-0 rounded-full bg-primary" aria-hidden />
      {logo && (
        // eslint-disable-next-line @next/next/no-img-element -- logo distant TCGdex
        <img src={`${logo}.webp`} alt="" className="h-8 max-w-20 shrink-0 object-contain" loading="lazy" />
      )}
      <div className="min-w-0">
        <h2 className="text-lg leading-tight font-bold text-balance">{name}</h2>
        {since && <p className="text-xs text-muted-foreground">depuis {dateText(since)}</p>}
      </div>
    </div>
  );
}

const SERIES_CHIP =
  "rounded-full border bg-card px-3 py-1.5 text-xs font-medium shadow-sm transition-colors hover:border-primary/50 hover:text-primary";

async function SetsList() {
  await connection();
  const [series, user] = await Promise.all([getCatalogIndex("fr"), requireUser()]);
  const owned = await ownedCardsBySet(user.id);
  return (
    <div className="space-y-10">
      <nav className="flex flex-wrap gap-2" aria-label="Séries">
        {series.map((s) => (
          <a key={s.id} href={`#${s.id}`} className={SERIES_CHIP}>
            {s.name}
          </a>
        ))}
      </nav>
      {series.map((serie) => (
        <section key={serie.id} id={serie.id} className="scroll-mt-24">
          <SerieHeader name={serie.name} logo={serie.logo} since={serie.releaseDate} />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
            {serie.sets.map((set) => (
              <SetTile
                key={set.id}
                href={setHref(set.id)}
                code={set.id.toUpperCase()}
                logo={set.logo}
                symbol={set.symbol}
                title={set.name}
                meta={`${set.total} cartes`}
                progress={tileProgress(owned, set)}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

async function JapaneseSetsList() {
  await connection();
  const [groups, user] = await Promise.all([getCatalogIndex("ja"), requireUser()]);
  const owned = await ownedCardsBySet(user.id);
  return (
    <div className="space-y-10">
      <p className="text-sm text-muted-foreground">
        {groups.reduce((n, g) => n + g.sets.length, 0)} extensions japonaises · cotes Cardmarket des versions japonaises · nom anglais indiqué quand il existe.
      </p>
      <nav className="flex flex-wrap gap-2" aria-label="Séries japonaises">
        {groups.map((g) => (
          <a key={g.id} href={`#ja-${g.id}`} className={SERIES_CHIP}>
            {g.name}
          </a>
        ))}
      </nav>
      {groups.map((g) => (
        <section key={g.id} id={`ja-${g.id}`} className="scroll-mt-24">
          <SerieHeader name={g.name} logo={null} since={null} />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
            {g.sets.map((set) => (
              <SetTile
                key={set.id}
                href={setHref(set.id, "ja")}
                code={set.id}
                logo={set.logo}
                symbol={set.symbol}
                title={set.englishName ?? set.name}
                subtitle={set.englishName ? set.name : null}
                meta={`${set.total} cartes${set.releaseDate ? ` · ${set.releaseDate.slice(0, 4)}` : ""}`}
                progress={tileProgress(owned, set)}
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
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
        {Array.from({ length: 12 }, (_, i) => (
          <Skeleton key={i} className="h-44 rounded-xl" />
        ))}
      </div>
    </div>
  );
}
