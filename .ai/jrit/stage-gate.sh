#!/usr/bin/env bash
# Stage gate: the plan and drive gates the chain graph runs, from the run
# worktree, with the base branch handed in as CEZ_BASE by the check node.
set -uo pipefail
TOOL=".ai/jrit/plan_tool.py"

fail() { echo "stage gate: $1"; exit 1; }

# RV5: a passing gate moves the durable branch to the run head.
durable_branch() {
    issue="$(git rev-parse --git-path jrit-chain-issue)"
    [ -f "$issue" ] || fail "no jrit-chain-issue; preflight did not run in this worktree"
    n="$(cat "$issue")"
    git branch -f "jrit/chain-I$n" HEAD || exit 1
    echo "Durable branch: jrit/chain-I$n -> $(git rev-parse HEAD | cut -c1-12)"
}

find_plan() {
    plan="$(python3 "$TOOL" find-plan --base "$CEZ_BASE")" || {
        printf '%s\n' "$plan"
        exit 1
    }
    echo "Plan: $plan"
}

case "${1:-}" in
plan | drive | ownership) ;;
*)
    echo "usage: stage-gate.sh plan|drive|ownership"
    exit 2
    ;;
esac
[ -n "${CEZ_BASE:-}" ] || fail "CEZ_BASE is not set; run this as a cezar check node"

case "$1" in
plan)
    find_plan
    python3 "$TOOL" check "$plan" --base "$CEZ_BASE" || exit 1
    ;;
drive)
    find_plan
    python3 "$TOOL" check "$plan" --base "$CEZ_BASE" || exit 1
    python3 "$TOOL" ownership "$plan" --base "$CEZ_BASE" || exit 1
    python3 "$TOOL" run-checks "$plan" || exit 1
    ;;
ownership)
    find_plan
    python3 "$TOOL" ownership "$plan" --base "$CEZ_BASE" || exit 1
    ;;
esac
durable_branch
