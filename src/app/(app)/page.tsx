import { ArrowLeftRight, ArrowRight, ChevronRight, Library, Search } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { CardImage } from "@/components/card-image";
import { cardHref, setHref } from "@/components/card-tile";
import { InstallHint } from "@/components/install-hint";
import { PageHeader, SectionTitle } from "@/components/page-header";
import { Stat } from "@/components/stat";
import { buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { requireUser } from "@/lib/auth/session";
import { getCardSummaries, getSetChecklist } from "@/lib/catalog";
import { cardKey, catalogLang } from "@/lib/catalog-db";
import { type CollectionItem, setProgress } from "@/lib/collection";
import { loadRecentItems } from "@/lib/collection-db";
import { loadCollectionOverview, type StartedSet } from "@/lib/collection-overview";
import { eur } from "@/lib/format";
import { loadTrades } from "@/lib/friends-db";

const int = new Intl.NumberFormat("fr-FR");

/** Lien vers la checklist d'une extension, filtrée sur les cartes manquantes si demandé. */
function checklistHref(set: Pick<StartedSet, "id" | "lang">, missingOnly = false) {
  const href = setHref(set.id, set.lang);
  return missingOnly ? `${href}${href.includes("?") ? "&" : "?"}vue=manquantes` : href;
}

export default function Home() {
  return (
    <Suspense fallback={<HomeSkeleton />}>
      <HomeContent />
    </Suspense>
  );
}

async function HomeContent() {
  const user = await requireUser();
  const [overview, recent] = await Promise.all([loadCollectionOverview(user.id), loadRecentItems(user.id, 8)]);
  if (!overview.items.length) return <Welcome />;

  const { totals, sets, completed, items } = overview;
  const inProgress = sets.filter((s) => s.owned < s.official);
  // L'extension la plus avancée parmi celles à moitié faites : celle qu'on a envie de finir.
  const almost = inProgress.filter((s) => s.pct >= 50).sort((a, b) => b.pct - a.pct)[0];
  const recentRefs = recent.map((i) => ({ id: i.cardId, lang: catalogLang(i.lang) }));
  const summaries = await getCardSummaries(recentRefs);
  const recentCards = recentRefs.map((ref) => summaries.get(cardKey(ref)) ?? null);

  return (
    <div className="space-y-8">
      <PageHeader
        title="Ma collection"
        description={`${int.format(totals.unique)} cartes différentes dans ${totals.sets} extension${totals.sets > 1 ? "s" : ""}.`}
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Stat
          label="Cartes"
          value={int.format(totals.copies)}
          sub={`dont ${int.format(totals.doubles)} en double`}
          accent
          className="col-span-2 lg:col-span-1"
        />
        <Stat label="Cartes différentes" value={int.format(totals.unique)} />
        <Stat label="Extensions" value={sets.length} sub={`${completed} complète${completed > 1 ? "s" : ""}`} />
      </div>

      {almost && (
        <Suspense fallback={<Skeleton className="h-36 rounded-xl" />}>
          <AlmostDone set={almost} items={items} />
        </Suspense>
      )}

      <Suspense>
        <FriendsTeaser userId={user.id} />
      </Suspense>

      {inProgress.length > 0 && (
        <section>
          <SectionTitle
            action={
              <Link href="/sets" className="text-sm text-primary hover:underline">
                Toutes les extensions
              </Link>
            }
          >
            Continuer
          </SectionTitle>
          <ul className="grid gap-2 md:grid-cols-2">
            {inProgress.slice(0, 6).map((set) => (
              <li key={set.id}>
                <SetRow set={set} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {recentCards.some(Boolean) && (
        <section>
          <SectionTitle>Ajoutées récemment</SectionTitle>
          <ul className="grid grid-cols-4 gap-2.5 sm:grid-cols-6 lg:grid-cols-8">
            {recentCards.map((card, i) =>
              card ? (
                <li key={`${recent[i].cardId}:${recent[i].variant}:${recent[i].lang}`} className="min-w-0">
                  <Link href={cardHref(card.id, recentRefs[i].lang)} className="block space-y-1">
                    <CardImage src={card.image} alt="" />
                    <span className="block truncate text-xs font-medium">{card.name}</span>
                  </Link>
                </li>
              ) : null,
            )}
          </ul>
        </section>
      )}
    </div>
  );
}

function SetRow({ set }: { set: StartedSet }) {
  return (
    <Link href={checklistHref(set)} className="flex items-center gap-3 rounded-xl border bg-card p-3 transition-colors hover:border-primary/40 hover:bg-accent/40">
      <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-muted">
        {set.symbol || set.logo ? (
          // eslint-disable-next-line @next/next/no-img-element -- symbole distant TCGdex
          <img src={`${set.symbol ?? set.logo}.webp`} alt="" className="max-h-7 max-w-8 object-contain" loading="lazy" />
        ) : (
          <Library className="size-5 text-muted-foreground" />
        )}
      </span>
      <span className="min-w-0 flex-1 space-y-1.5">
        <span className="flex items-baseline justify-between gap-2">
          <span className="truncate font-medium">{set.name}</span>
          <span className="num shrink-0 text-sm text-muted-foreground">
            {set.owned} / {set.official}
          </span>
        </span>
        <span className="block h-1.5 overflow-hidden rounded-full bg-muted">
          <span className="block h-full rounded-full bg-primary" style={{ width: `${set.pct}%` }} />
        </span>
      </span>
    </Link>
  );
}

/** Encart « presque fini » : cartes manquantes et leur coût, calculés sur la checklist complète. */
async function AlmostDone({ set, items }: { set: StartedSet; items: CollectionItem[] }) {
  const checklist = await getSetChecklist(set.id, set.lang).catch(() => null);
  const progress = checklist ? setProgress(checklist.cards, items.filter((i) => i.setId === set.id), set.official) : null;
  const missing = progress?.missing ?? set.official - set.owned;
  return (
    <section className="flex flex-col gap-3 rounded-xl border border-primary/40 bg-gradient-to-br from-primary/15 via-card to-card p-5 sm:flex-row sm:items-center">
      <div className="min-w-0 flex-1">
        <div className="text-xs font-semibold tracking-widest text-primary uppercase">Presque fini · {set.pct} %</div>
        <h2 className="mt-1 text-lg font-semibold text-balance">
          Plus que {missing} carte{missing > 1 ? "s" : ""} pour finir {set.name}
        </h2>
        {progress?.missingCost != null && (
          <p className="mt-0.5 text-sm text-muted-foreground">Environ {eur(progress.missingCost, { compact: true })} à la cote du jour</p>
        )}
      </div>
      <Link href={checklistHref(set, true)} className={buttonVariants({ size: "lg", className: "self-start sm:self-center" })}>
        Voir les cartes manquantes <ArrowRight />
      </Link>
    </section>
  );
}

/** Rappel des échanges : l'ami qui a le plus de doubles qui vous manquent. */
async function FriendsTeaser({ userId }: { userId: string }) {
  const { trades } = await loadTrades(userId);
  const best = trades.filter((t) => t.forMe.length).sort((a, b) => b.forMe.length - a.forMe.length)[0];
  if (!best) return null;
  const n = best.forMe.length;
  return (
    <Link href="/echanges" className="flex items-center gap-3 rounded-xl border bg-card p-4 transition-colors hover:border-primary/40 hover:bg-accent/40">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
        <ArrowLeftRight className="size-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-medium">
          {best.friend.username} a {n} carte{n > 1 ? "s" : ""} qui vous manque{n > 1 ? "nt" : ""}
        </span>
        <span className="block text-sm text-muted-foreground">
          et il lui en manque {best.forThem.length} que vous avez en double
        </span>
      </span>
      <ChevronRight className="size-4 text-muted-foreground" />
    </Link>
  );
}

function Welcome() {
  return (
    <div className="space-y-6">
      <section className="rounded-2xl border bg-gradient-to-br from-primary/15 via-card to-card p-6 sm:p-10">
        <div className="max-w-2xl">
          <div className="text-xs font-semibold tracking-widest text-primary uppercase">Bienvenue</div>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-balance sm:text-4xl">Votre collection, extension par extension.</h1>
          <p className="mt-3 text-muted-foreground text-pretty">
            Ouvrez une extension et touchez les cartes que vous possédez : PokéFolio suit votre avancement, liste les cartes
            manquantes et indique ce qu&apos;elles coûtent à la cote du jour.
          </p>
          <div className="mt-6 flex flex-wrap gap-2">
            <Link href="/sets" className={buttonVariants({ size: "lg" })}>
              <Library />
              Choisir une extension
            </Link>
            <Link href="/recherche" className={buttonVariants({ variant: "ghost", size: "lg" })}>
              <Search />
              Rechercher une carte
            </Link>
          </div>
        </div>
      </section>
      <InstallHint />
    </div>
  );
}

function HomeSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-9 w-56" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Skeleton className="col-span-2 h-24 rounded-xl lg:col-span-1" />
        <Skeleton className="h-24 rounded-xl" />
        <Skeleton className="h-24 rounded-xl" />
      </div>
      <Skeleton className="h-48 rounded-xl" />
    </div>
  );
}
