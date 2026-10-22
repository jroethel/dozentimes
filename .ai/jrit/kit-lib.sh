# Shared kit helpers, sourced as .ai/jrit/kit-lib.sh from the run worktree.

# kit_diff <base ref>: one path per line for every file under .ai/jrit/ in HEAD or the base,
# plus the chain graph, whose blob differs between HEAD and the base (absent on one side
# counts as differing); prints nothing when they match.
kit_diff() {
  local base=$1 p
  while IFS= read -r p; do
    [ -n "$p" ] || continue
    [ "$(git rev-parse -q --verify "HEAD:$p")" = "$(git rev-parse -q --verify "$base:$p")" ] || printf '%s\n' "$p"
  done < <({ git ls-tree -r --name-only HEAD -- .ai/jrit; git ls-tree -r --name-only "$base" -- .ai/jrit; printf '%s\n' .ai/cezar/workflows/jrit-chain.yaml; } | sort -u)
  return 0
}
