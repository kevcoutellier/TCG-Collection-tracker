import type { VercelConfig } from "@vercel/config/v1";

// Déploiement Vercel : relevé quotidien des prix des cartes suivies (construit l'historique).
export const config: VercelConfig = {
  framework: "nextjs",
  // Fonctions à Paris : api.tcgdex.net répond depuis le serveur le plus proche, et celui d'Amérique
  // du Nord sert une base en retard (sets « 30 ans » sans identifiants Cardmarket, donc sans prix).
  regions: ["cdg1"],
  crons: [{ path: "/api/cron/snapshot", schedule: "0 11 * * *" }],
};
