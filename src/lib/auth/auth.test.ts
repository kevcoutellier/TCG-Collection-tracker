import { describe, expect, it } from "vitest";
import { safeRedirectPath } from "./config";
import {
  DUMMY_PASSWORD_HASH,
  hashPassword,
  newSessionToken,
  secretsMatch,
  sessionIdFromToken,
  verifyPassword,
} from "./crypto";

describe("mots de passe", () => {
  it("vérifie le bon mot de passe et rejette les autres", async () => {
    const hash = await hashPassword("dracaufeu-1999");
    expect(hash).toMatch(/^scrypt\$ln=17,r=8,p=1\$[\w-]{22}\$[\w-]{43}$/);
    expect(await verifyPassword("dracaufeu-1999", hash)).toBe(true);
    expect(await verifyPassword("Dracaufeu-1999", hash)).toBe(false);
    expect(await verifyPassword("", hash)).toBe(false);
  });

  it("sale chaque empreinte", async () => {
    const [a, b] = await Promise.all([hashPassword("pikachu25"), hashPassword("pikachu25")]);
    expect(a).not.toBe(b);
  });

  it("rejette une empreinte illisible ou aux paramètres démesurés", async () => {
    expect(await verifyPassword("x", "")).toBe(false);
    expect(await verifyPassword("x", "md5$abc")).toBe(false);
    expect(await verifyPassword("x", "scrypt$ln=30,r=8,p=1$AAAA$AAAA")).toBe(false);
  });

  it("l'empreinte factice (pseudo inconnu) ne correspond à aucun mot de passe", async () => {
    expect(await verifyPassword("", DUMMY_PASSWORD_HASH)).toBe(false);
    expect(await verifyPassword("password", DUMMY_PASSWORD_HASH)).toBe(false);
  });
});

describe("jetons de session", () => {
  it("sont aléatoires et ne sont jamais stockés en clair", () => {
    const token = newSessionToken();
    expect(token).toMatch(/^[\w-]{43}$/);
    expect(newSessionToken()).not.toBe(token);
    const id = sessionIdFromToken(token);
    expect(id).toMatch(/^[0-9a-f]{64}$/);
    expect(id).not.toContain(token);
    expect(sessionIdFromToken(token)).toBe(id);
  });

  it("compare les secrets à temps constant, quelle que soit leur longueur", () => {
    expect(secretsMatch("amis-2026", "amis-2026")).toBe(true);
    expect(secretsMatch("amis-2026", "amis-2027")).toBe(false);
    expect(secretsMatch("", "amis-2026")).toBe(false);
  });
});

describe("safeRedirectPath", () => {
  it("garde les chemins internes", () => {
    expect(safeRedirectPath("/collection")).toBe("/collection");
    expect(safeRedirectPath("/cartes/sv3pt5-199?lang=en")).toBe("/cartes/sv3pt5-199?lang=en");
  });

  it("refuse les redirections vers un autre site", () => {
    for (const next of ["https://evil.com", "//evil.com", "/\\evil.com", "/\\/evil.com", "evil.com", "/\tevil", "javascript:alert(1)"]) {
      expect(safeRedirectPath(next)).toBe("/");
    }
  });

  it("refuse les pages de connexion (boucle) et les valeurs absentes", () => {
    expect(safeRedirectPath("/connexion")).toBe("/");
    expect(safeRedirectPath("/inscription?next=/watchlist")).toBe("/");
    expect(safeRedirectPath(undefined)).toBe("/");
    expect(safeRedirectPath(["/collection"])).toBe("/");
  });
});
