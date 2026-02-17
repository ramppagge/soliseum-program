/**
 * Soliseum Phase 3 - Database client
 * Uses Drizzle ORM with PostgreSQL (Supabase).
 * 
 * IMPORTANT: Use the Transaction Pooler URL for better connection handling:
 * postgres://postgres.[project-ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres
 * 
 * NOT the Session Pooler (port 5432) which has strict limits.
 */

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const connectionString =
  process.env.DATABASE_URL ?? "postgresql://localhost:5432/soliseum";

// Check if using transaction pooler (port 6543)
const isTransactionPooler = connectionString.includes(":6543");

// Configure postgres.js based on pooler type
const client = postgres(connectionString, {
  // Connection pool sizing
  // Local DB: use more connections since we're the only client
  // Supabase: use fewer to avoid hitting limits
  max: isTransactionPooler ? 10 : 20,
  
  // Connection settings for stability
  idle_timeout: 30,          // Close idle connections after 30s
  connect_timeout: 15,       // 15s connection timeout
  max_lifetime: 60 * 10,     // Recycle connections after 10 minutes
  
  // Keep connections alive - critical for battle operations
  keep_alive: 60,            // TCP keepalive interval in seconds
  
  // Required for Supabase pooler
  prepare: false,            // Disable prepared statements
  fetch_types: false,        // Don't fetch type info (reduces queries)
  
  // Connection callback for debugging
  onclose: () => {
    console.log("[DB] Connection closed");
  },
});

// Handle process shutdown gracefully
process.on("SIGINT", async () => {
  console.log("[DB] Closing connections...");
  await client.end({ timeout: 5 });
  process.exit(0);
});

process.on("SIGTERM", async () => {
  console.log("[DB] Closing connections...");
  await client.end({ timeout: 5 });
  process.exit(0);
});

export const db = drizzle(client, { schema });
export * from "./schema";
