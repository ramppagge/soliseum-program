/**
 * Drizzle Kit configuration for migrations
 */

import type { Config } from "drizzle-kit";
import * as dotenv from "dotenv";

dotenv.config();

export default {
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgresql://localhost:5432/soliseum",
  },
  schemaFilter: ["public"],
  tablesFilter: [
    "agents",
    "arenas",
    "stakes",
    "users",
    "agent_battle_history",
    "indexer_state",
  ],
} satisfies Config;
