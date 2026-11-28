---
name: founder-ip-protection
description: Apply the Juss & Co. Founder-Owned IP Protection Standard across repositories, AI providers, integrations, agents, and standalone products. Use for ownership/provenance, licensing, training/data use, confidentiality/isolation, portability, or auditability work.
---

# Founder IP Protection

**Status:** Candidate skill; not active policy until its governing PR is approved and merged.

## Objective

Protect founder-owned work without inventing ownership, overriding third-party licenses, collapsing standalone products, or treating technical access as permission.

## Required session kernel and specialist skills

Use Development OS as the session kernel. Co-activate only the relevant specialists:

- Lean Repository Execution for canonical-owner-first changes, branch safety, reversible mutations, and verification cadence.
- Specialist Reasoning for architecture, privacy/security, IP/licensing, operational and failure-mode challenges.
- Code Work for explicitly authorized implementation.
- Code Verification for independent, read-only verification.
- Cloudflare Security Audit for a scoped security audit when requested or materially required.
- Secrets and API Leak Prevention for credentials, outbound requests, and sensitive logging.
- Cloudflare Security Boundaries for Cloudflare identity, storage, cache, queues, and tenant-isolation paths.

Do not claim a skill was invoked unless its instructions were actually loaded and applied. Distinguish AVAILABLE, LOADED, APPLIED, VERIFIED, and NOT USED.

## Plugin routing

Use the connected plugin that owns the authoritative system:

- GitHub: repositories, source, branches, PRs, reviews, checks, and source provenance.
- Cloudflare: Cloudflare documentation, account, Workers, Pages, storage, security, and deployment evidence when those boundaries are in scope.
- Supabase: only when Supabase schema, RLS, Auth, storage, or runtime behavior is actually in scope; load the Supabase skill first.
- Files: conversation and Library artifacts only; never substitute for repository truth.
- Other plugins: discover and use only when their external system is part of the actual data path or requested work.

Plugin availability is not authorization. A plugin result is not a founder approval. Do not invoke unrelated plugins merely to claim broad coverage.

## Six control tracks

1. **Ownership and provenance:** identify the asset, author/contributor, source history, third-party inputs, and applicable license. Never infer exclusive ownership from repository administration or product branding.
2. **Explicit licensing and permissions:** bind every grant to exact assets, recipient, purpose, permitted operations, term, attribution, sublicensing, derivative rights, revocation, and written approval where required.
3. **AI training and provider data use:** identify provider, product/plan, terms and review date, data transmitted, training/retention settings, and evidence. Unknown settings mean confidential data flow is not approved.
4. **Confidentiality and isolation:** trace authenticated identity through APIs, storage, caches, queues, logs, model calls, and cross-product handoffs. Enforce server-side scope and negative tests.
5. **Portability and continuity:** verify exports, imports/restores, source and asset provenance, provider exit, and deletion behavior. A documented intention is not a tested export.
6. **Auditability and enforcement:** maintain a source-backed integration register, approval/access receipts, automated policy checks, exact-head CI, and runtime/provider readback.

## License compatibility guard

Read each repository's current LICENSE and third-party notices before asserting ownership or changing licensing.

- Proprietary licenses apply only to material their owner can lawfully license.
- Apache-2.0, MIT, GPL, and other third-party/open-source licenses must be honored as granted.
- Never retroactively claim that a new policy revokes rights already granted by a published license.
- For SolContinuity, the inspected LICENSE is Apache License 2.0 and names "SolContinuity contributors"; treat exclusive founder ownership and chain of title as UNKNOWN until contribution records and assignments are reviewed.
- Keep first-party contributions, third-party dependencies, user content, provider outputs, and contributor-authored code distinct.

## Authority and execution boundaries

- FCR owns cross-project governance, its approvals, evidence registry, and release gates.
- Chief AI Machine reasons, researches, routes and proposes; it does not self-authorize execution.
- PromptOS owns its standalone prompts, skills, workflows and instruction governance; its outputs do not grant write authority.
- SolContinuity independently challenges and verifies continuity/evidence; it does not approve itself.
- Every standalone product retains its own identity, data, credentials, and operational authority.
- External AI providers are replaceable capabilities, not portfolio owners.
- No merge, deployment, publication, provider mutation, credential rotation, license change, or data deletion follows from this skill alone.

## Evidence and reporting

