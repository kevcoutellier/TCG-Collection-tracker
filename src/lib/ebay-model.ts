// Annonces eBay (fonctions pures) : lecture de la réponse de l'API Browse et tri des annonces
// pour ne garder que la carte cherchée (ni lot, ni gradée si l'on cherche une carte brute, ni contrefaçon).

export interface EbayListing {
  id: string;
  title: string;
  /** Prix total (objet + port) en EUR. */
  total: number;
  itemPrice: number;
  shipping: number | null;
  url: string;
  image: string | null;
  condition: string | null;
  auction: boolean;
  endsAt: string | null;
  sellerFeedback: number | null;
  country: string | null;
}

interface Money {
  value?: string;
  currency?: string;
}

interface RawItem {
  itemId?: string;
  title?: string;
  price?: Money;
  currentBidPrice?: Money;
  buyingOptions?: string[];
  itemWebUrl?: string;
  image?: { imageUrl?: string };
  thumbnailImages?: { imageUrl?: string }[];
  condition?: string;
  itemEndDate?: string;
  shippingOptions?: { shippingCost?: Money }[];
  seller?: { feedbackPercentage?: string };
  itemLocation?: { country?: string };
}

function eurValue(m: Money | undefined): number | null {
  if (!m || (m.currency && m.currency !== "EUR")) return null;
  const n = Number.parseFloat(m.value ?? "");
  return Number.isFinite(n) && n >= 0 ? n : null;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Réponse `item_summary/search` → annonces en EUR (les autres devises sont ignorées). */
export function parseEbayItems(json: unknown): EbayListing[] {
  const items = (json as { itemSummaries?: RawItem[] } | null)?.itemSummaries ?? [];
  const out: EbayListing[] = [];
  for (const it of items) {
    const auction = !it.buyingOptions?.includes("FIXED_PRICE") && Boolean(it.buyingOptions?.includes("AUCTION"));
    const itemPrice = eurValue(auction ? (it.currentBidPrice ?? it.price) : it.price);
    if (!it.itemId || !it.title || !it.itemWebUrl || itemPrice == null) continue;
    const shipping = eurValue(it.shippingOptions?.[0]?.shippingCost);
    const feedback = Number.parseFloat(it.seller?.feedbackPercentage ?? "");
    out.push({
      id: it.itemId,
      title: it.title,
      total: round2(itemPrice + (shipping ?? 0)),
      itemPrice,
      shipping,
      url: it.itemWebUrl,
      image: it.image?.imageUrl ?? it.thumbnailImages?.[0]?.imageUrl ?? null,
      condition: it.condition ?? null,
      auction,
      endsAt: it.itemEndDate ?? null,
      sellerFeedback: Number.isFinite(feedback) ? feedback : null,
      country: it.itemLocation?.country ?? null,
    });
  }
  return out;
}

const GRADED = /\b(psa|cgc|bgs|beckett|pca|sgc|collect ?aura|grad[ée]+s?|graded|slab)\b/i;
const BUNDLE = /\b(lots?|bundle|classeur|binder|booster|display|etb|coffret|collection compl[eè]te)\b/i;
const FAKE = /\b(proxy|custom|fake|replica|r[ée]plique|orica|gold(en)? card|carte (en )?or|m[ée]tal(lique)?|fan ?art|goldenes?)\b/i;
const NUMBER = /(?<![\d/])0*(\d{1,3})\s*\/\s*0*(\d{1,3})(?![\d/])/g;

/**
 * Ne garde que les annonces plausibles pour la carte cherchée. Une annonce qui affiche un autre
 * numéro (« 4/102 » quand on cherche « 199/165 ») est écartée ; sans numéro, elle est conservée.
 */
export function filterListings(
  listings: readonly EbayListing[],
  { number, total, graded = false }: { number?: string | null; total?: number | null; graded?: boolean },
): EbayListing[] {
  const wanted = number && /^\d+$/.test(number) ? Number.parseInt(number, 10) : null;
  return listings
    .filter((l) => {
      if (BUNDLE.test(l.title) || FAKE.test(l.title)) return false;
      if (!graded && GRADED.test(l.title)) return false;
      if (wanted != null) {
        const found = [...l.title.matchAll(NUMBER)].map((m) => [Number(m[1]), Number(m[2])] as const);
        if (found.length && !found.some(([n, t]) => n === wanted && (total == null || t === total))) return false;
      }
      return true;
    })
    .sort((a, b) => a.total - b.total);
}
