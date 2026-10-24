import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { openDb } from "../../dozentimes-core/index.ts";
import { build, fact, ingestDir, tmp } from "./helpers.ts";

const setup = async () => {
  const { repo } = build("sequence");
  const db = openDb(":memory:");
  await ingestDir(db, repo, "2026-10-10");
  return db;
};

// Handoff files in one project, ingested in filename order like a real directory walk.
const handoffs = async (files: Record<string, string>) => {
  const dir = tmp("sequence"), db = openDb(":memory:");
  for (const [name, body] of Object.entries(files)) {
    const p = join(dir, "kiln/docs/handoffs", name);
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, body);
  }
  await ingestDir(db, dir, "2026-10-10");
  return db;
};

test("two same-day Next: lines in one file: the later line wins", async () => {
  const db = await setup();
  assert.equal(fact(db, "Next: write the lantern parser").invalid_at, "2026-10-09");
  assert.equal(fact(db, "Next: write the lantern tests").invalid_at, null);
});

test("two same-day handoffs where the second names the first: the second's State wins", async () => {
  const db = await setup();
  assert.equal(fact(db, "Lantern build is green%").invalid_at, "2026-10-09");
  assert.equal(fact(db, "Lantern build is red%").invalid_at, null);
});

test("handoffs about different units do not replace each other's State", async () => {
  const db = await handoffs({
    "2026-10-01.i4-t1-parser.resume.md": "## State\n- parser task has two open review comments\n",
    "2026-10-05.i4-t2-exporter.resume.md": "## State\n- exporter task is half written\n",
  });
  assert.equal(fact(db, "parser task has two open review comments").invalid_at, null);
  assert.equal(fact(db, "exporter task is half written").invalid_at, null);
});

test("a later handoff with the same slug replaces the earlier State", async () => {
  const db = await handoffs({
    "2026-10-01.kiln-parser.md": "## State\n- the kiln parser is half written\n",
    "2026-10-05-kiln-parser.md": "## State\n- the kiln parser is merged to main\n",
  });
  assert.equal(fact(db, "the kiln parser is half written").invalid_at, "2026-10-05");
  assert.equal(fact(db, "the kiln parser is merged to main").invalid_at, null);
});

test("a handoff that names an earlier one replaces its State even when it sorts first", async () => {
  const db = await handoffs({
    "2026-10-07.alpha-resume.md": "Continues 2026-10-07.zeta-start.\n\n## State\n- zeta work is merged to main\n",
    "2026-10-07.zeta-start.md": "## State\n- zeta work sits in code review\n",
  });
  assert.equal(fact(db, "zeta work sits in code review").invalid_at, "2026-10-07");
  assert.equal(fact(db, "zeta work is merged to main").invalid_at, null);
});

test("a name that only starts with another handoff's name does not chain", async () => {
  const db = await handoffs({
    "2026-10-07.alpha-resume.md": "Continues 2026-10-07.zeta-started.\n\n## State\n- zeta work is merged to main\n",
    "2026-10-07.zeta-start.md": "## State\n- zeta work sits in code review\n",
  });
  assert.equal(fact(db, "zeta work sits in code review").invalid_at, null);
});
