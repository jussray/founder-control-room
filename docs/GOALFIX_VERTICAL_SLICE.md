# Goalfix v1 Vertical Slice

## Founder outcome

Turn a messy founder goal into one bounded, proof-first repository inspection without granting the Control Room standing target-system mutation authority.

## AI role and honest submission framing

Founder Control Room is an AI-powered founder operating system. Model-backed intelligence runs through bounded FCR capabilities, while Goalfix / TruthMode is the truth, authority, evidence, continuity, and verification layer that governs what may be claimed or acted on.

Goalfix v1 does **not** currently claim to call a language model directly. Its job is to establish repository reality, classify evidence, bind proof to the exact source state, expose stale-proof drift, and stop before mutation unless a separate founder-approved action exists.

Submission-safe framing:

> Founder Control Room is an AI-powered founder operating system where model-backed intelligence operates inside a governed truth-and-evidence layer. TruthMode / Goalfix establishes reality, constrains authority, tracks continuity, and requires verifiable proof before completion claims are promoted.

Truth boundary:

- model-backed intelligence elsewhere in FCR does not make every Goalfix operation model-generated;
- do not describe a Goalfix result as LLM-generated unless an actual Goalfix model call is proved for that path;
- provider acceptance or model output is not a verified founder outcome;
- continuity fingerprints and proof cookies remain evidence-only and never become AI authority, founder approval, authentication, merge authority, or mutation permission.

## Runtime path

```text
Founder session
→ POST /goalfix/inspect
→ registered project lookup
→ named required proof set
→ RepositoryProvider.getRef
→ RepositoryProvider.listVerificationSignals
→ exact-head evidence classifier
→ continuity source fingerprint + evidence fingerprint + proof cookie
→ sanitized project_events completion or failure audit
→ REALITY / FIX / PROOF / RISK / ROLLBACK / NEXT GATE report
→ founder decision
```

The founder-facing surface is available at `/control-room/goalfix.html` after signing in through the existing Control Room session flow.

## Request contract

```json
{
  "projectSlug": "sekret-bip",
  "targetRef": "main",
  "desiredOutcome": "Keep the public welcome available before login.",
  "resolvedIntent": "Keep the public welcome available before login.",
  "reason": "Preserve a usable front door without weakening protected routes.",
  "constraints": ["Preserve unrelated work", "Do not deploy"],
  "suspectedFailureArea": "auth route boundary",
  "firstFilesOrLogs": ["app/_layout.tsx", "exact-head Playwright artifact"],
  "expectedVerificationNames": ["Typecheck", "Product Design Playwright Proof"],
  "stopCondition": "Stop before mutation or when the complete named exact-head proof set is missing."
}
```

`expectedVerificationNames` is required and must contain at least one exact provider check name. Goalfix does not infer the required proof set from whichever checks happen to be returned.

`resolvedIntent` is required for a proceedable request and represents the founder-confirmed outcome. Raw-only nonempty requests are intentionally blocked before repository access.

## Authority boundary

Goalfix v1 is `L1` and target-system read-only.

It may:

- resolve one registered repository ref to an immutable commit;
- read verification signals for that exact commit;
- compare exact-head signals against a founder-supplied required proof set;
- classify evidence as verified, inferred, unknown, or blocked;
- emit non-secret continuity fingerprints and a proof cookie that describe the inspected source/evidence state;
- persist one sanitized internal access-audit event for completed or failed provider-read attempts;
- recommend one next gate.

The sanitized audit may contain project ID, founder user ID, route stage, requested ref, resolved ref/SHA when available, readiness, exact-head signal count, required signal count, and error class. It does not contain raw provider error messages or founder free text.

It may not:

- create or change branches;
- edit files;
- merge or close pull requests;
- deploy or roll back a provider;
- mutate project/business data in Supabase, HubSpot, Linear, or another external system;
- store the founder's desired outcome, reason, constraints, supplied file names, or required check names in the access-audit event;
- use credentials beyond the existing repository read provider;
- present missing required checks, stale proof, skipped, running, unknown, or wrong-head evidence as green;
- treat a fingerprint or proof cookie as approval, authentication, merge authority, session authority, mutation authority, or permission renewal.

