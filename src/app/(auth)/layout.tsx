import { Brand } from "@/components/app-nav";
import { ClearOfflinePages } from "@/components/offline";

/** Pages de connexion et d'inscription : un formulaire centré, sans la navigation de l'app. */
export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="glow flex min-h-dvh flex-col items-center justify-center px-4 py-12" data-app-shell>
      <ClearOfflinePages />
      <Brand className="mb-8" />
      <div className="w-full max-w-sm">{children}</div>
      <p className="mt-8 max-w-sm text-center text-[11px] leading-relaxed text-muted-foreground">
        Chaque compte a sa propre collection et sa propre watchlist. Prix Cardmarket (EUR) et TCGplayer (USD) via
        l&apos;API TCGdex.
      </p>
    </div>
  );
}
