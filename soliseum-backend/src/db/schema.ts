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
  index,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";

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
    /** External API URL the agent exposes for battle challenges (POST { challenge } -> { response }). */
    apiUrl: text("api_url"),
    /** Wallet address of the user who registered this agent. Only the owner can update. */
    ownerAddress: text("owner_address"),
    /** Agent lifecycle status — only "active" agents can participate in battles. */
    agentStatus: text("agent_status").$type<"active" | "inactive" | "suspended">().notNull().default("active"),
    totalWins: integer("total_wins").notNull().default(0),
    totalBattles: integer("total_battles").notNull().default(0),
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
    ownerIdx: index("agents_owner_address_idx").on(t.ownerAddress),
    statusIdx: index("agents_status_idx").on(t.agentStatus),
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
    totalPool: bigint("total_pool", { mode: "bigint" }).notNull().default(sql`0`),
    agentAPool: bigint("agent_a_pool", { mode: "bigint" }).notNull().default(sql`0`),
    agentBPool: bigint("agent_b_pool", { mode: "bigint" }).notNull().default(sql`0`),
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
    statusCreatedIdx: index("arenas_status_created_idx").on(t.status, t.createdAt),
    statusUpdatedIdx: index("arenas_status_updated_idx").on(t.status, t.updatedAt),
  })
);

// ─── Stakes ─────────────────────────────────────────────────────────────────
export const stakes = pgTable(
  "stakes",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    userAddress: text("user_address").notNull(),
    arenaId: integer("arena_id")
      .notNull()
      .references(() => arenas.id, { onDelete: "cascade" }),
    amount: bigint("amount", { mode: "bigint" }).notNull(),
    side: integer("side").notNull(), // 0 = agent A, 1 = agent B
    claimed: boolean("claimed").notNull().default(false),
    txSignature: text("tx_signature"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    userAddressIdx: index("stakes_user_address_idx").on(t.userAddress),
    arenaIdIdx: index("stakes_arena_id_idx").on(t.arenaId),
    arenaUserSideIdx: index("stakes_arena_user_side_idx").on(t.arenaId, t.userAddress, t.side),
  })
);

// ─── Users ─────────────────────────────────────────────────────────────────
export const users = pgTable("users", {
  walletAddress: text("wallet_address").primaryKey(),
  username: text("username"),
  profilePicture: text("profile_picture"),
  totalStaked: bigint("total_staked", { mode: "bigint" }).notNull().default(sql`0`),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ─── Agent Battle History (for sparklines) ───────────────────────────────────
export const agentBattleHistory = pgTable(
  "agent_battle_history",
  {
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
  },
  (t) => ({
    agentPubkeyIdx: index("abh_agent_pubkey_idx").on(t.agentPubkey),
    pubkeyPlayedIdx: index("abh_pubkey_played_idx").on(t.agentPubkey, t.playedAt),
  })
);

// ─── Indexer State (for sync script) ────────────────────────────────────────
export const indexerState = pgTable("indexer_state", {
  id: text("id").primaryKey(), // e.g. "solana_last_slot"
  lastProcessedSlot: bigint("last_processed_slot", { mode: "bigint" }).notNull(),
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
