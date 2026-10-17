import Form from "next/form";
import { unstable_rethrow } from "next/navigation";
import { Search } from "lucide-react";
import { Suspense } from "react";
import { ActiveNavLinks, Brand, MobileTabBar, NavLinks } from "@/components/app-nav";
import { ReplayGateButton } from "@/components/gate/pokeball-gate";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { UserMenu } from "@/components/user-menu";
import { getCurrentUser, type User } from "@/lib/auth/session";

/** Habillage de l'application (navigation, recherche, compte) : réservé aux utilisateurs connectés. */
export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-dvh" data-app-shell>
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r bg-sidebar p-4 lg:flex">
        <Brand className="mb-6 px-1" />
        <Suspense fallback={<NavLinks />}>
          <ActiveNavLinks />
        </Suspense>
        <p className="mt-auto px-1 text-[11px] leading-relaxed text-muted-foreground">
          Prix Cardmarket (EUR) et TCGplayer (USD) via l&apos;API TCGdex, mis à jour quotidiennement. Les analyses ne
          constituent pas un conseil en investissement.
        </p>
        <ReplayGateButton className="mt-2 self-start px-1 text-[11px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline" />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* App installée sur iPhone : la barre d'état est transparente, l'en-tête passe dessous. */}
        <header className="sticky top-0 z-30 flex h-[calc(3.5rem+env(safe-area-inset-top))] items-center gap-2 border-b bg-background/80 px-4 pt-[env(safe-area-inset-top)] backdrop-blur-md lg:px-8">
          <Brand className="lg:hidden" />
          <Form action="/recherche" className="relative ml-auto w-full max-w-sm" role="search">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              name="q"
              placeholder="Rechercher une carte (Dracaufeu, Pikachu…)"
              aria-label="Rechercher une carte"
              className="h-9 pl-8"
              autoComplete="off"
            />
          </Form>
          {/* La session se lit à la requête : seul le menu de compte attend, le reste de la page s'affiche aussitôt. */}
          <Suspense fallback={<Skeleton className="size-9 shrink-0 rounded-full" />}>
            <CurrentUserMenu />
          </Suspense>
        </header>
        <main className="glow flex-1 px-4 pt-6 pb-[calc(5.5rem+env(safe-area-inset-bottom))] lg:px-8 lg:pt-8 lg:pb-16">
          <div className="mx-auto w-full max-w-7xl">{children}</div>
        </main>
      </div>
      <Suspense>
        <MobileTabBar />
      </Suspense>
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
