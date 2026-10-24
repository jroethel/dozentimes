import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { openDb } from "../dozentimes-core/index.ts";
import { ingestFile, ingestPaths, verifyFact } from "../dozentimes-agnt/ledger.ts";

process.env.DOZENTIMES_JEV = "off";
const tmp = () => mkdtempSync(join(tmpdir(), "dt-closed-"));
const write = (dir: string, rel: string, body: string) => {
  const p = join(dir, rel);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, body);
  return p;
};
const row = (db: DatabaseSync, text: string) =>
  db.prepare("SELECT invalid_at, replaced_by, closed_by FROM facts WHERE text = ?").get(text) as Record<string, any>;

test("each rule that closes a fact records its name in closed_by", async () => {
  const dir = tmp(), db = openDb(":memory:");
  const p = write(dir, "alpha/whats_next.md",
    "## 2026-10-01 session\n- [ ] ship the parser module\n- Next: build the extractor\n- a line that will be removed later\n");
  await ingestFile(db, p, "2026-10-01");
  writeFileSync(p,
    "## 2026-10-01 session\n- [ ] ship the parser module\n- Next: build the extractor\n\n## 2026-10-05 session\n- [x] ship the parser module\n- Next: wire the extension\n");
  await ingestFile(db, p, "2026-10-05");
  assert.equal(row(db, "[ ] ship the parser module").closed_by, "checkbox");
  assert.equal(row(db, "Next: build the extractor").closed_by, "next");
  assert.equal(row(db, "a line that will be removed later").closed_by, "removed");
  assert.equal(row(db, "Next: wire the extension").closed_by, null);
});

test("a handoff State close records handoff_section, and a line that comes back clears closed_by", async () => {
  const dir = tmp(), db = openDb(":memory:");
  const a = write(dir, "proj/docs/handoffs/2026-10-01.parser.md", "## State\n- the parser is half written\n");
  const b = write(dir, "proj/docs/handoffs/2026-10-09.parser.md", "## State\n- the parser is merged and released\n");
  await ingestPaths(db, [a, b], "2026-10-10");
  assert.equal(row(db, "the parser is half written").closed_by, "handoff_section");
  const p = write(dir, "proj/whats_next.md", "## 2026-10-01 session\n- keep the importer behind a flag\n");
  await ingestFile(db, p, "2026-10-02");
  writeFileSync(p, "## 2026-10-01 session\n- something else entirely here\n");
  await ingestFile(db, p, "2026-10-03");
  assert.equal(row(db, "keep the importer behind a flag").closed_by, "removed");
  writeFileSync(p, "## 2026-10-01 session\n- keep the importer behind a flag\n");
  await ingestFile(db, p, "2026-10-04");
  assert.deepEqual({ ...row(db, "keep the importer behind a flag") }, { invalid_at: null, replaced_by: null, closed_by: null });
});

test("openDb adds the new columns to a populated ledger made before they existed", () => {
  const path = join(tmp(), "old.db");
  const old = new DatabaseSync(path);
  old.exec(`CREATE TABLE facts (id INTEGER PRIMARY KEY, project TEXT NOT NULL, section TEXT NOT NULL, text TEXT NOT NULL,
    source_path TEXT NOT NULL, kind TEXT NOT NULL, kind_path TEXT NOT NULL, valid_at TEXT NOT NULL, invalid_at TEXT,
    replaced_by INTEGER, recorded_at TEXT NOT NULL, source_at TEXT NOT NULL, last_verified_at TEXT NOT NULL,
    verified_by TEXT NOT NULL, last_accessed_at TEXT, access_count INTEGER NOT NULL DEFAULT 0, UNIQUE (source_path, section, text));
    CREATE TABLE checks (id INTEGER PRIMARY KEY, fact_id INTEGER NOT NULL, ts TEXT NOT NULL, age_days INTEGER NOT NULL,
    changed INTEGER NOT NULL, reason TEXT NOT NULL);
    INSERT INTO facts (project, section, text, source_path, kind, kind_path, valid_at, recorded_at, source_at, last_verified_at, verified_by)
    VALUES ('alpha', 'S', 'a fact from before the migration', '/x/whats_next.md', 'status', 'keyword', '2026-10-01', '2026-10-01', '2026-10-01', '2026-10-01', 'author');
    INSERT INTO checks (fact_id, ts, age_days, changed, reason) VALUES (1, '2026-10-09', 8, 0, 'line present');`);
  old.close();
  const db = openDb(path);
  const cols = (t: string) => (db.prepare(`PRAGMA table_info(${t})`).all() as any[]).map((c) => c.name);
  assert.ok(cols("facts").includes("closed_by"));
  assert.ok(cols("checks").includes("kind"));
  assert.equal((db.prepare("SELECT COUNT(*) AS n FROM facts").get() as any).n, 1);
  assert.equal((db.prepare("SELECT COUNT(*) AS n FROM checks").get() as any).n, 1);
  db.close();
  openDb(path).close(); // a second open must not fail on the existing columns
});

test("a check row records the fact's class at check time", async () => {
  const dir = tmp(), db = openDb(":memory:");
  const p = write(dir, "alpha/whats_next.md", "## 2026-10-01 session\n- blocked on the extractor review\n");
  await ingestFile(db, p, "2026-10-01");
  const id = (db.prepare("SELECT id FROM facts").get() as any).id;
  verifyFact(db, id, "2026-10-10");
  assert.equal((db.prepare("SELECT kind FROM checks WHERE fact_id = ?").get(id) as any).kind, "status");
});
