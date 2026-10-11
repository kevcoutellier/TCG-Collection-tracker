import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { CardGrid, CardTile } from "@/components/card-tile";
import { PageHeader, SectionTitle } from "@/components/page-header";
import { Pagination } from "@/components/pagination";
import { Stat } from "@/components/stat";
import { Skeleton } from "@/components/ui/skeleton";
import { momentum } from "@/lib/analysis";
import { getExpansionLabelForCard } from "@/lib/cardmarket";
import { dateText, eur } from "@/lib/format";
import { JA_SERIES_LABELS } from "@/lib/japan";
import { cardVariants, primaryVariant } from "@/lib/pricing";
import { getSet, getUsdToEur, hydrateCards } from "@/lib/tcgdex";
import { type Lang, parseLang } from "@/lib/types";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Extension" };

const PAGE_SIZE = 60;
const SORTS = { price: "Valeur", number: "Numéro" } as const;
type Sort = keyof typeof SORTS;

export default function SetPage({ params, searchParams }: PageProps<"/sets/[id]">) {
  return (
    <Suspense fallback={<SetSkeleton />}>
      <SetContent params={params} searchParams={searchParams} />
    </Suspense>
  );
}

function first(v: string | string[] | undefined) {
  return (Array.isArray(v) ? v[0] : v) ?? "";
}

function pageHref(id: string, lang: Lang, sort: Sort, page = 1) {
  const params = new URLSearchParams();
  if (lang !== "fr") params.set("lang", lang);
  if (sort !== "price") params.set("sort", sort);
  if (page > 1) params.set("page", String(page));
  const qs = params.toString();
  return `/sets/${encodeURIComponent(id)}${qs ? `?${qs}` : ""}`;
}

async function SetContent({ params, searchParams }: Pick<PageProps<"/sets/[id]">, "params" | "searchParams">) {
  const [{ id: rawId }, sp] = await Promise.all([params, searchParams]);
  const id = decodeURIComponent(rawId);
  const lang = parseLang(first(sp.lang));
  const sort: Sort = first(sp.sort) === "number" ? "number" : "price";
  const page = Math.max(1, Number.parseInt(first(sp.page), 10) || 1);

  const set = await getSet(id, lang);
  if (!set) notFound();

  // Toutes les cartes de l'extension, avec la cote de chacune (cache de quelques heures).
  const [cards, fx] = await Promise.all([hydrateCards(set.cards.map((c) => c.id), lang), getUsdToEur()]);
  const priced = cards.map((card) => {
    const variants = cardVariants(card, fx);
    const main = primaryVariant(variants);
    return { card, price: main.price.price, vs30: momentum(main.price).vs30, variants, cardmarketId: main.cardmarketId };
  });
  if (sort === "price") priced.sort((a, b) => (b.price ?? -1) - (a.price ?? -1));
  else priced.sort((a, b) => a.card.localId.localeCompare(b.card.localId, "fr", { numeric: true }));

  const masterValue = priced.reduce((a, c) => a + (c.price ?? 0), 0);
  const variantCount = priced.reduce((a, c) => a + c.variants.length, 0);
  const top = [...priced].sort((a, b) => (b.price ?? -1) - (a.price ?? -1))[0];
  const englishName =
    lang === "ja" ? await getExpansionLabelForCard(priced.find((p) => p.cardmarketId)?.cardmarketId) : null;

  const pages = Math.max(1, Math.ceil(priced.length / PAGE_SIZE));
  const current = Math.min(page, pages);
  const shown = priced.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);
  const secret = Math.max(0, set.cardCount.total - set.cardCount.official);

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow={lang === "ja" ? `Japon · ${JA_SERIES_LABELS[set.serie.id] ?? set.serie.name}` : set.serie.name}
        title={englishName ? `${englishName}` : set.name}
        description={
          <>
            {englishName && <span className="mr-1 text-foreground">{set.name} ·</span>}
            Sortie le {dateText(set.releaseDate)} · {set.cardCount.official} cartes officielles
            {secret ? ` + ${secret} secrètes` : ""}
          </>
        }
        actions={
          set.logo ? (
            // eslint-disable-next-line @next/next/no-img-element -- logo distant TCGdex
            <img src={`${set.logo}.webp`} alt="" className="h-16 max-w-56 object-contain" />
          ) : undefined
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Cartes · variantes" value={`${set.cards.length} · ${variantCount}`} />
        <Stat label="Valeur du set complet" value={eur(masterValue, { compact: true })} sub="1 exemplaire de chaque carte" accent />
        <Stat label="Carte la plus chère" value={eur(top?.price)} sub={top?.card.name} />
        <Stat label="Cartes cotées" value={`${priced.filter((p) => p.price != null).length} / ${set.cards.length}`} />
      </div>

      <section>
        <SectionTitle
          action={
            <div className="inline-flex rounded-lg border bg-card p-0.5 text-xs">
              {(Object.keys(SORTS) as Sort[]).map((s) => (
                <Link
                  key={s}
                  href={pageHref(set.id, lang, s)}
                  className={cn("rounded-md px-2.5 py-1", s === sort ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground")}
                >
                  {SORTS[s]}
                </Link>
              ))}
            </div>
          }
        >
          {pages > 1 ? `Cartes ${(current - 1) * PAGE_SIZE + 1}-${Math.min(current * PAGE_SIZE, priced.length)} sur ${priced.length}` : `${priced.length} cartes`}
        </SectionTitle>
        <CardGrid>
          {shown.map(({ card, price, vs30, variants }) => (
            <CardTile
              key={card.id}
              id={card.id}
              lang={lang}
              name={card.name}
              image={card.image}
              setName={`n° ${card.localId}`}
              rarity={card.rarity}
              price={price}
              vs30={vs30}
              variantCount={variants.length}
            />
          ))}
        </CardGrid>
        {pages > 1 && (
          <div className="mt-4">
            <Pagination current={current} pages={pages} href={(p) => pageHref(set.id, lang, sort, p)} />
          </div>
        )}
      </section>
    </div>
  );
}

function SetSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-10 w-72" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-24 rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-96 rounded-xl" />
    </div>
  );
}
