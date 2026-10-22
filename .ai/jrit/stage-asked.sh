#!/usr/bin/env bash
# Print the latest question round for the card: find the node that flowed
# into this step and print its summary as a question when the last line is
# the JRIT-ASK marker. Runs inside the run worktree as a cezar check node.
# A last line "JRIT-ASK <json>" whose JSON passes cezar's own parseAskRequest
# prints that JSON alone on one line (the ask-user node renders it as the
# structured card), its first question prefixed "Card <k>: ". JSON that
# fails the check falls back to the text card; when node or ask.js is
# missing, the jq shape test alone decides. A bare "JRIT-ASK" last line
# prints the text card; any other reply prints "No question from <src>".
set -uo pipefail

die() { echo "stage-asked: $1" >&2; exit 1; }

for v in CEZ_API_URL CEZ_PROJECT_ID CEZ_RUN_ID CEZ_STEP_ID; do
  [ -n "${!v:-}" ] || die "$v is not set; run this as a cezar check node"
done

url="$CEZ_API_URL/api/v1/p/$CEZ_PROJECT_ID/runs/$CEZ_RUN_ID"
rec="$(curl -sf "$url")" || die "cannot read run $CEZ_RUN_ID from $url"

# source node: the text before the first "." of the last edge into this step
src="$(printf '%s' "$rec" | jq -r --arg step "$CEZ_STEP_ID" '
  [.graphState.taken[]? | select(endswith("->" + $step))][-1]
  | if . == null then empty else split(".")[0] end')"
[ -n "$src" ] || die "no edge into $CEZ_STEP_ID in graphState.taken"

sum="$(printf '%s' "$rec" | jq -r --arg s "$src" '.graphState.outputs[$s].summary // ""')"
last="$(printf '%s\n' "$sum" | sed '/^[[:space:]]*$/d' | tail -n 1)"
text_card() {
  echo "Question from the $src step$1:"
  if [ "$sum" != "$last" ]; then
    printf '%s\n' "${sum%$'\n'*}"
  fi
}

ask_js="${JRIT_CEZAR_PREFIX:-$HOME/.local/share/jrit/cezar}/node_modules/@open-mercato/cezar/dist/core/ask.js"
case "$last" in
  "JRIT-ASK "*)
    stage="${CEZ_STEP_ID%-asked}"
    k="$(printf '%s' "$rec" | jq -r --arg k "$stage-ask-rounds" '(.graphState.loops[$k] // 0) + 1')"
    json="$(printf '%s' "${last#JRIT-ASK }" | jq -c --argjson k "$k" '
      select((.questions | type) == "array" and (.questions | length) > 0)
      | .questions[0].question |= "Card \($k): " + (. // "")' 2>/dev/null)"
    ok=1
    [ -n "$json" ] || ok=0
    if [ "$ok" = 1 ] && [ -f "$ask_js" ] && command -v node >/dev/null 2>&1; then
      node --input-type=module -e 'const m = await import(process.argv[1]); process.exit(m.parseAskRequest(JSON.parse(process.argv[2])) ? 0 : 1);' "$ask_js" "$json" >/dev/null 2>&1 || ok=0
    fi
    if [ "$ok" = 1 ]; then
      printf '%s\n' "$json"
    else
      text_card " (its card did not parse; reply resend to have it printed again)"
    fi ;;
  "JRIT-ASK") text_card "" ;;
  *) echo "No question from $src; continuing." ;;
esac
exit 0
