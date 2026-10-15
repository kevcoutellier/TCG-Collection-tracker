import { eq, lt } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { cache } from "react";
import { getDb, schema } from "../db";
import { LOGIN_PATH, SESSION_COOKIE, SESSION_TTL_DAYS, sessionCookieOptions, sessionExpiry } from "./config";
import { newSessionToken, sessionIdFromToken } from "./crypto";

// Couche d'accès aux sessions : toute lecture ou écriture de données personnelles passe par `requireUser()`.
// Le proxy ne fait qu'un contrôle optimiste (présence du cookie) ; la vérification réelle est ici, en base.

export type User = { id: string; username: string };

const DAY_MS = 24 * 60 * 60 * 1000;

/** Ouvre une session et dépose son jeton dans le cookie (Server Action ou Route Handler uniquement). */
export async function createSession(userId: string) {
  const token = newSessionToken();
  const expiresAt = sessionExpiry();
  const db = await getDb();
  // Ménage au passage : les sessions expirées ne servent plus à rien.
  await db.delete(schema.sessions).where(lt(schema.sessions.expiresAt, new Date()));
  await db.insert(schema.sessions).values({ id: sessionIdFromToken(token), userId, expiresAt });
  (await cookies()).set(SESSION_COOKIE, token, sessionCookieOptions(expiresAt));
}

/** Ferme la session courante (Server Action ou Route Handler uniquement). */
export async function destroySession() {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) {
    const db = await getDb();
    await db.delete(schema.sessions).where(eq(schema.sessions.id, sessionIdFromToken(token)));
  }
  store.delete(SESSION_COOKIE);
}

async function validateToken(token: string): Promise<User | null> {
  const id = sessionIdFromToken(token);
  const db = await getDb();
  const [row] = await db
    .select({ id: schema.users.id, username: schema.users.username, expiresAt: schema.sessions.expiresAt })
    .from(schema.sessions)
    .innerJoin(schema.users, eq(schema.sessions.userId, schema.users.id))
    .where(eq(schema.sessions.id, id));
  if (!row) return null;

  const now = Date.now();
  const remaining = row.expiresAt.getTime() - now;
  if (remaining <= 0) {
    await db.delete(schema.sessions).where(eq(schema.sessions.id, id));
    return null;
  }
  // Session glissante : prolongée dès qu'elle a consommé la moitié de sa durée (le proxy prolonge le cookie).
  if (remaining < (SESSION_TTL_DAYS / 2) * DAY_MS) {
    await db.update(schema.sessions).set({ expiresAt: sessionExpiry(now) }).where(eq(schema.sessions.id, id));
  }
  return { id: row.id, username: row.username };
}

/** Utilisateur connecté, ou `null`. Mémorisé le temps d'une requête. */
export const getCurrentUser = cache(async (): Promise<User | null> => {
  // L'expiration dépend de l'heure : la session se vérifie à chaque requête, jamais pendant un prérendu.
  await connection();
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return token ? validateToken(token) : null;
});

/** Utilisateur connecté, sinon redirection vers la connexion. `redirect()` lève une exception : appeler hors d'un try/catch. */
export async function requireUser(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) redirect(LOGIN_PATH);
  return user;
}
