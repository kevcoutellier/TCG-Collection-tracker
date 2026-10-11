import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { CardImage } from "@/components/card-image";
import { cardHref } from "@/components/card-tile";
import { Delta } from "@/components/delta";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { dateText, eur } from "@/lib/format";
import { getMarketOverview, type MarketCard } from "@/lib/market";

export function MarketRow({ c }: { c: MarketCard }) {
  return (
    <Link href={cardHref(c.id)} className="flex items-center gap-3 rounded-lg p-1.5 transition-colors hover:bg-accent/50">
      <CardImage src={c.image} alt={c.name} className="w-8 shrink-0 rounded-[3px]" />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{c.name}</div>
        <div className="truncate text-xs text-muted-foreground">{c.setName}</div>
      </div>
      <div className="text-right">
        <div className="num text-sm font-medium">{eur(c.price, { compact: true })}</div>
        <Delta value={c.vs30} className="text-xs" />
      </div>
    </Link>
  );
}

/** Aperçu de l'indice blue chip : variation globale et plus fortes hausses/baisses. */
export async function MarketPulse() {
  const { cards, index, updated } = await getMarketOverview();
  const ranked = cards.filter((c) => c.vs30 != null).sort((a, b) => b.vs30! - a.vs30!);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Pouls du marché</CardTitle>
        <CardDescription>
          Indice de {index.total} cartes emblématiques · {index.up} en hausse · cotes du {dateText(updated)}
        </CardDescription>
        <CardAction>
          <Link href="/marche" className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
            Marché <ArrowRight className="size-3.5" />
          </Link>
        </CardAction>
      </CardHeader>
      <CardContent className="grid gap-6 md:grid-cols-[200px_1fr_1fr]">
        <div className="rounded-xl bg-muted/40 p-4">
          <div className="text-xs text-muted-foreground uppercase">Indice blue chip</div>
          <div className="num mt-1 text-2xl font-semibold">{eur(index.value, { compact: true })}</div>
          <div className="mt-2 space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">vs 30 j</span>
              <Delta value={index.vs30} />
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">vs 7 j</span>
              <Delta value={index.vs7} />
            </div>
          </div>
        </div>
        <div>
          <div className="mb-1 text-xs font-medium text-muted-foreground uppercase">Plus fortes hausses</div>
          {ranked.slice(0, 4).map((c) => (
            <MarketRow key={c.id} c={c} />
          ))}
        </div>
        <div>
          <div className="mb-1 text-xs font-medium text-muted-foreground uppercase">Plus fortes baisses</div>
          {ranked
            .slice(-4)
            .reverse()
            .map((c) => (
              <MarketRow key={c.id} c={c} />
            ))}
        </div>
      </CardContent>
    </Card>
  );
}
