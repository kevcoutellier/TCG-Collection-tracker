import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchSetList } from "./tcgdex";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

/** Remplace `fetch` par ces réponses, dans l'ordre ; renvoie la liste des URL appelées. */
function stubFetch(responses: (Response | Error)[]) {
  const calls: string[] = [];
  vi.stubGlobal("fetch", async (url: string) => {
    calls.push(url);
    const next = responses.shift();
    if (!next || next instanceof Error) throw next ?? new Error("réponse non prévue");
    return next;
  });
  return calls;
}

const status = (code: number, headers?: Record<string, string>) => new Response(null, { status: code, headers });

describe("client TCGdex", () => {
  it("retente une indisponibilité passagère puis renvoie la réponse", async () => {
    vi.useFakeTimers();
    const calls = stubFetch([status(503), new TypeError("fetch failed"), Response.json([{ id: "sv01" }])]);
    const result = fetchSetList("en");
    await vi.runAllTimersAsync();
    expect(await result).toEqual([{ id: "sv01" }]);
    expect(calls).toEqual(Array(3).fill("https://api.tcgdex.net/v2/en/sets"));
  });

  it("abandonne après trois tentatives", async () => {
    vi.useFakeTimers();
    const calls = stubFetch([status(503), status(502), status(503)]);
    const result = expect(fetchSetList("en")).rejects.toThrow("TCGdex a répondu 503 pour /sets");
    await vi.runAllTimersAsync();
    await result;
    expect(calls).toHaveLength(3);
  });

  it("attend la durée demandée par Retry-After", async () => {
    vi.useFakeTimers();
    const calls = stubFetch([status(429, { "retry-after": "3" }), Response.json([])]);
    const result = fetchSetList("fr");
    await vi.advanceTimersByTimeAsync(2999);
    expect(calls).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(await result).toEqual([]);
    expect(calls).toHaveLength(2);
  });

  it("ne retente ni une absence (404) ni une erreur définitive", async () => {
    const calls = stubFetch([status(404), status(400)]);
    expect(await fetchSetList("ja")).toEqual([]);
    await expect(fetchSetList("ja")).rejects.toThrow("TCGdex a répondu 400 pour /sets");
    expect(calls).toHaveLength(2);
  });
});
