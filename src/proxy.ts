import { type NextRequest, NextResponse } from "next/server";
import { AUTH_PAGES, LOGIN_PATH, SESSION_COOKIE, sessionCookieOptions, sessionExpiry } from "@/lib/auth/config";

/**
 * Contrôle optimiste : sans cookie de session, on renvoie vers la connexion avant tout rendu.
 * La validité réelle de la session est vérifiée en base au plus près des données (lib/auth/session.ts).
 */
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (AUTH_PAGES.includes(pathname)) return NextResponse.next();

  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (!token) {
    if (pathname.startsWith("/api/")) return Response.json({ error: "Non authentifié" }, { status: 401 });
    const url = new URL(LOGIN_PATH, request.url);
    if (pathname !== "/") url.searchParams.set("next", `${pathname}${search}`);
    return NextResponse.redirect(url);
  }

  // Session glissante : chaque visite repousse l'expiration du cookie (pas sur les POST, où une action peut le modifier).
  const response = NextResponse.next();
  if (request.method === "GET") response.cookies.set(SESSION_COOKIE, token, sessionCookieOptions(sessionExpiry()));
  return response;
}

export const config = {
  // Exclus : le cron (protégé par CRON_SECRET), les fichiers statiques et les images.
  matcher: ["/((?!api/cron|_next/static|_next/image|favicon\\.ico|.*\\.(?:png|jpg|jpeg|gif|svg|webp|avif|ico|txt|xml)$).*)"],
};
