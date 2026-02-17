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
  // Transaction pooler can handle more connections
  // Session pooler (port 5432) is limited to ~10
  max: isTransactionPooler ? 10 : 3,
  
  // Connection settings for stability
  idle_timeout: 20,          // Close idle connections after 20s
  connect_timeout: 10,       // 10s connection timeout (was 5s)
  max_lifetime: 60 * 5,      // Recycle connections after 5 minutes
  
  // Required for Supabase pooler
  prepare: false,            // Disable prepared statements
  fetch_types: false,        // Don't fetch type info (reduces queries)
  
  // Debug mode (remove in production)
  debug: process.env.NODE_ENV === "development" ? console.log : undefined,
  
  // Connection callback
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
