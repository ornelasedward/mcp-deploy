/**
 * Apply all SQL migrations in order. Use with Neon/Supabase/RDS DATABASE_URL.
 *
 *   pnpm migrate
 *   DATABASE_URL=postgres://... pnpm migrate
 */
import { readdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import postgres from "postgres";

const MIGRATIONS_DIR = resolve(import.meta.dirname, "../packages/db/migrations");

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is required");
    process.exit(1);
  }

  const sql = postgres(url, { max: 1 });
  const files = (await readdir(MIGRATIONS_DIR))
    .filter((f) => f.endsWith(".sql"))
    .sort();

  console.log(`Applying ${files.length} migrations…`);
  for (const file of files) {
    const body = await readFile(join(MIGRATIONS_DIR, file), "utf8");
    console.log(`  → ${file}`);
    await sql.unsafe(body);
  }

  await sql.end();
  console.log("Migrations complete.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
