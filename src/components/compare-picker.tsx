"use client";

import { GitCompareArrows, Loader2, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { CardImage } from "@/components/card-image";
import { NativeSelect } from "@/components/native-select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  addCompareRef,
  COMPARE_STORAGE_KEY,
  type CompareRef,
  compareHref,
  formatCompareIds,
  MAX_COMPARE,
  parseCompareIds,
} from "@/lib/compare";
import type { Lang } from "@/lib/types";
import { useCardSearch } from "./use-card-search";

function readStored(): CompareRef[] {
  try {
    return parseCompareIds(localStorage.getItem(COMPARE_STORAGE_KEY));
  } catch {
    return [];
  }
}

function store(refs: readonly CompareRef[]) {
  try {
    localStorage.setItem(COMPARE_STORAGE_KEY, formatCompareIds(refs));
  } catch {
    // Stockage indisponible (navigation privée) : la sélection reste dans l'URL.
  }
}

/** Recherche de cartes à ajouter au comparateur. La sélection est mémorisée dans le navigateur. */
export function ComparePicker({ selected, explicit }: { selected: CompareRef[]; explicit: boolean }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [lang, setLang] = useState<Lang>("fr");
  const { searching, results } = useCardSearch(query, lang);
  const ids = formatCompareIds(selected);

  // Sans sélection dans l'URL, on reprend la dernière comparaison ; sinon on la mémorise.
  useEffect(() => {
    if (!explicit && !ids) {
      const saved = readStored();
      if (saved.length) router.replace(compareHref(saved));
      return;
    }
    store(parseCompareIds(ids));
  }, [ids, explicit, router]);


  return (
    <div className="space-y-2">
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1 sm:max-w-md">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Ajouter une carte : Dracaufeu, Noctali…"
            className="h-9 pl-8"
            aria-label="Rechercher une carte à comparer"
          />
        </div>
        <NativeSelect value={lang} onChange={(e) => setLang(e.target.value as Lang)} className="h-9 sm:w-40" aria-label="Langue des cartes">
          <option value="fr">Cartes FR</option>
          <option value="en">Cartes EN</option>
          <option value="ja">Cartes japonaises</option>
        </NativeSelect>
      </div>
      {selected.length >= MAX_COMPARE && searching && (
        <p className="text-xs text-muted-foreground">{MAX_COMPARE} cartes au maximum : la plus ancienne de la sélection sera remplacée.</p>
      )}
      {searching && (
        <div className="max-h-80 overflow-y-auto rounded-lg border bg-card">
          {results === undefined ? (
            <div className="flex items-center gap-2 px-3 py-4 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Recherche…
            </div>
          ) : results === null ? (
            <p className="px-3 py-4 text-sm text-muted-foreground">Recherche indisponible pour le moment.</p>
          ) : results.length ? (
            <ul className="grid grid-cols-2 gap-2 p-2 sm:grid-cols-4 lg:grid-cols-6">
              {results.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setQuery("");
                      router.push(compareHref(addCompareRef(selected, { id: c.id, lang })));
                    }}
                    className="w-full rounded-lg p-1.5 text-left transition-colors hover:bg-accent"
                  >
                    <CardImage src={c.image} alt={c.name} />
                    <span className="mt-1 block truncate text-xs font-medium">{c.name}</span>
                    <span className="block truncate text-[11px] text-muted-foreground">{c.id}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-3 py-4 text-sm text-muted-foreground">Aucune carte trouvée.</p>
          )}
        </div>
      )}
    </div>
  );
}

/** Ajoute la carte à la comparaison en cours (mémorisée dans le navigateur) et ouvre le comparateur. */
export function CompareButton({ id, lang }: { id: string; lang: Lang }) {
  const router = useRouter();
  return (
    <Button
      variant="outline"
      onClick={() => {
        const next = addCompareRef(readStored(), { id, lang });
        store(next);
        router.push(compareHref(next));
      }}
    >
      <GitCompareArrows />
      Comparer
    </Button>
  );
}
