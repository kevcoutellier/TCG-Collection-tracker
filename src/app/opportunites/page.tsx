import { Crosshair, Info, Radar, SearchX } from "lucide-react";
import type { Metadata } from "next";
import Form from "next/form";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { CardImage } from "@/components/card-image";
import { cardHref } from "@/components/card-tile";
import { Delta } from "@/components/delta";
import { EbayOffers, MarketplaceChips } from "@/components/marketplace";
import { NativeSelect } from "@/components/native-select";
import { Pagination } from "@/components/pagination";
import { EmptyState, PageHeader, SectionTitle } from "@/components/page-header";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { DISCLAIMER } from "@/lib/constants";
import { ebayConfigured } from "@/lib/ebay";
import { dateText, eur, signedEur } from "@/lib/format";
import { cardQuery, marketplaceLinks } from "@/lib/marketplaces";
import { DEFAULT_MIN_PRICE, OPPORTUNITY_LABELS, type OpportunityKind, type ScanFilters } from "@/lib/opportunities";
import { loadMarketOpportunities, type OpportunityItem, resolveCardmarketSingle } from "@/lib/opportunity-scan";
import { loadWatchlist, type WatchView } from "@/lib/portfolio";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Opportunités" };

const PAGE_SIZE = 25;

export default function OpportunitiesPage({ searchParams }: PageProps<"/opportunites">) {
  return (
    <>
      <PageHeader
        eyebrow="Opportunités"
        title="Opportunités d'achat"
        description="Toutes les cartes cotées sur Cardmarket passées au crible : celles qui s'échangent sous leur moyenne récente, puis un accès direct aux annonces les moins chères sur eBay, Vinted, Leboncoin et Cardmarket."
      />
      <div className="space-y-10">
        <Suspense fallback={<Skeleton className="h-40 rounded-xl" />}>
          <WatchTargets />
        </Suspense>
        <Suspense fallback={<ScannerSkeleton />}>
          <MarketScanner searchParams={searchParams} />
        </Suspense>
        <p className="flex gap-1.5 text-[11px] text-muted-foreground">
          <Info className="mt-0.5 size-3 shrink-0" />
          {DISCLAIMER} Une décote peut aussi annoncer une réimpression ou une baisse durable de la demande.
        </p>
      </div>
    </>
  );
}

/* ---------- Cibles de la watchlist ---------- */

async function WatchTargets() {
  const items = await loadWatchlist();
  const ebay = ebayConfigured();
  return (
    <section>
      <SectionTitle action={<Link href="/watchlist" className="text-sm text-primary hover:underline">Gérer la watchlist</Link>}>
        Vos cibles sur les sites de vente
      </SectionTitle>
      {items.length ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {[...items]
            .sort((a, b) => (a.distance ?? Infinity) - (b.distance ?? Infinity))
            .map((w) => (
              <TargetCard key={w.id} w={w} ebay={ebay} />
            ))}
        </div>
      ) : (
        <div className="flex items-center gap-3 rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
          <Crosshair className="size-5 shrink-0" />
          <span>
            Surveillez une carte avec un prix cible (bouton « Surveiller » sur sa fiche) : elle sera vérifiée ici sur chaque site, avec des
            recherches plafonnées à votre prix.
          </span>
        </div>
      )}
    </section>
  );
}

