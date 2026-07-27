# Goalfix v1 Vertical Slice

## Founder outcome

Turn a messy founder goal into one bounded, proof-first repository inspection without granting the Control Room standing mutation authority.

## Runtime path

```text
Founder session
→ POST /goalfix/inspect
→ registered project lookup
→ RepositoryProvider.getRef
→ RepositoryProvider.listVerificationSignals
→ exact-head evidence classifier
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
  "stopCondition": "Stop before mutation or when exact-head proof is missing."
}
```

## Authority boundary

Goalfix v1 is `L1` and read-only.

It may:

- resolve one registered repository ref to an immutable commit;
- read verification signals for that exact commit;
- classify evidence as verified, inferred, unknown, or blocked;
- recommend one next gate.

It may not:

- create or change branches;
- edit files;
- merge or close pull requests;
- deploy or roll back a provider;
- mutate Supabase, HubSpot, Linear, or another external system;
- use credentials beyond the existing repository read provider;
- present missing, stale, skipped, running, unknown, or wrong-head evidence as green.

Any future mutation requires a separate founder-approved action through the existing approval and idempotency system.

## Readiness states

- `blocked`: at least one exact-head signal failed or was cancelled.
- `waiting_for_evidence`: exact-head proof is missing, incomplete, skipped, unknown, or only available for a different commit.
- `ready_for_founder_decision`: every returned exact-head signal passed. This does not prove production behavior or the founder outcome.

## Verification

```bash
npm run typecheck
npm run verify:goalfix
npx playwright install --with-deps chromium
npm run proof:goalfix
```

The dedicated `Goalfix Vertical Slice Proof` workflow checks out the immutable pull-request head, reruns the focused contracts, renders the founder-facing report in real Chromium at desktop and mobile sizes, and uploads screenshots plus the JSON report.

## Cross-system boundary

- GitHub owns source, pull-request review, exact-head checks, artifacts, merge, and rollback history.
- Cloudflare owns deployment/runtime evidence after a separately approved merge and deployment.
- Linear may track the implementation and unresolved gates, but does not become code authority.
- HubSpot may receive a proof note only after the required CRM confirmation. It does not become repository truth.

## Rollback

Revert the focused merge. No data migration, provider configuration, secret, CRM record, deployment, or external account cleanup is required by this slice.
