#!/usr/bin/env bash
# Preflight for a jrit chain run: parse the task text, check the brief, the
# base branch, the graph cezar loaded, and the kit, then write the chain
# state and route the run. Runs inside the run worktree as a cezar check node.
set -uo pipefail

die() { echo "preflight: $1" >&2; exit 1; }

for v in CEZ_API_URL CEZ_PROJECT_ID CEZ_RUN_ID CEZ_BASE; do
  [ -n "${!v:-}" ] || die "$v is not set; run this as a cezar check node"
done

url="$CEZ_API_URL/api/v1/p/$CEZ_PROJECT_ID/runs/$CEZ_RUN_ID"
rec="$(curl -sf "$url")" || die "cannot read run $CEZ_RUN_ID from $url"

# 2. task text: <brief> [--from plan|drive|review] [--branch <branch>]
USAGE='<brief> [--from plan|drive|review] [--branch <branch>]'
read -r -a words <<< "$(printf '%s' "$rec" | jq -r '.task // ""')"
[ "${#words[@]}" -gt 0 ] || die "no brief in the task text; task text is: $USAGE"
brief="${words[0]}"
from=""
old=""
i=1
while [ "$i" -lt "${#words[@]}" ]; do
  w="${words[$i]}"
  case "$w" in
    --from)
      nv="${words[$((i + 1))]:-}"
      case "$nv" in
        plan|drive|review) from="$nv"; i=$((i + 2)) ;;
        *) die "unknown argument ${nv:-$w}; task text is: $USAGE" ;;
      esac
      ;;
    --branch)
      nv="${words[$((i + 1))]:-}"
      if [ -n "$nv" ]; then old="$nv"; i=$((i + 2)); else die "unknown argument $w; task text is: $USAGE"; fi
      ;;
    *)
      die "unknown argument $w; task text is: $USAGE"
      ;;
  esac
done

# 3. the brief is committed on the base branch
git cat-file -e "HEAD:$brief" 2>/dev/null \
  || die "brief $brief is not on $CEZ_BASE; commit and push it to $CEZ_BASE before starting a chain"

# 4. no unpushed base commits
if git rev-parse -q --verify "refs/remotes/origin/$CEZ_BASE" >/dev/null; then
  ahead="$(git rev-list --count "origin/$CEZ_BASE..HEAD")"
  [ "$ahead" -eq 0 ] || die "$CEZ_BASE has $ahead commits not on origin; push them before starting a chain"
else
  echo "note: no origin/$CEZ_BASE; push check skipped"
fi

# 5. the graph cezar loaded (the project root's copy) matches this worktree's
common="$(git rev-parse --path-format=absolute --git-common-dir)"
root="${common%/*}"
graph=".ai/cezar/workflows/jrit-chain.yaml"
if ! cmp -s "$graph" "$root/$graph"; then
  {
    echo "preflight: the graph cezar loaded ($root) differs from this run's branch; keep the project root on main with no uncommitted kit edits"
    git diff --no-index --stat "$root/$graph" "$graph"
  } >&2
  exit 1
fi

# 6. the loop pointer
[ -f docs/loop/pointer.md ] || die "docs/loop/pointer.md is missing; run loop-setup in this repo first"

# 7. the tracker issue number
name="$(basename "$brief")"
issue=""
if [[ "$name" =~ \.I([0-9]+)\. ]]; then
  issue="${BASH_REMATCH[1]}"
else
  issue="$(git show "HEAD:$brief" | sed -n 's/^Tracker:.*#\([0-9][0-9]*\).*/\1/p' | head -n 1)"
fi
[ -n "$issue" ] || die "no issue number: name the brief <date>.I<n>.<slug>-brief.md or give it a Tracker: line with #<n>"

# 8. dispatched marker and chain state
branch="$(git branch --show-current)"
printf '%s\n' "$branch" > "$(git rev-parse --path-format=absolute --git-path jrit-loop-dispatched)"
printf '%s\n' "$CEZ_BASE" > "$(git rev-parse --path-format=absolute --git-path jrit-chain-base)"
printf '%s\n' "$brief" > "$(git rev-parse --path-format=absolute --git-path jrit-chain-brief)"
printf '%s\n' "$issue" > "$(git rev-parse --path-format=absolute --git-path jrit-chain-issue)"

# 9. merge a named old branch
merged=""
if [ -n "$old" ]; then
  git rev-parse -q --verify "refs/heads/$old" >/dev/null || die "branch $old not found"
  if ! git merge --no-edit "$old" >/dev/null 2>&1; then
    files="$(git diff --name-only --diff-filter=U | tr '\n' ' ')"
    files="${files% }"
    git merge --abort 2>/dev/null
    die "merging $old conflicts in: $files"
  fi
  merged="$(git rev-parse "$old" | cut -c1-12)"
fi

# 10. kit integrity: the kit and the graph match the base branch
. ./.ai/jrit/kit-lib.sh || die "cannot load .ai/jrit/kit-lib.sh; restamp the chain kit"
bad=$(kit_diff "$CEZ_BASE")
if [ -n "$bad" ]; then
  {
    echo "preflight: the chain kit on this branch differs from $CEZ_BASE:"
    printf '%s\n' "$bad"
  } >&2
  exit 1
fi

# 11. a restart at drive or review needs a committed, passing plan
plan=""
if [ "$from" = drive ] || [ "$from" = review ]; then
  plan="$(python3 .ai/jrit/plan_tool.py find-plan)" \
    || die "--from $from needs a committed plan on this branch; pass --branch <the branch that holds it>"
  python3 .ai/jrit/plan_tool.py check "$plan" >/dev/null 2>&1 \
    || die "--from $from needs a committed plan on this branch; pass --branch <the branch that holds it>"
fi

# 12. durable branch
git branch -f "jrit/chain-I$issue" HEAD

# 13. summary and route
echo "Brief: $brief"
echo "Issue: #$issue"
echo "Base: $CEZ_BASE"
echo "Branch: $branch"
echo "Durable branch: jrit/chain-I$issue"
[ -n "$merged" ] && echo "Merged: $old ($merged)"
[ -n "$plan" ] && echo "Plan: $plan"
echo "Route: ${from:-plan}"
exit 0
