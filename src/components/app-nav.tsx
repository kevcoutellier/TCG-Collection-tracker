"use client";

import {
  BrainCircuit,
  Camera,
  Eye,
  GitCompareArrows,
  Layers,
  LayoutDashboard,
  Library,
  Menu,
  Radar,
  Search,
  TrendingUp,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { PokeballIcon } from "@/components/card-image";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

export const NAV = [
  { href: "/", label: "Tableau de bord", icon: LayoutDashboard },
  { href: "/collection", label: "Ma collection", icon: Layers },
  { href: "/scanner", label: "Scanner des cartes", icon: Camera },
  { href: "/watchlist", label: "Watchlist", icon: Eye },
  { href: "/opportunites", label: "Opportunités", icon: Radar },
  { href: "/analyse", label: "Analyse & stratégie", icon: BrainCircuit },
  { href: "/marche", label: "Marché", icon: TrendingUp },
  { href: "/comparateur", label: "Comparateur", icon: GitCompareArrows },
  { href: "/recherche", label: "Recherche", icon: Search },
  { href: "/sets", label: "Extensions", icon: Library },
] as const;

function isActive(pathname: string | null, href: string) {
  if (!pathname) return false;
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`) || (href === "/recherche" && pathname.startsWith("/cartes"));
}

export function NavLinks({ onNavigate, pathname = null }: { onNavigate?: () => void; pathname?: string | null }) {
  return (
    <nav className="grid gap-0.5">
      {NAV.map(({ href, label, icon: Icon }) => {
        const active = isActive(pathname, href);
        return (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-sidebar-foreground/75 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground",
              active && "bg-sidebar-accent font-medium text-sidebar-foreground",
            )}
          >
            <Icon className={cn("size-4", active && "text-primary")} />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

export function ActiveNavLinks() {
  return <NavLinks pathname={usePathname()} />;
}

export function Brand({ className }: { className?: string }) {
  return (
    <Link href="/" className={cn("flex items-center gap-2 font-semibold tracking-tight", className)}>
      <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
        <PokeballIcon className="size-5" />
      </span>
      <span className="text-base">
        Poké<span className="text-primary">Folio</span>
      </span>
    </Link>
  );
}

export function MobileNav() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger render={<Button variant="ghost" size="icon" className="lg:hidden" aria-label="Ouvrir le menu" />}>
        <Menu />
      </SheetTrigger>
      <SheetContent side="left" className="w-72 bg-sidebar p-4">
        <SheetTitle className="sr-only">Navigation</SheetTitle>
        <Brand className="mb-4 px-1" />
        <NavLinks pathname={pathname} onNavigate={() => setOpen(false)} />
      </SheetContent>
    </Sheet>
  );
}