Classify each claim as VERIFIED, INFERRED, UNKNOWN, or BLOCKED. Bind findings to exact repository, ref/SHA, file/path, provider, and observation time where available.

For browser behavior, use Playwright on the exact candidate head. For provider state, use provider-native readback. Tests prove only what they exercise. Never describe a source document or policy as runtime enforcement.

Report:
- REALITY
- FIX
- PROOF
- RISK
- ROLLBACK
- NEXT GATE

Stop when the current referent is complete or reaches a genuine founder/provider approval boundary.


## Full skill and plugin capability remembrance

Treat the installed skill and connected-plugin catalogs as live capability registries, not static model memory.

At the start of each material continuation:
1. Discover the current installed skill catalog and available plugin/tool catalog.
2. Match task scope to the skill trigger and the authoritative system owner.
3. Read the complete applicable skill instructions and required references before using its tools.
4. Record capability state precisely: `AVAILABLE`, `LOADED`, `APPLIED`, `VERIFIED`, or `NOT USED`.
5. Re-discover after tool/plugin installation changes; do not assume a prior catalog snapshot is current.
6. Invoke only the minimum relevant plugin set. Availability is not permission, and a connected plugin is not proof it was used.

### Repository-native skill chain for FCR work

Before FCR code, configuration, schemas, providers, verification contracts, or documentation changes, apply the exact current repository instructions and the relevant local skills. For this IP-protection workflow, the inspected FCR skill set includes:

- `.ai/skills/juss-founder-os/SKILL.md` — founder intent, OODA, brand/IP, evidence and authority.
- `skills/outcome-first/SKILL.md` — outcome, authority, constraints, acceptance and stop.
- `skills/portfolio-control-plane/SKILL.md` — cross-repository governance and provider boundaries.
- `skills/devil/SKILL.md` — premise and selected-plan attack.
- `skills/ultrathink-suite/README.md` and `skills/ultrathink-attack-godmode/SKILL.md` — authorized adversarial execution.
- `skills/repair-to-proof/SKILL.md` — exact-head verification and release gate.
- `skills/continuity-proof-ledger/SKILL.md` — provenance, supersession and handoff.
- `.claude/skills/confidentiality-gate/SKILL.md` — outbound disclosure classification and approval.
- `skills/typescript-audit/SKILL.md` — required before FCR TypeScript/JavaScript/Worker edits.
- `skills/typescript-root-cause-debugger/SKILL.md`, `skills/typescript-minimal-patch/SKILL.md`, `skills/typescript-behavior-tests/SKILL.md`, and `skills/typescript-strict-review/SKILL.md` — load when their respective debugging, implementation, test, and review triggers apply.

This list is not a claim that every listed skill was invoked in every task. Use the exact repository-local source as authority and report actual invocation state.

### Plugin routing memory

- **GitHub:** source, branch, PR, review, CI and repository evidence. Use the exact repository and head.
- **Cloudflare:** account identity, Pages/Workers deployments, routes, bindings, security and runtime readback. Search endpoint contracts before API execution; use read-only methods for preflight.
- **Supabase:** app-specific project identity, migrations, tables, RLS, grants, advisors, auth and Edge Functions. Read the Supabase skill before any Supabase task. Never query private end-user content for this IP review.
- **Atlassian Rovo (Legacy):** Jira/Confluence issue and internal-document discovery where the user/workflow has authorized workspace scope. It is a knowledge/work-item source, never repository, runtime, provider, ownership, or approval truth.
- **Notion:** workspace knowledge, skill and decision records where explicitly relevant; not a substitute for source repository or provider truth.
- **Files:** conversation uploads and Library artifacts; not a substitute for connector-native repository or account records.
- **Plugin Management:** discover available app capabilities and permissions; installing or changing broad permissions always requires explicit user action.
- **Other connected plugins:** route by the system that owns the authoritative record (for example Stripe for payment-provider state, Resend for email-provider state, Vercel for Vercel deployments, AWS for AWS resources, and GitBook for GitBook documentation). Do not invoke unrelated providers or infer they are in use from installation alone.

### Cross-system rule

The skill catalog and plugin catalog are capability inventories. They do not become a global agent runtime, do not automatically install into Chief/PromptOS/SolContinuity, and do not grant those agents access. Each standalone system must explicitly load or implement its own adapter/skill contract and prove the resulting behavior. Preserve product-local stricter rules and FCR's final approval boundary.
