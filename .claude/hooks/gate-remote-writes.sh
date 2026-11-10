#!/usr/bin/env bash
# PreToolUse(Bash) gate for GitHub remote writes.
#  - DENY any git push that targets main or production, however the flags are
#    ordered (`-u`, `-C dir`, `--force-with-lease`, `HEAD:refs/heads/main`, `+main`),
#    and a bare `git push` while the checked-out branch is main/production.
#    Prefix permission rules cannot catch reordered flags; this can.
#  - ASK before every other remote write: git push, PR update-branch, PR merge,
#    ruleset API calls. Ruleset 20819094 targets ~ALL and this credential can
#    bypass it, so the prompt is the visible checkpoint. In auto mode an "ask"
#    may be resolved without a human; only the DENY branch is a hard stop.
cmd=$(jq -r '.tool_input.command // ""')
emit() {
  jq -n --arg d "$1" --arg r "$2" \
    '{hookSpecificOutput: {hookEventName: "PreToolUse", permissionDecision: $d, permissionDecisionReason: $r}}'
  exit 0
}
protected='^(\+?)((HEAD|[^:]*):)?(refs/heads/)?(main|production)$'
# Walk every `git ... push ...` segment of the command line.
while IFS= read -r seg; do
  read -r -a tok <<<"$seg"
  i=0; n=${#tok[@]}
  [[ "${tok[0]:-}" == git ]] || continue
  i=1
  while (( i < n )) && [[ "${tok[i]}" != push ]]; do
    [[ "${tok[i]}" == -C || "${tok[i]}" == -c ]] && dir="${tok[i+1]:-}" && (( i++ ))
    (( i++ ))
  done
  (( i < n )) || continue
  positional=()
  for (( j=i+1; j<n; j++ )); do
    t="${tok[j]}"
    [[ "$t" == -* ]] && continue
    positional+=("$t")
  done
  # positional[0] = remote, rest = refspecs
  for ref in "${positional[@]:1}"; do
    [[ "$ref" =~ $protected ]] && emit deny "Direct push to ${BASH_REMATCH[5]} is denied. Integrate through a PR with exact-SHA founder approval (docs/FOUNDER_MERGE_AUTHORITY.md)."
  done
  if (( ${#positional[@]} <= 1 )); then
    cur=$(git -C "${dir:-${CLAUDE_PROJECT_DIR:-.}}" rev-parse --abbrev-ref HEAD 2>/dev/null)
    [[ "$cur" == main || "$cur" == production ]] && emit deny "Bare git push from protected branch $cur is denied."
  fi
  emit ask "Remote write to GitHub. Ruleset 20819094 targets ~ALL and this credential can bypass it: confirm the exact branch/PR/SHA before allowing."
done < <(printf '%s\n' "$cmd" | sed -E 's/(&&|\|\||;|\|)/\n/g' | sed -E 's/^[[:space:]]*(cd [^ ]+[[:space:]]*)?//')

if printf '%s' "$cmd" | grep -Eq 'update-branch|/pulls/[0-9]+/merge|/rulesets( |/|$)'; then
  emit ask "GitHub PR/ruleset write. Confirm the exact PR/SHA before allowing."
fi
exit 0
