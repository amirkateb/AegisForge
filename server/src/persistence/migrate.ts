import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";
import { loadConfig } from "../config.js";

const config = loadConfig();
const pool = new Pool({ connectionString: config.DATABASE_URL });
const directory = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../database/migrations",
);
await pool.query(
  "CREATE TABLE IF NOT EXISTS schema_migrations(name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())",
);
for (const name of (await fs.readdir(directory))
  .filter((entry) => entry.endsWith(".sql"))
  .sort()) {
  const exists = await pool.query(
    "SELECT 1 FROM schema_migrations WHERE name=$1",
    [name],
  );
  if (exists.rowCount) continue;
  const sql = await fs.readFile(path.join(directory, name), "utf8");
  await pool.query(sql);
  await pool.query("INSERT INTO schema_migrations(name) VALUES($1)", [name]);
  console.error(`Applied migration ${name}`);
}
await pool.end();
