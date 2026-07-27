# Goalfix v1 Vertical Slice

## Founder outcome

Turn a messy founder goal into one bounded, proof-first repository inspection without granting the Control Room standing target-system mutation authority.

## Runtime path

```text
Founder session
→ POST /goalfix/inspect
→ registered project lookup
→ named required proof set
→ RepositoryProvider.getRef
→ RepositoryProvider.listVerificationSignals
→ exact-head evidence classifier
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
  "reason": "Preserve a usable front door without weakening protected routes.",
  "constraints": ["Preserve unrelated work", "Do not deploy"],
  "suspectedFailureArea": "auth route boundary",
  "firstFilesOrLogs": ["app/_layout.tsx", "exact-head Playwright artifact"],
  "expectedVerificationNames": ["Typecheck", "Product Design Playwright Proof"],
  "stopCondition": "Stop before mutation or when the complete named exact-head proof set is missing."
}
```

`expectedVerificationNames` is required and must contain at least one exact provider check name. Goalfix does not infer the required proof set from whichever checks happen to be returned.

## Authority boundary

Goalfix v1 is `L1` and target-system read-only.

It may:

- resolve one registered repository ref to an immutable commit;
- read verification signals for that exact commit;
- compare exact-head signals against a founder-supplied required proof set;
- classify evidence as verified, inferred, unknown, or blocked;
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
- present missing required checks, stale proof, skipped, running, unknown, or wrong-head evidence as green.

The route fails closed when its sanitized access audit cannot persist. A provider factory, ref-resolution, or verification-signal failure is audited before the error is returned when the audit store remains available. Any future target-system mutation requires a separate founder-approved action through the existing approval and idempotency system.

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

The dedicated `Goalfix Vertical Slice Proof` workflow checks out the immutable pull-request head, reruns the focused contracts, renders the founder-facing report in real Chromium at desktop and mobile sizes, and uploads screenshots plus the JSON report.

## Evidence-ledger rule

A capability contract may reference immutable artifacts from an earlier head as historical or stale evidence. It must not mark the current contract green merely because an older head passed. Updating the evidence ledger creates a new head, so current-head proof must remain outside that mutable ledger or the ledger must stay cautious until a separate immutable attestation records the final head.

## Cross-system boundary

- GitHub owns source, pull-request review, exact-head checks, artifacts, merge, and rollback history.
- Cloudflare owns deployment/runtime evidence after a separately approved merge and deployment.
- Linear may track the implementation and unresolved gates, but does not become code authority.
- HubSpot may receive a proof note only after the required CRM confirmation. It does not become repository truth.
- Supabase stores the sanitized internal access-audit event; it does not receive the founder's free-text goal payload or named proof set from this route.

## Rollback

Revert the focused merge to remove Goalfix code and UI. No data migration, provider configuration, secret, CRM record, deployment, or external account cleanup is required. Sanitized audit events already written remain historical evidence rather than being deleted.
