// Coverage matrix for the twelve kinds: node:test events grouped by test file.
import { run } from "node:test";
import { basename } from "node:path";
import { KINDS } from "../../dozentimes-core/contract.ts";

const files = KINDS.map((k) => new URL(`./${k}.test.ts`, import.meta.url).pathname);
const rows: Record<string, { pass: number; todo: number; fail: number; why: string[] }> =
  Object.fromEntries(KINDS.map((k) => [k, { pass: 0, todo: 0, fail: 0, why: [] }]));
const failures: string[] = [];

for await (const ev of run({ files, concurrency: true })) {
  if (ev.type !== "test:pass" && ev.type !== "test:fail") continue;
  const d = ev.data as { name: string; file?: string; nesting: number; todo?: string | boolean; details: { type?: string; error?: Error } };
  if (d.nesting !== 0 || d.details.type === "suite" || !d.file) continue;
  const r = rows[basename(d.file).replace(".test.ts", "")];
  if (!r) continue;
  if (d.todo) { r.todo++; if (typeof d.todo === "string" && !r.why.includes(d.todo)) r.why.push(d.todo); }
  else if (ev.type === "test:pass") r.pass++;
  else { r.fail++; failures.push(`${basename(d.file)}: ${d.name}: ${d.details.error?.message.split("\n")[0]}`); }
}

const w = Math.max(...KINDS.map((k) => k.length));
const clip = (s: string) => (s.length > 99 ? s.slice(0, 96) + "..." : s);
console.log(`${"kind".padEnd(w)} | pass | todo | fail | todo reasons`);
for (const k of KINDS) {
  const r = rows[k];
  console.log(clip(`${k.padEnd(w)} | ${String(r.pass).padStart(4)} | ${String(r.todo).padStart(4)} | ${String(r.fail).padStart(4)} | ${r.why.join("; ")}`));
}
for (const f of failures) console.log(clip(`FAIL ${f}`));
process.exitCode = failures.length ? 1 : 0;
