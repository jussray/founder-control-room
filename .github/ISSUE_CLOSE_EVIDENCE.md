# Issue Closure Evidence Template

Post this as a new issue comment immediately before closing an issue. If the issue was reopened, post a new evidence comment for the current close cycle. Do not reuse or edit an older closure comment after clicking close.

```md
## Closure Evidence
Resolution: <what was actually resolved>
Scope: <code | docs | operations | non-code>
Exact head: <40-character commit SHA | not_applicable: specific reason>
Proof: <tests, workflow runs, screenshots, receipts, or authoritative evidence>
Rollback: <how to reverse the change or reopen the work>
Next gate: <next required action | none>
Unresolved risks: none
Founder approval: @jussray
```

## Rules

- The comment must be posted by `@jussray`.
- The comment must be created after the latest issue reopen and last edited before the current close event.
- Later evidence-shaped comments from other authors do not replace the founder's evidence.
- `Proof` may not be `none`.
- Code and documentation work require the exact 40-character SHA of the current repository default-branch head.
- Operational or non-code work may use `not_applicable: <reason>` only when no repository mutation exists.
- `Unresolved risks` must be exactly `none`. Approval cannot convert an unresolved tracked risk into completion.
- A rerun for an older close timestamp must not reopen or otherwise mutate a newer closure cycle.
- Merge, deployment, publication, payment, vendor activation, or verbal approval does not automatically authorize issue closure.
- A passing gate posts one idempotent closure receipt with the evidence comment ID, timestamps, and SHA-256 witness. It does not copy the raw evidence text.
- If the gate fails, GitHub Actions reopens the issue and posts the missing evidence fields.
