import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

// A D1Database stand-in backed by real SQLite (node:sqlite), loaded with the
// real migration — so the SQL under test is the SQL that ships, not a mock.
export function createTestD1(): D1Database {
  const db = new DatabaseSync(":memory:");
  db.exec(readFileSync(fileURLToPath(new URL("../migrations/0001_events.sql", import.meta.url).href), "utf8"));

  const prepare = (sql: string) => {
    let params: unknown[] = [];
    const statement = {
      bind(...values: unknown[]) {
        params = values;
        return statement;
      },
      async run() {
        db.prepare(sql).run(...(params as never[]));
        return { success: true, meta: {} };
      },
      async all() {
        return { results: db.prepare(sql).all(...(params as never[])), success: true, meta: {} };
      },
      async first() {
        return db.prepare(sql).get(...(params as never[])) ?? null;
      },
    };
    return statement;
  };

  return { prepare } as unknown as D1Database;
}
