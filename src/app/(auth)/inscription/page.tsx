import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { SignupForm } from "@/components/forms/auth-forms";
import { safeRedirectPath } from "@/lib/auth/config";
import { getCurrentUser } from "@/lib/auth/session";
import { AuthCard, AuthFormSkeleton } from "../auth-card";

export const metadata: Metadata = { title: "Créer un compte" };

export default function SignupPage({ searchParams }: PageProps<"/inscription">) {
  return (
    <AuthCard title="Créer un compte" description="Votre collection, votre watchlist et vos analyses restent privées.">
      <Suspense fallback={<AuthFormSkeleton fields={3} />}>
        <SignupContent searchParams={searchParams} />
      </Suspense>
    </AuthCard>
  );
}

async function SignupContent({ searchParams }: Pick<PageProps<"/inscription">, "searchParams">) {
  const next = safeRedirectPath((await searchParams).next);
  if (await getCurrentUser()) redirect(next);
  return <SignupForm next={next} inviteRequired={Boolean(process.env.INVITE_CODE?.trim())} />;
}
