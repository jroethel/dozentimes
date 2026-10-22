// Turns a JSON spec into a git repo with commits at given dates and files at given mtimes.
// Usage: node test/kinds/gen-history.ts <spec.json> <outdir>
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export interface Commit { date: string; files: Record<string, string | null>; message?: string }
export interface HistorySpec { commits: Commit[]; mtimes?: Record<string, string>; clone?: boolean }

const git = (cwd: string, args: string[], env: Record<string, string> = {}): string =>
  execFileSync("git", ["-c", "commit.gpgsign=false", ...args], { cwd, encoding: "utf8", env: { ...process.env, ...env } });

const noon = (date: string): Date => new Date(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10)), 12);

export function genHistory(spec: HistorySpec, outDir: string): { repo: string; clone?: string } {
  const repo = join(outDir, "repo");
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(repo, { recursive: true });
  git(repo, ["init", "-q"]);
  for (const c of spec.commits) {
    for (const [rel, body] of Object.entries(c.files)) {
      const p = join(repo, rel);
      if (body === null) rmSync(p, { force: true });
      else { mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, body); }
    }
    const stamp = `${c.date}T12:00:00`;
    git(repo, ["add", "-A"]);
    git(repo, ["commit", "-q", "--allow-empty", "-m", c.message ?? `update ${c.date}`], {
      GIT_AUTHOR_DATE: stamp, GIT_COMMITTER_DATE: stamp,
      GIT_AUTHOR_NAME: "freshtime-test", GIT_COMMITTER_NAME: "freshtime-test",
      GIT_AUTHOR_EMAIL: "test@example.invalid", GIT_COMMITTER_EMAIL: "test@example.invalid",
    });
  }
  // A clone is made before mtimes are set, so its files carry the clone time, as on a fresh checkout.
  let clone: string | undefined;
  if (spec.clone) { clone = join(outDir, "clone"); git(outDir, ["clone", "-q", repo, clone]); }
  for (const [rel, date] of Object.entries(spec.mtimes ?? {})) utimesSync(join(repo, rel), noon(date), noon(date));
  return { repo, clone };
}

// File contents as of the end of a date: the last commit made on or before it.
export function checkoutAt(repoDir: string, date: string): Record<string, string> {
  const sha = git(repoDir, ["rev-list", "-1", `--before=${date}T23:59:59`, "HEAD"]).trim();
  const out: Record<string, string> = {};
  if (!sha) return out;
  for (const rel of git(repoDir, ["ls-tree", "-r", "--name-only", sha]).split("\n").filter(Boolean)) out[rel] = git(repoDir, ["show", `${sha}:${rel}`]);
  return out;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [specPath, outDir] = process.argv.slice(2);
  if (!specPath || !outDir) { console.error("usage: node test/kinds/gen-history.ts <spec.json> <outdir>"); process.exit(2); }
  const r = genHistory(JSON.parse(readFileSync(specPath, "utf8")) as HistorySpec, outDir);
  console.log(JSON.stringify(r));
}
