const eur2 = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 2, minimumFractionDigits: 2 });
const eur0 = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
const usd2 = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "USD", maximumFractionDigits: 2 });

/** Montant en euros ; sans centimes au-delà de 1 000 € pour rester lisible. */
export function eur(n: number | null | undefined, { compact = false } = {}): string {
  if (n == null || !Number.isFinite(n)) return "—";
  if (compact && Math.abs(n) >= 1000) return eur0.format(n);
  return eur2.format(n);
}

export function signedEur(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return `${n > 0 ? "+" : n < 0 ? "−" : ""}${eur(Math.abs(n), { compact: true })}`;
}

export function usd(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return usd2.format(n);
}

/** Variation en pourcentage, signée : « +12,3 % ». */
export function pctText(n: number | null | undefined, digits = 1): string {
  if (n == null || !Number.isFinite(n)) return "—";
  const sign = n > 0.0005 ? "+" : n < -0.0005 ? "−" : "";
  return `${sign}${Math.abs(n * 100).toFixed(digits).replace(".", ",")} %`;
}

const dateFmt = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", year: "numeric" });
const shortDateFmt = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short" });

export function dateText(iso: string | null | undefined, { short = false } = {}): string {
  if (!iso) return "—";
  const d = new Date(iso.length === 10 ? `${iso}T12:00:00` : iso);
  if (Number.isNaN(d.getTime())) return "—";
  return (short ? shortDateFmt : dateFmt).format(d);
}

/** Date du jour au format « AAAA-MM-JJ » (fuseau du serveur). */
export function todayISO(d = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
