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

## Founder Signal Engine provider routing

For Founder Signal Engine, also read:

- [`.ai/skills/claude-zapier-founder-operator/SKILL.md`](.ai/skills/claude-zapier-founder-operator/SKILL.md)
- [`docs/founder-signal-engine/claude-zapier-operator.md`](docs/founder-signal-engine/claude-zapier-operator.md)
- [`docs/founder-signal-engine/zapier-steering-authority.md`](docs/founder-signal-engine/zapier-steering-authority.md)
- [`.ai/skills/chatgpt-openai-developers-zapier-bridge/SKILL.md`](.ai/skills/chatgpt-openai-developers-zapier-bridge/SKILL.md)

Current provider truth:

```text
Claude with connected Zapier MCP
-> direct Zapier and connected-app operator path within exposed scope

ChatGPT without direct Zapier MCP
-> existing OpenAI Developers bridge
-> approved Catch Hook, webhook, or named Founder Signal Engine target
-> Zapier invocation within exposed bridge scope
```

The OpenAI Developers bridge remains valid and operational. The current limitation is that ChatGPT does not have a direct Zapier MCP connection in its active connector set. Never report the missing ChatGPT MCP connection as an OpenAI bridge failure.

Claude's direct Zapier MCP path complements the OpenAI bridge. It does not replace it. The bridge also does not grant ChatGPT direct Zapier administration.

Use the strongest valid path that is actually available:

1. Claude should use connected Zapier MCP tools directly when they expose the required action.
2. ChatGPT should use the existing OpenAI Developers bridge when direct Zapier MCP is absent and the bridge exposes the required invocation.
3. Manual Zapier UI instructions are the final fallback only when neither path can perform the action.
4. Never create, rotate, duplicate, reveal, or paste an API key merely because direct MCP access is absent.

A Claude MCP tool run proves only the tool action actually returned. An OpenAI bridge invocation proves only the bridge action and artifacts actually returned. Neither path proves the complete Founder Signal Engine chain without the required Zapier, analysis, HubSpot, Buffer when applicable, and Founder Control Room evidence.

Using connected external tools under the scoped Founder Signal Engine contracts does not turn the Founder Control Room dashboard runtime into a general mutation layer. Keep repository runtime boundaries separate from agent tool authority.

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

## Implementation Discipline

Continue the same reasoning style while implementing code. Do not perform analysis once, then abandon it when editing begins.

Use this sequence for every material implementation:

```text
Goal → Reality → Redteam I → Lindy → L99 → Redteam II → OODA → Bill Gates → Elon Musk → Proof → Rollback → Next gate
```

After meaningful changes, re-observe repository state, tests, schemas, provider behavior, and runtime evidence.

The Bill Gates pass must identify the bottleneck, highest-leverage correction, reusable standard, and what should not be automated or scaled yet.

The Elon Musk pass must question the requirement, delete unnecessary complexity before optimizing it, simplify the remaining path, shorten the feedback loop without weakening proof, and automate only after repeatable success. It may not delete approval, privacy, audit, rollback, or evidence boundaries.

Compilation proves compilation. Unit tests prove tested behavior. CI proves repository workflow execution. Runtime observation proves deployed behavior. Never collapse those into one cheerful but fictional green checkmark.

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

Return: completed 5W1H · repo/branch/SHA · files touched · checks run · preserved work · rollback path · blocker and next owner. When the Implementation Discipline sequence applies, also report: goal, reality, premise risk, Lindy screen, L99 view, decision, plan risk, OODA action, Bill Gates bottleneck/leverage pass, Elon Musk requirement/deletion/simplification/feedback/automation pass.

Claude should strengthen founder control, not build an autonomous bureaucracy with an API key and delusions of governance.
