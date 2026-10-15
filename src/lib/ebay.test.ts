import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getFrenchSealedMarket } from "./ebay";
import type { PriceInfo } from "./types";

vi.mock("next/cache", () => ({ cacheLife: () => {} }));
vi.mock("./sealed", () => ({ getFrenchExpansionName: async () => "Évolutions Prismatiques" }));

const product = { name: "Prismatic Evolutions Elite Trainer Box", idExpansion: 1, price: { price: 130 } as PriceInfo };

const item = (title: string, value: string, currency = "EUR") => ({ title, price: { value, currency } });

function stubEbay(search: Response) {
  const fetchMock = vi.fn(async (url: string) =>
    url.includes("/oauth2/token") ? Response.json({ access_token: "tok", expires_in: 7200 }) : search,
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

beforeEach(() => {
  (globalThis as { __pokefolioEbayToken?: unknown }).__pokefolioEbayToken = undefined;
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("getFrenchSealedMarket", () => {
  it("sans clés eBay, donne seulement les liens", async () => {
    vi.stubEnv("EBAY_CLIENT_ID", "");
    const fetchMock = stubEbay(Response.json({}));
    const market = await getFrenchSealedMarket(product);
    expect(market?.summary).toBeNull();
    expect(market?.soldUrl).toContain("LH_Sold=1");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("interroge eBay.fr et résume les annonces en euros", async () => {
    vi.stubEnv("EBAY_CLIENT_ID", "id");
    vi.stubEnv("EBAY_CLIENT_SECRET", "secret");
    const fetchMock = stubEbay(
      Response.json({
        itemSummaries: [
          item("ETB Évolutions Prismatiques FR", "190.00"),
          item("ETB Évolutions Prismatiques FR", "200.00"),
          item("ETB Évolutions Prismatiques FR", "210.00"),
          item("ETB Évolutions Prismatiques FR", "150.00", "USD"),
        ],
      }),
    );
    const market = await getFrenchSealedMarket(product);
    expect(market?.summary).toEqual({ price: 200, low: 190, count: 3 });

    const [tokenUrl, tokenInit] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(tokenUrl).toBe("https://api.ebay.com/identity/v1/oauth2/token");
    expect((tokenInit.headers as Record<string, string>).authorization).toBe(`Basic ${btoa("id:secret")}`);

    const [searchUrl, searchInit] = fetchMock.mock.calls[1] as unknown as [string, RequestInit];
    const url = new URL(searchUrl);
    expect(url.pathname).toBe("/buy/browse/v1/item_summary/search");
    expect(url.searchParams.get("q")).toBe("Évolutions Prismatiques (etb, elite, élite)");
    expect(url.searchParams.get("filter")).toBe("buyingOptions:{FIXED_PRICE},conditions:{NEW},itemLocationCountry:FR");
    expect(searchInit.headers).toMatchObject({ authorization: "Bearer tok", "x-ebay-c-marketplace-id": "EBAY_FR" });
  });

  it("se replie sans cote en cas d'erreur eBay", async () => {
    vi.stubEnv("EBAY_CLIENT_ID", "id");
    vi.stubEnv("EBAY_CLIENT_SECRET", "secret");
    vi.spyOn(console, "warn").mockImplementation(() => {});
    stubEbay(new Response("quota", { status: 429 }));
    const market = await getFrenchSealedMarket(product);
    expect(market?.summary).toBeNull();
    expect(market?.url).toContain("ebay.fr");
  });
});
