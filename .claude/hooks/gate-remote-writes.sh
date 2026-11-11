#!/usr/bin/env bash
# PreToolUse(Bash) gate for GitHub remote writes.
#  - DENY any git push that targets main or production, however the flags are
#    ordered (`-u`, `-C dir`, `--force-with-lease`, `HEAD:refs/heads/main`, `+main`),
#    and a bare `git push` while the checked-out branch is main/production.
#    Prefix permission rules cannot catch reordered flags; this can.
#  - ALLOW (founder approval line, 2026-11-11: "Branches + PRs only"): ordinary
#    pushes to PR/feature branches and PR update-branch run without a prompt.
#  - ASK for force pushes to any branch, PR merges, ruleset API calls and
#    production workflow dispatches (Deploy, Worker Reconcile, Access recovery).
#    Merge, deploy, publish, spend, secrets and delete stay founder-approved.
#    In auto mode an "ask" may be resolved without a human; only DENY is a hard stop.
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
  positional=(); force=0
  for (( j=i+1; j<n; j++ )); do
    t="${tok[j]}"
    [[ "$t" == --force* || "$t" == -f || "$t" =~ ^-[a-zA-Z]*f[a-zA-Z]*$ ]] && force=1
    [[ "$t" == -* ]] && continue
    [[ "$t" == +* ]] && force=1
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
  (( force )) && emit ask "Force push rewrites branch history. Confirm the exact branch and why before allowing."
done < <(printf '%s\n' "$cmd" | sed -E 's/(&&|\|\||;|\|)/\n/g' | sed -E 's/^[[:space:]]*(cd [^ ]+[[:space:]]*)?//')

if printf '%s' "$cmd" | grep -Eq '/pulls/[0-9]+/merge|/rulesets( |/|$)|actions/workflows/(deploy|worker-reconcile|fcr-access-front-door-recovery)\.yml/dispatches'; then
  emit ask "Merge, ruleset or production dispatch: founder approval required for the exact PR/SHA."
fi
exit 0
