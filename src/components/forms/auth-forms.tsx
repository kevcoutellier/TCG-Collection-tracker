"use client";

import { Loader2, LogIn, UserPlus } from "lucide-react";
import Link from "next/link";
import { useActionState } from "react";
import { type AuthState, login, signup } from "@/app/auth-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LOGIN_PATH, SIGNUP_PATH } from "@/lib/auth/config";
import { Field } from "./field";

/** Conserve la page demandée au départ quand on bascule entre connexion et inscription. */
const withNext = (path: string, next: string) => (next === "/" ? path : `${path}?next=${encodeURIComponent(next)}`);

function FormError({ state }: { state: AuthState }) {
  if (!state) return null;
  return (
    <p role="alert" className="rounded-lg border border-loss/30 bg-loss/10 px-3 py-2 text-sm text-loss">
      {state.message}
    </p>
  );
}

function SwitchLink({ question, label, href }: { question: string; label: string; href: string }) {
  return (
    <p className="text-center text-sm text-muted-foreground">
      {question}{" "}
      <Link href={href} className="font-medium text-foreground underline-offset-4 hover:underline">
        {label}
      </Link>
    </p>
  );
}

export function LoginForm({ next }: { next: string }) {
  const [state, formAction, pending] = useActionState(login, null);
  return (
    <form action={formAction} className="grid gap-4">
      <input type="hidden" name="next" value={next} />
      <Field label="Pseudo" htmlFor="login-username">
        <Input
          id="login-username"
          name="username"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          maxLength={32}
          defaultValue={state?.username}
          required
        />
      </Field>
      <Field label="Mot de passe" htmlFor="login-password">
        <Input id="login-password" name="password" type="password" autoComplete="current-password" maxLength={128} required />
      </Field>
      <FormError state={state} />
      <Button type="submit" size="lg" disabled={pending}>
        {pending ? <Loader2 className="animate-spin" /> : <LogIn />}
        Se connecter
      </Button>
      <SwitchLink question="Pas encore de compte ?" label="Créer un compte" href={withNext(SIGNUP_PATH, next)} />
    </form>
  );
}

export function SignupForm({ next, inviteRequired }: { next: string; inviteRequired: boolean }) {
  const [state, formAction, pending] = useActionState(signup, null);
  return (
    <form action={formAction} className="grid gap-4">
      <input type="hidden" name="next" value={next} />
      <Field label="Pseudo" htmlFor="signup-username" hint="3 à 32 caractères : lettres sans accent, chiffres, point, tiret ou tiret bas.">
        <Input
          id="signup-username"
          name="username"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          minLength={3}
          maxLength={32}
          defaultValue={state?.username}
          required
        />
      </Field>
      <Field label="Mot de passe" htmlFor="signup-password" hint="8 caractères minimum.">
        <Input id="signup-password" name="password" type="password" autoComplete="new-password" minLength={8} maxLength={128} required />
      </Field>
      <Field label="Confirmer le mot de passe" htmlFor="signup-confirm">
        <Input id="signup-confirm" name="confirm" type="password" autoComplete="new-password" minLength={8} maxLength={128} required />
      </Field>
      {inviteRequired && (
        <Field label="Code d'invitation" htmlFor="signup-invite" hint="Demandez-le à la personne qui vous a partagé l'application.">
          <Input id="signup-invite" name="inviteCode" autoComplete="off" autoCapitalize="none" spellCheck={false} required />
        </Field>
      )}
      <FormError state={state} />
      <Button type="submit" size="lg" disabled={pending}>
        {pending ? <Loader2 className="animate-spin" /> : <UserPlus />}
        Créer mon compte
      </Button>
      <SwitchLink question="Déjà inscrit ?" label="Se connecter" href={withNext(LOGIN_PATH, next)} />
    </form>
  );
}
