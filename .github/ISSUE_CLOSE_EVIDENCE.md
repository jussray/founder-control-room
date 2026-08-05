# Issue Closure Evidence Template

Post this as a new issue comment immediately before closing an issue.

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
- `Proof` may not be `none`.
- Code and documentation work require the exact 40-character head SHA.
- Operational or non-code work may use `not_applicable: <reason>` only when no repository mutation exists.
- `Unresolved risks` must be exactly `none`. Approval cannot convert an unresolved tracked risk into completion.
- Merge, deployment, publication, payment, vendor activation, or verbal approval does not automatically authorize issue closure.
- If the gate fails, GitHub Actions reopens the issue and posts the missing evidence fields.
