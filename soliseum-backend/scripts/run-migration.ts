/**
 * Run SQL migration files directly against the database.
 * Bypasses drizzle-kit push which has a known bug with Supabase CHECK constraints.
 *
 * Usage: npx ts-node scripts/run-migration.ts
 */
import * as dotenv from "dotenv";
import * as fs from "fs";
import * as path from "path";
import postgres from "postgres";

dotenv.config();

async function main() {
  const connectionString =
    process.env.DATABASE_URL ?? "postgresql://localhost:5432/soliseum";

  console.log("Connecting to database...");
  const sql = postgres(connectionString, {
    max: 1,
    connect_timeout: 15,
  });

  try {
    // Test connection
    const [{ now }] = await sql`SELECT now()`;
    console.log(`Connected! Server time: ${now}`);

    // Read and execute the migration SQL file
    const migrationPath = path.join(__dirname, "..", "drizzle", "0000_soliseum_schema.sql");
    const migrationSql = fs.readFileSync(migrationPath, "utf-8");

    console.log("Running migration: 0000_soliseum_schema.sql ...");

    // Split by semicolons and execute each statement
    const statements = migrationSql
      .split(";")
      .map((s) => s.trim())
      .filter((s) => s.length > 0 && !s.startsWith("--"));

    for (const statement of statements) {
      console.log(`  Executing: ${statement.substring(0, 60)}...`);
      await sql.unsafe(statement);
    }

    console.log("\nMigration completed successfully!");
  } catch (err) {
    console.error("Migration failed:", err);
    process.exit(1);
  } finally {
    await sql.end();
  }
}

main();
