import { setAgeYears, type UnitQuote } from "./analysis";
import { mapLimit } from "./async";
import { getSealedProduct } from "./cardmarket";
import { getGradedSales } from "./graded";
import { gradeQuote } from "./graded-model";
import { cardVariants, findVariant } from "./pricing";
import { getCard, getSet, getUsdToEur } from "./tcgdex";
import type { CardDetail, Lang, VariantKey } from "./types";

// Cote automatique de chaque ligne du portefeuille : carte brute (variante exacte), carte gradée
// (ventes réelles ou estimation) ou produit scellé (guide des prix Cardmarket).

export interface HoldingRef {
  id: string;
  kind: "card" | "sealed";
  cardId: string | null;
  cardLang: Lang;
  variant: VariantKey;
  productId?: number | null;
  gradingCompany: string | null;
  grade: string | null;
}

export interface HoldingQuote extends UnitQuote {
  /** Clé de variante résolue (les anciennes clés « normal »/« reverse » sont converties). */
  variantKey?: string;
  variantLabel?: string;
  /** Produit Cardmarket d'un scellé, pour le lien vers sa page. */
  cardmarket?: { name: string; path: string | null };
}

const cardRef = (lang: Lang, id: string) => `${lang}:${id}`;

export async function quoteHoldings(rows: HoldingRef[], now: Date = new Date()): Promise<Map<string, HoldingQuote>> {
  const fx = await getUsdToEur();
  const out = new Map<string, HoldingQuote>();

  const cardTargets = new Map<string, { id: string; lang: Lang }>();
  for (const r of rows) if (r.kind === "card" && r.cardId) cardTargets.set(cardRef(r.cardLang, r.cardId), { id: r.cardId, lang: r.cardLang });
  const cardList = await mapLimit([...cardTargets.values()], 12, (t) => getCard(t.id, t.lang).catch(() => null));
  const cards = new Map<string, CardDetail>();
  [...cardTargets.keys()].forEach((k, i) => cardList[i] && cards.set(k, cardList[i]!));

  // Date de sortie des extensions des cartes gradées (l'âge influe sur la prime de grading).
  const graded = rows.filter((r) => r.kind === "card" && r.gradingCompany && r.grade && r.cardId);
  const setTargets = new Map<string, { id: string; lang: Lang }>();
  for (const r of graded) {
    const card = cards.get(cardRef(r.cardLang, r.cardId!));
    if (card) setTargets.set(cardRef(r.cardLang, card.set.id), { id: card.set.id, lang: r.cardLang });
  }
  const setList = await mapLimit([...setTargets.values()], 8, (t) => getSet(t.id, t.lang).catch(() => null));
  const releases = new Map<string, string | null>();
  [...setTargets.keys()].forEach((k, i) => releases.set(k, setList[i]?.releaseDate ?? null));

  await mapLimit(rows, 8, async (r) => {
    if (r.kind === "sealed") {
      const product = r.productId ? await getSealedProduct(r.productId).catch(() => null) : null;
      if (product) {
        out.set(r.id, {
          price: product.price.price,
          source: "sealed",
          momentumFrom: product.price,
          cardmarket: { name: product.name, path: product.path },
        });
      }
      return;
    }
    if (!r.cardId) return;
    const card = cards.get(cardRef(r.cardLang, r.cardId));
    if (!card) return;
    const variant = findVariant(cardVariants(card, fx), r.variant);
    const base = { variantKey: variant.key, variantLabel: variant.label, momentumFrom: variant.price };
    if (r.gradingCompany && r.grade) {
      const release = releases.get(cardRef(r.cardLang, card.set.id)) ?? null;
      const sales = await getGradedSales(variant.tcgplayerId, r.cardLang, fx);
      const q = gradeQuote(r.gradingCompany, r.grade, variant.price.price, setAgeYears(release, now), sales);
      out.set(r.id, { ...base, price: q.price, source: q.source === "sales" ? "sales" : "estimate" });
    } else {
      out.set(r.id, { ...base, price: variant.price.price, source: "market" });
    }
  });
  return out;
}
