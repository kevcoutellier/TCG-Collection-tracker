import { describe, expect, it } from "vitest";
import { type EbayListing, filterListings, parseEbayItems } from "./ebay-model";
import { cardQuery, marketplaceLinks } from "./marketplaces";

describe("cardQuery", () => {
  it("ajoute le numéro imprimé quand il est connu", () => {
    expect(cardQuery({ name: "Dracaufeu ex", localId: "199", total: 165 })).toBe("Dracaufeu ex 199/165");
    expect(cardQuery({ name: "Pikachu", localId: "TG05", total: 30 })).toBe("Pikachu TG05");
    expect(cardQuery({ name: "Mew" })).toBe("Mew");
  });
});

describe("marketplaceLinks", () => {
  it("plafonne la recherche au prix visé, arrondi à l'euro supérieur", () => {
    const links = marketplaceLinks({ query: "Dracaufeu ex 199/165", name: "Dracaufeu ex", maxPrice: 119.2 });
    const byId = Object.fromEntries(links.map((l) => [l.id, l.href]));
    expect(byId.ebay).toContain("_udhi=120");
    expect(byId.ebay).toContain("_sop=15");
    expect(byId.vinted).toContain("price_to=120");
    expect(byId.vinted).toContain("search_text=Dracaufeu%20ex%20199%2F165");
    expect(byId.leboncoin).toContain("price=min-120");
    expect(byId.cardmarket).toContain("searchString=Dracaufeu%20ex");
    expect(byId.tcgplayer).toBeUndefined();
  });

  it("sans prix visé, trie seulement par prix ; TCGplayer si le produit est connu", () => {
    const links = marketplaceLinks({ query: "Mew", name: "Mew", tcgplayerId: 42 });
    expect(links.find((l) => l.id === "ebay")!.href).not.toContain("_udhi");
    expect(links.find((l) => l.id === "tcgplayer")!.href).toBe("https://www.tcgplayer.com/product/42");
  });
});

const listing = (title: string, total: number): EbayListing => ({
  id: title,
  title,
  total,
  itemPrice: total,
  shipping: 0,
  url: "https://www.ebay.fr/itm/1",
  image: null,
  condition: null,
  auction: false,
  endsAt: null,
  sellerFeedback: null,
  country: null,
});

describe("filterListings", () => {
  const listings = [
    listing("Dracaufeu ex 199/165 Pokémon 151 FR NM", 120),
    listing("Carte Pokémon Dracaufeu ex 199/165 PSA 10", 400),
    listing("Lot 10 cartes Pokémon 151 dont Dracaufeu", 30),
    listing("Dracaufeu ex 006/165 double rare", 8),
    listing("Dracaufeu ex gold metal card 199/165", 15),
    listing("Charizard ex SIR 151 japonais", 95),
  ];

  it("écarte lots, gradées, contrefaçons et numéros différents, puis trie par prix", () => {
    expect(filterListings(listings, { number: "199", total: 165 }).map((l) => l.total)).toEqual([95, 120]);
  });

  it("garde les gradées quand on les cherche", () => {
    expect(filterListings(listings, { number: "199", total: 165, graded: true }).map((l) => l.total)).toEqual([95, 120, 400]);
  });
});

describe("parseEbayItems", () => {
  it("lit prix, port et enchères en EUR et ignore les autres devises", () => {
    const res = parseEbayItems({
      itemSummaries: [
        {
          itemId: "v1|1|0",
          title: "Dracaufeu ex 199/165",
          price: { value: "110.00", currency: "EUR" },
          buyingOptions: ["FIXED_PRICE"],
          itemWebUrl: "https://www.ebay.fr/itm/1",
          image: { imageUrl: "https://i.ebayimg.com/1.jpg" },
          shippingOptions: [{ shippingCost: { value: "2.50", currency: "EUR" } }],
          seller: { feedbackPercentage: "99.8" },
        },
        {
          itemId: "v1|2|0",
          title: "Dracaufeu ex enchère",
          price: { value: "50.00", currency: "EUR" },
          currentBidPrice: { value: "61.00", currency: "EUR" },
          buyingOptions: ["AUCTION"],
          itemWebUrl: "https://www.ebay.fr/itm/2",
          itemEndDate: "2026-10-14T18:00:00.000Z",
        },
        { itemId: "v1|3|0", title: "Charizard", price: { value: "90", currency: "USD" }, itemWebUrl: "https://www.ebay.com/itm/3" },
      ],
    });
    expect(res).toHaveLength(2);
    expect(res[0]).toMatchObject({ total: 112.5, shipping: 2.5, sellerFeedback: 99.8, auction: false });
    expect(res[1]).toMatchObject({ total: 61, auction: true, endsAt: "2026-10-14T18:00:00.000Z", shipping: null });
  });

  it("tolère une réponse vide ou inattendue", () => {
    expect(parseEbayItems(null)).toEqual([]);
    expect(parseEbayItems({ total: 0 })).toEqual([]);
  });
});
