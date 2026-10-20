"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";

/** Image TCGdex sans extension (`…/logo`) → WebP ; une URL complète (logo pokemontcg.io) est gardée telle quelle. */
function imageUrl(src: string) {
  return /\.(?:png|jpe?g|webp|gif|svg)$/i.test(src) ? src : `${src}.webp`;
}

/**
 * Logo ou symbole d'une extension : la première image qui se charge parmi `sources` (dans l'ordre), sinon `fallback`
 * (le code de l'extension, une icône… ou rien).
 */
export function SetLogo({ sources, fallback = null }: { sources: { src?: string | null; className?: string }[]; fallback?: ReactNode }) {
  const images = sources.flatMap(({ src, className }) => (src ? [{ src: imageUrl(src), className }] : []));
  const [failed, setFailed] = useState(0);
  const current = images[failed];
  const img = useRef<HTMLImageElement>(null);

  // Image en échec avant l'hydratation : React n'a pas reçu l'événement `error`, on le constate ici.
  useEffect(() => {
    const el = img.current;
    if (el?.complete && el.naturalWidth === 0) setFailed((n) => n + 1);
  }, [current?.src]);

  if (!current) return fallback;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- logos distants (TCGdex, pokemontcg.io)
    <img
      ref={img}
      key={current.src}
      src={current.src}
      alt=""
      loading="lazy"
      decoding="async"
      onError={() => setFailed((n) => n + 1)}
      className={current.className}
    />
  );
}
