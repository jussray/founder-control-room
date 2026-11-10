#!/usr/bin/env bash
# PreToolUse(Bash) gate: any command that writes to the GitHub remote
# (git push, PR branch update, PR merge, ruleset write) must be approved by
# the founder in the permission prompt. The live ruleset lets this credential
# bypass branch rules silently, so the prompt is the only visible checkpoint.
cmd=$(jq -r '.tool_input.command // ""')
if printf '%s' "$cmd" | grep -Eq '(^|[;&|(` ]|\s)git( -C [^ ]+)? push( |$)|update-branch|/pulls/[0-9]+/merge|/rulesets( |/|$)'; then
  jq -n '{
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "ask",
      permissionDecisionReason: "Remote write to GitHub. Ruleset 20819094 targets ~ALL and this credential can bypass it: confirm the exact branch/PR/SHA before allowing."
    }
  }'
fi
exit 0
