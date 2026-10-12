import { Award, ChevronRight, ExternalLink, Info, Layers, ShoppingCart } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { after, connection } from "next/server";
import { cache, Suspense } from "react";
import { CardImage } from "@/components/card-image";
import { setHref } from "@/components/card-tile";
import { MomentumChart, PriceHistoryChart } from "@/components/charts";
import { CompareButton } from "@/components/compare-picker";
import { Delta, MoneyDelta } from "@/components/delta";
import { AddHoldingDialog } from "@/components/forms/holding-forms";
import { WatchDialog } from "@/components/forms/watch-forms";
import { GradedPricePanel, type GradedVariantOption } from "@/components/graded";
import { EbayOffers, MarketplaceRow } from "@/components/marketplace";
import { ScoreRing, SignalBadge } from "@/components/score";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { analyzeCard, momentum, setAgeYears, volatility } from "@/lib/analysis";
import { getExpansionLabelForCard } from "@/lib/cardmarket";
import { DISCLAIMER } from "@/lib/constants";
import { ebayConfigured } from "@/lib/ebay";
import { dateText, eur, pctText, todayISO, usd } from "@/lib/format";
import { getGradedSales, gradedSalesConfigured } from "@/lib/graded";
import type { SalesByGrade } from "@/lib/graded-model";
import { cardQuery, marketplaceLinks } from "@/lib/marketplaces";
import { loadCardTracking } from "@/lib/portfolio";
import { cardVariants, primaryVariant } from "@/lib/pricing";
import { recordCardSnapshot } from "@/lib/snapshots";
import { getCard, getSet, getUsdToEur } from "@/lib/tcgdex";
import { type CardVariant, type Lang, parseLang } from "@/lib/types";

export const metadata: Metadata = { title: "Fiche carte" };

// Déduplique la lecture en base entre les deux blocs qui en ont besoin.
const getTracking = cache(loadCardTracking);

export default function CardPage({ params, searchParams }: PageProps<"/cartes/[id]">) {
  return (
    <Suspense fallback={<CardPageSkeleton />}>
      <CardPageContent params={params} searchParams={searchParams} />
    </Suspense>
  );
}

