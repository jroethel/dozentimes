import type { DatabaseSync } from "node:sqlite";

export interface TraceRow {
  tool: string;
  input?: unknown;
  output?: unknown;
  path?: string;
  ms?: number;
  error?: string;
}

const clip = (v: unknown): string | null =>
  v === undefined ? null : (typeof v === "string" ? v : JSON.stringify(v)).slice(0, 2000);

export function trace(db: DatabaseSync, row: TraceRow): void {
  db.prepare("INSERT INTO traces (ts, tool, input, output, path, ms, error) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .run(new Date().toISOString(), row.tool, clip(row.input), clip(row.output), row.path ?? null, row.ms ?? null, row.error ?? null);
}

export function recentTraces(db: DatabaseSync, n = 10): Record<string, unknown>[] {
  return db.prepare("SELECT ts, tool, path, ms, error, output FROM traces ORDER BY id DESC LIMIT ?").all(n) as Record<string, unknown>[];
}
