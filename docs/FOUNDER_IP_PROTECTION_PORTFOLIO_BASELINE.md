# Founder IP Protection Portfolio Baseline

**Status:** Initial source inspection; partial coverage, not certification  
**Review date:** 2026-11-26  
**Authority:** Founder Control Room governance review  
**Scope:** FCR, Chief AI Machine, PromptOS, SolContinuity  
**Purpose:** Establish the actual rights and control baseline before implementing the six protection tracks.

## Executive finding

The four systems are standalone peers with distinct product ownership and execution boundaries. Existing source already contains meaningful IP and authority controls, but the portfolio is not yet uniformly governed by one verified integration register or one demonstrated enforcement path.

**Critical license distinction:** Chief AI Machine and PromptOS currently publish proprietary/no-reuse license notices. SolContinuity's checked-in LICENSE is Apache License 2.0 and its copyright line says "SolContinuity contributors". The portfolio standard must not overwrite, contradict, or imply revocation of the Apache 2.0 rights already granted. SolContinuity ownership and contribution provenance require a separate chain-of-title review before any exclusive ownership claim or license change.

## Evidence observed

| System | Evidence | Observed state | Limitation |
|---|---|---|---|
| FCR | `docs/FOUNDER_OWNED_IP_PROTECTION_STANDARD.md`, PR #1182 | Six-control governance proposal exists | Proposal is not a runtime enforcement mechanism or approved portfolio certification |
| Chief AI Machine | `README.md`, `LICENSE`, `AGENTS.md`, `.agents/skills/juss-os/references/os.md` | Proprietary license; explicit separation from FCR execution authority; commercial-use review guard requires founder approval before nonpublic work is used commercially | Does not by itself prove provider-side training settings, outbound data inventory, or all runtime isolation |
| PromptOS | `LICENSE`, `AGENTS.md`, `.control-room/product-boundary.json`, `docs/FOUNDER_INTELLIGENCE_CONSTITUTION.md` | Proprietary license; standalone product boundary; no execution, provider-authentication, deployment, or publication authority; human-agency and privacy principles | Does not by itself prove every plugin/provider data path, training setting, export path, or live isolation |
| SolContinuity | `LICENSE`, `README.md`, `AGENTS.md`, `SECURITY.md` | Apache-2.0 license; README copyright names contributors; independent verification role and no FCR release authority | Copyright ownership/assignment and contribution provenance are unresolved; do not assert exclusive founder ownership of all repository contents |

### Source fingerprints

- Chief README blob: `735836938533760b7bc78bbbd538eea6585a1eae`
- Chief LICENSE blob: `e58abba974109129fed1ee06ee866813aa4f3c9a`
- Chief AGENTS blob: `5b9d0ed40b014d2962703cba106b7b04bf19e387`
- Chief commercial-use guard blob: `80e8476ae2805950956b1333804f020967a7d6ea`
- PromptOS README blob: `c37b2d9269b61cf14a07855c9dac4fec5eb0778f`
- PromptOS LICENSE blob: `9e60fe2569b1431bff3353097bf13d85f05e88a5`
- PromptOS product-boundary contract blob: `cb684d271f62379c888c9155cf41783c5df657cb`
- PromptOS council-residency contract blob: `7f0162af04159924d267fb95b5f6952d364466af`
- PromptOS constitution blob: `6580aed512d30edb549754d50e547db2e6636e99`
- SolContinuity README blob: `bc6356ded8130d302b4ea1aa9dbcfe92cef13ee7`
- SolContinuity LICENSE blob: `aafda4b77d41ab1ffef07b70b4de15e62e274799`
- SolContinuity AGENTS blob: `5218dbbcd700024cd9a1365ee711b69e5c4e8cc5`
- SolContinuity SECURITY blob: `9c742973c2c1c44410a2cca0f7b1f0be9a35f971`

These are file/blob fingerprints, not repository commit SHAs or proof of deployment.

## Six-track implementation ledger

| Track | Current source evidence | Remaining work | State |
|---|---|---|---|
| 1. Ownership and provenance | Proprietary licenses in Chief and PromptOS; Apache-2.0 in SolContinuity | Establish authorship/contributor chain, asset provenance, third-party notices, and license compatibility per repo | PARTIAL / SOL OWNERSHIP UNKNOWN |
| 2. Explicit licensing and permission boundaries | Chief commercial-use guard; PromptOS advisory-only authority contract; FCR founder approval boundary | Normalize scoped grants, allowed operations, expiry/revocation, and exact asset/recipient binding in native contracts | PARTIAL |
| 3. AI training and provider data use | Provider-neutrality doctrine and external provider seats documented | Inventory provider, plan, terms URL/version, training/retention controls, transmitted data classes, and evidence for every active path | UNKNOWN |
| 4. Confidentiality and data isolation | Standalone peer topology; separate product boundaries; Sol security reporting guidance | Trace authenticated identity through storage, cache, logs, queues, model calls, and cross-product handoffs; add negative isolation tests | PARTIAL / RUNTIME UNKNOWN |
| 5. Portability and continuity | Provider-neutral product intent; source repositories and portable workflows | Verify export formats, completeness, restore/import, deletion behavior, and provider-exit continuity for each product | UNKNOWN |
| 6. Auditability and enforcement | FCR authority/evidence gates; Chief commercial-use review; Sol independent verification | Build one evidence-backed integration register, audit events, automated policy checks, and exact-head verification per owner | PARTIAL |

## Non-negotiable peer boundaries

