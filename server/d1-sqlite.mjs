import { DatabaseSync } from 'node:sqlite';
import { accessSync, constants, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';

export function defaultDbPath(env = process.env) {
  if (env.SQLITE_PATH) return env.SQLITE_PATH;
  try {
    accessSync('/data', constants.W_OK);
    return '/data/casagrande.sqlite';
  } catch {
    return '/tmp/casagrande.sqlite';
  }
}

class D1Statement {
  constructor(raw, sql, values = []) {
    this.raw = raw;
    this.sql = sql;
    this.values = values;
  }

  bind(...values) {
    return new D1Statement(this.raw, this.sql, values);
  }

  first() {
    return this.raw.prepare(this.sql).get(...this.values) || null;
  }

  all() {
    return { results: this.raw.prepare(this.sql).all(...this.values) };
  }

  run() {
    const query = this.raw.prepare(this.sql);
    if (query.columns().length) {
      const rows = query.all(...this.values);
      return { results: rows, meta: { changes: rows.length } };
    }
    const info = query.run(...this.values);
    return { results: [], meta: { changes: info.changes } };
  }
}

export function applyMigrations(raw, migrationsDir = new URL('../drizzle/', import.meta.url)) {
  raw.exec('CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL);');
  const files = readdirSync(migrationsDir).filter(name => /^\d+.*\.sql$/.test(name)).sort();
  for (const file of files) {
    const applied = raw.prepare('SELECT 1 AS ok FROM _migrations WHERE name = ?').get(file);
    if (applied) continue;
    const sql = readFileSync(new URL(file, migrationsDir), 'utf8');
    const chunks = sql.split('--> statement-breakpoint').map(part => part.trim()).filter(Boolean);
    raw.exec('BEGIN');
    try {
      for (const statement of chunks) {
        try {
          raw.exec(statement);
        } catch (err) {
          if (!/already exists/i.test(err?.message || '')) throw err;
        }
      }
      raw.prepare('INSERT INTO _migrations(name, applied_at) VALUES(?, ?)').run(file, new Date().toISOString());
      raw.exec('COMMIT');
    } catch (err) {
      try { raw.exec('ROLLBACK'); } catch { /* ignore rollback errors */ }
      throw err;
    }
  }
}

export function openSqliteD1(dbPath = defaultDbPath()) {
  if (dbPath !== ':memory:') {
    mkdirSync(dirname(dbPath), { recursive: true });
  }
  const raw = new DatabaseSync(dbPath);
  raw.exec('PRAGMA foreign_keys = ON;');
  raw.exec('PRAGMA busy_timeout = 5000;');
  if (dbPath !== ':memory:') {
    raw.exec('PRAGMA journal_mode = WAL;');
  }
  applyMigrations(raw);

  const db = {
    raw,
    path: dbPath,
    prepare(sql) {
      return new D1Statement(raw, sql);
    },
    batch(statements) {
      raw.exec('BEGIN IMMEDIATE');
      try {
        const results = statements.map(statement => statement.run());
        raw.exec('COMMIT');
        return results;
      } catch (err) {
        try { raw.exec('ROLLBACK'); } catch { /* ignore rollback errors */ }
        throw err;
      }
    },
    close() {
      raw.close();
    }
  };
  return db;
}
