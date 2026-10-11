import type { VercelConfig } from "@vercel/config/v1";

// Déploiement Vercel : relevé quotidien des prix des cartes suivies (construit l'historique).
export const config: VercelConfig = {
  framework: "nextjs",
  crons: [{ path: "/api/cron/snapshot", schedule: "0 11 * * *" }],
};
