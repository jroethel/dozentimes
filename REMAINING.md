# Remaining work

pi-time reads this list at startup only when `gh` cannot reach the GitHub issues.
The issues labeled `agent:todo` are the source of truth.

- Blind intent test set: the 20 labeled questions were written next to the rules, so the 20/20 score is a regression check, not accuracy. Needs about 50 questions written by Jeremy.
- Replacement rules cover `Next:` lines, checkboxes, removed lines, state-like handoff sections (State, Next step, Recent artifacts), status-family bullets and reworded lines. An older handoff's narrative bullets go stale but are never replaced by a newer one.
- Intended time is parsed (`future`) but nothing schedules it.
- Business time: `FY` phrases add the business kind, but no fiscal calendar maps them to dates.
- Store adapters: the contract leaves room for Graphiti or Mem0 behind the ledger, and none is written.
- Retrieval is SQLite FTS5. qmd could supply candidates instead.
- Video: the A Dozen Times ending tagline repeats "dozen times" after the rename, and both films still show the old name until they are re-rendered.
