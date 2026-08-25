# GitHub Truth MCP v0

Status: **classifier foundation only**

This bounded v0 starts the read-only GitHub Truth MCP proposed for Founder Control Room. The implemented slice is a pure, deterministic PR/CI evidence classifier under `src/mcp/github-truth/`. It does not mount an MCP route, add an external tool, call GitHub, write a receipt, change provider permissions, or claim deployed capability.

## Product contract

The intended founder-facing outcome is one `github.audit_pr` read tool that can eventually gather provider-native PR and CI observations, bind them to the exact current head, persist a minimized receipt through FCR, and return a verification summary. A receipt may report evidence state; it must never approve a merge, deployment, or other consequential action.

The eventual tool family remains deliberately narrow:

1. `github.get_repo_truth`
2. `github.get_pr_state`
3. `github.get_ci_evidence`
4. `github.audit_pr`

None of these names is present in the served external catalog yet. The current six-tool paired MCP authority ceiling remains unchanged.

## Implemented classifier contract

`evaluatePrAuditEvidence` accepts minimized pull-request, check-run, and workflow observations plus an injected audit time. It returns:

- `evidence_complete` only when the PR is open, all supplied CI evidence is fresh, every CI observation is bound to the exact current head, every outcome is a completed `success`, and no finding exists;
- `evidence_incomplete` for absent, failed, pending, unknown, malformed, stale, unbound, or wrong-head evidence;
- `evidence_conflicted` when the caller-bound expected head disagrees with provider observation, the provider head changes during collection, or duplicate current-head CI identities disagree.

The default freshness window is five minutes. A caller may request a shorter or longer positive whole-number window up to one hour. Malformed or future observation times are `unknown`; they never become current by assumption. Only a completed `success` counts as pass. `neutral`, `skipped`, missing, and unknown conclusions fail closed as unknown.

Every SHA used for identity binding must be a full 40-character Git SHA. A successful result for a prior SHA yields `ci_stale_for_head_sha` and cannot determine the current head's pass or fail conclusion.

## Data boundary

Classifier inputs contain only minimized repository evidence:

- PR number, state, base/head identity, and observation time;
- CI ID, name, head identity, status, conclusion, and observation time.

Raw patches, file contents, logs, bearer tokens, GitHub App credentials, cookies, device fingerprints, private prompts, and user content are outside this type contract.

## Current architecture audit

The current repository already provides the reusable pieces a later transport may compose:

- a Cloudflare Worker/Express runtime;
- the provider-independent `RepositoryProvider` boundary and GitHub implementation;
- an external paired MCP route with a fixed six-tool catalog;
- evidence and redacted MCP receipt concepts;
- Vitest, TypeScript, ESLint, and exact-head GitHub Actions gates.

Those source components do not prove live GitHub App permissions, live Supabase receipt tables, OAuth/client configuration, Cloudflare bindings, or deployed runtime behavior.

## Next implementation gate

Do not mount transport or expose `github.audit_pr` until a separate bounded review proves all of the following together:

1. read-only GitHub App permissions and an explicit repository allowlist;
2. bounded pagination, request timeouts, rate-limit handling, and provider error normalization;
3. initial and final PR-head reads around CI collection;
4. complete required-check discovery, including limited or unavailable visibility represented as incomplete evidence;
5. append-only receipt persistence through the existing FCR evidence boundary, with persistence failure causing the tool call to fail closed;
6. OAuth/project scope and external-tool-catalog changes reviewed as a new authority increment;
7. exact-head unit, mocked integration, permission, stale-state, spoofing, and receipt-failure tests;
8. current Supabase, Cloudflare, GitHub, ChatGPT, and Claude provider proof before any production-ready claim.

Do not expose a generic `github.create_receipt` tool. Receipt construction belongs inside the future audited composite path so an agent cannot turn arbitrary claims into authoritative-looking evidence.

## Rollback

Before transport integration, rollback is source-only: close the unmerged change or revert the classifier, tests, and this documentation. No provider, database, secret, deployment, or runtime rollback is required for this slice.
