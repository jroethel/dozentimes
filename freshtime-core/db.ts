import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";

export const defaultDbPath = (): string =>
  process.env.FRESHTIME_DB ?? join(homedir(), ".freshtime", "ledger.db");

const SCHEMA = `
CREATE TABLE IF NOT EXISTS facts (
  id INTEGER PRIMARY KEY,
  project TEXT NOT NULL,
  section TEXT NOT NULL,
  text TEXT NOT NULL,
  source_path TEXT NOT NULL,
  kind TEXT NOT NULL,
  kind_path TEXT NOT NULL,
  valid_at TEXT NOT NULL,
  invalid_at TEXT,
  replaced_by INTEGER,
  recorded_at TEXT NOT NULL,
  source_at TEXT NOT NULL,
  last_verified_at TEXT NOT NULL,
  verified_by TEXT NOT NULL,
  last_accessed_at TEXT,
  access_count INTEGER NOT NULL DEFAULT 0,
  UNIQUE (source_path, section, text)
);
CREATE VIRTUAL TABLE IF NOT EXISTS facts_fts USING fts5(project, section, text, content='facts', content_rowid='id');
CREATE TRIGGER IF NOT EXISTS facts_ai AFTER INSERT ON facts BEGIN
  INSERT INTO facts_fts(rowid, project, section, text) VALUES (new.id, new.project, new.section, new.text);
END;
CREATE TABLE IF NOT EXISTS checks (
  id INTEGER PRIMARY KEY,
  fact_id INTEGER NOT NULL,
  ts TEXT NOT NULL,
  age_days INTEGER NOT NULL,
  changed INTEGER NOT NULL,
  reason TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sources (
  path TEXT PRIMARY KEY,
  hash TEXT NOT NULL,
  ingested_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS traces (
  id INTEGER PRIMARY KEY,
  ts TEXT NOT NULL,
  tool TEXT NOT NULL,
  input TEXT,
  output TEXT,
  path TEXT,
  ms INTEGER,
  error TEXT
);
`;

export function openDb(path = defaultDbPath()): DatabaseSync {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec(SCHEMA);
  return db;
}
