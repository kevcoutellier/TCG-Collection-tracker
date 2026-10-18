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
    <div className={cn("holo @container relative aspect-[63/88] overflow-hidden rounded-[4.5%/3.2%] bg-muted", className)}>
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
        <div className="flex size-full flex-col items-center justify-center gap-2 p-[8%] text-center text-muted-foreground">
          <PokeballIcon className="size-1/2 max-w-8 opacity-40" />
          <span className="hidden text-[11px] leading-tight @[96px]:line-clamp-3">{alt}</span>
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

/** Poké Ball pleine (logo) : moitié haute rouge, moitié basse blanche, bande et bouton sombres. */
export function PokeballMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <circle cx="16" cy="16" r="14.5" fill="#fff" />
      <path d="M1.5 16a14.5 14.5 0 0 1 29 0z" className="fill-primary" />
      <path d="M1.5 16h29" className="stroke-foreground" strokeWidth="3" />
      <circle cx="16" cy="16" r="14.5" fill="none" className="stroke-foreground" strokeWidth="2.2" />
      <circle cx="16" cy="16" r="4.6" fill="#fff" className="stroke-foreground" strokeWidth="2.4" />
    </svg>
  );
}
