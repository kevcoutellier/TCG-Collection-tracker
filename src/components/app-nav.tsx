"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { PokeballIcon } from "@/components/card-image";
import { COLLECTION_NAV, INVESTMENT_NAV } from "@/components/nav-items";
import { cn } from "@/lib/utils";

function isActive(pathname: string | null, href: string) {
  if (!pathname) return false;
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`) || (href === "/recherche" && pathname.startsWith("/cartes"));
}

function NavGroup({ items, pathname }: { items: typeof COLLECTION_NAV | typeof INVESTMENT_NAV; pathname: string | null }) {
  return items.map(({ href, label, icon: Icon }) => {
    const active = isActive(pathname, href);
    return (
      <Link
        key={href}
        href={href}
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
  });
}

export function NavLinks({ pathname = null }: { pathname?: string | null }) {
  return (
    <nav className="grid gap-0.5">
      <NavGroup items={COLLECTION_NAV} pathname={pathname} />
      <div className="mt-5 mb-1 px-3 text-[11px] font-semibold tracking-widest text-muted-foreground uppercase">Investissement</div>
      <NavGroup items={INVESTMENT_NAV} pathname={pathname} />
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

/** Barre d'onglets fixée en bas de l'écran sur mobile, au-dessus de la barre d'accueil de l'iPhone. */
export function MobileTabBar() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Navigation principale"
      className="fixed inset-x-0 bottom-0 z-40 border-t bg-sidebar/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:hidden"
    >
      <div className="mx-auto grid max-w-lg grid-cols-5 px-1 pt-1.5 pb-1">
        {COLLECTION_NAV.map(({ href, label, icon: Icon }) => {
          const active = isActive(pathname, href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-lg text-[11px] font-medium text-muted-foreground transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                active && "text-foreground",
              )}
            >
              <Icon className={cn("size-5", active && "text-primary")} />
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