function TargetCard({ w, ebay }: { w: WatchView; ebay: boolean }) {
  const price = w.price?.price ?? null;
  const low = w.price?.low ?? null;
  const max = w.targetPrice ?? price;
  const query = cardQuery({ name: w.name, localId: w.localId, total: w.setTotal });
  const floorHit = low != null && w.targetPrice != null && low <= w.targetPrice;
  return (
    <div className={cn("flex gap-3 rounded-xl border bg-card p-3", (w.reached || floorHit) && "border-gain/40 bg-gain/5")}>
      <Link href={cardHref(w.cardId, w.cardLang)} className="w-16 shrink-0">
        <CardImage src={w.image} alt={w.name} />
      </Link>
      <div className="min-w-0 flex-1 space-y-1.5">
        <Link href={cardHref(w.cardId, w.cardLang)} className="block truncate font-medium hover:underline">
          {w.name}
        </Link>
        <dl className="grid grid-cols-3 gap-2 text-xs">
          <div>
            <dt className="text-muted-foreground">Cote</dt>
            <dd className="num font-semibold">{eur(price)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Cible</dt>
            <dd className="num">{eur(w.targetPrice)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground" title="Annonce la moins chère sur Cardmarket, tous états et langues">
              Plus bas CM
            </dt>
            <dd className={cn("num", floorHit && "font-semibold text-gain")}>{eur(low)}</dd>
          </div>
        </dl>
        {floorHit && <p className="text-xs text-gain">Une annonce Cardmarket est sous votre cible : vérifiez l&apos;état et la langue.</p>}
        {ebay && (
          <Suspense fallback={<Skeleton className="h-4 w-40" />}>
            <EbayOffers query={query} number={w.localId} total={w.setTotal} maxPrice={max} reference={price} compact />
          </Suspense>
        )}
        <MarketplaceChips links={marketplaceLinks({ query, name: w.name, maxPrice: max, tcgplayerId: w.tcgplayerId })} />
      </div>
    </div>
  );
}

/* ---------- Scanner du marché ---------- */

function first(v: string | string[] | undefined) {
  return (Array.isArray(v) ? v[0] : v) ?? "";
}

function parseAmount(v: string): number | null {
  const n = Number.parseFloat(v.replace(",", "."));
  return Number.isFinite(n) && n >= 0 ? n : null;
}

const KINDS = Object.keys(OPPORTUNITY_LABELS) as OpportunityKind[];

interface ScanParams {
  q: string;
  kind: OpportunityKind | null;
  min: number;
  max: number | null;
  popular: boolean;
}

function scanHref(p: ScanParams, page = 1) {
  const params = new URLSearchParams();
  if (p.q) params.set("q", p.q);
  if (p.kind) params.set("type", p.kind);
  if (p.min !== DEFAULT_MIN_PRICE) params.set("min", String(p.min));
  if (p.max != null) params.set("max", String(p.max));
  if (p.popular) params.set("pop", "1");
  if (page > 1) params.set("page", String(page));
  const qs = params.toString();
  return `/opportunites${qs ? `?${qs}` : ""}#scanner`;
}

async function MarketScanner({ searchParams }: Pick<PageProps<"/opportunites">, "searchParams">) {
  const sp = await searchParams;
  // Catalogue Cardmarket de plusieurs Mo, mis en cache en mémoire : chargé à la requête, pas au build.
  await connection();
  const kindParam = first(sp.type);
  const p: ScanParams = {
    q: first(sp.q).trim().slice(0, 80),
    kind: (KINDS as string[]).includes(kindParam) ? (kindParam as OpportunityKind) : null,
    min: parseAmount(first(sp.min)) ?? DEFAULT_MIN_PRICE,
    max: parseAmount(first(sp.max)),
    popular: first(sp.pop) === "1",
  };
  const page = Math.max(1, Number.parseInt(first(sp.page), 10) || 1);
  const filters: ScanFilters = { query: p.q, kind: p.kind, minPrice: p.min, maxPrice: p.max, popularOnly: p.popular };

  let data: Awaited<ReturnType<typeof loadMarketOpportunities>>;
  try {
    data = await loadMarketOpportunities(filters);
  } catch (err) {
    console.error(err);
    return (
      <section id="scanner">
        <SectionTitle>Scanner du marché</SectionTitle>
        <EmptyState icon={<Radar />} title="Catalogue Cardmarket indisponible" description="Le guide des prix n'a pas pu être téléchargé. Réessayez dans quelques minutes." />
      </section>
    );
  }
  const { items, scanned, updated } = data;
  const pages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  const current = Math.min(page, pages);
  const shown = items.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);

  return (
    <section id="scanner" className="scroll-mt-20 space-y-4">
      <SectionTitle>Scanner du marché</SectionTitle>
      <Form action="/opportunites" className="grid gap-2 sm:grid-cols-2 lg:flex lg:flex-wrap lg:items-center">
        <Input name="q" defaultValue={p.q} placeholder="Nom (Dracaufeu, Umbreon…)" className="h-9 lg:w-56" aria-label="Nom de la carte" />
        <NativeSelect name="type" defaultValue={p.kind ?? ""} className="h-9 lg:w-56" aria-label="Type d'opportunité">
          <option value="">Toutes les opportunités</option>
          {KINDS.map((k) => (
            <option key={k} value={k}>
              {OPPORTUNITY_LABELS[k]}
            </option>
          ))}
        </NativeSelect>
        <div className="flex gap-2">
          <Input name="min" type="number" min={0} step={1} defaultValue={p.min} className="h-9 lg:w-24" aria-label="Prix minimum (€)" placeholder="Min €" />
          <Input name="max" type="number" min={0} step={1} defaultValue={p.max ?? ""} className="h-9 lg:w-24" aria-label="Prix maximum (€)" placeholder="Max €" />
        </div>
        <label className="flex h-9 items-center gap-2 text-sm">
          <input type="checkbox" name="pop" value="1" defaultChecked={p.popular} className="size-4 accent-[var(--primary)]" />
          Pokémon recherchés uniquement
        </label>
        <Button type="submit" size="lg">
          Scanner
        </Button>
      </Form>

      <p className="text-sm text-muted-foreground">
        {scanned.toLocaleString("fr-FR")} cartes analysées · {items.length.toLocaleString("fr-FR")} opportunité{items.length > 1 ? "s" : ""}
        {updated && ` · guide des prix Cardmarket du ${dateText(updated)}`}
        {pages > 1 && ` · page ${current} / ${pages}`}
      </p>

      {shown.length ? (
        <div className="overflow-x-auto rounded-xl border bg-card">
          <table className="w-full min-w-[920px] text-sm">
            <thead>
              <tr className="text-xs text-muted-foreground">
                <th className="px-3 py-2 text-left font-medium" colSpan={2}>
                  Carte
                </th>
                <th className="px-2 py-2 text-right font-medium">Score</th>
                <th className="px-2 py-2 text-right font-medium">Cote</th>
                <th className="px-2 py-2 text-right font-medium" title="Tendance vs moyenne des ventes sur 30 jours">
                  vs 30 j
                </th>
                <th className="px-2 py-2 text-right font-medium" title="Moyenne des ventes 24 h vs moyenne 7 jours">
                  24 h
                </th>
                <th className="px-2 py-2 text-right font-medium" title="Annonce la moins chère, tous états et langues">
                  Plus bas
                </th>
                <th className="px-2 py-2 text-right font-medium" title="Écart avec la moyenne 30 jours">
                  Potentiel
                </th>
                <th className="px-3 py-2 text-left font-medium">Acheter (≤ cote)</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((item) => (
                <Suspense key={item.idProduct} fallback={<OpportunityRow item={item} />}>
                  <ResolvedOpportunityRow item={item} />
                </Suspense>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState
          icon={<SearchX />}
          title="Aucune opportunité avec ces critères"
          description="Élargissez la fourchette de prix ou retirez le filtre de nom : le marché est peut-être simplement stable."
        >
          <Link href="/opportunites#scanner" className={buttonVariants({ variant: "outline" })}>
            Réinitialiser les filtres
          </Link>
        </EmptyState>
      )}
      {pages > 1 && <Pagination current={current} pages={pages} href={(n) => scanHref(p, n)} />}
    </section>
  );
}

async function ResolvedOpportunityRow({ item }: { item: OpportunityItem }) {
  return <OpportunityRow item={item} card={await resolveCardmarketSingle(item)} />;
}

const KIND_STYLE: Record<OpportunityKind, string> = {
  rebound: "bg-gain/15 text-gain",
  discount: "bg-primary/15 text-primary",
  floor: "bg-muted text-muted-foreground",
};

function OpportunityRow({ item, card }: { item: OpportunityItem; card?: Awaited<ReturnType<typeof resolveCardmarketSingle>> }) {
  const o = item.opportunity;
  const price = item.price.price;
  const name = card?.name ?? item.name;
  const href = card ? cardHref(card.id, card.lang) : `/recherche?q=${encodeURIComponent(item.name)}&lang=en`;
  const query = card ? cardQuery({ name: card.name, localId: card.localId, total: card.total }) : item.name;
  const td = "num px-2 py-2 text-right whitespace-nowrap";
  return (
    <tr className="border-t align-middle">
      <td className="w-14 py-2 pl-3">
        <Link href={href} className="block w-10">
          <CardImage src={card?.image} alt={name} />
        </Link>
      </td>
      <td className="max-w-64 px-2 py-2">
        <Link href={href} className="block truncate font-medium hover:underline">
          {name}
        </Link>
        <div className="truncate text-xs text-muted-foreground">
          {item.expansion ?? "Extension Cardmarket"}
          {card && ` · n° ${card.localId}`}
          {card && card.name !== item.name && ` · ${item.name}`}
        </div>
        <span className={cn("mt-1 inline-block rounded px-1.5 py-0.5 text-[10px] font-medium", KIND_STYLE[o.kind])}>{OPPORTUNITY_LABELS[o.kind]}</span>
      </td>
      <td className={td}>
        <Tooltip>
          <TooltipTrigger className="cursor-help">
            <ScorePill score={o.score} />
          </TooltipTrigger>
          <TooltipContent className="block max-w-sm text-left">
            <ul className="list-disc space-y-1 pl-3">
              {o.reasons.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          </TooltipContent>
        </Tooltip>
      </td>
      <td className={td}>
        <div className="font-medium">{eur(price)}</div>
        <div className="text-[11px] text-muted-foreground">moy. 30 j {eur(item.price.avg30)}</div>
      </td>
      <td className={td}>
        <Delta value={o.vs30} icon={false} className="text-xs" />
      </td>
      <td className={td}>
        <Delta value={o.day} icon={false} className="text-xs" />
      </td>
      <td className={td}>{eur(item.price.low)}</td>
      <td className={cn(td, (o.upside ?? 0) > 0 && "text-gain")}>{o.upside != null && o.upside > 0 ? signedEur(o.upside) : "—"}</td>
      <td className="px-3 py-2">
        <MarketplaceChips className="max-w-56" links={marketplaceLinks({ query, name: item.name, maxPrice: price })} />
      </td>
    </tr>
  );
}

function ScorePill({ score }: { score: number }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="h-1.5 w-10 overflow-hidden rounded-full bg-muted">
        <span
          className={cn("block h-full rounded-full", score >= 65 ? "bg-gain" : score >= 45 ? "bg-primary" : "bg-muted-foreground")}
          style={{ width: `${score}%` }}
        />
      </span>
      <span className="font-semibold">{score}</span>
    </span>
  );
}

function ScannerSkeleton() {
  return (
    <div className="space-y-3">
      <Skeleton className="h-9 w-full max-w-3xl" />
      <Skeleton className="h-4 w-72" />
      <Skeleton className="h-96 rounded-xl" />
    </div>
  );
}
