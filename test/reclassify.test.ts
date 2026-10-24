import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { openDb } from "../dozentimes-core/index.ts";
import type { Volatility } from "../dozentimes-core/index.ts";
import { ingestFile, maintain, reclassify } from "../dozentimes-agnt/ledger.ts";
import type { Classified } from "../dozentimes-agnt/ledger.ts";

process.env.DOZENTIMES_JEV = "off";
const tmp = () => mkdtempSync(join(tmpdir(), "ft-reclass-"));
const write = (dir: string, rel: string, body: string) => {
  const p = join(dir, rel);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, body);
  return p;
};
const BODY = "## 2026-10-01 session\n- decided to keep sqlite for storage\n- the parser handles nested lists\n";
const jev = async (texts: string[]): Promise<Classified[]> =>
  texts.map((t) => ({ kind: (t.includes("parser") ? "identity" : "decision") as Volatility, path: "jev" }));
const down = async (texts: string[]): Promise<Classified[]> =>
  texts.map(() => ({ kind: "decision" as Volatility, path: "fallback", reason: "timeout" }));
const kinds = (db: DatabaseSync) =>
  (db.prepare("SELECT text, kind, kind_path FROM facts ORDER BY id").all() as any[]).map((r) => [r.text, r.kind, r.kind_path]);
const setup = async () => {
  const db = openDb(":memory:");
  await ingestFile(db, write(tmp(), "alpha/whats_next.md", BODY), "2026-10-01");
  return db;
};

test("reclassify upgrades keyword rows when the classifier answers from Jev", async () => {
  const db = await setup();
  assert.deepEqual(kinds(db), [
    ["decided to keep sqlite for storage", "decision", "keyword"],
    ["the parser handles nested lists", "decision", "keyword"],
  ]);
  assert.deepEqual(await reclassify(db, jev), { updated: 2, changed: 1 });
  assert.deepEqual(kinds(db), [
    ["decided to keep sqlite for storage", "decision", "jev"],
    ["the parser handles nested lists", "identity", "jev"],
  ]);
  assert.deepEqual(await reclassify(db, jev), { updated: 0, changed: 0 });
});

test("reclassify leaves keyword rows alone when the classifier falls back", async () => {
  const db = await setup();
  assert.deepEqual(await reclassify(db, down), { updated: 0, changed: 0 });
  assert.ok(kinds(db).every(([, , path]) => path === "keyword"));
});

test("maintain reclassifies before it checks", async () => {
  const db = await setup();
  assert.deepEqual(await maintain(db, "2026-10-02", 5, jev), { checked: 0, changed: 0, reclassified: 2 });
});
