// Sites de vente connus : recherches préremplies (nom + numéro), triées par prix croissant et
// plafonnées au prix visé quand le site le permet. Vinted et Leboncoin n'ont pas d'API publique :
// on y renvoie l'utilisateur avec la bonne recherche plutôt que de les aspirer.

export type MarketplaceId = "cardmarket" | "ebay" | "vinted" | "leboncoin" | "tcgplayer";

export interface MarketplaceLink {
  id: MarketplaceId;
  label: string;
  href: string;
  /** Ce que montre la recherche (« ≤ 120 €, prix croissants »). */
  hint: string;
}

export const MARKETPLACE_LABELS: Record<MarketplaceId, string> = {
  cardmarket: "Cardmarket",
  ebay: "eBay",
  vinted: "Vinted",
  leboncoin: "Leboncoin",
  tcgplayer: "TCGplayer",
};

/** Requête de recherche d'une carte : « Dracaufeu ex 199/165 » (les vendeurs indiquent le numéro). */
export function cardQuery(card: { name: string; localId?: string | null; total?: number | null }): string {
  const number = card.localId && /^\d+$/.test(card.localId) && card.total ? ` ${card.localId}/${card.total}` : card.localId ? ` ${card.localId}` : "";
  return `${card.name}${number}`.trim();
}

const enc = encodeURIComponent;

export function marketplaceLinks({
  query,
  name,
  maxPrice,
  tcgplayerId,
}: {
  /** Recherche complète (nom + numéro) pour les sites de particuliers. */
  query: string;
  /** Nom seul : Cardmarket cherche dans ses fiches produit, sans numéro. */
  name: string;
  /** Prix plafond (cote ou objectif) ; arrondi à l'euro supérieur. */
  maxPrice?: number | null;
  tcgplayerId?: number | null;
}): MarketplaceLink[] {
  const max = maxPrice != null && maxPrice > 0 ? Math.ceil(maxPrice) : null;
  const capped = max != null ? `≤ ${max} €, prix croissants` : "prix croissants";
  const links: MarketplaceLink[] = [
    {
      id: "cardmarket",
      label: MARKETPLACE_LABELS.cardmarket,
      href: `https://www.cardmarket.com/fr/Pokemon/Products/Search?searchString=${enc(name)}`,
      hint: "Fiche produit, offres par état et langue",
    },
    {
      id: "ebay",
      label: MARKETPLACE_LABELS.ebay,
      href: `https://www.ebay.fr/sch/i.html?_nkw=${enc(query)}&_sop=15${max != null ? `&_udhi=${max}` : ""}`,
      hint: `${capped} (port compris)`,
    },
    {
      id: "vinted",
      label: MARKETPLACE_LABELS.vinted,
      href: `https://www.vinted.fr/catalog?search_text=${enc(query)}&order=price_low_to_high${max != null ? `&price_to=${max}&currency=EUR` : ""}`,
      hint: capped,
    },
    {
      id: "leboncoin",
      label: MARKETPLACE_LABELS.leboncoin,
      href: `https://www.leboncoin.fr/recherche?text=${enc(query)}&sort=price&order=asc${max != null ? `&price=min-${max}` : ""}`,
      hint: capped,
    },
  ];
  if (tcgplayerId) {
    links.push({
      id: "tcgplayer",
      label: MARKETPLACE_LABELS.tcgplayer,
      href: `https://www.tcgplayer.com/product/${tcgplayerId}`,
      hint: "Marché américain (USD), frais d'import en sus",
    });
  }
  return links;
}
