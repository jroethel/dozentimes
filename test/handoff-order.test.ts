import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { openDb } from "../dozentimes-core/index.ts";
import { ingestFile } from "../dozentimes-agnt/ledger.ts";

process.env.DOZENTIMES_JEV = "off";

// Rule (d) closes E's State at the earliest handoff that continues E (D16), whatever order the files arrive in.
const write = (files: Record<string, string>) => {
  const dir = mkdtempSync(join(tmpdir(), "ft-order-"));
  return Object.entries(files).map(([name, body]) => {
    const p = join(dir, "kiln/docs/handoffs", name);
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, body);
    return p;
  });
};
const orders = <T>(xs: T[]): T[][] =>
  xs.length <= 1 ? [xs] : xs.flatMap((x, i) => orders([...xs.slice(0, i), ...xs.slice(i + 1)]).map((r) => [x, ...r]));
const row = (db: DatabaseSync, text: string) =>
  db.prepare("SELECT id, invalid_at, replaced_by, closed_by FROM facts WHERE text = ?").get(text) as Record<string, any>;
const ingestInOrder = async (paths: string[]) => {
  const db = openDb(":memory:");
  for (const p of paths) await ingestFile(db, p, "2026-10-10");
  return db;
};

test("three same-slug handoffs: each State closes at its next handoff, in all six ingest orders", async () => {
  const paths = write({
    "2026-10-01.kiln-parser.md": "## State\n- the kiln parser is half written\n",
    "2026-10-05.kiln-parser.md": "## State\n- the kiln parser is in review\n",
    "2026-10-09.kiln-parser.md": "## State\n- the kiln parser is merged to main\n",
  });
  for (const order of orders(paths)) {
    const db = await ingestInOrder(order);
    const e = row(db, "the kiln parser is half written");
    const h1 = row(db, "the kiln parser is in review");
    const h2 = row(db, "the kiln parser is merged to main");
    const label = order.map((p) => basename(p)).join(", ");
    assert.deepEqual([e.invalid_at, e.replaced_by, e.closed_by], ["2026-10-05", h1.id, "handoff_section"], `E, order ${label}`);
    assert.deepEqual([h1.invalid_at, h1.replaced_by, h1.closed_by], ["2026-10-09", h2.id, "handoff_section"], `H1, order ${label}`);
    assert.equal(h2.invalid_at, null, `H2, order ${label}`);
  }
});

test("two continuers on the same date: the one that sorts first by path closes E, in all ingest orders", async () => {
  const paths = write({
    "2026-10-01.kiln-start.md": "## State\n- kiln work sits in code review\n",
    "2026-10-05.kiln-start.md": "## State\n- kiln work is approved\n",
    "2026-10-05.zz-followup.md": "Continues 2026-10-01.kiln-start.\n\n## State\n- kiln work is merged to main\n",
  });
  for (const order of orders(paths)) {
    const db = await ingestInOrder(order);
    const e = row(db, "kiln work sits in code review");
    const first = row(db, "kiln work is approved");
    assert.deepEqual([e.invalid_at, e.replaced_by], ["2026-10-05", first.id], `order ${order.map((p) => basename(p)).join(", ")}`);
  }
});