- FCR owns its governance, approvals, evidence registry, and release gates; it does not silently own peer runtimes or credentials.
- Chief reasons, researches, routes capabilities, and proposes. It cannot convert its output into approval or execution authority.
- PromptOS owns its prompt, skill, workflow, and instruction-governance product. Its artifacts remain advisory unless a separate current contract grants a bounded role.
- SolContinuity independently challenges and verifies continuity/evidence. It cannot approve itself or replace FCR's final release authority.
- External AI providers are replaceable seats, not owners of portfolio state.
- A shared standard cannot collapse standalone product identity, data, or authority boundaries.

## Skills and connected-plugin record for this implementation

Skills loaded/applied as relevant:
- Development OS — session orchestration, current intent, authority and stage.
- Lean Repository Execution — canonical-owner-first, reversible repository changes and mutation integrity.
- Specialist Reasoning — architecture, privacy/security, legal/IP and operations perspectives.
- Code Work — bounded implementation and repository-aware change discipline.
- Code Verification — independent source and evidence review.
- Cloudflare Security Audit — security-review method and evidence discipline.
- Secrets and API Leak Prevention — credential and outbound-data exposure review.
- Cloudflare Security Boundaries — identity, storage, cache, queue and tenant-isolation review.

Connected plugin actually invoked:
- GitHub — repository metadata, source reads, branch and PR work.

Not invoked for this source-only baseline:
- Cloudflare account/provider mutation tools; no Cloudflare settings, secrets, Workers, Pages, D1, or deployment state was changed.
- No other plugin should be described as executed merely because it is installed or discoverable.

## Next execution gates

1. Obtain and inspect the complete current repository instructions and exact main/head identities before changing each peer.
2. Resolve SolContinuity contribution provenance and confirm whether the Apache-2.0 license is intentional and must remain.
3. Inventory actual provider integrations and outbound data paths before asserting training, retention, confidentiality, or no-sharing guarantees.
4. Implement one small native enforcement slice per repository only after its local contract and tests are inspected.
5. Run repository-native tests and exact-head CI; use Playwright for any browser-facing changes. No Playwright run is claimed by this source-only review.
6. Re-observe provider/runtime state before any production claim. No merge, deploy, provider mutation, license change, or data deletion is authorized by this baseline.

## Coverage and confidence

This is a targeted initial review of selected canonical files, not an exhaustive security audit. It does not inspect every route, dependency, model/provider adapter, environment, deployed setting, contributor record, or customer data path. Unknown means unknown, not safe and not absent.


## First enforcement slice added to the FCR candidate

- `config/founder-ip-protection-registry.json` now records the four standalone peers, six control states, known license posture, unresolved integration inventory, permission defaults, and required evidence.
- `scripts/verify-founder-ip-protection.mjs` validates required peers and controls, preserves SolContinuity's Apache-2.0/contributor uncertainty, rejects an empty inventory marked complete, rejects confidential/restricted flows approved with unknown provider posture, requires a contract reference for cross-product access, and rejects any claim that technical access grants ownership.
- `scripts/verify-founder-ip-protection.test.mjs` contains positive and negative contract tests.
- `package.json` adds `verify:founder-ip-protection` and wires it into `npm test`.

**Scope:** CI/source contract enforcement only. It does not intercept runtime provider calls, change provider settings, prove data isolation, establish ownership, or certify exports. Those remain open gates and must be implemented in each product's native runtime after its own preflight and local source review.


## FCR provider preflight — read-only observation, 2026-11-26

- **GitHub:** candidate branch is `feat/founder-ip-protection-standard`; current PR #1182 head observed separately. The exact candidate is still subject to current-head CI and review.
- **Cloudflare identity:** one authenticated account was returned. Account identifiers and environment secrets are intentionally not copied into this document.
- **Cloudflare Pages:** the `founder-control-room` project is connected to `jussray/founder-control-room`, production branch `main`. The latest preview deployment was triggered from candidate commit `0d39b0e09a673860416652dee1d37f2c90c07aa3` and was still in its initialize stage when observed. The latest canonical production deployment was from main commit `e4a9888f6384a38782a21585ddbe43a75f1e5fa8` and its deployment stages reported success. This does not prove the preview completed or that production contains this candidate.
- **Cloudflare Worker:** a Worker named `founder-control-room` exists and has a scheduled handler. The list response did not establish its current source commit/deployed artifact parity, so Worker runtime parity remains UNKNOWN.
- **Supabase identity:** the repository's code-owned FCR project reference `oojzfmmywbvficgybaxd` matched the connected project named `founder-control-room`, reported `ACTIVE_HEALTHY`.
- **Supabase migrations:** the latest observed migration version was `20261123222318` (`register_truth_compass_external_read_identity_20261123`). This is provider migration history, not proof that the candidate has a migration or that any candidate schema is deployed.
- **Supabase security advisors:** read-only security advisory returned 51 public tables with RLS enabled but no policies (INFO) and one leaked-password-protection-disabled warning. These are observed findings requiring owner-level classification and a bounded remediation plan; this source-only IP change does not authorize database/auth mutations. Do not infer public data exposure solely from the RLS-without-policy lint: inspect intended service-role-only access and grants before deciding.
- **Supabase Edge Functions:** five functions were listed, including payment-related functions. Function inventory alone does not prove code/source parity, invocation authorization, or data handling.

**Provider boundary:** no Cloudflare settings, routes, secrets, deployments, Supabase schemas, auth settings, functions, or data were changed. Provider/runtime claims remain separate from repository source and CI evidence.
