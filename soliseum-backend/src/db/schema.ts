/**
 * Soliseum Phase 3 - Database Schema (Drizzle ORM)
 * Mirrors and augments on-chain data for fast queries.
 * All timestamps stored in UTC.
 */

import {
  pgTable,
  text,
  bigint,
  boolean,
  timestamp,
  integer,
  primaryKey,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

// ─── Agents ─────────────────────────────────────────────────────────────────
export const agents = pgTable(
  "agents",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    pubkey: text("pubkey").notNull().unique(),
    name: text("name").notNull(),
    description: text("description"),
    category: text("category").$type<"Trading" | "Chess" | "Coding">().notNull(),
    metadataUrl: text("metadata_url"),
    totalWins: integer("total_wins").notNull().default(0),
    credibilityScore: integer("credibility_score").notNull().default(0), // 0-100
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    pubkeyIdx: uniqueIndex("agents_pubkey_idx").on(t.pubkey),
  })
);

// ─── Arenas ─────────────────────────────────────────────────────────────────
export const arenas = pgTable(
  "arenas",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    arenaAddress: text("arena_address").notNull().unique(),
    creatorAddress: text("creator_address").notNull(),
    oracleAddress: text("oracle_address").notNull(),
    status: text("status")
      .$type<"Live" | "Settled" | "Pending" | "Cancelled">()
      .notNull()
      .default("Live"),
    totalPool: bigint("total_pool", { mode: "number" }).notNull().default(0),
    agentAPool: bigint("agent_a_pool", { mode: "number" }).notNull().default(0),
    agentBPool: bigint("agent_b_pool", { mode: "number" }).notNull().default(0),
    winnerSide: integer("winner_side"), // 0 or 1, null if not settled
    agentAPubkey: text("agent_a_pubkey"),
    agentBPubkey: text("agent_b_pubkey"),
    startTime: timestamp("start_time", { withTimezone: true }),
    endTime: timestamp("end_time", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    arenaAddressIdx: uniqueIndex("arenas_arena_address_idx").on(t.arenaAddress),
  })
);

// ─── Stakes ─────────────────────────────────────────────────────────────────
export const stakes = pgTable("stakes", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  userAddress: text("user_address").notNull(),
  arenaId: integer("arena_id")
    .notNull()
    .references(() => arenas.id, { onDelete: "cascade" }),
  amount: bigint("amount", { mode: "number" }).notNull(),
  side: integer("side").notNull(), // 0 = agent A, 1 = agent B
  claimed: boolean("claimed").notNull().default(false),
  txSignature: text("tx_signature"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ─── Users ─────────────────────────────────────────────────────────────────
export const users = pgTable("users", {
  walletAddress: text("wallet_address").primaryKey(),
  username: text("username"),
  profilePicture: text("profile_picture"),
  totalStaked: bigint("total_staked", { mode: "number" }).notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ─── Agent Battle History (for sparklines) ───────────────────────────────────
export const agentBattleHistory = pgTable("agent_battle_history", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  agentPubkey: text("agent_pubkey").notNull(),
  arenaId: integer("arena_id")
    .notNull()
    .references(() => arenas.id, { onDelete: "cascade" }),
  side: integer("side").notNull(),
  won: boolean("won").notNull(),
  credibilityBefore: integer("credibility_before"),
  credibilityAfter: integer("credibility_after"),
  playedAt: timestamp("played_at", { withTimezone: true }).notNull().defaultNow(),
});

// ─── Indexer State (for sync script) ────────────────────────────────────────
export const indexerState = pgTable("indexer_state", {
  id: text("id").primaryKey(), // e.g. "solana_last_slot"
  lastProcessedSlot: bigint("last_processed_slot", { mode: "number" }).notNull(),
  lastProcessedSignature: text("last_processed_signature"),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ─── Relations ──────────────────────────────────────────────────────────────
export const arenasRelations = relations(arenas, ({ many }) => ({
  stakes: many(stakes),
}));

export const stakesRelations = relations(stakes, ({ one }) => ({
  arena: one(arenas),
}));

export const agentsRelations = relations(agents, ({ many }) => ({
  battleHistory: many(agentBattleHistory),
}));
