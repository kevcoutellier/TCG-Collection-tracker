import { createHash, randomBytes, scrypt, timingSafeEqual } from "node:crypto";

// Primitives d'authentification sans dépendance externe : tout repose sur node:crypto.

/** Paramètres scrypt recommandés par l'OWASP (N = 2^17, r = 8, p = 1), soit 128 Mio par calcul. */
const SCRYPT = { ln: 17, r: 8, p: 1 };
const KEY_LENGTH = 32;

function deriveKey(password: string, salt: Buffer, ln: number, r: number, p: number): Promise<Buffer> {
  const N = 2 ** ln;
  return new Promise((resolve, reject) =>
    scrypt(password.normalize("NFKC"), salt, KEY_LENGTH, { N, r, p, maxmem: 256 * N * r }, (err, key) =>
      err ? reject(err) : resolve(key),
    ),
  );
}

/** Empreinte au format `scrypt$ln=17,r=8,p=1$<sel>$<clé>` : les paramètres voyagent avec elle. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await deriveKey(password, salt, SCRYPT.ln, SCRYPT.r, SCRYPT.p);
  return `scrypt$ln=${SCRYPT.ln},r=${SCRYPT.r},p=${SCRYPT.p}$${salt.toString("base64url")}$${key.toString("base64url")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const match = /^scrypt\$ln=(\d+),r=(\d+),p=(\d+)\$([\w-]+)\$([\w-]+)$/.exec(stored);
  if (!match) return false;
  const [, ln, r, p, salt, expected] = match;
  // Bornes : une empreinte corrompue ne doit pas pouvoir réclamer un calcul démesuré.
  if (+ln < 10 || +ln > 18 || +r < 1 || +r > 16 || +p < 1 || +p > 4) return false;
  const want = Buffer.from(expected, "base64url");
  const key = await deriveKey(password, Buffer.from(salt, "base64url"), +ln, +r, +p);
  return key.length === want.length && timingSafeEqual(key, want);
}

/** Empreinte de référence pour les pseudos inconnus : la réponse prend le même temps qu'un vrai essai. */
export const DUMMY_PASSWORD_HASH = `scrypt$ln=${SCRYPT.ln},r=${SCRYPT.r},p=${SCRYPT.p}$AAAAAAAAAAAAAAAAAAAAAA$${"A".repeat(43)}`;

/** Jeton de session aléatoire (256 bits) remis au navigateur. */
export function newSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

/** Identifiant stocké en base : une fuite de la table `sessions` ne donne aucun jeton utilisable. */
export function sessionIdFromToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Comparaison à temps constant de deux secrets de longueur quelconque. */
export function secretsMatch(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}
