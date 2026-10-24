import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkoutAt, genHistory } from "./gen-history.ts";
import { isoDate } from "../../dozentimes-core/dates.ts";

const spec = {
  commits: [
    { date: "2026-09-01", files: { "p/a.md": "one\n", "p/b.md": "keep\n" } },
    { date: "2026-09-10", files: { "p/a.md": "two\n", "p/b.md": null } },
  ],
  mtimes: { "p/a.md": "2026-08-01" },
  clone: true,
};

test("genHistory sets commit dates, author, mtimes and clone", () => {
  const out = mkdtempSync(join(tmpdir(), "ft-gen-"));
  const { repo, clone } = genHistory(spec, out);
  const log = execFileSync("git", ["log", "--format=%an|%as|%cs", "--reverse"], { cwd: repo, encoding: "utf8" }).trim().split("\n");
  assert.deepEqual(log, ["dozentimes-test|2026-09-01|2026-09-01", "dozentimes-test|2026-09-10|2026-09-10"]);
  assert.equal(isoDate(statSync(join(repo, "p/a.md")).mtime), "2026-08-01");
  assert.equal(readFileSync(join(clone!, "p/a.md"), "utf8"), "two\n");
  assert.equal(isoDate(statSync(join(clone!, "p/a.md")).mtime), isoDate(new Date()));
});

test("checkoutAt returns the tree as of a date", () => {
  const out = mkdtempSync(join(tmpdir(), "ft-gen-"));
  const { repo } = genHistory(spec, out);
  assert.deepEqual(checkoutAt(repo, "2026-08-31"), {});
  assert.deepEqual(checkoutAt(repo, "2026-09-05"), { "p/a.md": "one\n", "p/b.md": "keep\n" });
  assert.deepEqual(checkoutAt(repo, "2026-09-10"), { "p/a.md": "two\n" });
});
