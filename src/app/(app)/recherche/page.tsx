import { SearchX } from "lucide-react";
import type { Metadata } from "next";
import Form from "next/form";
import Link from "next/link";
import { Suspense } from "react";
import { CardGrid, CardTile } from "@/components/card-tile";
import { NativeSelect } from "@/components/native-select";
import { Pagination } from "@/components/pagination";
import { EmptyState, PageHeader } from "@/components/page-header";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { momentum } from "@/lib/analysis";
import { cardVariants, primaryVariant } from "@/lib/pricing";
import { getUsdToEur, hydrateCards, searchCardBriefs, searchJapaneseBriefs } from "@/lib/tcgdex";
import { type Lang, parseLang } from "@/lib/types";

export const metadata: Metadata = { title: "Recherche" };

const PAGE_SIZE = 48;

const SORTS = {
  "price-desc": "Prix décroissant",
  "price-asc": "Prix croissant",
  momentum: "Plus forte hausse (30 j)",
  name: "Nom",
  set: "Extension",
} as const;
type Sort = keyof typeof SORTS;

const LANG_LABELS: Record<Lang, string> = { fr: "Cartes FR", en: "Cartes EN", ja: "Cartes japonaises" };

const SUGGESTIONS = ["Dracaufeu", "Pikachu", "Noctali", "Mewtwo", "Rayquaza", "Lugia", "Ectoplasma", "Évoli", "Amphinobi", "Giratina", "Magicarpe", "Lucario"];

export default function SearchPage({ searchParams }: PageProps<"/recherche">) {
  return (
    <>
      <PageHeader
        title="Recherche de cartes"
        description="Toutes les cartes Pokémon TCG et toutes leurs variantes, avec leur cote Cardmarket et TCGplayer. Pour les cartes japonaises, tapez simplement le nom français (« Dracaufeu »)."
      />
      <Suspense fallback={<Skeleton className="h-9 w-full max-w-2xl" />}>
        <SearchArea searchParams={searchParams} />
      </Suspense>
    </>
  );
}

function first(v: string | string[] | undefined) {
  return (Array.isArray(v) ? v[0] : v) ?? "";
}

function searchHref(q: string, lang: Lang, sort: Sort, page = 1) {
  const params = new URLSearchParams({ q });
  if (lang !== "fr") params.set("lang", lang);
  if (sort !== "price-desc") params.set("sort", sort);
  if (page > 1) params.set("page", String(page));
  return `/recherche?${params}`;
}

