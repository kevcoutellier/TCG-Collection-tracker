"use client";

import { useEffect, useState } from "react";
import type { CardBrief, Lang } from "@/lib/types";

/**
 * Recherche de cartes par nom (avec délai de frappe) pour les sélecteurs.
 * `results` : undefined pendant la recherche, null si elle a échoué.
 */
export function useCardSearch(query: string, lang: Lang) {
  const [found, setFound] = useState<{ key: string; cards: CardBrief[] | null } | null>(null);
  const q = query.trim();
  const key = `${lang}|${q}`;

  useEffect(() => {
    if (q.length < 2) return;
    const timer = setTimeout(() => {
      fetch(`/api/cards?q=${encodeURIComponent(q)}&lang=${lang}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((d: { cards: CardBrief[] } | null) => setFound({ key: `${lang}|${q}`, cards: d?.cards ?? null }))
        .catch(() => setFound({ key: `${lang}|${q}`, cards: null }));
    }, 300);
    return () => clearTimeout(timer);
  }, [q, lang]);

  return { searching: q.length >= 2, results: found?.key === key ? found.cards : undefined };
}
