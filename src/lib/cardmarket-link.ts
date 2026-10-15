// Liens vers les pages produit de Cardmarket, filtrées sur la langue d'une ligne de la collection.
// Le catalogue public ne donne pas l'adresse des produits : on la reconstruit à partir de la
// catégorie et du nom (« Prismatic Evolutions: Mini Tin Display » → Tins/Prismatic-Evolutions-Mini-Tin-Display).

const SITE = "https://www.cardmarket.com/fr/Pokemon/Products";

/** Identifiants du filtre de langue de Cardmarket (`?language=2` : offres en français). */
const LANGUAGE_IDS: Record<string, number> = { EN: 1, FR: 2, DE: 3, ES: 4, IT: 5, JP: 7 };

/**
 * Segment d'adresse Cardmarket d'un nom de produit : accents retirés, espaces et ponctuation
 * remplacés par des tirets. Null quand la conversion n'est pas sûre (apostrophes, barres…).
 */
export function cardmarketSlug(name: string): string | null {
  const plain = name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim();
  if (!plain || !/^[A-Za-z0-9 :&()-]+$/.test(plain)) return null;
  return plain.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export interface CardmarketLink {
  url: string;
  /** Langue filtrée sur la page (« FR »), null si la page n'est pas filtrée. */
  language: string | null;
}

/** Page du produit filtrée sur la langue de l'exemplaire, ou recherche par nom si l'adresse est inconnue. */
export function cardmarketProductLink(product: { name: string; path: string | null }, language?: string | null): CardmarketLink {
  if (!product.path) return { url: `${SITE}/Search?searchString=${encodeURIComponent(product.name)}`, language: null };
  const id = language ? LANGUAGE_IDS[language] : undefined;
  return id ? { url: `${SITE}/${product.path}?language=${id}`, language: language! } : { url: `${SITE}/${product.path}`, language: null };
}
