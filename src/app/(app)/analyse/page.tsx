import {
  Award,
  BrainCircuit,
  Gem,
  Package,
  Repeat,
  ShieldAlert,
  Sparkles,
  Zap,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { GradingCalculator, ProjectionCalculator, SaleCalculator } from "@/components/calculators";
import { AllocationChart } from "@/components/charts";
import { Delta, MoneyDelta } from "@/components/delta";
import { InsightItem } from "@/components/insight-item";
import { EmptyState, PageHeader, SectionTitle } from "@/components/page-header";
import { ScoreRing, SignalBadge } from "@/components/score";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { analyzeCard } from "@/lib/analysis";
import { DISCLAIMER } from "@/lib/constants";
import { eur } from "@/lib/format";
import { loadPortfolio } from "@/lib/portfolio";

export const metadata: Metadata = { title: "Analyse & stratégie" };

export default function AnalysisPage() {
  return (
    <div className="space-y-10">
      <PageHeader
        eyebrow="Analyse"
        title="Analyse & stratégie"
        description="Diagnostic automatique de votre portefeuille, simulateurs pour décider (vendre, grader, accumuler) et stratégies éprouvées par les collectionneurs-investisseurs."
      />

      <section>
        <SectionTitle>Diagnostic du portefeuille</SectionTitle>
        <Suspense fallback={<Skeleton className="h-80 rounded-xl" />}>
          <Diagnostics />
        </Suspense>
      </section>

      <section>
        <SectionTitle>Simulateurs</SectionTitle>
        <Card>
          <CardContent>
            <Tabs defaultValue="sale">
              <TabsList className="mb-4">
                <TabsTrigger value="sale">Revente nette</TabsTrigger>
                <TabsTrigger value="grading">Grading</TabsTrigger>
                <TabsTrigger value="projection">Projection DCA</TabsTrigger>
              </TabsList>
              <TabsContent value="sale">
                <SaleCalculator />
              </TabsContent>
              <TabsContent value="grading">
                <GradingCalculator />
              </TabsContent>
              <TabsContent value="projection">
                <ProjectionCalculator />
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </section>

      <section>
        <SectionTitle>Stratégies d&apos;investissement</SectionTitle>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {STRATEGIES.map((s) => (
            <Card key={s.title}>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <s.icon className="size-4 text-primary" />
                  <CardTitle>{s.title}</CardTitle>
                </div>
                <CardDescription>
                  Horizon : {s.horizon} · Risque : {s.risk}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <p className="text-pretty">{s.text}</p>
                <p className="rounded-lg bg-muted/50 p-2.5 text-xs text-muted-foreground text-pretty">
                  <span className="font-medium text-foreground">Clé : </span>
                  {s.tip}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section>
        <SectionTitle>Risques à connaître</SectionTitle>
        <Card>
          <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {RISKS.map((r) => (
              <div key={r.title} className="flex gap-3">
                <ShieldAlert className="mt-0.5 size-4 shrink-0 text-loss" />
                <div>
                  <div className="text-sm font-medium">{r.title}</div>
                  <p className="mt-0.5 text-sm text-muted-foreground text-pretty">{r.text}</p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
        <p className="mt-4 text-xs text-muted-foreground">{DISCLAIMER}</p>
      </section>
    </div>
  );
}

async function Diagnostics() {
  const { positions, summary, insights } = await loadPortfolio();
  if (!positions.length) {
    return (
      <EmptyState
        icon={<BrainCircuit />}
        title="Rien à analyser pour l'instant"
        description="Ajoutez des cartes ou des produits scellés à votre collection : le diagnostic évalue diversification, dynamique, prises de bénéfices et risques."
      >
        <Link href="/recherche" className={buttonVariants()}>
          Ajouter une carte
        </Link>
      </EmptyState>
    );
  }

  const scored = positions
    .filter((p) => p.kind === "card" && p.marketPrice)
    .map((p) => ({ p, a: analyzeCard({ name: p.name, rarity: p.rarity, price: p.marketPrice! }) }))
    .sort((x, y) => y.a.score - x.a.score);
  const perf = positions.filter((p) => p.pnlPct != null).sort((a, b) => b.pnlPct! - a.pnlPct!);
  const maxAbs = Math.max(...perf.map((p) => Math.abs(p.pnlPct!)), 0.01);

  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Diversification</CardTitle>
            <CardDescription>Basée sur l&apos;indice de concentration (Herfindahl)</CardDescription>
          </CardHeader>
          <CardContent className="flex items-center gap-5">
            <ScoreRing score={summary.diversification} size={104} />
            <dl className="space-y-2 text-sm">
              <div>
                <dt className="text-xs text-muted-foreground">Lignes</dt>
                <dd className="num">{summary.positionCount}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Plus grosse exposition</dt>
                <dd className="num">
                  {Math.round(summary.topWeight * 100)} % <span className="text-muted-foreground">· {summary.topName}</span>
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Dynamique pondérée vs 30 j</dt>
                <dd>
                  <Delta value={summary.weightedVs30} />
                </dd>
              </div>
            </dl>
          </CardContent>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Exposition par extension</CardTitle>
            <CardDescription>Part de la valeur totale ({eur(summary.totalValue, { compact: true })})</CardDescription>
          </CardHeader>
          <CardContent>
            <AllocationChart data={summary.allocation.sets} height={170} />
          </CardContent>
        </Card>
      </div>

      {insights.length > 0 && (
        <div className="grid gap-3 md:grid-cols-2">
          {insights.map((i) => (
            <InsightItem key={i.title} insight={i} />
          ))}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Performance par ligne</CardTitle>
            <CardDescription>Plus-value latente depuis l&apos;achat</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2.5">
              {perf.slice(0, 12).map((p) => (
                <li key={p.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 text-sm">
                  <span className="truncate">{p.name}</span>
                  <span className="flex items-center gap-2">
                    <MoneyDelta value={p.pnl} className="text-xs" />
                    <Delta value={p.pnlPct} icon={false} className="w-16 justify-end" />
                  </span>
                  <div className="col-span-2 h-1.5 rounded-full bg-muted">
                    <div
                      className={`h-full rounded-full ${p.pnlPct! >= 0 ? "bg-gain" : "bg-loss"}`}
                      style={{ width: `${Math.max(2, (Math.abs(p.pnlPct!) / maxAbs) * 100)}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Signaux sur vos cartes</CardTitle>
            <CardDescription>Score d&apos;attractivité et dynamique de marché</CardDescription>
          </CardHeader>
          <CardContent>
            {scored.length ? (
              <ul className="divide-y">
                {scored.slice(0, 10).map(({ p, a }) => (
                  <li key={p.id} className="flex items-center gap-3 py-2">
                    <span className="num w-9 shrink-0 rounded-md bg-muted py-0.5 text-center text-sm font-semibold">{a.score}</span>
                    <span className="min-w-0 flex-1 truncate text-sm">{p.name}</span>
                    <SignalBadge kind={a.signal.kind} label={a.signal.label} />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">Aucune carte avec une cote de marché.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

const STRATEGIES = [
  {
    icon: Package,
    title: "Scellé long terme",
    horizon: "3 à 10 ans",
    risk: "modéré",
    text: "Displays et ETB d'extensions populaires, conservés intacts. Une fois l'impression arrêtée, l'offre ne fait que diminuer à mesure que les produits sont ouverts.",
    tip: "Acheter en fin de cycle d'impression, stocker au sec et à l'abri de la lumière, garder le film d'origine.",
  },
  {
    icon: Sparkles,
    title: "Cartes « chase » des Pokémon stars",
    horizon: "1 à 5 ans",
    risk: "modéré à élevé",
    text: "Les illustrations spéciales et alternatives des Pokémon les plus demandés (Dracaufeu, Noctali, Pikachu…) concentrent l'essentiel de la valeur d'une extension.",
    tip: "Les prix baissent souvent 1 à 3 mois après la sortie, quand l'offre est maximale : une meilleure fenêtre que la précommande.",
  },
  {
    icon: Award,
    title: "Grading sélectif",
    horizon: "6 mois à 3 ans",
    risk: "modéré",
    text: "Un PSA 10 peut valoir 2 à 10 fois la carte brute, mais un 8 vaut parfois moins. Ne grader que des cartes de valeur en état quasi parfait.",
    tip: "Vérifier centrage, coins et surface à la loupe, puis passer la décision au simulateur de grading.",
  },
  {
    icon: Gem,
    title: "Vintage & blue chips",
    horizon: "5 ans et plus",
    risk: "faible à modéré",
    text: "Les cartes WotC (1999-2003) et les classiques reconnus ont une offre figée et une demande portée par la nostalgie : la référence du marché.",
    tip: "Ticket d'entrée élevé et contrefaçons fréquentes : privilégier les exemplaires gradés par une société reconnue.",
  },
  {
    icon: Zap,
    title: "Momentum (court terme)",
    horizon: "semaines à mois",
    risk: "élevé",
    text: "Profiter des hausses liées à l'actualité : nouveau jeu vidéo, anime, championnat, effet influenceur. Repérez-les avec le signal « Momentum haussier ».",
    tip: "Fixer un objectif et un seuil de sortie avant d'acheter : commission et envoi rendent l'aller-retour coûteux.",
  },
  {
    icon: Repeat,
    title: "Accumulation régulière (DCA)",
    horizon: "long terme",
    risk: "réduit",
    text: "Investir un montant fixe chaque mois lisse le prix d'achat moyen et évite d'acheter tout son capital au sommet d'une hype.",
    tip: "Associer la watchlist à des prix cibles : n'acheter que lorsque la cote passe sous votre objectif.",
  },
];

const RISKS = [
  { title: "Réimpressions", text: "The Pokémon Company réimprime les extensions populaires : l'offre peut grimper brutalement et faire chuter les prix." },
  { title: "Contrefaçons", text: "Fréquentes sur les cartes chères et le scellé : achetez auprès de vendeurs notés, préférez le gradé pour le haut de gamme." },
  { title: "Liquidité", text: "Vendre prend du temps et l'écart entre prix demandé et prix obtenu peut être important, surtout sur les cartes de niche." },
  { title: "Frais cachés", text: "Commission, envoi, assurance, grading : intégrez-les dès l'achat pour connaître votre vrai seuil de rentabilité." },
  { title: "Conservation", text: "Humidité, lumière et manipulations abîment les cartes : sleeves, toploaders et boîtes hermétiques sont indispensables." },
  { title: "Fiscalité", text: "En France, la vente de biens meubles peut être imposable au-delà de 5 000 € par cession : renseignez-vous auprès de l'administration fiscale." },
];
