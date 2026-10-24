# Run log - dozentimes design explanation

## Intake

- Doctype: technical-brief (distributed tier, craft-write doctypes).
- Personas: architecture-reviewer, resolved in the distributed tier of the installed persona plugin, and no user-tier copy shadows it.
- The Why: the project owner needs one place that explains how the four parts fit, what the tests prove, and what to build next, before a fresh session works the open issues.
- Altitude: the owner reads at the mechanism level, summary first and then the detail.
- Source set: the paths in the content front matter, plus docs/content/dozentimes-design/runs-2026-10-22.txt.
- Path: minimal. The request came as a delegated task with its content specified, so no intake round with the owner was possible.

Intake answers came from the task message, not from a live round with the owner.
The `pre-draft-confirmed` line was not written before the draft: the draft was created first, and this log records that gap.

## Minimal path

minimal-path 2026-10-22T01:40-04:00 skipped: form-audit, seat-review; reduced: assumption-pass (number-bearing, same-context); approved-by: none (delegated task, owner approval pending)

## Anti-slop pass

The no-ai-slop skill was not loaded in this run.
A manual pass replaced it: a grep for the general-layer banned words and tics, removal of every semicolon, one sentence per line, and a read of the full draft.

## Changes during drafting

- The orchestrator reported commit e9ef5f7 (Jev's own now judgment replaces the keyword guard, plus the probe). All synthetic commands were re-run at e9ef5f7 and the draft was updated: the guard text, Figure 2, a sixth test layer, issue #13, and the provenance lines.
- A stale todo marker found while counting tests was dropped in commit 5c375b9, a separate commit.

## Gate

status: draft. The human gate has not run.
`check-content.py` passes on the draft and the ledger-only check passes.
