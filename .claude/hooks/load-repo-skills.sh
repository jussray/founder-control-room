#!/usr/bin/env bash
# SessionStart: put the repo-local skills/ index into context so every session
# applies them, not just the one where the founder asked.
root="${CLAUDE_PROJECT_DIR:-$(pwd)}/skills"
[ -d "$root" ] || exit 0
index=$(
  for f in "$root"/*/SKILL.md "$root"/juss-authored/*/SKILL.md; do
    [ -f "$f" ] || continue
    name=$(basename "$(dirname "$f")")
    desc=$(awk '/^description:/{sub(/^description: *>? */,""); if($0!=""){print; exit}; getline; print; exit}' "$f" | sed 's/^ *//' | cut -c1-160)
    [ -n "$desc" ] || desc=$(awk '/^---$/{c++;next} c>=2 && NF && !/^#/{print; exit}' "$f" | cut -c1-160)
    printf -- '- %s (%s): %s\n' "$name" "${f#${CLAUDE_PROJECT_DIR:-$(pwd)}/}" "$desc"
  done
)
jq -n --arg ctx "Founder instruction (2026-11-10): apply the repo-local skills in skills/ wherever their trigger fits; read the SKILL.md before using one.
$index" '{hookSpecificOutput: {hookEventName: "SessionStart", additionalContext: $ctx}}'
