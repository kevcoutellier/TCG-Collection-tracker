import {
  date,
  doublePrecision,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import type { HoldingKind } from "../analysis";
import type { Lang, VariantKey } from "../types";

/** Comptes : chacun a sa propre collection et sa propre watchlist. */
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  /** Pseudo de connexion, stocké en minuscules. */
  username: text("username").notNull().unique(),
  /** Empreinte scrypt du mot de passe (voir lib/auth/crypto.ts). */
  passwordHash: text("password_hash").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Sessions ouvertes : seule l'empreinte SHA-256 du jeton est stockée, le jeton reste dans le cookie. */
export const sessions = pgTable("sessions", {
  id: text("id").primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Lignes du portefeuille : cartes (raw ou gradées) et produits scellés. */
export const holdings = pgTable("holdings", {
  id: uuid("id").primaryKey().defaultRandom(),
  /** Propriétaire ; nul uniquement pour les lignes antérieures aux comptes, pas encore rattachées. */
  userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
  kind: text("kind").$type<HoldingKind>().notNull(),
  cardId: text("card_id"),
  cardLang: text("card_lang").$type<Lang>().notNull().default("fr"),
  name: text("name").notNull(),
  setName: text("set_name"),
  image: text("image"),
  rarity: text("rarity"),
  /** Variante TCGdex (variantId) : 1re édition, reverse, reverse Poké Ball… */
  variant: text("variant").$type<VariantKey>().notNull().default("normal"),
  variantLabel: text("variant_label"),
  /** Produit Cardmarket d'un scellé : sa cote est récupérée automatiquement. */
  productId: integer("product_id"),
  language: text("language").notNull().default("FR"),
  condition: text("condition").notNull().default("NM"),
  gradingCompany: text("grading_company"),
  grade: text("grade"),
  sealedType: text("sealed_type"),
  quantity: integer("quantity").notNull().default(1),
  /** Prix d'achat unitaire en EUR (frais inclus). */
  purchasePrice: doublePrecision("purchase_price").notNull(),
  purchaseDate: date("purchase_date").notNull(),
  /** Valeur unitaire saisie à la main (scellé, cartes gradées) : prioritaire sur le marché. */
  manualPrice: doublePrecision("manual_price"),
  soldAt: date("sold_at"),
  salePrice: doublePrecision("sale_price"),
  saleFees: doublePrecision("sale_fees"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const watchlist = pgTable(
  "watchlist",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
    cardId: text("card_id").notNull(),
    cardLang: text("card_lang").$type<Lang>().notNull().default("fr"),
    name: text("name").notNull(),
    setName: text("set_name"),
    image: text("image"),
    rarity: text("rarity"),
    variant: text("variant").$type<VariantKey>().notNull().default("normal"),
    variantLabel: text("variant_label"),
    /** Prix d'achat visé : alerte quand le marché passe en dessous. */
    targetPrice: doublePrecision("target_price"),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  // Une carte n'est surveillée qu'une fois par compte.
  (t) => [uniqueIndex("watchlist_user_card_idx").on(t.userId, t.cardId)],
);

/**
 * Collection « checklist » : quantité possédée par carte, langue et variante (voir lib/collection.ts).
 * Une carte retirée est supprimée : aucune ligne n'a une quantité nulle.
 */
export const collectionItems = pgTable(
  "collection_items",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    cardId: text("card_id").notNull(),
    cardLang: text("card_lang").$type<Lang>().notNull().default("fr"),
    /** Variante TCGdex (variantId), ou « normal » / « reverse » pour les lignes reprises du portefeuille. */
    variant: text("variant").$type<VariantKey>().notNull(),
    /** Extension de la carte : la complétion par extension se lit sans le catalogue. */
    setId: text("set_id").notNull(),
    quantity: integer("quantity").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.cardId, t.cardLang, t.variant] }),
    index("collection_items_user_set_idx").on(t.userId, t.setId),
  ],
);

/** Un relevé de prix par jour et par objet suivi : c'est ce qui construit l'historique. */
export const priceSnapshots = pgTable(
  "price_snapshots",
  {
    /** ID TCGdex de la carte, ou « manual:<id de ligne> » pour une valeur saisie. */
    itemKey: text("item_key").notNull(),
    day: date("day").notNull(),
    price: doublePrecision("price"),
    priceReverse: doublePrecision("price_reverse"),
    low: doublePrecision("low"),
    avg1: doublePrecision("avg1"),
    avg7: doublePrecision("avg7"),
    avg30: doublePrecision("avg30"),
    usdMarket: doublePrecision("usd_market"),
  },
  (t) => [primaryKey({ columns: [t.itemKey, t.day] })],
);

export const appMeta = pgTable("app_meta", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

/** DDL idempotent exécuté au démarrage : garder synchronisé avec les tables ci-dessus. */
export const BOOTSTRAP_SQL = `
CREATE TABLE IF NOT EXISTS holdings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL,
  card_id text,
  card_lang text NOT NULL DEFAULT 'fr',
  name text NOT NULL,
  set_name text,
  image text,
  rarity text,
  variant text NOT NULL DEFAULT 'normal',
  language text NOT NULL DEFAULT 'FR',
  condition text NOT NULL DEFAULT 'NM',
  grading_company text,
  grade text,
  sealed_type text,
  quantity integer NOT NULL DEFAULT 1,
  purchase_price double precision NOT NULL,
  purchase_date date NOT NULL,
  manual_price double precision,
  sold_at date,
  sale_price double precision,
  sale_fees double precision,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS holdings_card_id_idx ON holdings (card_id);

CREATE TABLE IF NOT EXISTS watchlist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id text NOT NULL,
  card_lang text NOT NULL DEFAULT 'fr',
  name text NOT NULL,
  set_name text,
  image text,
  rarity text,
  variant text NOT NULL DEFAULT 'normal',
  target_price double precision,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS price_snapshots (
  item_key text NOT NULL,
  day date NOT NULL,
  price double precision,
  price_reverse double precision,
  low double precision,
  avg1 double precision,
  avg7 double precision,
  avg30 double precision,
  usd_market double precision,
  PRIMARY KEY (item_key, day)
);

CREATE TABLE IF NOT EXISTS app_meta (
  key text PRIMARY KEY,
  value text NOT NULL
);

-- v2 : variantes détaillées et scellé coté automatiquement
ALTER TABLE holdings ADD COLUMN IF NOT EXISTS variant_label text;
ALTER TABLE holdings ADD COLUMN IF NOT EXISTS product_id integer;
ALTER TABLE watchlist ADD COLUMN IF NOT EXISTS variant_label text;

-- v3 : comptes utilisateurs, chaque collection est rattachée à son propriétaire
CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  username text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sessions (
  id text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sessions_user_id_idx ON sessions (user_id);

ALTER TABLE holdings ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES users(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS holdings_user_id_idx ON holdings (user_id);
ALTER TABLE watchlist ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE watchlist DROP CONSTRAINT IF EXISTS watchlist_card_id_key;
CREATE UNIQUE INDEX IF NOT EXISTS watchlist_user_card_idx ON watchlist (user_id, card_id);

-- v4 : collection « checklist », une ligne par carte × langue × variante possédée
CREATE TABLE IF NOT EXISTS collection_items (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  card_id text NOT NULL,
  card_lang text NOT NULL DEFAULT 'fr',
  variant text NOT NULL,
  set_id text NOT NULL,
  quantity integer NOT NULL CHECK (quantity > 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, card_id, card_lang, variant)
);
CREATE INDEX IF NOT EXISTS collection_items_user_set_idx ON collection_items (user_id, set_id);
`;
