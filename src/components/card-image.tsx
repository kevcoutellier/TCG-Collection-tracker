"use client";

import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";

const TCGDEX_ASSETS = "https://assets.tcgdex.net/";

/**
 * Visuel de carte. Pour une image TCGdex on essaie la version française puis anglaise
 * (certaines cartes FR n'ont pas encore de scan), sinon on affiche un emplacement neutre.
 */
export function CardImage({
  src,
  alt,
  quality = "low",
  className,
}: {
  src?: string | null;
  alt: string;
  quality?: "low" | "high";
  className?: string;
}) {
  const candidates = useMemo(() => {
    if (!src) return [];
    if (!src.startsWith(TCGDEX_ASSETS)) return [src];
    const list = [`${src}/${quality}.webp`];
    if (src.includes("/fr/")) list.push(`${src.replace("/fr/", "/en/")}/${quality}.webp`);
    return list;
  }, [src, quality]);
  const [attempt, setAttempt] = useState(0);
  const current = candidates[attempt];

  return (
    <div className={cn("holo relative aspect-[63/88] overflow-hidden rounded-[4.5%/3.2%] bg-muted", className)}>
      {current ? (
        // eslint-disable-next-line @next/next/no-img-element -- images distantes TCGdex déjà optimisées en WebP
        <img
          key={current}
          src={current}
          alt={alt}
          loading="lazy"
          decoding="async"
          onError={() => setAttempt((a) => a + 1)}
          className="size-full object-cover"
        />
      ) : (
        <div className="flex size-full flex-col items-center justify-center gap-2 p-3 text-center text-muted-foreground">
          <PokeballIcon className="size-8 opacity-40" />
          <span className="line-clamp-3 text-[11px] leading-tight">{alt}</span>
        </div>
      )}
    </div>
  );
}

export function PokeballIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className} aria-hidden>
      <circle cx="12" cy="12" r="9.5" />
      <path d="M2.5 12h6.5M15 12h6.5" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}
