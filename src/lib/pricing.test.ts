import { describe, expect, it } from "vitest";
import { cardVariants, extractPrice, findVariant, primaryVariant, variantLabel } from "./pricing";
import type { CardDetail } from "./types";

type Pricing = Pick<CardDetail, "pricing" | "variants_detailed">;

const moonbreon: Pricing = {
  pricing: {
    cardmarket: {
      avg: 1547.22,
      low: 220,
      trend: 1930.74,
      avg1: 1199,
      avg7: 2037.33,
      avg30: 1764.06,
      "avg-holo": null,
      "trend-holo": 0,
      "avg30-holo": null,
    },
    tcgplayer: { unit: "USD", holofoil: { marketPrice: 2351.42, midPrice: 2300 } },
  },
};

describe("variantes sans détail (anciennes fiches)", () => {
  it("prend la tendance Cardmarket comme prix de référence", () => {
    const p = extractPrice(moonbreon, "normal", 0.9);
    expect(p.price).toBe(1930.74);
    expect(p.source).toBe("cardmarket");
    expect(p.avg30).toBe(1764.06);
    expect(p.usdMarket).toBe(2351.42);
  });

  it("n'invente pas de reverse quand sa cote vaut 0", () => {
    expect(cardVariants(moonbreon, 0.9).map((v) => v.key)).toEqual(["normal"]);
  });

  it("lit les champs -holo pour la version reverse", () => {
    const card: Pricing = { pricing: { cardmarket: { trend: 0.2, "trend-holo": 1.5, "avg30-holo": 1.2 } } };
    const reverse = findVariant(cardVariants(card, 0.9), "reverse");
    expect(reverse.price.price).toBe(1.5);
    expect(reverse.price.avg30).toBe(1.2);
  });

  it("se rabat sur TCGplayer converti en euros sans cote Cardmarket", () => {
    const p = extractPrice({ pricing: { cardmarket: null, tcgplayer: { normal: { marketPrice: 10 } } } }, "normal", 0.92);
    expect(p.price).toBe(9.2);
    expect(p.source).toBe("tcgplayer");
  });
});

// Extrait réel de TCGdex : Noeunoeuf d'Évolutions Prismatiques (reverse simple + Poké Ball + Master Ball).
const exeggcute: Pricing = {
  variants_detailed: [
    {
      type: "normal",
      variantId: "n",
      thirdParty: { cardmarket: 805390, tcgplayer: 610356 },
      pricing: {
        cardmarket: { trend: 0.02, avg30: 0.03, "trend-holo": 0.16, "avg30-holo": 0.08 },
        tcgplayer: { normal: { productId: 610356, marketPrice: 0.05 }, "reverse-holofoil": { productId: 610356, marketPrice: 0.16 } },
      },
    },
    {
      type: "reverse",
      variantId: "r",
      thirdParty: { cardmarket: 805390, tcgplayer: 610356 },
      pricing: {
        cardmarket: { trend: 0.02, avg30: 0.03, "trend-holo": 0.16, "avg30-holo": 0.08 },
        tcgplayer: { normal: { marketPrice: 0.05 }, "reverse-holofoil": { marketPrice: 0.16 } },
      },
    },
    {
      type: "reverse",
      foil: "pokeball",
      variantId: "pb",
      thirdParty: { cardmarket: 806408, tcgplayer: 610536 },
      pricing: { cardmarket: { trend: 0.25, avg30: 0.28, "trend-holo": 0.35 }, tcgplayer: { holofoil: { marketPrice: 0.32 } } },
    },
    {
      type: "reverse",
      foil: "masterball",
      variantId: "mb",
      thirdParty: { cardmarket: 806409, tcgplayer: 610637 },
      pricing: { cardmarket: { trend: 0, avg30: null }, tcgplayer: { holofoil: { marketPrice: 4.1 } } },
    },
  ],
};

describe("variantes détaillées", () => {
  const variants = cardVariants(exeggcute, 0.9);

  it("liste toutes les variantes avec un libellé lisible", () => {
    expect(variants.map((v) => v.label)).toEqual(["Normale", "Reverse", "Reverse · Poké Ball", "Reverse · Master Ball"]);
  });

  it("reverse simple : champs -holo du produit partagé ; reverse spécial : son propre produit", () => {
    expect(variants[0].price.price).toBe(0.02);
    expect(variants[1].price.price).toBe(0.16);
    expect(variants[2].price.price).toBe(0.25);
    expect(variants[2].cardmarketId).toBe(806408);
    // Master Ball sans vente Cardmarket : repli sur TCGplayer converti.
    expect(variants[3].price.price).toBe(3.69);
    expect(variants[3].price.source).toBe("tcgplayer");
    expect(variants[0].tcgplayerId).toBe(610356);
  });

  it("résout les anciennes clés et la variante de référence", () => {
    expect(findVariant(variants, "reverse").key).toBe("r");
    expect(findVariant(variants, "normal").key).toBe("n");
    expect(findVariant(variants, "pb").key).toBe("pb");
    expect(primaryVariant(variants).key).toBe("n");
  });

  it("décrit éditions et tampons, en anglais comme en français", () => {
    expect(variantLabel({ type: "holo", subtype: "shadowless", stamp: ["1st-edition"], size: "standard" })).toBe("Holo · Shadowless · 1re édition");
    expect(variantLabel({ type: "Holo", subtype: "sans ombre", stamp: ["1re Édition"], size: "Standard" })).toBe("Holo · Shadowless · 1re édition");
    expect(variantLabel({ type: "Holo", subtype: "illimité", size: "Standard" })).toBe("Holo · Illimitée");
    expect(variantLabel({ type: "Reverse", foil: "Pokéball", size: "Standard" })).toBe("Reverse · Poké Ball");
    expect(variantLabel({ type: "normal", stamp: ["set-logo"], size: "jumbo" })).toBe("Normale · Tampon logo · Jumbo");
  });

  it("une variante sans prix propre reste sans cote", () => {
    const card: Pricing = {
      pricing: { cardmarket: { trend: 300 } },
      variants_detailed: [
        { type: "Holo", variantId: "a", pricing: { cardmarket: { trend: 300 } } },
        { type: "Holo", subtype: "Copyright 1999-2000", variantId: "b" },
      ],
    };
    const [a, b] = cardVariants(card, 0.9);
    expect(a.price.price).toBe(300);
    expect(b.price.price).toBeNull();
    expect(b.label).toBe("Holo · © 1999-2000");
  });
});
