import { DatabaseSync } from "node:sqlite";
import { drizzle } from "drizzle-orm/sqlite-proxy";
import { mkdirSync, readdirSync, readFileSync, existsSync, copyFileSync, statSync } from "node:fs";
import { dirname, resolve, join, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";
import * as schema from "./schema.js";

const urlEnv = process.env.DATABASE_URL ?? "file:./db/dev.db";
const filePath = urlEnv.startsWith("file:") ? urlEnv.slice("file:".length) : urlEnv;
// Absolute paths (e.g. /home/site/ops-data/dev.db) are used as-is.
// Relative paths are resolved from process.cwd() (project root in both dev and prod).
const dbPath = isAbsolute(filePath) ? filePath : resolve(process.cwd(), filePath);

mkdirSync(dirname(dbPath), { recursive: true });

// Bootstrap: on first deployment, copy the seed DB to its target location.
// Also handles the case where an empty DB was accidentally created before the seed arrived.
if (process.env.DATABASE_URL) {
  const seedDb = resolve(process.cwd(), "db/dev.db");
  const dbExists = existsSync(dbPath);
  const dbIsEmpty = dbExists && statSync(dbPath).size <= 4096;
  if ((!dbExists || dbIsEmpty) && existsSync(seedDb) && seedDb !== dbPath) {
    copyFileSync(seedDb, dbPath);
    console.log(`[db] Initialized database from seed: ${dbPath}`);
  }
}

const sqlite = new DatabaseSync(dbPath);
sqlite.exec("PRAGMA journal_mode = WAL");
sqlite.exec("PRAGMA foreign_keys = ON");

export const db = drizzle(
  async (sql, params, method) => {
    try {
      const stmt = sqlite.prepare(sql);
      if (method === "run") {
        stmt.run(...params as any[]);
        return { rows: [] };
      }
      if (method === "get") {
        const row = stmt.get(...params as any[]) as Record<string, unknown> | undefined;
        return { rows: row ? [Object.values(row)] : [] };
      }
      const rows = stmt.all(...params as any[]) as Record<string, unknown>[];
      return { rows: rows.map((r) => Object.values(r)) };
    } catch (e) {
      console.error("DB error:", sql, params, e);
      throw e;
    }
  },
  { schema, logger: false }
);

export { schema };

// Simple migration runner — reads SQL files from db/migrations/ and applies unapplied ones.
export function runMigrations(migrationsDir: string = resolve(__dirname, "migrations")) {
  if (!existsSync(migrationsDir)) return;

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS __drizzle_migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      hash TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  const applied = new Set(
    (sqlite.prepare("SELECT hash FROM __drizzle_migrations").all() as { hash: string }[]).map(
      (r) => r.hash
    )
  );

  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = readFileSync(join(migrationsDir, file), "utf-8");
    sqlite.exec(sql);
    sqlite.prepare("INSERT INTO __drizzle_migrations (hash) VALUES (?)").run(file);
    console.log(`Applied migration: ${file}`);
  }
}
