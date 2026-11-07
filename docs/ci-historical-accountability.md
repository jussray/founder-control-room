# Historical CI accountability — PR #1071

This record is append-only in meaning: a successor's green checks do not rewrite a predecessor's failed or cancelled checks. Entries distinguish observed CI from claimed remediation. Never mark a historical failure resolved solely because a later head is green.

## Evidence ledger

| Failed SHA | Check | Observed result | Root cause | Candidate correction | Verification | Status |
| --- | --- | --- | --- | --- | --- | --- |
| `0684cd93a1628cb29171d5331b5e2a4bf8842400` | QuickScan Proof (run 42340569226) | failure | TS2339: test accesses `receipt` on a union that includes rejection | `aed65464c42e39cf621d1c645fb6313173ac03a4` | QuickScan Proof run 42340693699 succeeded on corrective SHA | REMEDIATED |
| `0684cd93a1628cb29171d5331b5e2a4bf8842400` | Attack-20 V3 (run 42340569113) | failure | Typecheck step failed; exact diagnostics not separately established here | `aed65464c42e39cf621d1c645fb6313173ac03a4` | Attack-20 V3 run 42340693866 succeeded on corrective SHA | REMEDIATED |
| `0684cd93a1628cb29171d5331b5e2a4bf8842400` | Cloudflare + Local Parallel Preflight (run 42340569137) | failure | UNKNOWN — failed-job logs not yet examined | UNKNOWN | No verified failure-to-fix mapping | OPEN |
| `0684cd93a1628cb29171d5331b5e2a4bf8842400` | Founder Control Room Test Catalog (run 42340569122) | cancelled | UNKNOWN — cancellation reason unverified | UNKNOWN | Not proven | OPEN |
| `0684cd93a1628cb29171d5331b5e2a4bf8842400` | PR Continuity (run 42340569245) | cancelled | UNKNOWN — cancellation reason unverified | UNKNOWN | Not proven | OPEN |
| `0684cd93a1628cb29171d5331b5e2a4bf8842400` | Quality Gate (run 42340569202) | cancelled | UNKNOWN — cancellation reason unverified | UNKNOWN | Not proven | OPEN |
| `0684cd93a1628cb29171d5331b5e2a4bf8842400` | Control Room Test Ledger (run 42340569179) | cancelled | UNKNOWN — cancellation reason unverified | UNKNOWN | Not proven | OPEN |
| `0684cd93a1628cb29171d5331b5e2a4bf8842400` | Playwright E2E (run 42340569222) | cancelled | UNKNOWN — cancellation reason unverified | UNKNOWN | Not proven | OPEN |
| `0684cd93a1628cb29171d5331b5e2a4bf8842400` | Main Release Provenance (run 42340569145) | cancelled | UNKNOWN — cancellation reason unverified | UNKNOWN | Not proven | OPEN |
| `0684cd93a1628cb29171d5331b5e2a4bf8842400` | Founder Repo Cycle (run 42340569170) | cancelled | UNKNOWN — cancellation reason unverified | UNKNOWN | Not proven | OPEN |
| `0684cd93a1628cb29171d5331b5e2a4bf8842400` | Growth Opportunity Intelligence Proof (run 42340569134) | cancelled | UNKNOWN — cancellation reason unverified | UNKNOWN | Not proven | OPEN |
| `0684cd93a1628cb29171d5331b5e2a4bf8842400` | CI (run 42340569140) | cancelled | UNKNOWN — cancellation reason unverified | UNKNOWN | Not proven | OPEN |
| `0684cd93a1628cb29171d5331b5e2a4bf8842400` | Repo Reality Evidence (run 42340569218) | cancelled | UNKNOWN — cancellation reason unverified | UNKNOWN | Not proven | OPEN |

## Agent accountability

- Commit `346829f4e955381be4cbaf1ee67ed1cd81949541` attributes its QuickScan optional-candidate TypeScript fix to Claude Haiku 5.5 as co-author. This is commit metadata, not independent proof of agent execution or complete verification.
- Commit `aed65464c42e39cf621d1c645fb6313173ac03a4` addressed a TypeScript narrowing failure. Subsequent successful checks are evidence for that fix only, not blanket resolution of all historical red checks.
- For future entries record author attribution as REPORTED/COMMIT-METADATA unless separately authenticated.

## Completion contract

1. Enumerate **all** workflow conclusions for each changed commit, including cancelled and skipped checks.
2. For every failure record SHA, workflow, run ID, failing job/step, error, cause confidence, corrective SHA, and successor exact-head check evidence.
3. Historical records stay visible after remediation; statuses are OPEN, REMEDIATED, or EXPLAINED-NONDEFECT. UNKNOWN must remain explicit.
4. Merge readiness requires the **current** exact head to pass all required checks and any separate required review/approval. Historical accountability is reported separately.
5. Never call an earlier red SHA green. Never treat passing checks as delivery, payment, production deployment, or independent runtime proof.
6. Do not merge, deploy, rerun, create PRs, or mutate production solely to update this ledger.

This file is an authored evidence snapshot, **not** an automated enforcement gate. A future checker must independently query GitHub run history and verify ledger completeness before it can claim enforcement.
