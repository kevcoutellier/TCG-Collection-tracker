import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { PokeballGate } from "@/components/gate/pokeball-gate";
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
          {children}
          <Toaster theme="dark" position="bottom-right" richColors />
        </TooltipProvider>
      </body>
    </html>
  );
}
