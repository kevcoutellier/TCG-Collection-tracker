import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { PokeballGate } from "@/components/gate/pokeball-gate";
import { ServiceWorkerRegistration } from "@/components/offline";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "PokéFolio — Collection Pokémon TCG", template: "%s · PokéFolio" },
  description:
    "Cochez vos cartes Pokémon TCG extension par extension, suivez votre avancement et la cote Cardmarket de votre collection.",
  applicationName: "PokéFolio",
  // Installée sur l'écran d'accueil d'un iPhone : plein écran, barre d'état fondue dans l'en-tête.
  appleWebApp: { capable: true, title: "PokéFolio", statusBarStyle: "black-translucent" },
  icons: { icon: "/favicon.ico", apple: "/apple-touch-icon.png" },
  formatDetection: { telephone: false },
};

// Exécuté avant le premier rendu : masque la gate si elle a déjà été vue dans la session (`?intro` force l'affichage).
const GATE_SCRIPT = `try{var d=document.documentElement,s=sessionStorage.getItem("pokefolio:gate");d.dataset.gate=s&&!/[?&]intro\\b/.test(location.search)?"off":"on"}catch(e){document.documentElement.dataset.gate="off"}`;

// `viewportFit: "cover"` : la page occupe tout l'écran (encoche, barre d'accueil) ; les marges
// `env(safe-area-inset-*)` de l'en-tête et de la barre d'onglets gardent le contenu lisible.
export const viewport: Viewport = { themeColor: "#14161f", colorScheme: "dark", viewportFit: "cover" };

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
        <ServiceWorkerRegistration />
        <TooltipProvider>
          {children}
          <Toaster
            theme="dark"
            position="bottom-right"
            richColors
            mobileOffset={{ bottom: "calc(4.5rem + env(safe-area-inset-bottom))" }}
          />
        </TooltipProvider>
      </body>
    </html>
  );
}
