import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { LoginForm } from "@/components/forms/auth-forms";
import { safeRedirectPath } from "@/lib/auth/config";
import { getCurrentUser } from "@/lib/auth/session";
import { AuthCard, AuthFormSkeleton } from "../auth-card";

export const metadata: Metadata = { title: "Connexion" };

export default function LoginPage({ searchParams }: PageProps<"/connexion">) {
  return (
    <AuthCard title="Connexion" description="Retrouvez votre collection, votre watchlist et vos analyses.">
      <Suspense fallback={<AuthFormSkeleton fields={2} />}>
        <LoginContent searchParams={searchParams} />
      </Suspense>
    </AuthCard>
  );
}

async function LoginContent({ searchParams }: Pick<PageProps<"/connexion">, "searchParams">) {
  const next = safeRedirectPath((await searchParams).next);
  // Déjà connecté (session valide en base, pas seulement un cookie présent) : direction l'app.
  if (await getCurrentUser()) redirect(next);
  return <LoginForm next={next} />;
}
