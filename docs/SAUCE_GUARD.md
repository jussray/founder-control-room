# Sauce Guard — founder-content protection

## Role and source

Sauce Guard is an existing founder-content protection policy, defined by the canonical [Sauce Guard skill](../.agents/skills/sauce-guard/SKILL.md). It helps prepare public-safe descriptions of verified product work without disclosing proprietary source details. It is not a synonym for every security or access-control boundary in Founder Control Room.

The source flow is: verified evidence → proposal → removal of sensitive implementation details → freshness classification → exact founder approval → execution-time recheck → separately authorized provider action → provider readback → receipt.

## Invariants

- An operator must not publish raw proprietary prompts, private implementation details, credentials, raw provider payloads, or private user/customer records.
- CURRENT claims need current proof. HISTORICAL claims must say when they were true. STALE, SUPERSEDED, and UNKNOWN claims cannot be presented as current facts.
- A proposal is not publication permission; a provider acknowledgement is not proof that a public artifact exists.
- Founder approval must apply to the exact content and destination being executed. It is not inferred from a passing code check.
- Do not invent users, conversions, revenue, adoption, or releases.
- Safe rollback preserves records. Any deletion requires specific, explicit authorization.

## Bounded verification

The read-only verification script at scripts/verify-sauce-source-guard.mjs checks for these existing source boundaries. Its structured public-draft validator checks evidence classification, dates, evidence references, and obvious credential markers. Its tests do not connect to any publishing provider.

These source checks **do not prove** that the runtime publishing pipeline enforces every step, that a draft has human approval, or that a destination contains a published artifact. Those claims require independent runtime evidence.

## Status

- Existing policy/skill: **SOURCE IMPLEMENTED**.
- Additional read-only verifier: **SOURCE IMPLEMENTED in the proposed branch**, subject to exact-head CI checks.
- Any particular public post: **UNKNOWN** until separately approved, executed and confirmed by provider readback.

See [Source Guard](SOURCE_GUARD.md) and [Founder Merge Authority](FOUNDER_MERGE_AUTHORITY.md).
