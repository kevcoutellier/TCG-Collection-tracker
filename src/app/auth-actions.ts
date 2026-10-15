"use server";

import { eq, isNull } from "drizzle-orm";
import { redirect } from "next/navigation";
import { z } from "zod";
import { LOGIN_PATH, safeRedirectPath } from "@/lib/auth/config";
import { DUMMY_PASSWORD_HASH, hashPassword, secretsMatch, verifyPassword } from "@/lib/auth/crypto";
import { createSession, destroySession } from "@/lib/auth/session";
import { getDb, schema } from "@/lib/db";

/** Message d'erreur à afficher, et pseudo saisi pour le remettre dans le formulaire. */
export type AuthState = { message: string; username?: string } | null;

const loginSchema = z.object({
  username: z.string().trim().toLowerCase().min(1, "Pseudo requis").max(32, "Pseudo ou mot de passe incorrect"),
  password: z.string().min(1, "Mot de passe requis").max(128, "Pseudo ou mot de passe incorrect"),
});

const signupSchema = z
  .object({
    username: z
      .string()
      .trim()
      .toLowerCase()
      .min(3, "Pseudo : 3 caractères minimum")
      .max(32, "Pseudo : 32 caractères maximum")
      .regex(/^[a-z0-9._-]+$/, "Pseudo : lettres sans accent, chiffres, point, tiret ou tiret bas uniquement"),
    password: z.string().min(8, "Mot de passe : 8 caractères minimum").max(128, "Mot de passe : 128 caractères maximum"),
    confirm: z.string(),
  })
  .refine((d) => d.password === d.confirm, { message: "Les deux mots de passe ne correspondent pas" });

const text = (v: FormDataEntryValue | undefined) => (typeof v === "string" ? v.trim().toLowerCase() : undefined);

const UNEXPECTED = "Une erreur est survenue, réessayez.";

export async function login(_: AuthState, formData: FormData): Promise<AuthState> {
  const raw = Object.fromEntries(formData);
  const parsed = loginSchema.safeParse(raw);
  if (!parsed.success) return { message: parsed.error.issues[0]?.message ?? "Données invalides", username: text(raw.username) };
  const { username, password } = parsed.data;

  try {
    const db = await getDb();
    const [user] = await db
      .select({ id: schema.users.id, passwordHash: schema.users.passwordHash })
      .from(schema.users)
      .where(eq(schema.users.username, username));
    // Pseudo inconnu : on calcule quand même une empreinte pour ne pas révéler les comptes existants.
    const valid = await verifyPassword(password, user?.passwordHash ?? DUMMY_PASSWORD_HASH);
    if (!user || !valid) return { message: "Pseudo ou mot de passe incorrect", username };
    await createSession(user.id);
  } catch (e) {
    console.error(e);
    return { message: UNEXPECTED, username };
  }
  redirect(safeRedirectPath(raw.next));
}

export async function signup(_: AuthState, formData: FormData): Promise<AuthState> {
  const raw = Object.fromEntries(formData);
  const parsed = signupSchema.safeParse(raw);
  if (!parsed.success) return { message: parsed.error.issues[0]?.message ?? "Données invalides", username: text(raw.username) };
  const { username, password } = parsed.data;

  // Code d'invitation facultatif : s'il est défini, seuls ceux qui le connaissent peuvent créer un compte.
  const invite = process.env.INVITE_CODE?.trim();
  if (invite && !secretsMatch(typeof raw.inviteCode === "string" ? raw.inviteCode.trim() : "", invite)) {
    return { message: "Code d'invitation incorrect", username };
  }

  try {
    const db = await getDb();
    const [user] = await db
      .insert(schema.users)
      .values({ username, passwordHash: await hashPassword(password) })
      .onConflictDoNothing({ target: schema.users.username })
      .returning({ id: schema.users.id });
    if (!user) return { message: "Ce pseudo est déjà pris", username };
    await claimLegacyData(user.id);
    await createSession(user.id);
  } catch (e) {
    console.error(e);
    return { message: UNEXPECTED, username };
  }
  redirect(safeRedirectPath(raw.next));
}

export async function logout() {
  await destroySession();
  redirect(LOGIN_PATH);
}

/**
 * La collection et la watchlist saisies avant l'arrivée des comptes reviennent au tout premier compte créé.
 * Le verrou dans `app_meta` garantit qu'un seul compte les récupère, même en cas d'inscriptions simultanées.
 */
async function claimLegacyData(userId: string) {
  const db = await getDb();
  const [claimed] = await db
    .insert(schema.appMeta)
    .values({ key: "legacyOwner", value: userId })
    .onConflictDoNothing()
    .returning();
  if (!claimed) return;
  await db.update(schema.holdings).set({ userId }).where(isNull(schema.holdings.userId));
  await db.update(schema.watchlist).set({ userId }).where(isNull(schema.watchlist.userId));
}
