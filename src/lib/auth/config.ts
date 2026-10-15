// Constantes d'authentification partagées par le proxy et le serveur (aucune dépendance Node ni base).

export const SESSION_COOKIE = "pokefolio_session";

/** Durée d'une session ; elle est prolongée tant que le compte est utilisé (voir lib/auth/session.ts). */
export const SESSION_TTL_DAYS = 30;

export const LOGIN_PATH = "/connexion";
export const SIGNUP_PATH = "/inscription";
/** Pages accessibles sans être connecté. */
export const AUTH_PAGES: readonly string[] = [LOGIN_PATH, SIGNUP_PATH];

export function sessionCookieOptions(expires: Date) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    expires,
  };
}

export function sessionExpiry(from = Date.now()) {
  return new Date(from + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);
}

/**
 * Destination après connexion : uniquement un chemin interne (« /collection?x=1 »), jamais un autre domaine
 * (« //evil.com », « /\evil.com ») ni une page de connexion (boucle).
 */
export function safeRedirectPath(next: unknown, fallback = "/"): string {
  if (typeof next !== "string" || !next.startsWith("/") || next.startsWith("//") || next.includes("\\")) return fallback;
  if (/[\u0000-\u001f\u007f]/.test(next)) return fallback;
  const pathname = next.split(/[?#]/, 1)[0];
  if (AUTH_PAGES.includes(pathname)) return fallback;
  return next;
}
