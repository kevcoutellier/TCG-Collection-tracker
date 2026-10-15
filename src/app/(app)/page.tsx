import {
  ArrowRight,
  BellRing,
  BrainCircuit,
  Layers,
  LineChart,
  Search,
} from "lucide-react";
import Link from "next/link";
import { after } from "next/server";
import { Suspense } from "react";
import { CardImage } from "@/components/card-image";
import { cardHref } from "@/components/card-tile";
import { AllocationChart, PortfolioChart } from "@/components/charts";
import { Delta, MoneyDelta } from "@/components/delta";
import { AddSealedDialog } from "@/components/forms/holding-forms";
import { RefreshPricesButton } from "@/components/forms/watch-forms";
import { MarketPulse } from "@/components/market-pulse";
import { InsightItem } from "@/components/insight-item";
import { PageHeader } from "@/components/page-header";
import { Stat } from "@/components/stat";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { eur, pctText, todayISO } from "@/lib/format";
import { loadPortfolio, loadPortfolioHistory, loadWatchlist, type PositionView } from "@/lib/portfolio";
import { refreshIfStale } from "@/lib/snapshots";

export default function Home() {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <Dashboard />
    </Suspense>
  );
}

async function Dashboard() {
  const data = await loadPortfolio();
  after(() => refreshIfStale().catch(() => {}));

  if (!data.positions.length && !data.sold.length) return <Welcome today={todayISO()} />;

  const [history, watch] = await Promise.all([loadPortfolioHistory(data.rows), loadWatchlist()]);
  const { summary, insights, positions } = data;
  const alerts = watch.filter((w) => w.reached);
  const ranked = positions.filter((p) => p.pnlPct != null).sort((a, b) => b.pnlPct! - a.pnlPct!);
  const winners = ranked.filter((p) => p.pnlPct! > 0).slice(0, 4);
  const losers = ranked.filter((p) => p.pnlPct! < 0).slice(-4).reverse();

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Tableau de bord"
        title="Votre portefeuille Pokémon"
        description="Valorisé à la cote Cardmarket du jour. Un relevé quotidien construit l'historique de chaque carte suivie."
        actions={<RefreshPricesButton />}
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat label="Valeur" value={eur(summary.totalValue, { compact: true })} sub={`${summary.itemCount} objets`} accent className="col-span-2 lg:col-span-1" />
        <Stat label="Investi" value={eur(summary.totalCost, { compact: true })} />
        <Stat label="Latent" value={<MoneyDelta value={summary.unrealized} />} sub={pctText(summary.unrealizedPct)} />
        <Stat label="Réalisé" value={<MoneyDelta value={summary.realized} />} sub={pctText(summary.realizedPct)} />
        <Stat
          label="Diversification"
          value={`${summary.diversification}/100`}
          sub={summary.topName ? `1re ligne : ${Math.round(summary.topWeight * 100)} %` : undefined}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Évolution de la valeur</CardTitle>
            <CardDescription>Valeur de marché vs capital investi</CardDescription>
          </CardHeader>
          <CardContent>
            {history.length >= 2 ? (
              <PortfolioChart data={history} />
            ) : (
              <div className="flex h-[260px] flex-col items-center justify-center gap-2 rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                <LineChart className="size-6" />
                <p className="max-w-sm text-pretty">
                  La courbe apparaîtra dès le deuxième jour de relevés. Les prix de vos cartes sont relevés automatiquement à
                  chaque nouvelle journée d&apos;utilisation.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Répartition</CardTitle>
            <CardDescription>Par type d&apos;actif</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <AllocationChart data={summary.allocation.category} height={150} />
            <div>
              <div className="mb-2 text-xs font-medium text-muted-foreground uppercase">Principales extensions</div>
              <ul className="space-y-2 text-sm">
                {summary.allocation.sets.slice(0, 4).map((s) => (
                  <li key={s.name}>
                    <div className="flex justify-between gap-2">
                      <span className="truncate">{s.name}</span>
                      <span className="num text-muted-foreground">{eur(s.value, { compact: true })}</span>
                    </div>
                    <div className="mt-1 h-1.5 rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-chart-2"
                        style={{ width: `${summary.totalValue ? (s.value / summary.totalValue) * 100 : 0}%` }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <MoversCard title="Meilleures performances" positions={winners} empty="Aucune ligne en plus-value pour l'instant." />
        <MoversCard title="À surveiller" positions={losers} empty="Aucune ligne en moins-value." />
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BellRing className="size-4 text-primary" /> Alertes watchlist
            </CardTitle>
            <CardDescription>Cartes passées sous votre prix cible</CardDescription>
            <CardAction>
              <Link href="/watchlist" className="text-sm text-primary hover:underline">
                Tout voir
              </Link>
            </CardAction>
          </CardHeader>
          <CardContent>
            {alerts.length ? (
              <ul className="space-y-1">
                {alerts.slice(0, 4).map((w) => (
                  <li key={w.id}>
                    <Link href={cardHref(w.cardId, w.cardLang)} className="flex items-center gap-3 rounded-lg p-1.5 hover:bg-accent/50">
                      <CardImage src={w.image} alt={w.name} className="w-8 shrink-0 rounded-[3px]" />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium">{w.name}</div>
                        <div className="text-xs text-muted-foreground">Cible {eur(w.targetPrice)}</div>
                      </div>
                      <div className="num text-sm font-medium text-gain">{eur(w.price?.price)}</div>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">
                {watch.length
                  ? `Aucune des ${watch.length} cartes surveillées n'a atteint son objectif.`
                  : "Ajoutez des cartes à surveiller avec un prix cible depuis leur fiche."}
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {insights.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BrainCircuit className="size-4 text-primary" /> Diagnostic
            </CardTitle>
            <CardDescription>Points d&apos;attention détectés dans votre portefeuille</CardDescription>
            <CardAction>
              <Link href="/analyse" className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
                Analyse complète <ArrowRight className="size-3.5" />
              </Link>
            </CardAction>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2">
            {insights.slice(0, 4).map((i) => (
              <InsightItem key={i.title} insight={i} />
            ))}
          </CardContent>
        </Card>
      )}

      <Suspense fallback={<Skeleton className="h-64 rounded-xl" />}>
        <MarketPulse />
      </Suspense>
    </div>
  );
}

function MoversCard({ title, positions, empty }: { title: string; positions: PositionView[]; empty: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>Plus-value latente en %</CardDescription>
      </CardHeader>
      <CardContent>
        {positions.length ? (
          <ul className="space-y-1">
            {positions.map((p) => (
              <li key={p.id} className="flex items-center gap-3 rounded-lg p-1.5">
                <CardImage src={p.image} alt={p.name} className="w-8 shrink-0 rounded-[3px]" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{p.name}</div>
                  <div className="truncate text-xs text-muted-foreground">{p.setName}</div>
                </div>
                <div className="text-right">
                  <Delta value={p.pnlPct} className="text-sm" />
                  <div className="text-xs">
                    <MoneyDelta value={p.pnl} />
                  </div>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">{empty}</p>
        )}
      </CardContent>
    </Card>
  );
}

const FEATURES = [
  {
    icon: Search,
    title: "Cotes en temps réel",
    text: "Plus de 20 000 cartes avec les prix Cardmarket (tendance, moyennes 1/7/30 j) et TCGplayer.",
  },
  {
    icon: Layers,
    title: "Collection = portefeuille",
    text: "Cartes brutes, gradées et scellé : prix de revient, valeur, plus-values latentes et réalisées.",
  },
  {
    icon: BrainCircuit,
    title: "Analyse & stratégie",
    text: "Score d'attractivité, signaux de momentum, diagnostic de diversification, simulateurs de grading et de revente.",
  },
];

function Welcome({ today }: { today: string }) {
  return (
    <div className="space-y-8">
      <section className="relative overflow-hidden rounded-2xl border bg-gradient-to-br from-primary/15 via-card to-card p-6 sm:p-10">
        <div className="max-w-2xl">
          <div className="text-xs font-semibold tracking-widest text-primary uppercase">Collection & investissement</div>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
            Pilotez votre collection Pokémon comme un portefeuille.
          </h1>
          <p className="mt-3 text-muted-foreground text-pretty">
            Recherchez n&apos;importe quelle carte, suivez l&apos;évolution de sa cote, enregistrez vos achats et laissez
            l&apos;analyse repérer les risques et les opportunités.
          </p>
          <div className="mt-6 flex flex-wrap gap-2">
            <Link href="/recherche" className={buttonVariants({ size: "lg" })}>
              <Search />
              Ajouter ma première carte
            </Link>
            <AddSealedDialog today={today} />
            <Link href="/marche" className={buttonVariants({ variant: "ghost", size: "lg" })}>
              Explorer le marché <ArrowRight />
            </Link>
          </div>
        </div>
      </section>
      <div className="grid gap-4 md:grid-cols-3">
        {FEATURES.map(({ icon: Icon, title, text }) => (
          <div key={title} className="rounded-xl border bg-card p-5">
            <Icon className="size-5 text-primary" />
            <h2 className="mt-3 font-medium">{title}</h2>
            <p className="mt-1 text-sm text-muted-foreground text-pretty">{text}</p>
          </div>
        ))}
      </div>
      <Suspense fallback={<Skeleton className="h-64 rounded-xl" />}>
        <MarketPulse />
      </Suspense>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-9 w-72" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {Array.from({ length: 5 }, (_, i) => (
          <Skeleton key={i} className="h-24 rounded-xl" />
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <Skeleton className="h-80 rounded-xl lg:col-span-2" />
        <Skeleton className="h-80 rounded-xl" />
      </div>
    </div>
  );
}
