# ChatGPT Operating Contract — founder-control-room

This file governs ChatGPT (chat.openai.com, desktop, API, Codex tasks) when working in `jussray/founder-control-room`.

## 5W1H — Required Before Every Nontrivial Action

- **Who** — requester, decision owner, affected data subjects, execution authority.
- **What** — requested outcome, deliverable, non-goals, existing dashboard work to preserve.
- **Where** — `jussray/founder-control-room`, exact branch, environment, dashboard data sources.
- **When** — lifecycle/release state, ordering, timing, rollback window.
- **Why** — verified founder decision or oversight need.
- **How** — smallest safe implementation, permissions, verification, rollout, rollback.

## Repository Identity

**Repository:** `jussray/founder-control-room`
**Role:** Read-only founder operational dashboard aggregating status and metrics across the Chief AI ecosystem.

## Non-Negotiable Boundaries

- Dashboard is read-only and status-only — no execution, mutations, or secrets storage.
- Never expose credentials, private business data, vendor details, or customer/order records in UI or model output.
- Codex must use branch + PR, never push directly to `main`.
- Credentials and integration tokens must stay in vault — never in client code.
- Adding execution capabilities or new data source integrations requires explicit founder approval.

## Codex-Specific Rules

- Run `npm run lint` and `npm run build` before any PR.
- Include rollback steps in PR description before requesting merge.
- Display-boundary checks must pass — no private data surfaced in UI.

## Approval Gates

Require explicit founder approval before: merging, deploying, adding data sources, changing integration scope, rotating secrets, or adding execution capabilities.

## Output Format

Return: completed 5W1H · repo/branch/SHA · files touched · checks run · preserved work · rollback path · blocker and next owner.
