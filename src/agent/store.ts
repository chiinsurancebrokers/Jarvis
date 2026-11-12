import pg from "pg";
import type { Store } from "./types.js";

export class MemoryStore implements Store {
  private data = new Map<string, Map<string, unknown>>();
  async put<T>(coll: string, id: string, value: T) {
    if (!this.data.has(coll)) this.data.set(coll, new Map());
    this.data.get(coll)!.set(id, value);
  }
  async get<T>(coll: string, id: string) {
    return (this.data.get(coll)?.get(id) as T | undefined) ?? null;
  }
  async list<T>(coll: string) {
    return [...(this.data.get(coll)?.values() ?? [])] as T[];
  }
}

/** One JSONB table keeps the schema trivial; the domain logic lives in TypeScript. */
export class PgStore implements Store {
  private pool: pg.Pool;
  private ready: Promise<unknown>;
  constructor(url: string) {
    this.pool = new pg.Pool({ connectionString: url, max: 4 });
    this.ready = this.pool.query(
      `CREATE TABLE IF NOT EXISTS jarvis_docs (
         coll text NOT NULL, id text NOT NULL, data jsonb NOT NULL,
         updated_at timestamptz NOT NULL DEFAULT now(),
         PRIMARY KEY (coll, id))`,
    );
  }
  async put<T>(coll: string, id: string, value: T) {
    await this.ready;
    await this.pool.query(
      `INSERT INTO jarvis_docs (coll, id, data) VALUES ($1, $2, $3)
       ON CONFLICT (coll, id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`,
      [coll, id, JSON.stringify(value)],
    );
  }
  async get<T>(coll: string, id: string) {
    await this.ready;
    const r = await this.pool.query("SELECT data FROM jarvis_docs WHERE coll = $1 AND id = $2", [coll, id]);
    return (r.rows[0]?.data as T | undefined) ?? null;
  }
  async list<T>(coll: string) {
    await this.ready;
    const r = await this.pool.query("SELECT data FROM jarvis_docs WHERE coll = $1 ORDER BY updated_at", [coll]);
    return r.rows.map((x) => x.data as T);
  }
}
