import { ExternalLink, Gavel } from "lucide-react";
import { pct } from "@/lib/analysis";
import { searchEbayListings } from "@/lib/ebay";
import { dateText, eur, pctText } from "@/lib/format";
import { type MarketplaceId, type MarketplaceLink } from "@/lib/marketplaces";
import { cn } from "@/lib/utils";

const DOT: Record<MarketplaceId, string> = {
  cardmarket: "bg-sky-400",
  ebay: "bg-amber-400",
  vinted: "bg-teal-400",
  leboncoin: "bg-orange-500",
  tcgplayer: "bg-indigo-400",
};

/** Liens compacts vers les sites de vente (recherche préremplie, prix croissants). */
export function MarketplaceChips({ links, className }: { links: MarketplaceLink[]; className?: string }) {
  return (
    <div className={cn("flex flex-wrap gap-1", className)}>
      {links.map((l) => (
        <a
          key={l.id}
          href={l.href}
          target="_blank"
          rel="noreferrer"
          title={`${l.label} : ${l.hint}`}
          className="inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] whitespace-nowrap text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
        >
          <span className={cn("size-1.5 rounded-full", DOT[l.id])} />
          {l.label}
        </a>
      ))}
    </div>
  );
}

/** Ligne « site → ce que montre la recherche », pour le panneau d'achat d'une carte. */
export function MarketplaceRow({ link, children }: { link: MarketplaceLink; children?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2.5">
      <div className="min-w-0">
        <div className="flex items-center gap-2 text-sm font-medium">
          <span className={cn("size-2 rounded-full", DOT[link.id])} />
          {link.label}
        </div>
        <div className="mt-0.5 text-xs text-muted-foreground">{children ?? link.hint}</div>
      </div>
      <a
        href={link.href}
        target="_blank"
        rel="noreferrer"
        className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs hover:bg-accent"
      >
        Voir <ExternalLink className="size-3" />
      </a>
    </div>
  );
}

/** Annonces eBay les moins chères (port compris), comparées à la cote de référence. */
export async function EbayOffers({
  query,
  number,
  total,
  maxPrice,
  reference,
  limit = 5,
  compact = false,
}: {
  query: string;
  number?: string | null;
  total?: number | null;
  maxPrice?: number | null;
  /** Cote utilisée pour afficher l'écart de chaque annonce. */
  reference: number | null;
  limit?: number;
  compact?: boolean;
}) {
  const listings = await searchEbayListings(query, { maxPrice, number, total });
  if (listings == null) return <p className="text-xs text-muted-foreground">Annonces eBay indisponibles pour le moment.</p>;
  if (!listings.length) {
    return (
      <p className="text-xs text-muted-foreground">
        Aucune annonce eBay{maxPrice != null ? ` sous ${eur(maxPrice)}` : ""} pour cette carte en ce moment.
      </p>
    );
  }
  if (compact) {
    const best = listings[0];
    return (
      <a href={best.url} target="_blank" rel="noreferrer" className="text-xs hover:underline">
        <span className="font-medium text-gain">
          {listings.length} annonce{listings.length > 1 ? "s" : ""} eBay
        </span>{" "}
        · dès <span className="num font-medium text-foreground">{eur(best.total)}</span> port compris
      </a>
    );
  }
  return (
    <ul className="divide-y rounded-lg border">
      {listings.slice(0, limit).map((l) => (
        <li key={l.id}>
          <a href={l.url} target="_blank" rel="noreferrer" className="flex items-center gap-3 px-3 py-2 hover:bg-accent/50">
            {l.image ? (
              // eslint-disable-next-line @next/next/no-img-element -- vignette distante eBay
              <img src={l.image} alt="" className="size-10 shrink-0 rounded object-cover" loading="lazy" />
            ) : (
              <div className="size-10 shrink-0 rounded bg-muted" />
            )}
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm">{l.title}</div>
              <div className="flex flex-wrap items-center gap-x-2 text-[11px] text-muted-foreground">
                {l.auction && (
                  <span className="inline-flex items-center gap-1">
                    <Gavel className="size-3" /> Enchère{l.endsAt ? ` · fin le ${dateText(l.endsAt, { short: true })}` : ""}
                  </span>
                )}
                {l.condition && <span>{l.condition}</span>}
                {l.shipping != null && <span>{l.shipping > 0 ? `port ${eur(l.shipping)}` : "port offert"}</span>}
                {l.country && l.country !== "FR" && <span>{l.country}</span>}
              </div>
            </div>
            <div className="shrink-0 text-right">
              <div className="num text-sm font-semibold">{eur(l.total)}</div>
              {reference != null && <VsReference value={pct(reference, l.total)} />}
            </div>
          </a>
        </li>
      ))}
    </ul>
  );
}

/** Écart d'un prix d'achat avec la cote : en vert sous la cote (bonne affaire), en rouge au-dessus. */
export function VsReference({ value, className }: { value: number | null; className?: string }) {
  if (value == null) return null;
  return (
    <span
      className={cn(
        "num text-[11px] font-medium",
        value < -0.02 ? "text-gain" : value > 0.02 ? "text-loss" : "text-muted-foreground",
        className,
      )}
    >
      {pctText(value)} vs cote
    </span>
  );
}
