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
