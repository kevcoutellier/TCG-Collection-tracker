import { BrainCircuit, Eye, House, Layers, LayoutDashboard, Library, Search, TrendingUp, UserRound } from "lucide-react";

// Entrées de navigation, partagées par la barre latérale, la barre d'onglets mobile et la page Profil.
// Module sans « use client » : un composant serveur peut le lire.

export const COLLECTION_NAV = [
  { href: "/", label: "Accueil", icon: House },
  { href: "/sets", label: "Extensions", icon: Library },
  { href: "/recherche", label: "Rechercher", icon: Search },
  { href: "/profil", label: "Profil", icon: UserRound },
] as const;

/** Suivi des achats et de la valeur : accessible depuis la barre latérale et le profil. */
export const INVESTMENT_NAV = [
  { href: "/tableau-de-bord", label: "Tableau de bord", icon: LayoutDashboard },
  { href: "/collection", label: "Portefeuille", icon: Layers },
  { href: "/watchlist", label: "Watchlist", icon: Eye },
  { href: "/analyse", label: "Analyse & stratégie", icon: BrainCircuit },
  { href: "/marche", label: "Marché", icon: TrendingUp },
] as const;
