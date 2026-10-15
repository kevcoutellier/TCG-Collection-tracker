import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { CardGrid, CardTile } from "@/components/card-tile";
import { Delta } from "@/components/delta";
import { MarketRow } from "@/components/market-pulse";
import { PageHeader, SectionTitle } from "@/components/page-header";
import { Stat } from "@/components/stat";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { dateText, eur } from "@/lib/format";
import { ERA_LABELS, getMarketOverview, getRecentSets } from "@/lib/market";

export const metadata: Metadata = { title: "Marché" };

export default function MarketPage() {
  return (
    <>
      <PageHeader
        eyebrow="Marché"
        title="Tendances du marché Pokémon TCG"
        description="Un indice de 30 cartes emblématiques, des classiques Wizards aux dernières Méga-Évolutions, pour prendre le pouls du marché. Variations calculées entre la tendance Cardmarket et les moyennes de ventes 7 et 30 jours."
      />
      <Suspense fallback={<MarketSkeleton />}>
        <MarketContent />
      </Suspense>
    </>
  );
}

async function MarketContent() {
  // Données publiques mises en cache (1 h) mais chargées à la demande plutôt qu'au build.
  await connection();
  const [{ cards, index, eras, updated }, recentSets] = await Promise.all([getMarketOverview(), getRecentSets(8)]);
  const ranked = cards.filter((c) => c.vs30 != null).sort((a, b) => b.vs30! - a.vs30!);

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Indice blue chip" value={eur(index.value, { compact: true })} sub={`Cotes du ${dateText(updated)}`} accent />
        <Stat label="vs moyenne 30 j" value={<Delta value={index.vs30} />} />
        <Stat label="vs moyenne 7 j" value={<Delta value={index.vs7} />} />
        <Stat label="Cartes en hausse (30 j)" value={`${index.up} / ${index.total}`} sub={index.up > index.total / 2 ? "Marché haussier" : "Marché baissier"} />
      </div>

      <section>
        <SectionTitle>Par époque</SectionTitle>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {eras.map((e) => (
            <div key={e.era} className="rounded-xl border bg-card p-4">
              <div className="text-sm font-medium">{e.label}</div>
              <div className="num mt-1 text-xl font-semibold">{eur(e.value, { compact: true })}</div>
              <div className="mt-2 flex justify-between text-sm">
                <span className="text-muted-foreground">30 j</span>
                <Delta value={e.vs30} />
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">7 j</span>
                <Delta value={e.vs7} />
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                {e.up} / {e.total} en hausse
              </div>
            </div>
          ))}
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Plus fortes hausses</CardTitle>
            <CardDescription>Tendance vs moyenne des ventes sur 30 jours</CardDescription>
          </CardHeader>
          <CardContent>
            {ranked.slice(0, 6).map((c) => (
              <MarketRow key={c.id} c={c} />
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Plus fortes baisses</CardTitle>
            <CardDescription>Opportunités potentielles… ou couteaux qui tombent</CardDescription>
          </CardHeader>
          <CardContent>
            {ranked
              .slice(-6)
              .reverse()
              .map((c) => (
                <MarketRow key={c.id} c={c} />
              ))}
          </CardContent>
        </Card>
      </div>

      <section>
        <SectionTitle>Composition de l&apos;indice</SectionTitle>
        {(Object.keys(ERA_LABELS) as (keyof typeof ERA_LABELS)[]).map((era) => (
          <div key={era} className="mb-6">
            <h3 className="mb-2 text-sm font-medium">{ERA_LABELS[era]}</h3>
            <CardGrid>
              {cards
                .filter((c) => c.era === era)
                .map((c) => (
                  <CardTile key={c.id} id={c.id} name={c.name} image={c.image} setName={c.setName} price={c.price} vs30={c.vs30} />
                ))}
            </CardGrid>
          </div>
        ))}
      </section>

      <section>
        <SectionTitle action={<Link href="/sets" className="text-sm text-primary hover:underline">Toutes les extensions</Link>}>
          Dernières extensions
        </SectionTitle>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {recentSets.map((s) => (
            <Link
              key={s.id}
              href={`/sets/${encodeURIComponent(s.id)}`}
              className="flex flex-col items-center gap-2 rounded-xl border bg-card p-4 text-center transition-colors hover:border-primary/40"
            >
              {s.logo ? (
                // eslint-disable-next-line @next/next/no-img-element -- logo distant TCGdex
                <img src={`${s.logo}.webp`} alt="" className="h-12 w-full object-contain" loading="lazy" />
              ) : (
                <div className="h-12" />
              )}
              <div className="text-sm font-medium">{s.name}</div>
              <div className="text-xs text-muted-foreground">
                {s.serie} · {s.cardCount.total} cartes
              </div>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}

function MarketSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-24 rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-72 rounded-xl" />
    </div>
  );
}
