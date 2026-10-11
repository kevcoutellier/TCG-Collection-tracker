import type { Metadata, Viewport } from "next";
import Form from "next/form";
import { Geist, Geist_Mono } from "next/font/google";
import { Search } from "lucide-react";
import { Suspense } from "react";
import { ActiveNavLinks, Brand, MobileNav, NavLinks } from "@/components/app-nav";
import { PokeballGate, ReplayGateButton } from "@/components/gate/pokeball-gate";
import { Input } from "@/components/ui/input";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "PokéFolio — Collection & investissement Pokémon TCG", template: "%s · PokéFolio" },
  description:
    "Suivez la valeur de votre collection Pokémon TCG, l'évolution des prix Cardmarket et TCGplayer, et analysez vos investissements.",
};

// Exécuté avant le premier rendu : masque la gate si elle a déjà été vue dans la session (`?intro` force l'affichage).
const GATE_SCRIPT = `try{var d=document.documentElement,s=sessionStorage.getItem("pokefolio:gate");d.dataset.gate=s&&!/[?&]intro\\b/.test(location.search)?"off":"on"}catch(e){document.documentElement.dataset.gate="off"}`;

export const viewport: Viewport = { themeColor: "#14161f", colorScheme: "dark" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="fr"
      className={`dark ${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-dvh">
        <script dangerouslySetInnerHTML={{ __html: GATE_SCRIPT }} />
        <noscript>
          <style>{".pg-root{display:none}"}</style>
        </noscript>
        <PokeballGate />
        <TooltipProvider>
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
              <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b bg-background/80 px-4 backdrop-blur-md lg:px-8">
                <Suspense>
                  <MobileNav />
                </Suspense>
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
              </header>
              <main className="glow flex-1 px-4 pt-6 pb-16 lg:px-8 lg:pt-8">
                <div className="mx-auto w-full max-w-7xl">{children}</div>
              </main>
            </div>
          </div>
          <Toaster theme="dark" position="bottom-right" richColors />
        </TooltipProvider>
      </body>
    </html>
  );
}
