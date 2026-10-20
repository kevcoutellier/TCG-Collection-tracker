import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { type ChecklistFilter, SetChecklist } from "@/components/checklist/set-checklist";
import { SetLogo } from "@/components/set-logo";
import { Skeleton } from "@/components/ui/skeleton";
import { requireUser } from "@/lib/auth/session";
import { getSetChecklist } from "@/lib/catalog";
import { loadSetItems } from "@/lib/collection-db";
import { dateText } from "@/lib/format";
import { JA_SERIES_LABELS } from "@/lib/japan";
import { parseLang } from "@/lib/types";

export const metadata: Metadata = { title: "Extension" };

export default function SetPage({ params, searchParams }: PageProps<"/sets/[id]">) {
  return (
    <Suspense fallback={<SetSkeleton />}>
      <SetContent params={params} searchParams={searchParams} />
    </Suspense>
  );
}

function first(v: string | string[] | undefined) {
  return (Array.isArray(v) ? v[0] : v) ?? "";
}

/** `?vue=manquantes` ou `?vue=possedees` : ouvre la checklist déjà filtrée (lien « cartes manquantes » de l'accueil). */
const VIEWS: Record<string, ChecklistFilter> = { manquantes: "missing", possedees: "owned" };

async function SetContent({ params, searchParams }: Pick<PageProps<"/sets/[id]">, "params" | "searchParams">) {
  const [{ id: rawId }, sp] = await Promise.all([params, searchParams]);
  const id = decodeURIComponent(rawId);
  // Catalogue international (servi en français) ou japonais : les ID de cartes diffèrent entre les deux.
  const lang = parseLang(first(sp.lang)) === "ja" ? "ja" : "fr";

  const [checklist, user] = await Promise.all([getSetChecklist(id, lang), requireUser()]);
  if (!checklist) notFound();
  const { set, englishName, cards } = checklist;
  const items = await loadSetItems(user.id, set.id);
  const official = set.cardCount.official || cards.length;
  const secret = Math.max(0, cards.length - official);

  return (
    <>
      <header className="flex items-center gap-4 pb-5 sm:gap-6">
        {(set.logo || set.symbol) && (
          <div className="flex h-20 w-28 shrink-0 items-center justify-center rounded-xl border bg-card p-2 shadow-sm sm:h-24 sm:w-44">
            <SetLogo
              sources={[
                { src: set.logo, className: "max-h-full max-w-full object-contain" },
                { src: set.symbol, className: "size-12 object-contain" },
              ]}
              fallback={
                <span className="text-sm font-bold tracking-wide text-muted-foreground">{lang === "ja" ? set.id : set.id.toUpperCase()}</span>
              }
            />
          </div>
        )}
        <div className="min-w-0">
          <div className="text-xs font-semibold tracking-widest text-primary uppercase">
            {lang === "ja" ? `Japon · ${JA_SERIES_LABELS[set.serie.id] ?? set.serie.name}` : set.serie.name}
          </div>
          <h1 className="mt-0.5 text-2xl font-bold tracking-tight text-balance sm:text-3xl">{englishName ?? set.name}</h1>
          <p className="mt-1 text-sm text-muted-foreground text-pretty">
            {englishName && <span className="mr-1 text-foreground">{set.name} ·</span>}
            Sortie le {dateText(set.releaseDate)} · {official} cartes{secret ? ` + ${secret} secrètes` : ""}
          </p>
        </div>
      </header>
      <SetChecklist
        setId={set.id}
        cards={cards}
        initialItems={items}
        official={official}
        lang={lang}
        initialFilter={VIEWS[first(sp.vue)] ?? "all"}
      />
    </>
  );
}

function SetSkeleton() {
  return (
    <div className="space-y-5">
      <Skeleton className="h-10 w-72" />
      <Skeleton className="h-40 rounded-xl" />
      <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8">
        {Array.from({ length: 12 }, (_, i) => (
          <Skeleton key={i} className="aspect-[63/88] rounded-lg" />
        ))}
      </div>
    </div>
  );
}
