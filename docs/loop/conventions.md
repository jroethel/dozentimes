# Loop conventions

This is the prose surface for the loop convention in this repo.
The machine-readable keys live in the sibling `docs/loop/pointer.md`.

## Tracker

This repo tracks issues on GitHub (`tracker: github` in the pointer doc).
List open issues with `gh issue list --state open`.

## The `agent:` label vocabulary

Exactly one of these is active on an issue at a time:

- `agent:todo` - open and unclaimed.
- `agent:working` - claimed and in progress.
- `agent:needs-input` - blocked on a human answer.
- `agent:review` - work done, awaiting review.
- `agent:done` - closed, and reachable only through the receipt helper's `done` verb.

Two other labels exist outside that single-active rotation:

- `idea` - a parked backlog item, not active work.
- `wayfinder:map` - a wayfinder mapping item.

## Filename grammar

Files in the doc-tree homes (`docs/handoffs/`, `docs/briefs/`, `docs/plans/`, `docs/reviews/`, `docs/archive/`) share one grammar: `YYYY-MM-DD.<descriptor>.md`, date first, dot-separated, the descriptor a short slug with optional tracker-token segments (e.g. `.I6` for issue 6).
The loop-drive resume pointer (`YYYY-MM-DD.<unit-slug>.resume.md`) and the loop-auto batch-review journal (`YYYY-MM-DD.<tokens>.<slug>-batch-review.md`) are the two fixed instances of that grammar.

## Archive and graduation

Moved work lands in `docs/archive/`, keeping its original filename.
Nothing is deleted on graduation; it is relocated there once superseded or completed.

## Verbose-announce convention

When a loop skill claims, completes, or updates the state of a tracked unit, it announces the action in one line naming the issue number and the new state, rather than staying silent about tracker writes.
