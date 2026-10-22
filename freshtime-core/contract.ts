// The one contract both tools share. intf produces TemporalIntent, agnt consumes it and returns LedgerFact.
// Dates are ISO calendar dates (YYYY-MM-DD) unless named *_ts.

export type AsOfMode = "current" | "past" | "range" | "future" | "mixed" | "none";
export type Basis = "stated" | "inherited" | "default";
export type Path = "jev" | "fallback";
export type Volatility = "identity" | "preference" | "decision" | "status";
export type FactStatus = "current" | "replaced" | "needs_check" | "current_then";

export const KINDS = [
  "event", "valid", "record", "source", "reference", "sequence",
  "verification", "access", "volatility", "intended", "business", "asof",
] as const;
export type Kind = (typeof KINDS)[number];

export interface Anchor { start: string; end: string; text: string }

export interface TemporalIntent {
  asof_mode: AsOfMode;
  anchor: Anchor | null;
  basis: Basis;
  kinds: Kind[];
  confidence: number;
  path: Path;
  query: string; // question with time phrases removed, for retrieval
  fallback_reason?: string;
}

// What intf remembers between turns.
export interface Session {
  now: string;
  ambient: Anchor | null; // a stated as-of that later questions inherit
}

export interface LedgerFact {
  id: number;
  project: string;
  section: string;
  text: string;
  source_path: string;
  kind: Volatility;
  valid_at: string;
  invalid_at: string | null;
  recorded_at: string;
  source_at: string;
  last_verified_at: string;
  verified_by: string;
  last_accessed_at: string | null;
  status: FactStatus;
}

// Shelf life per volatility class, from research/temporal-memory/scorer.py half-lives.
// ponytail: hand-set. Fit per class from verification outcomes once enough checks exist.
export const SHELF_LIFE_DAYS: Record<Volatility, number | null> = {
  status: 7, decision: 90, preference: 365, identity: null,
};
