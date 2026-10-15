import { BellRing, Eye, Search } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { CardImage } from "@/components/card-image";
import { cardHref } from "@/components/card-tile";
import { Delta } from "@/components/delta";
import { RemoveWatchButton, WatchDialog } from "@/components/forms/watch-forms";
import { EmptyState, PageHeader } from "@/components/page-header";
import { SignalBadge } from "@/components/score";
import { buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { eur, pctText } from "@/lib/format";
import { loadWatchlist, type WatchView } from "@/lib/portfolio";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Watchlist" };

export default function WatchlistPage() {
  return (
    <>
      <PageHeader
        title="Watchlist"
        description="Les cartes que vous visez, avec un prix d'achat cible. Celles passées sous votre objectif remontent en tête."
      />
      <Suspense fallback={<Skeleton className="h-96 rounded-xl" />}>
        <WatchlistContent />
      </Suspense>
    </>
  );
}

async function WatchlistContent() {
  const items = await loadWatchlist();
  if (!items.length) {
    return (
      <EmptyState
        icon={<Eye />}
        title="Aucune carte surveillée"
        description="Depuis la fiche d'une carte, cliquez sur « Surveiller » et fixez un prix cible : vous verrez ici l'écart avec la cote et le signal de marché."
      >
        <Link href="/recherche" className={buttonVariants()}>
          <Search />
          Trouver une carte
        </Link>
        <Link href="/marche" className={buttonVariants({ variant: "outline" })}>
          Voir le marché
        </Link>
      </EmptyState>
    );
  }

  const sorted = [...items].sort((a, b) => {
    if (a.reached !== b.reached) return a.reached ? -1 : 1;
    return (a.distance ?? Infinity) - (b.distance ?? Infinity);
  });
  const reached = items.filter((i) => i.reached).length;

  return (
    <div className="space-y-4">
      {reached > 0 && (
        <div className="flex items-center gap-2 rounded-xl border border-gain/30 bg-gain/10 px-4 py-3 text-sm">
          <BellRing className="size-4 text-gain" />
          {reached} carte{reached > 1 ? "s ont" : " a"} atteint votre prix cible.
        </div>
      )}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {sorted.map((w) => (
          <WatchCard key={w.id} w={w} />
        ))}
      </div>
    </div>
  );
}

function WatchCard({ w }: { w: WatchView }) {
  const price = w.price?.price ?? null;
  return (
    <div className={cn("flex gap-4 rounded-xl border bg-card p-3", w.reached && "border-gain/40 bg-gain/5")}>
      <Link href={cardHref(w.cardId, w.cardLang)} className="w-24 shrink-0">
        <CardImage src={w.image} alt={w.name} />
      </Link>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-start justify-between gap-2">
          <Link href={cardHref(w.cardId, w.cardLang)} className="min-w-0 hover:underline">
            <div className="truncate font-medium">{w.name}</div>
            <div className="truncate text-xs text-muted-foreground">
              {w.setName}
              {w.variantCount > 1 && w.variantLabel && ` · ${w.variantLabel}`}
            </div>
          </Link>
          <RemoveWatchButton id={w.id} name={w.name} />
        </div>
        {w.analysis && (
          <div className="mt-1.5">
            <SignalBadge kind={w.analysis.signal.kind} label={w.analysis.signal.label} />
          </div>
        )}
        <dl className="mt-3 grid grid-cols-3 gap-2 text-sm">
          <div>
            <dt className="text-xs text-muted-foreground">Cote</dt>
            <dd className="num font-semibold">{eur(price)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Cible</dt>
            <dd className="num">{eur(w.targetPrice)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">vs 30 j</dt>
            <dd>
              <Delta value={w.analysis?.momentum.vs30} className="text-sm" />
            </dd>
          </div>
        </dl>
        <div className="mt-auto flex items-center justify-between gap-2 pt-3">
          <span className={cn("text-xs", w.reached ? "font-medium text-gain" : "text-muted-foreground")}>
            {w.distance == null
              ? "Pas d'objectif"
              : w.reached
                ? "Objectif atteint"
                : `${pctText(w.distance)} au-dessus de la cible`}
          </span>
          <WatchDialog
            card={{ cardId: w.cardId, cardLang: w.cardLang, name: w.name }}
            variants={[{ key: w.variant, label: w.variantLabel ?? "", price }]}
            existing={{ id: w.id, targetPrice: w.targetPrice, note: w.note }}
          />
        </div>
        {w.note && <p className="mt-2 line-clamp-2 text-xs text-muted-foreground italic">{w.note}</p>}
      </div>
    </div>
  );
}
