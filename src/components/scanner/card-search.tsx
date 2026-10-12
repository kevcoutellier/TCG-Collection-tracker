"use client";

import { Loader2, Search } from "lucide-react";
import { useState } from "react";
import { CardImage } from "@/components/card-image";
import { Input } from "@/components/ui/input";
import type { CardCandidate } from "@/lib/scan-model";
import type { Lang } from "@/lib/types";
import { useCardSearch } from "../use-card-search";

/** Recherche manuelle d'une carte pour corriger (ou compléter) une identification. */
export function CardSearch({ lang, initial = "", onPick }: { lang: Lang; initial?: string; onPick: (card: CardCandidate) => void }) {
  const [query, setQuery] = useState(initial);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { searching, results } = useCardSearch(query, lang);

  const pick = async (id: string) => {
    setLoadingId(id);
    setError(null);
    try {
      const res = await fetch(`/api/cards/${encodeURIComponent(id)}?lang=${lang}`);
      const data = (await res.json()) as { card?: CardCandidate; error?: string };
      if (!res.ok || !data.card) throw new Error(data.error ?? "Carte indisponible");
      onPick(data.card);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoadingId(null);
    }
  };

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Nom de la carte…"
          className="h-9 pl-8"
          aria-label="Rechercher la bonne carte"
        />
      </div>
      {error && <p className="text-xs text-loss">{error}</p>}
      {searching && (
        <div className="max-h-72 overflow-y-auto rounded-lg border">
          {results === undefined ? (
            <div className="flex items-center gap-2 px-3 py-3 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Recherche…
            </div>
          ) : !results?.length ? (
            <p className="px-3 py-3 text-sm text-muted-foreground">{results === null ? "Recherche indisponible." : "Aucune carte trouvée."}</p>
          ) : (
            <ul className="grid grid-cols-3 gap-2 p-2 sm:grid-cols-5">
              {results.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    disabled={loadingId != null}
                    onClick={() => pick(c.id)}
                    className="relative w-full rounded-lg p-1 text-left transition-colors hover:bg-accent disabled:opacity-60"
                  >
                    <CardImage src={c.image} alt={c.name} />
                    {loadingId === c.id && (
                      <span className="absolute inset-0 flex items-center justify-center">
                        <Loader2 className="size-5 animate-spin" />
                      </span>
                    )}
                    <span className="mt-1 block truncate text-[11px] font-medium">{c.name}</span>
                    <span className="block truncate text-[10px] text-muted-foreground">{c.id}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
