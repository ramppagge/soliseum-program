/**
 * Soliseum Phase 3 - Database client
 * Uses Drizzle ORM with PostgreSQL (Supabase).
 */

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const connectionString =
  process.env.DATABASE_URL ?? "postgresql://localhost:5432/soliseum";

// For connection pooling (Supabase), use postgres.js
// Disable prefetch for serverless/edge compatibility if needed
const client = postgres(connectionString, {
  max: 10,
  idle_timeout: 20,
  connect_timeout: 10,
});

export const db = drizzle(client, { schema });
export * from "./schema";