function safeDecode(s: string) {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

async function CardPageContent({
  params,
  searchParams,
}: Pick<PageProps<"/cartes/[id]">, "params" | "searchParams">) {
  const [{ id: rawId }, sp] = await Promise.all([params, searchParams]);
  // L'analyse dépend de la date du jour (ancienneté de l'extension) : rendu à la requête.
  await connection();
  const id = safeDecode(rawId);
  const lang = parseLang(sp.lang);
  const [card, fx] = await Promise.all([getCard(id, lang), getUsdToEur()]);
  if (!card) notFound();
  const set = await getSet(card.set.id, lang).catch(() => null);

  const variants = cardVariants(card, fx);
  const primary = primaryVariant(variants);
  const main = primary.price;
  const ageYears = setAgeYears(set?.releaseDate, new Date());
  const analysis = analyzeCard({ name: card.name, rarity: card.rarity, releaseDate: set?.releaseDate, price: main });
  const englishSet = lang === "ja" ? await getExpansionLabelForCard(primary.cardmarketId) : null;

  // Ventes gradées réelles (si une clé API est configurée) : au plus 3 produits par carte.
  const salesConfigured = gradedSalesConfigured();
  const salesById = new Map<number, SalesByGrade | null>();
  if (salesConfigured) {
    const ids = [...new Set(variants.map((v) => v.tcgplayerId).filter((x): x is number => x != null))].slice(0, 3);
    const results = await Promise.all(ids.map((tid) => getGradedSales(tid, lang, fx)));
    ids.forEach((tid, i) => salesById.set(tid, results[i]));
  }
  const gradedOptions: GradedVariantOption[] = variants.map((v) => ({
    key: v.key,
    label: v.label,
    price: v.price.price,
    sales: v.tcgplayerId ? (salesById.get(v.tcgplayerId) ?? null) : null,
  }));

  const cardRef = {
    cardId: card.id,
    cardLang: lang,
    name: card.name,
    setName: englishSet ? `${card.set.name} (${englishSet})` : card.set.name,
    image: card.image ?? null,
    rarity: card.rarity ?? null,
  };
  const tcgProductId = primary.tcgplayerId;
  const official = card.set.cardCount?.official;

  // Chaque consultation enregistre le relevé du jour : l'historique se construit tout seul.
  after(() => recordCardSnapshot(card, fx).catch(() => {}));

  return (
    <div className="space-y-6">
      <nav className="flex items-center gap-1 text-sm text-muted-foreground" aria-label="Fil d'Ariane">
        <Link href={lang === "ja" ? "/sets?lang=ja" : "/sets"} className="hover:text-foreground">
          {lang === "ja" ? "Extensions japonaises" : "Extensions"}
        </Link>
        <ChevronRight className="size-3.5" />
        <Link href={setHref(card.set.id, lang)} className="truncate hover:text-foreground">
          {card.set.name}
        </Link>
        <ChevronRight className="size-3.5" />
        <span className="truncate text-foreground">{card.name}</span>
      </nav>

      <div className="grid gap-8 lg:grid-cols-[minmax(240px,340px)_1fr]">
        <div className="space-y-4">
          <CardImage src={card.image} alt={card.name} quality="high" className="mx-auto w-full max-w-[340px] shadow-2xl shadow-black/40" />
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-xl border bg-card p-4 text-sm">
            <Meta label="Numéro" value={`${card.localId}${official ? ` / ${official}` : ""}`} />
            <Meta label="Sortie" value={dateText(set?.releaseDate)} />
            <Meta label="Série" value={set?.serie.name} />
            <Meta label="Illustrateur" value={card.illustrator} />
            {card.hp ? <Meta label="PV" value={String(card.hp)} /> : null}
            {card.types?.length ? <Meta label="Type" value={card.types.join(", ")} /> : null}
            <Meta label="Variantes" value={String(variants.length)} />
            <Meta label="Langue" value={lang === "ja" ? "Japonais" : lang === "en" ? "Anglais" : "Français"} />
          </dl>
          <div className="flex flex-wrap gap-2 text-sm">
            <a
              className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 hover:bg-accent"
              href={`https://www.cardmarket.com/fr/Pokemon/Products/Search?searchString=${encodeURIComponent(card.name)}`}
              target="_blank"
              rel="noreferrer"
            >
              Cardmarket <ExternalLink className="size-3.5" />
            </a>
            {tcgProductId && (
              <a
                className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 hover:bg-accent"
                href={`https://www.tcgplayer.com/product/${tcgProductId}`}
                target="_blank"
                rel="noreferrer"
              >
                TCGplayer <ExternalLink className="size-3.5" />
              </a>
            )}
          </div>
        </div>

        <div className="min-w-0 space-y-6">
          <header>
            <div className="flex flex-wrap items-center gap-2">
              {lang === "ja" && <Badge variant="outline">Japonaise</Badge>}
              {card.rarity && <Badge variant="secondary">{card.rarity}</Badge>}
              <SignalBadge kind={analysis.signal.kind} label={analysis.signal.label} />
            </div>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight">{card.name}</h1>
            <p className="text-muted-foreground">
              {card.set.name}
              {englishSet && <span> · {englishSet}</span>} · n° {card.localId}
            </p>
            <div className="mt-4 flex flex-wrap items-end gap-x-6 gap-y-2">
              <div>
                <div className="text-xs tracking-wide text-muted-foreground uppercase">
                  Cote brute · {primary.label}
                </div>
                <div className="num text-4xl font-semibold tracking-tight">{eur(main.price)}</div>
              </div>
              <div className="pb-1.5 text-sm">
                <Delta value={analysis.momentum.vs30} /> <span className="text-muted-foreground">vs moyenne 30 j</span>
              </div>
            </div>
            <Suspense fallback={<Skeleton className="mt-5 h-9 w-80" />}>
              <CardActions cardRef={cardRef} variants={gradedOptions} ageYears={ageYears} />
            </Suspense>
          </header>

          <VariantTable variants={variants} primaryKey={primary.key} fx={fx} />

          <BuyPanel
            name={card.name}
            query={cardQuery({ name: card.name, localId: card.localId, total: official })}
            localId={card.localId}
            total={official ?? null}
            variant={primary}
            fx={fx}
          />

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Award className="size-4 text-primary" /> Prix gradé
              </CardTitle>
              <CardDescription>Choisissez la variante, la société et la note</CardDescription>
            </CardHeader>
            <CardContent>
              <GradedPricePanel variants={gradedOptions} ageYears={ageYears} salesConfigured={salesConfigured} />
            </CardContent>
          </Card>

          <div className="grid gap-6 xl:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Analyse investissement</CardTitle>
                <CardDescription>Score sur 100 : rareté, demande, dynamique, liquidité, ancienneté</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-4">
                  <ScoreRing score={analysis.score} />
                  <div className="space-y-1 text-sm">
                    <div>
                      Seuil de revente : <span className="num font-semibold">{eur(analysis.breakEven)}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Prix minimum pour récupérer la cote actuelle après commission (5 %) et envoi.
                    </p>
                  </div>
                </div>
                <ul className="space-y-2 text-sm">
                  {analysis.reasons.map((r) => (
                    <li key={r.text} className="flex gap-2">
                      <span
                        className={`mt-1.5 size-1.5 shrink-0 rounded-full ${
                          r.tone === "positive" ? "bg-gain" : r.tone === "negative" ? "bg-loss" : "bg-muted-foreground"
                        }`}
                      />
                      <span className="text-pretty">{r.text}</span>
                    </li>
                  ))}
                </ul>
                <p className="flex gap-1.5 text-[11px] text-muted-foreground">
                  <Info className="mt-0.5 size-3 shrink-0" />
                  {DISCLAIMER}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Dynamique récente</CardTitle>
                <CardDescription>Moyennes des ventes Cardmarket · {primary.label}</CardDescription>
              </CardHeader>
              <CardContent>
                <MomentumChart
                  data={[
                    { label: "Moy. 30 j", value: main.avg30 },
                    { label: "Moy. 7 j", value: main.avg7 },
                    { label: "Moy. 24 h", value: main.avg1 },
                    { label: "Tendance", value: main.trend ?? main.price },
                  ]}
                />
                <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
                  <MiniDelta label="vs 30 j" value={analysis.momentum.vs30} />
                  <MiniDelta label="vs 7 j" value={analysis.momentum.vs7} />
                  <MiniDelta label="24 h vs 7 j" value={analysis.momentum.day} />
                </div>
              </CardContent>
            </Card>
          </div>

          <Suspense fallback={<Skeleton className="h-72 w-full rounded-xl" />}>
            <CardHistory cardId={card.id} variants={variants} primaryKey={primary.key} />
          </Suspense>
        </div>
      </div>
    </div>
  );
}

function Meta({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="truncate">{value || "—"}</dd>
    </div>
  );
}

function MiniDelta({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="rounded-lg bg-muted/50 px-2 py-1.5">
      <div className="text-muted-foreground">{label}</div>
      <Delta value={value} icon={false} />
    </div>
  );
}

function VariantTable({ variants, primaryKey, fx }: { variants: CardVariant[]; primaryKey: string; fx: number }) {
  const updated = variants.find((v) => v.price.updated)?.price.updated;
  const th = "py-1.5 px-2 font-medium whitespace-nowrap";
  const td = "num py-2 px-2 text-right whitespace-nowrap";
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>Prix par variante</CardTitle>
        <CardDescription>
          {variants.length} variante{variants.length > 1 ? "s" : ""} ·{" "}
          {updated ? `guide des prix du ${dateText(updated)}` : "guide des prix"} · 1 USD = {fx.toFixed(3).replace(".", ",")} €
        </CardDescription>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="text-xs text-muted-foreground">
              <th className={`${th} text-left`}>Variante</th>
              <th className={`${th} text-right`} title="Prix de référence lissé par Cardmarket">Tendance</th>
              <th className={`${th} text-right`} title="Annonce la moins chère, tous états confondus">Plus bas</th>
              <th className={`${th} text-right`}>Moy. 7 j</th>
              <th className={`${th} text-right`}>Moy. 30 j</th>
              <th className={`${th} text-right`}>vs 30 j</th>
              <th className={`${th} text-right`}>TCGplayer</th>
            </tr>
          </thead>
          <tbody>
            {variants.map((v) => (
              <tr key={v.key} className="border-t">
                <td className="px-2 py-2">
                  <span className={v.key === primaryKey ? "font-medium" : undefined}>{v.label}</span>
                  {v.key === primaryKey && variants.length > 1 && (
                    <Badge variant="outline" className="ml-2">
                      référence
                    </Badge>
                  )}
                </td>
                <td className={`${td} font-medium`}>{eur(v.price.trend ?? v.price.price)}</td>
                <td className={td}>{eur(v.price.low)}</td>
                <td className={td}>{eur(v.price.avg7)}</td>
                <td className={td}>{eur(v.price.avg30)}</td>
                <td className={td}>
                  <Delta value={momentum(v.price).vs30} icon={false} className="text-xs" />
                </td>
                <td className={td} title={v.price.usdMarket != null ? usd(v.price.usdMarket) : undefined}>
                  {v.price.usdMarket != null ? eur(v.price.usdMarket * fx) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {variants.every((v) => v.price.price == null) && (
          <p className="mt-3 text-sm text-muted-foreground">Aucune vente récente référencée pour cette carte.</p>
        )}
      </CardContent>
    </Card>
  );
}

function BuyPanel({
  name,
  query,
  localId,
  total,
  variant,
  fx,
}: {
  name: string;
  query: string;
  localId: string;
  total: number | null;
  variant: CardVariant;
  fx: number;
}) {
  const p = variant.price;
  const links = marketplaceLinks({ query, name, maxPrice: p.price, tcgplayerId: variant.tcgplayerId });
  const ebay = ebayConfigured();
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShoppingCart className="size-4 text-primary" /> Acheter au meilleur prix
        </CardTitle>
        <CardDescription>
          Recherche « {query} » sur chaque site, triée par prix croissant
          {p.price != null ? ` et plafonnée à la cote du jour (${eur(p.price)}) : tout ce qui s'affiche est sous le marché` : ""}.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="divide-y">
          {links.map((l) => (
            <MarketplaceRow key={l.id} link={l}>
              {l.id === "cardmarket" ? (
                <>
                  Tendance <span className="num text-foreground">{eur(p.trend ?? p.price)}</span> · annonce la moins chère{" "}
                  <span className="num text-foreground">{eur(p.low)}</span> (tous états et langues)
                </>
              ) : l.id === "tcgplayer" ? (
                <>
                  Market <span className="num text-foreground">{usd(p.usdMarket)}</span>
                  {p.usdMarket != null && (
                    <>
                      {" "}
                      ≈ <span className="num text-foreground">{eur(p.usdMarket * fx)}</span>
                    </>
                  )}{" "}
                  · hors port, TVA et frais d&apos;import
                </>
              ) : l.id === "ebay" && ebay ? (
                "Annonces en direct ci-dessous, port compris"
              ) : undefined}
            </MarketplaceRow>
          ))}
        </div>
        {ebay && (
          <Suspense fallback={<Skeleton className="h-32 w-full rounded-lg" />}>
            <EbayOffers query={query} number={localId} total={total} maxPrice={p.price != null ? p.price * 1.1 : null} reference={p.price} />
          </Suspense>
        )}
      </CardContent>
    </Card>
  );
}

async function CardActions({
  cardRef,
  variants,
  ageYears,
}: {
  cardRef: { cardId: string; cardLang: Lang; name: string; setName: string; image: string | null; rarity: string | null };
  variants: GradedVariantOption[];
  ageYears: number | null;
}) {
  const { owned, watch } = await getTracking(cardRef.cardId);
  const qty = owned.reduce((a, h) => a + h.quantity, 0);
  const cost = owned.reduce((a, h) => a + h.quantity * h.purchasePrice, 0);
  const price = variants[0]?.price;
  return (
    <div className="mt-5 flex flex-wrap items-center gap-2">
      <AddHoldingDialog card={cardRef} variants={variants} ageYears={ageYears} today={todayISO()} />
      <WatchDialog card={cardRef} variants={variants} existing={watch} />
      <CompareButton id={cardRef.cardId} lang={cardRef.cardLang} />
      {qty > 0 && (
        <Link href="/collection" className="inline-flex items-center gap-1.5 rounded-lg bg-muted px-3 py-1.5 text-sm hover:bg-accent">
          <Layers className="size-4 text-primary" />
          {qty} en collection
          {price != null && cost > 0 && !owned.some((h) => h.gradingCompany) && (
            <>
              {" · "}
              <MoneyDelta value={qty * price - cost} />
            </>
          )}
        </Link>
      )}
      {watch?.targetPrice != null && (
        <span className="text-sm text-muted-foreground">
          Objectif : <span className="num text-foreground">{eur(watch.targetPrice)}</span>
        </span>
      )}
    </div>
  );
}

async function CardHistory({ cardId, variants, primaryKey }: { cardId: string; variants: CardVariant[]; primaryKey: string }) {
  const { history } = await getTracking(cardId);
  const today = todayISO();
  const primary = variants.find((v) => v.key === primaryKey);

  // Une courbe par variante relevée (5 au maximum), la variante de référence en premier.
  const keys = [...new Set(history.map((h) => h.variant))]
    .filter((k) => variants.some((v) => v.key === k))
    .sort((a, b) => (a === primaryKey ? -1 : b === primaryKey ? 1 : 0))
    .slice(0, 5);
  if (!keys.includes(primaryKey) && primary?.price.price != null) keys.unshift(primaryKey);
  const series = keys.map((k, i) => ({ key: `s${i}`, label: variants.find((v) => v.key === k)?.label ?? k }));

  const byDay = new Map<string, Record<string, string | number | null>>();
  for (const h of history) {
    const i = keys.indexOf(h.variant);
    if (i < 0) continue;
    const row = byDay.get(h.day) ?? { day: h.day };
    row[`s${i}`] = h.price;
    byDay.set(h.day, row);
  }
  if (primary?.price.price != null) {
    const row = byDay.get(today) ?? { day: today };
    row.s0 ??= primary.price.price;
    byDay.set(today, row);
  }
  const data = [...byDay.values()].sort((a, b) => String(a.day).localeCompare(String(b.day)));

  const mainSeries = data.map((d) => d.s0).filter((p): p is number => typeof p === "number");
  const vol = volatility(mainSeries);
  const change = mainSeries.length > 1 ? mainSeries.at(-1)! / mainSeries[0] - 1 : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Historique des prix</CardTitle>
        <CardDescription>
          {data.length > 1 ? `${data.length} relevés depuis le ${dateText(String(data[0].day))}` : "Premier relevé enregistré aujourd'hui"}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {data.length > 1 ? (
          <>
            <PriceHistoryChart data={data} series={series} />
            <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm">
              <span className="text-muted-foreground">
                {series[0]?.label} depuis le premier relevé : <Delta value={change} />
              </span>
              {vol != null && (
                <span className="text-muted-foreground">
                  Volatilité entre relevés : <span className="num text-foreground">{pctText(vol).replace("+", "")}</span>
                </span>
              )}
            </div>
          </>
        ) : (
          <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
            L&apos;historique se construit automatiquement : un relevé de chaque variante est enregistré chaque jour pour
            les cartes que vous consultez, possédez ou surveillez. En attendant, le graphique « Dynamique récente » montre
            les moyennes des 30 derniers jours.
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function CardPageSkeleton() {
  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(240px,340px)_1fr]">
      <Skeleton className="aspect-[63/88] w-full max-w-[340px] rounded-xl" />
      <div className="space-y-4">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-12 w-48" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    </div>
  );
}
