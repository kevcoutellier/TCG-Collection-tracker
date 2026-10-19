import Form from "next/form";
import { unstable_rethrow } from "next/navigation";
import { Search } from "lucide-react";
import { type CSSProperties, Suspense } from "react";
import { ActiveNavLinks, Brand, MobileTabBar, NavLinks } from "@/components/app-nav";
import { ReplayGateButton } from "@/components/gate/pokeball-gate";
import { OfflineBanner } from "@/components/offline";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { UserMenu } from "@/components/user-menu";
import { getCurrentUser, type User } from "@/lib/auth/session";

/** Hauteur de l'en-tête rouge (barre de 3,5 rem + liseré sombre de 3 px), sous la barre d'état de l'iPhone. */
const HEADER = "calc(3.5rem + 3px + env(safe-area-inset-top))";

/** Habillage de l'application (navigation, recherche, compte) : réservé aux utilisateurs connectés. */
export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-dvh flex-col" data-app-shell style={{ "--header": HEADER } as CSSProperties}>
      {/* En-tête rouge et liseré sombre, comme le haut d'une Poké Ball. App installée sur iPhone : la barre
          d'état est transparente, l'en-tête passe dessous. */}
      <header className="sticky top-0 z-30 border-b-[3px] border-foreground bg-primary pt-[env(safe-area-inset-top)] text-primary-foreground shadow-md">
        <div className="flex h-14 items-center gap-3 px-4 lg:px-6">
          <Brand inverse className="shrink-0" />
          {/* Sur mobile, la recherche a son onglet : l'en-tête reste épuré. */}
          <Form action="/recherche" className="relative ml-auto hidden w-full max-w-md sm:block" role="search">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              name="q"
              placeholder="Rechercher une carte (Dracaufeu, Pikachu…)"
              aria-label="Rechercher une carte"
              className="h-10 rounded-full border-transparent bg-white pl-9 text-foreground shadow-sm placeholder:text-muted-foreground focus-visible:border-transparent focus-visible:ring-white/50"
              autoComplete="off"
            />
          </Form>
          {/* La session se lit à la requête : seul le menu de compte attend, le reste de la page s'affiche aussitôt. */}
          <div className="ml-auto sm:ml-0">
            <Suspense fallback={<Skeleton className="size-9 shrink-0 rounded-full bg-white/30" />}>
              <CurrentUserMenu />
            </Suspense>
          </div>
        </div>
      </header>

      <div className="flex flex-1">
        <aside className="sticky top-(--header) hidden h-[calc(100dvh-var(--header))] w-60 shrink-0 flex-col border-r bg-sidebar p-4 lg:flex">
          <Suspense fallback={<NavLinks />}>
            <ActiveNavLinks />
          </Suspense>
          <p className="mt-auto px-1 text-[11px] leading-relaxed text-muted-foreground">
            Prix Cardmarket (EUR) et TCGplayer (USD) via l&apos;API TCGdex, mis à jour quotidiennement. Les analyses ne
            constituent pas un conseil en investissement.
          </p>
          <ReplayGateButton className="mt-2 self-start px-1 text-[11px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline" />
        </aside>
        <main className="glow min-w-0 flex-1 px-4 pt-5 pb-[calc(5.5rem+env(safe-area-inset-bottom))] lg:px-8 lg:pt-8 lg:pb-16">
          <div className="mx-auto w-full max-w-7xl">{children}</div>
        </main>
      </div>
      <Suspense>
        <MobileTabBar />
      </Suspense>
      <OfflineBanner />
    </div>
  );
}

async function CurrentUserMenu() {
  let user: User | null = null;
  try {
    user = await getCurrentUser();
  } catch (e) {
    // Une erreur levée dans un layout échappe à son error.tsx : base indisponible → on masque le menu,
    // et la page affiche sa propre erreur.
    unstable_rethrow(e);
    console.error(e);
  }
  return user ? <UserMenu username={user.username} /> : null;
}
