import Link from "next/link";
import type { ReactNode } from "react";
import { eur } from "@/lib/format";
import type { Lang } from "@/lib/types";
import { CardImage } from "./card-image";
import { Delta } from "./delta";

export function cardHref(id: string, lang: Lang = "fr") {
  return `/cartes/${encodeURIComponent(id)}${lang !== "fr" ? `?lang=${lang}` : ""}`;
}

export function setHref(id: string, lang: Lang = "fr") {
  return `/sets/${encodeURIComponent(id)}${lang !== "fr" ? `?lang=${lang}` : ""}`;
}

/** Vignette de carte : visuel, nom, extension, prix tendance et variation vs moyenne 30 j. */
export function CardTile({
  id,
  name,
  image,
  setName,
  rarity,
  price,
  vs30,
  lang = "fr",
  badge,
  variantCount,
}: {
  id: string;
  name: string;
  image?: string | null;
  setName?: string | null;
  rarity?: string | null;
  price?: number | null;
  vs30?: number | null;
  lang?: Lang;
  badge?: ReactNode;
  /** Nombre de variantes (1re édition, reverse…) : chacune a sa fiche de prix. */
  variantCount?: number;
}) {
  return (
    <Link
      href={cardHref(id, lang)}
      className="group flex flex-col rounded-xl border bg-card p-2.5 transition-colors hover:border-primary/40 hover:bg-accent/40 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
    >
      <div className="relative">
        <CardImage src={image} alt={name} className="transition-transform duration-300 group-hover:-translate-y-0.5" />
        {badge && <div className="absolute top-1.5 left-1.5 z-10">{badge}</div>}
        {variantCount != null && variantCount > 1 && (
          <span className="absolute right-1.5 bottom-1.5 z-10 rounded-md bg-black/70 px-1.5 py-0.5 text-[10px] font-medium text-white backdrop-blur">
            {variantCount} variantes
          </span>
        )}
      </div>
      <div className="mt-2.5 flex min-w-0 flex-1 flex-col px-0.5">
        <div className="truncate text-sm font-medium">{name}</div>
        <div className="truncate text-xs text-muted-foreground">
          {setName}
          {rarity && setName ? " · " : ""}
          {rarity}
        </div>
        <div className="mt-auto flex items-baseline justify-between gap-2 pt-2">
          <span className="num text-base font-semibold">{eur(price)}</span>
          {vs30 !== undefined && <Delta value={vs30} className="text-xs" />}
        </div>
      </div>
    </Link>
  );
}

export function CardGrid({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">{children}</div>;
}
