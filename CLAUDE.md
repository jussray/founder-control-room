# Claude Operating Contract — founder-control-room

This file governs Claude (claude.ai, Claude Code, MCP-connected sessions) when working in `jussray/founder-control-room`.

## 5W1H — Required Before Every Nontrivial Action

- **Who** — requester, decision owner, affected users, data subjects, execution authority.
- **What** — requested outcome, deliverable, non-goals, existing work to preserve.
- **Where** — `jussray/founder-control-room`, exact branch, environment, runtime, dashboard data sources, and provider boundary.
- **When** — current lifecycle/release state, ordering, timing, rollback window.
- **Why** — verified founder decision or oversight need and evidence.
- **How** — smallest safe implementation, permissions, verification, rollout, rollback.

For messaging, lead generation, sales automation, unified inbox, consent, outreach,
email, SMS, calls, webchat, Instagram, Facebook, WhatsApp, Telegram, Viber, or
channel-adapter work, also read:

- [`.ai/skills/unified-growth-inbox/SKILL.md`](.ai/skills/unified-growth-inbox/SKILL.md)
- [`docs/private/UNIFIED_GROWTH_INBOX_PLAN.md`](docs/private/UNIFIED_GROWTH_INBOX_PLAN.md)
- [`docs/private/UNIFIED_GROWTH_INBOX_COMPLIANCE_GATE.md`](docs/private/UNIFIED_GROWTH_INBOX_COMPLIANCE_GATE.md)
- [`config/unified-growth-inbox.channels.json`](config/unified-growth-inbox.channels.json)
- [`src/types/growthInbox.ts`](src/types/growthInbox.ts)

The default growth-inbox mode is `draft_only`. The existence of these contracts does
not authorize live outreach, calling, campaign launch, provider credentials, paid
services, deployment, pricing, discounts, or external publishing.

## Repository Identity

**Repository:** `jussray/founder-control-room`
**Role:** Founder-facing operational dashboard aggregating health, metrics, and status signals across all Chief AI ecosystem projects — Chief AI, Se’kret Bip, Think Tank, JBH, Untold Stories, and L99.
**Trust boundary:** This surface shows aggregated status. It must never become an execution layer — no mutations, no secrets storage, no direct project writes.

## Non-Negotiable Boundaries

- This dashboard is read-only and status-only — no execution, mutation, or secrets storage.
- Never expose raw credentials, private business data, vendor details, or customer/order records in the dashboard UI or any model output.
- Do not blend project-specific private data across project views.
- Credentials and integration tokens must stay in vault — never in client code.
- All production-touching changes require explicit founder approval.
- Keep the Control Room separate from Se’kret Bip’s database and service credentials.
- Preserve `RepositoryProvider` abstraction unless an approved architecture decision replaces it.
- Founder authentication is not enough; founder allowlist authorization must remain enforced.
- Curated operational events may cross project boundaries. Raw private user content must not.
- Never delete Juss’s material without explicit authorization for that specific deletion.
- Do not invent dashboard state, provider configuration, deployment success, approval history, demand, or revenue.
- Do not merge, deploy, rotate credentials, alter auth/RLS, publish externally, contact anyone, or perform destructive changes without explicit founder approval.

## Required Loop

1. Observe exact branch, data source configurations, and display boundaries.
2. Complete 5W1H and identify authority or safety gaps.
3. Red-team data exposure, cross-project blending, mutation creep, and rollback.
4. Choose smallest reversible action preserving existing work.
5. Run build and display-boundary checks.
6. Report proven, inferred, blocked, and next owner.

## Approval Gates

Require explicit founder approval before: merging, deploying, adding new data sources, changing integration scope, rotating secrets, or adding execution capabilities.

## Output Format

Return: completed 5W1H · repo/branch/SHA · files touched · checks run · preserved work · rollback path · blocker and next owner.
