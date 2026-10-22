import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, utimesSync, appendFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDb } from "../freshtime-core/index.ts";
import type { TemporalIntent } from "../freshtime-core/index.ts";
import { extractFacts, ingestFile, ingestPaths, discoverSources, readFacts, verifyFact, maintain, classify } from "../freshtime-agnt/ledger.ts";

process.env.FRESHTIME_JEV = "off";
const tmp = () => mkdtempSync(join(tmpdir(), "ft-agnt-"));
const write = (dir: string, rel: string, body: string) => {
  const p = join(dir, rel);
  mkdirSync(join(p, ".."), { recursive: true });
  writeFileSync(p, body);
  return p;
};
const read = (db: any, query: string, o: Record<string, unknown> = {}) =>
  readFacts(db, null, { now: "2026-10-22", ledger: true, verify: false, query, ...o } as any);
const intent = (over: Partial<TemporalIntent>): TemporalIntent =>
  ({ asof_mode: "current", anchor: null, basis: "default", kinds: [], confidence: 1, path: "fallback", query: "", ...over });

test("extractor dates, projects, fences, short bullets", () => {
  const md = "# Plan\n- ignored before date heading is dated by filename\n## 2026-10-14 session, part 2\n### Notes\n- [ ] write the widget tests\n- short\n```\n- inside a code fence line\n```\n## Other\n- plain bullet after other heading\n";
  const f = extractFacts("/x/proj/docs/handoffs/2026-09-01-a.md", md, "2026-10-20");
  assert.equal(f.length, 3);
  assert.equal(f[0].valid_at, "2026-09-01");
  assert.equal(f[0].project, "proj");
  assert.equal(f[1].valid_at, "2026-10-14");
  assert.equal(f[1].section, "Notes");
  assert.equal(f[1].checked, false);
  assert.equal(f[2].valid_at, "2026-09-01");
  assert.equal(extractFacts("/x/p/whats_next.md", "- a long enough bullet\n", "2026-10-20")[0].valid_at, "2026-10-20");
});

test("checkbox replacement and file discovery", async () => {
  const dir = tmp(), db = openDb(":memory:");
  const p = write(dir, "alpha/whats_next.md", "## 2026-10-01 session\n- [ ] ship the parser module\n");
  write(dir, "alpha/node_modules/x/whats_next.md", "- should be skipped entirely\n");
  write(dir, "beta/docs/handoffs/2026-10-02-h.md", "- handoff bullet number one\n");
  assert.equal(discoverSources([dir]).length, 2);
  await ingestFile(db, p, "2026-10-02");
  writeFileSync(p, "## 2026-10-05 session\n- [x] ship the parser module\n");
  const r = await ingestFile(db, p, "2026-10-06");
  assert.deepEqual(r, { added: 1, replaced: 1 });
  const old = db.prepare("SELECT invalid_at, replaced_by FROM facts WHERE text LIKE '[ ]%'").get() as any;
  assert.equal(old.invalid_at, "2026-10-05");
  assert.ok(old.replaced_by);
});

test("later Next: replaces earlier one in the same project", async () => {
  const dir = tmp(), db = openDb(":memory:");
  const p = write(dir, "alpha/whats_next.md", "## 2026-10-01 session\n- Next: build the extractor\n");
  const h = write(dir, "alpha/HANDOFF.md", "## 2026-10-09 session\n- Next: wire the pi extension\n");
  await ingestPaths(db, [p, h], "2026-10-10");
  const rows = db.prepare("SELECT text, invalid_at FROM facts ORDER BY valid_at").all() as any[];
  assert.equal(rows[0].invalid_at, "2026-10-09");
  assert.equal(rows[1].invalid_at, null);
});

test("removed line is caught by verifyFact; verified line is stamped", async () => {
  const dir = tmp(), db = openDb(":memory:");
  const p = write(dir, "alpha/whats_next.md", "## 2026-10-01 session\n- keep this decision line\n- drop this decision line\n");
  await ingestFile(db, p, "2026-10-02");
  writeFileSync(p, "## 2026-10-01 session\n- keep this decision line\n");
  const keep = (db.prepare("SELECT id FROM facts WHERE text LIKE 'keep%'").get() as any).id;
  const drop = (db.prepare("SELECT id FROM facts WHERE text LIKE 'drop%'").get() as any).id;
  assert.equal(verifyFact(db, drop, "2026-10-20"), true);
  assert.equal(verifyFact(db, keep, "2026-10-20"), false);
  const k = db.prepare("SELECT * FROM facts WHERE id = ?").get(keep) as any;
  assert.equal(k.verified_by, "source");
  assert.equal(k.last_verified_at, "2026-10-20");
  assert.equal((db.prepare("SELECT invalid_at FROM facts WHERE id = ?").get(drop) as any).invalid_at, "2026-10-20");
  assert.equal((db.prepare("SELECT COUNT(*) n FROM checks").get() as any).n, 2);
});

test("past anchor returns a replaced fact as current_then", async () => {
  const dir = tmp(), db = openDb(":memory:");
  const p = write(dir, "alpha/whats_next.md", "## 2026-10-01 session\n- [ ] ship the parser module\n");
  await ingestFile(db, p, "2026-10-02");
  writeFileSync(p, "## 2026-10-12 session\n- [x] ship the parser module\n");
  await ingestFile(db, p, "2026-10-13");
  const past = readFacts(db, intent({ asof_mode: "past", anchor: { start: "2026-10-05", end: "2026-10-05", text: "Oct 5" }, query: "parser module" }),
    { now: "2026-10-22", ledger: true, verify: true });
  assert.equal(past.facts.length, 1);
  assert.equal(past.facts[0].status, "current_then");
  assert.ok(past.facts[0].text.startsWith("[ ]"));
  assert.equal(past.checks, 0);
  const cur = read(db, "parser module");
  assert.deepEqual(cur.facts.map((f) => f.status).sort(), ["needs_check", "replaced"]);
});