async function SearchArea({ searchParams }: Pick<PageProps<"/recherche">, "searchParams">) {
  const sp = await searchParams;
  const q = first(sp.q).trim();
  const lang = parseLang(first(sp.lang));
  const sortParam = first(sp.sort);
  const sort: Sort = sortParam in SORTS ? (sortParam as Sort) : "price-desc";
  const page = Math.max(1, Number.parseInt(first(sp.page), 10) || 1);

  return (
    <div className="space-y-6">
      <Form action="/recherche" className="flex flex-col gap-2 sm:flex-row">
        <Input name="q" defaultValue={q} placeholder="Nom de la carte…" className="h-9 sm:max-w-sm" autoFocus={!q} />
        <div className="grid grid-cols-2 gap-2 sm:flex">
          <NativeSelect name="lang" defaultValue={lang} className="h-9 sm:w-44" aria-label="Langue des cartes">
            {(Object.keys(LANG_LABELS) as Lang[]).map((l) => (
              <option key={l} value={l}>
                {LANG_LABELS[l]}
              </option>
            ))}
          </NativeSelect>
          <NativeSelect name="sort" defaultValue={sort} className="h-9 sm:w-52" aria-label="Tri">
            {Object.entries(SORTS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </NativeSelect>
        </div>
        <Button type="submit" size="lg">
          Rechercher
        </Button>
      </Form>

      {q ? (
        <Suspense key={`${q}|${lang}|${sort}|${page}`} fallback={<ResultsSkeleton />}>
          <Results q={q} lang={lang} sort={sort} page={page} />
        </Suspense>
      ) : (
        <div>
          <p className="mb-3 text-sm text-muted-foreground">Recherches populaires</p>
          <div className="flex flex-wrap gap-2">
            {SUGGESTIONS.map((s) => (
              <Link
                key={s}
                href={`/recherche?q=${encodeURIComponent(s)}`}
                className="rounded-full border bg-card px-3 py-1 text-sm transition-colors hover:border-primary/40 hover:bg-accent"
              >
                {s}
              </Link>
            ))}
            <Link
              href="/recherche?q=Dracaufeu&lang=ja"
              className="rounded-full border bg-card px-3 py-1 text-sm transition-colors hover:border-primary/40 hover:bg-accent"
            >
              Dracaufeu japonais
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

async function Results({ q, lang, sort, page }: { q: string; lang: Lang; sort: Sort; page: number }) {
  const briefs = lang === "ja" ? await searchJapaneseBriefs(q) : await searchCardBriefs(q, lang);
  if (!briefs.length) {
    const other: Lang = lang === "fr" ? "en" : "fr";
    return (
      <EmptyState
        icon={<SearchX />}
        title={`Aucune carte trouvée pour « ${q} »`}
        description={
          lang === "ja"
            ? "Tapez le nom français ou anglais d'un Pokémon (les cartes Dresseur japonaises se cherchent en japonais)."
            : "Essayez le nom du Pokémon dans l'autre langue ou une orthographe plus courte."
        }
      >
        <Link href={searchHref(q, other, sort)} className={buttonVariants({ variant: "outline" })}>
          Chercher dans les {LANG_LABELS[other].toLowerCase()}
        </Link>
      </EmptyState>
    );
  }

  // Toutes les cartes sont chargées (avec cache) pour trier l'ensemble des résultats.
  const [cards, fx] = await Promise.all([hydrateCards(briefs.map((b) => b.id), lang), getUsdToEur()]);
  const items = cards.map((card) => {
    const variants = cardVariants(card, fx);
    const p = primaryVariant(variants).price;
    return { card, price: p.price, vs30: momentum(p).vs30, variantCount: variants.length };
  });
  items.sort((a, b) => {
    switch (sort) {
      case "price-asc":
        return (a.price ?? Infinity) - (b.price ?? Infinity);
      case "momentum":
        return (b.vs30 ?? -Infinity) - (a.vs30 ?? -Infinity);
      case "name":
        return a.card.name.localeCompare(b.card.name, "fr");
      case "set":
        return a.card.set.name.localeCompare(b.card.set.name, "fr") || a.card.localId.localeCompare(b.card.localId, "fr", { numeric: true });
      default:
        return (b.price ?? -1) - (a.price ?? -1);
    }
  });

  const pages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  const current = Math.min(page, pages);
  const shown = items.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);
  const variantTotal = items.reduce((a, i) => a + i.variantCount, 0);

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        {items.length} carte{items.length > 1 ? "s" : ""} · {variantTotal} variantes
        {pages > 1 && ` · page ${current} / ${pages}`}
      </p>
      <CardGrid>
        {shown.map(({ card, price, vs30, variantCount }) => (
          <CardTile
            key={card.id}
            id={card.id}
            lang={lang}
            name={card.name}
            image={card.image}
            setName={card.set.name}
            rarity={card.rarity}
            price={price}
            vs30={vs30}
            variantCount={variantCount}
          />
        ))}
      </CardGrid>
      {pages > 1 && <Pagination current={current} pages={pages} href={(p) => searchHref(q, lang, sort, p)} />}
    </div>
  );
}

function ResultsSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
      {Array.from({ length: 10 }, (_, i) => (
        <div key={i} className="rounded-xl border p-2.5">
          <Skeleton className="aspect-[63/88] w-full rounded-lg" />
          <Skeleton className="mt-3 h-4 w-3/4" />
          <Skeleton className="mt-2 h-3 w-1/2" />
        </div>
      ))}
    </div>
  );
}
