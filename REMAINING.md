# Remaining work

pi-time reads this list at startup only when `gh` cannot reach the GitHub issues.
The issues labeled `agent:todo` are the source of truth.

- Blind intent test set: the 20 labeled questions were written next to the rules, so the 20/20 score is a regression check, not accuracy. Needs about 50 questions written by Jeremy.
- Facts from conversation: when the person says a fact changed, pi-time should record it as a verification (`verified_by = user`) or a replacement. Today only a source re-read can verify.
- Fitted shelf lives: the `checks` table records age and whether a fact changed, but shelf lives are still the hand-set scorer.py values.
- Re-ingest during verify classifies new facts by keyword, because verify is synchronous. Jev only classifies at full ingest.
- Fact identity is the exact line. A reworded bullet reads as one fact replaced and a new one added.
- Replacement rules cover `Next:` lines, checkboxes, removed lines and state-like handoff sections (State, Next step, Recent artifacts). Other bullets, such as an older handoff's project narrative, go stale but are never replaced by a newer one.
- Intended time is parsed (`future`) but nothing schedules it.
- Business time: `FY` phrases add the business kind, but no fiscal calendar maps them to dates.
- Store adapters: the contract leaves room for Graphiti or Mem0 behind the ledger, and none is written.
- Retrieval is SQLite FTS5. qmd could supply candidates instead.