test("needs_check follows shelf life; ledger=false never flags", async () => {
  const dir = tmp(), db = openDb(":memory:");
  const p = write(dir, "alpha/whats_next.md", "## 2026-10-01 session\n- Next: build the extractor now\n- decided to keep sqlite for storage\n");
  await ingestFile(db, p, "2026-10-01");
  const st = (now: string, ledger = true) =>
    Object.fromEntries(read(db, "extractor sqlite", { now, ledger }).facts.map((f) => [f.kind, f.status]));
  assert.deepEqual(st("2026-10-05"), { status: "current", decision: "current" });
  assert.deepEqual(st("2026-10-10"), { status: "needs_check", decision: "current" });
  assert.deepEqual(st("2026-10-10", false), { status: "current", decision: "current" });
  assert.equal(st("2027-02-01").decision, "needs_check");
});

test("verify=true re-reads only needs_check facts; maintain respects budget", async () => {
  const dir = tmp(), db = openDb(":memory:");
  const p = write(dir, "alpha/whats_next.md", "## 2026-10-01 session\n- Next: build the extractor now\n- decided to keep sqlite for storage\n- blocked on the extractor review\n");
  await ingestFile(db, p, "2026-10-01");
  const r = read(db, "extractor sqlite blocked", { now: "2026-10-10", verify: true });
  assert.equal(r.checks, 2);
  assert.equal(r.caught, 0);
  assert.ok(r.facts.every((f) => f.status === "current"));
  const again = read(db, "extractor sqlite blocked", { now: "2026-10-11", verify: true });
  assert.equal(again.checks, 0);
  assert.deepEqual(maintain(db, "2026-10-30", 1), { checked: 1, changed: 0 });
});

test("appended later session replaces old Next: on verify and read reruns retrieval", async () => {
  const dir = tmp(), db = openDb(":memory:");
  const p = write(dir, "alpha/whats_next.md", "## 2026-10-01 session\n- Next: build the extractor now\n");
  await ingestFile(db, p, "2026-10-01");
  appendFileSync(p, "\n## 2026-10-15 session\n- Next: wire the extension loader\n");
  const r = read(db, "next extractor extension loader", { now: "2026-10-20", verify: true });
  assert.equal(r.checks, 1);
  assert.equal(r.caught, 1);
  const by = (s: string) => r.facts.find((f) => f.text.includes(s))!;
  assert.equal(by("wire the extension").status, "current");
  assert.equal(by("build the extractor").status, "replaced");
});

test("classify falls back to keywords with Jev off", async () => {
  const r = await classify(["[ ] do the thing", "decided to use X not Y", "she prefers short answers", "plain note about a thing"]);
  assert.deepEqual(r.map((x) => x.kind), ["status", "decision", "preference", "decision"]);
});

test("learning guide html: dt and table facts, dated by h2 then title", () => {
  const html = `<html><head><title>Learning Guide - Demo (2026-07-01 to 2026-09-30)</title></head><body>
<h2>1. Principles that emerged</h2><section class="card"><dl><dt>Files never move; state lives in metadata.</dt><dd>why</dd></dl></section>
<h2>5. Adapter build (2026-08-11, evening)</h2><table><tr><th>Decision</th><th>Alternatives</th></tr>
<tr><td>Use <code>SQLite</code> &amp; FTS5 for search</td><td>Postgres</td></tr></table><dl><dt>short</dt></dl></body></html>`;
  const f = extractFacts("/x/demo/learning_guide.html", html, "2026-10-20");
  assert.deepEqual(f.map((x) => [x.text, x.valid_at, x.project]), [
    ["Files never move; state lives in metadata.", "2026-09-30", "demo"],
    ["Use SQLite & FTS5 for search", "2026-08-11", "demo"],
  ]);
});

test("same-day Next: earlier in the file is replaced by the later one", async () => {
  const dir = tmp(), db = openDb(":memory:");
  const p = write(dir, "alpha/whats_next.md", "## Status\n- Next: pick the first test to run\n## 2026-10-14 session\n- Next: decide on the beachhead market\n");
  utimesSync(p, new Date(2026, 9, 14, 12), new Date(2026, 9, 14, 12));
  await ingestFile(db, p, "2026-10-15");
  const r = read(db, "Next");
  assert.equal(r.facts.find((f) => f.text.includes("first test"))?.status, "replaced");
  assert.notEqual(r.facts.find((f) => f.text.includes("beachhead"))?.status, "replaced");
});

test("a state section in a later handoff replaces the same section in an earlier one", async () => {
  const dir = tmp(), db = openDb(":memory:");
  const a = write(dir, "proj/docs/handoffs/2026-10-01.a.md", "## State\n- the parser is half written\n## Decisions\n- decided to keep the parser in TypeScript\n");
  const b = write(dir, "proj/docs/handoffs/2026-10-09.b.md", "## State\n- the parser is merged and released\n");
  await ingestPaths(db, [b, a], "2026-10-10"); // order must not matter
  const r = read(db, "parser");
  assert.equal(r.facts.find((f) => f.text.includes("half written"))?.status, "replaced");
  assert.notEqual(r.facts.find((f) => f.text.includes("merged and released"))?.status, "replaced");
  assert.notEqual(r.facts.find((f) => f.text.includes("TypeScript"))?.status, "replaced");
});
