import { Database } from 'bun:sqlite';
import * as fs from 'fs';
import * as path from 'path';

function getCorvynDir(): string {
  const home = process.env.HOME ?? process.env.USERPROFILE ?? '/tmp';
  return path.join(home, '.corvyn');
}

export function getDbPath(): string {
  return path.join(getCorvynDir(), 'corvyn.db');
}

export function initDb(): Database {
  const dir = getCorvynDir();
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const dbPath = getDbPath();
  const sqlite = new Database(dbPath);
  sqlite.exec('PRAGMA journal_mode = WAL');
  sqlite.exec('PRAGMA foreign_keys = ON');

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp TEXT NOT NULL,
      task_category TEXT NOT NULL,
      provider_used TEXT NOT NULL,
      model_used TEXT NOT NULL,
      provider_tier TEXT NOT NULL,
      tokens_input INTEGER NOT NULL,
      tokens_output INTEGER NOT NULL,
      cost_usd REAL NOT NULL,
      cost_local REAL NOT NULL,
      saved_usd REAL NOT NULL,
      currency_code TEXT NOT NULL,
      latency_ms INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS quota_state (
      provider TEXT PRIMARY KEY,
      requests_today INTEGER NOT NULL,
      requests_limit INTEGER NOT NULL,
      last_reset TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS daily_stats (
      date TEXT PRIMARY KEY,
      total_requests INTEGER NOT NULL,
      free_requests INTEGER NOT NULL,
      local_requests INTEGER NOT NULL,
      paid_requests INTEGER NOT NULL,
      cost_usd REAL NOT NULL,
      cost_local REAL NOT NULL,
      saved_local REAL NOT NULL,
      currency_code TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS exchange_rates (
      currency_code TEXT PRIMARY KEY,
      rate REAL NOT NULL,
      symbol TEXT NOT NULL,
      fetched_at TEXT NOT NULL
    );
  `);

  return sqlite;
}

export function ensureQuotaRow(
  db: Database,
  provider: string,
  limit: number
): void {
  const today = new Date().toISOString().split('T')[0]!;
  const now = new Date().toISOString();

  const existing = db
    .prepare('SELECT provider FROM quota_state WHERE provider = ?')
    .get(provider) as { provider: string } | undefined;

  if (!existing) {
    db.prepare(
      'INSERT INTO quota_state (provider, requests_today, requests_limit, last_reset, updated_at) VALUES (?, 0, ?, ?, ?)'
    ).run(provider, limit, today, now);
  }
}

export function getLastUsedOpenRouterModel(db: Database): string | null {
  const row = db
    .prepare(
      `SELECT model_used FROM requests WHERE provider_used = 'openrouter' ORDER BY timestamp DESC LIMIT 1`
    )
    .get() as { model_used: string } | undefined;
  return row?.model_used ?? null;
}

export type Db = Database;