The route fails closed when its sanitized access audit cannot persist. A provider factory, ref-resolution, or verification-signal failure is audited before the error is returned when the audit store remains available. Any future target-system mutation requires a separate founder-approved action through the existing approval and idempotency system.

## Continuity contract

Goalfix uses `goalfix-continuity-v1` to make stale proof visible instead of silently inheriting it.

- **Source fingerprint:** binds the repository, provider, target ref, and immutable target commit.
- **Evidence fingerprint:** binds the source fingerprint, readiness state, required exact-head check names, and the latest exact-head verification signals.
- **Proof cookie:** a non-secret evidence lineage marker. It is returned in the Goalfix report only and is never stored as a browser authentication cookie.
- **Authority:** continuity markers are `EVIDENCE_ONLY`. They never create, renew, widen, or substitute for founder approval.

Continuity is bidirectional:

1. **Incoming evidence** must update or invalidate the current markers when the authoritative target, required proof set, provider/repository binding, verification evidence, or resulting readiness changes.
2. **Outgoing founder-approved action** must be tied to the current verified state and must emit fresh receipts/continuity markers for the resulting state so later work can detect drift.
3. A stale fingerprint or proof cookie may explain historical state, but it may not make a newer head green.
4. If code changes after proof, the previous proof remains historical evidence and the new exact head must reacquire the proof required for its claim.

## Readiness states

- `blocked`: at least one exact-head signal failed or was cancelled.
- `waiting_for_evidence`: a named required exact-head signal is absent, incomplete, skipped, unknown, only available for a different commit, or no required proof set was supplied to the engine.
- `ready_for_founder_decision`: every named required check has at least one passing signal on the exact commit, with no exact-head failed, cancelled, queued, running, skipped, or unknown signal. This does not prove production behavior or the founder outcome.

## Verification

```bash
npm run typecheck
npm run verify:goalfix
npx playwright install --with-deps chromium
npm run proof:goalfix
```

The dedicated `Goalfix Vertical Slice Proof` workflow checks out the immutable exact head, reruns the focused contracts, renders the founder-facing report in real Chromium at desktop and mobile sizes, proves the continuity markers are visible evidence rather than browser authority, and uploads screenshots plus the JSON report.

## Evidence-ledger rule

A capability contract may reference immutable artifacts from an earlier head as historical or stale evidence. It must not mark the current contract green merely because an older head passed. Updating the evidence ledger creates a new head, so current-head proof must remain outside that mutable ledger or the ledger must stay cautious until a separate immutable attestation records the final head.

## External submission / hackathon truth boundary

Repository provenance and contest eligibility are separate truth planes.

Verified repository history shows that Goalfix foundations existed before the current hackathon window, while the founder-facing TruthMode/Confess Fix preflight and the continuity fingerprint/proof-cookie implementation were added later. Therefore:

- do **not** claim that the entire Founder Control Room or all of Goalfix was created during the hackathon;
- treat eligibility of a hackathon-period slice built on the older FCR foundation as `UNKNOWN` until the organizer confirms that boundary in writing;
- if confirmed, scope any submission claim narrowly to the qualifying hackathon-period work and preserve the older foundation as disclosed prior art;
- if not confirmed, do not rewrite history, manufacture provenance, or relabel older work as newly created;
- contest acceptance is not source-code truth, and source-code proof is not contest-rule authority.

Historical provenance checkpoints currently relevant to that distinction include the pre-window Goalfix extension (`37b9078a`), the later TruthMode/Confess Fix preflight (`3b09b908`), and the continuity-marker implementation/proof sequence (`ad3b1561` → `76cbd351` → `ee97f30a`). These are provenance references, not authority tokens.

## Cross-system boundary

- GitHub owns source, pull-request review, exact-head checks, artifacts, merge, and rollback history.
- Cloudflare owns deployment/runtime evidence after a separately approved merge and deployment.
- Linear may track the implementation and unresolved gates, but does not become code authority.
- HubSpot may receive a proof note only after the required CRM confirmation. It does not become repository truth.
- Supabase stores the sanitized internal access-audit event; it does not receive the founder's free-text goal payload or named proof set from this route.

## Rollback

Revert the focused Goalfix documentation/code commit that introduced a disputed rule or surface. No data migration, provider configuration, secret, CRM record, deployment, or external account cleanup is required. Sanitized audit events and immutable proof artifacts already written remain historical evidence rather than being deleted.