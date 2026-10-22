#!/usr/bin/env bash
# Classify a stopped step: only the 30-minute cut-off continues the same
# session; a quota stop and every other failure end the chain. Runs inside
# the run worktree as a cezar check node.
set -uo pipefail

for v in CEZ_API_URL CEZ_PROJECT_ID CEZ_RUN_ID CEZ_STEP_ID; do
  [ -n "${!v:-}" ] || { echo "stage-cut-reason: $v is not set; run this as a cezar check node" >&2; exit 1; }
done

url="$CEZ_API_URL/api/v1/p/$CEZ_PROJECT_ID/runs/$CEZ_RUN_ID"
rec="$(curl -sf "$url")" \
  || { echo "stage-cut-reason: cannot read run $CEZ_RUN_ID from $url" >&2; exit 1; }

# source node: the text before the first "." of the last edge into this step
src="$(printf '%s' "$rec" | jq -r --arg step "$CEZ_STEP_ID" '
  [.graphState.taken[]? | select(endswith("->" + $step))][-1]
  | if . == null then empty else split(".")[0] end')"
[ -n "$src" ] \
  || { echo "stage-cut-reason: no edge into $CEZ_STEP_ID in graphState.taken" >&2; exit 1; }

err="$(printf '%s' "$rec" | jq -r --arg s "$src" '[.steps[]? | select(.id == $s)][-1].error // ""')"

if printf '%s' "$err" | grep -q 'claude CLI timed out after'; then
  echo "cut off by the 30-minute step limit: $src; continuing the same session"
  exit 0
fi
if printf '%s' "$err" | grep -iqE 'usage limit|rate limit|quota|limit reached|429'; then
  echo "quota stop: $src: $err"
  exit 1
fi
echo "stopped: $src failed: ${err:-no error recorded}"
exit 1
