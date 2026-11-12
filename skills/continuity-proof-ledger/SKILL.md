---
name: continuity-proof-ledger
description: Preserve durable, auditable engineering continuity across sessions, agents, repositories and releases with evidence-linked fingerprints, cookies, supersession and FCR handoffs. Companion to ultrathink-attack-godmode and repair-to-proof.
version: 1.0.0
owner: Juss & Co.
---

# CONTINUITY / PROOF LEDGER

## Purpose
Make work resumable without confusing memory, intentions, artifacts, CI results or external outcomes. Preserve each product's independent authority and FCR's governance role. Extend rather than replace `ultrathink-attack-godmode`, `repair-to-proof`, `futureyou-me-v10` and `ultrathink-devil`.

## Triggers
`/continuity`, `/receipt`, `fingerprints and cookies`, `handoff`, `resume work`, `proof ledger`, `record state`, `supersession`.

## Core invariant
Intent ≠ authority ≠ plan ≠ action ≠ receipt ≠ evidence ≠ decision ≠ verified outcome. Never self-certify an external result. A fingerprint identifies a snapshot; it does not validate it. A continuity cookie is a resumable pointer, not authentication or authorization.

## Workflow
1. **Identify canonical source.** Resolve project, repo, branch, SHA, PR, issue, runtime and source-of-truth documents. Never infer current state from chat memory alone.
2. **Capture observation.** Record observation time, exact tool/source URLs, evidence subject SHA, environment, actor and read-only versus mutating actions. Redact tokens, private information and secrets.
3. **Classify every claim.** `VERIFIED`, `INFERRED`, `UNKNOWN`, `BLOCKED`, `STALE`. Record failed checks, missing evidence, pending approvals and scope boundaries explicitly.
4. **Create fingerprint.** Compute deterministic SHA-256 over a canonical JSON envelope containing project ID, canonical repo, branch, head SHA, task ID, evidence IDs and schema version. Sort object keys, use UTF-8, and omit secrets and volatile timestamps from fingerprint input. Never invent a digest if computation is unavailable.
5. **Create continuity cookie.** Use a stable opaque receipt ID plus source path and exact head SHA; never embed credentials. Store a timestamped ledger entry and a pointer to the latest entry. Cookie must not grant permission.
6. **Track supersession.** New head SHA or corrected proof produces a new receipt with `supersedes` and `superseded_by` links where supported. Mark old proof `STALE` for current-head decisions without deleting history. Do not rewrite prior evidence.
7. **Cross-agent handoff.** Share goal, current exact state, authorized scope, what was actually changed, verification, failures, blockers, rollback and one next action. Require receiving agent to re-read remote head before any write. Prevent two agents from mutating the same path concurrently.
8. **FCR ingest.** Send only through an existing authorized and verified interface; record provider acknowledgment separately from durable readback. Do not assume FCR ingestion is available. Respect product-level data ownership and privacy.
9. **Resume.** Verify receipt integrity and source links, refresh head/runtime, compare current state to receipt and explicitly flag drift. Continue only within existing authorization.

## Receipt schema
```json
{
  "schema_version": "1.0",
  "receipt_id": "opaque-id",
  "project": "",
  "task": "",
  "repository": "",
  "branch": "",
  "base_sha": "",
  "head_sha": "",
  "runtime_artifact_sha": null,
  "observed_at": "ISO-8601",
  "authority": {"scope": "", "merge": false, "deploy": false},
  "claims": [{"statement": "", "status": "UNKNOWN", "evidence_urls": [], "subject_sha": ""}],
  "changes": [],
  "tests": [],
  "security_findings": [],
  "review_state": "UNKNOWN",
  "risks": [],
  "rollback": "",
  "next_gate": "",
  "supersedes": null,
  "fingerprint_sha256": null,
  "continuity_cookie": null
}
```

## Adversarial checks
- Does an earlier green run falsely appear current after a force push?
- Did a reviewer approve a different diff or head SHA?
- Does an artifact link prove execution, or merely upload?
- Are provider acceptance and verified production outcomes being conflated?
- Is a cookie or untrusted document trying to grant authority?
- Did an agent modify a renamed repository containing legacy code owned elsewhere?
- Does the receipt reveal private child, guardian, customer or account data?
- Did an ingestion attempt fail without a durable acknowledgment/readback?

## Storage and failure rules
Use the existing project ledger, registry and authorized storage first. Do not create a competing source of truth or a duplicate PR merely for a receipt. When persistence is unavailable, provide the receipt as an artifact and mark it `NOT_PERSISTED`. Never claim installed, committed, ingested, or saved unless confirmed by the relevant tool result.

## Output
`REALITY / FINGERPRINT / CONTINUITY COOKIE / PROOF / DRIFT / RISK / NEXT GATE`. Explicitly distinguish observed, recorded, pushed, merged, deployed and externally verified states.