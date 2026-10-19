import type { VercelConfig } from "@vercel/config/v1";

// Déploiement Vercel : copie quotidienne du catalogue TCGdex en base, puis relevé des prix des cartes suivies
// (construit l'historique).
export const config: VercelConfig = {
  framework: "nextjs",
  crons: [
    { path: "/api/cron/catalog", schedule: "0 4 * * *" },
    { path: "/api/cron/snapshot", schedule: "0 11 * * *" },
  ],
};
