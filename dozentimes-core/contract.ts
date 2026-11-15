// The one contract both tools share. intf produces TemporalIntent, agnt consumes it and returns LedgerFact.
// Dates are ISO calendar dates (YYYY-MM-DD) unless named *_ts.

export type AsOfMode = "current" | "past" | "range" | "future" | "mixed" | "none";
export type Basis = "stated" | "inherited" | "default";
export type Path = "jev" | "fallback" | "manual"; // manual = the model set the reading through ledger_query
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
  charge?: number; // how much the fact has mattered lately: raised by each read, halved every CHARGE_HALF_LIFE_DAYS
  status: FactStatus;
}

// A sealed letter to a future reading, after hearth's capsules. A date trigger fires on fire_at; a topic trigger
// fires when a question shares half its topic words, and not before fire_at when it has one. Firing only moves
// sealed to fired. The agent or the person moves fired to surfaced or dismissed, or re-arms it back to sealed.
export type CapsuleState = "sealed" | "fired" | "surfaced" | "dismissed";
export interface Capsule {
  id: number;
  body: string;
  trigger: "date" | "topic";
  fire_at: string | null;
  due_by: string | null; // the end of the intended window; a fired capsule past it is overdue
  topic: string | null;
  anchor_text: string | null; // the phrase the date came from, as the person said it
  state: CapsuleState;
  sealed_at: string;
  fired_at: string | null;
  resolved_at: string | null;
  reason: string | null;
}

// Shelf life per volatility class, from research/temporal-memory/scorer.py half-lives.
// These are the fallback while a class has fewer than 30 distinct facts checked; from 30 on,
// shelfLives in dozentimes-agnt/ledger.ts fits each class's shelf life from the checks table.
export const SHELF_LIFE_DAYS: Record<Volatility, number | null> = {
  status: 7, decision: 90, preference: 365, identity: null,
};
