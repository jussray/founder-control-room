# Operational Memory Bootstrap — FCR Canon Extension

Status: SOURCE CONTRACT ONLY. This document is not proof of a deployed API, database write, or connected agent runtime.

## Existing authority

Extend `src/lib/canonKnowledge.ts`, `docs/CANON_KNOWLEDGE_POLICY.md`, existing FCR evidence/continuity stores, and existing FCR authorization. Do not create another control plane or a parallel source of truth.

## Mandatory agent entry

Before claiming a previously working integration is missing or unusable, an authorized agent MUST:
1. Resolve the exact project, environment, repository, and current commit/runtime identity.
2. Retrieve relevant authorized last-known-verified canon records, linked evidence, and predecessor receipts from the existing FCR service.
3. Compare historical proof scope with current requirements. A past success remains historical evidence even when it is no longer current authorization.
4. Reuse a proven method when compatible, revalidating live credentials/permissions without exposing secrets.
5. Distinguish NO_RECORD, ACCESS_DENIED, PROVIDER_UNAVAILABLE, HISTORICAL_SUCCESS, CURRENT_VERIFIED, and CURRENT_BLOCKED. A failed lookup MUST NOT be reported as a missing credential or non-existent workflow.
6. Before any mutation, enforce current founder authority, expected SHA, PR and environment scope, independent review/proof gates, and GitHub/Cloudflare/Supabase provider permissions.
7. After execution, append a sanitized receipt with actor, UTC timestamp, project, repository, exact SHA, environment, action, evidence URL/digest, observed outcome, verification scope, next gate, and invalidation conditions. Preserve predecessors.

## Read-only API contract (proposed, not deployed)

`GET /api/canon/bootstrap?project=<slug>&environment=<name>` must require FCR-authenticated project-scoped read permission. Return only non-secret records the actor is entitled to view, including latest verified event, historical receipts, freshness status, and exact proof scope. Never return raw credentials, personal content, teen data, or private provider payloads. Return explicit 401/403/503 for authentication/authorization/provider failure, never an empty successful record list in those cases.

`POST /api/canon/receipts` must be server-only and must use the existing trusted `verifyEvidence` and `authorizeWrite` gates; caller-provided verified flags do not establish proof. Append-only transaction and idempotency are required before production use.

## Product experience

Within the existing private FCR control room, provide a **Working Knowledge** view: search by project/capability, last verified time, historical vs current state, exact evidence link, compatibility check, authority required, and a **Reuse workflow** action that creates an approval-gated intent, never directly performs a privileged action.

## Provider boundaries

- GitHub: existing PR #1055, no new PR; preserve branch protections and exact-head checks.
- Supabase: reuse existing evidence and continuity structures where semantics fit; inspect existing constraints, RLS, and grants before any migration. No anonymous/client write permissions.
- Cloudflare: use existing FCR Worker and Access boundary; deploy only after exact-head CI and founder production authorization.
- Agents: integrate bootstrap into existing AGENTS/Claude/Codex entry points; unavailable connectors must report the failure distinctly from NO_RECORD.

## Acceptance evidence (all required before declaring live)

1. Trusted append and readback survive fresh sessions and return the same historical receipt.
2. Two independently started agents retrieve and reuse a known successful workflow, after validating current compatibility.
3. Wrong-project actor receives 403; unauthenticated request receives 401; provider outage returns a distinct failure, not empty history.
4. Forged proof, stale SHA, unauthorized mutation, and duplicate receipt are rejected.
5. Predecessor receipt remains readable after a newer verified event supersedes it.
6. GitHub exact-head CI, Supabase RLS/advisors, Cloudflare deployed Worker identity, and authenticated production-browser proof are independently recorded.
7. Only then mark the integration CURRENT_VERIFIED. No README, mock, source commit, or green unit test alone establishes production success.
