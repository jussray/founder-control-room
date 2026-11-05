---
name: sauce-guard
description: >
  Founder-owned progress publishing pipeline for jussray. Lets Juss publicly talk
  about his own products — progress, discoveries, corrections, wins — without exposing
  proprietary implementation. Pipeline: verified evidence → Chief AI proposes public-safe
  story → Sauce Guard strips private machinery → temporal classification → Current You
  approves → FCR revalidates → executes → provider readback confirms → receipt stored.
  Use whenever Juss is drafting LinkedIn posts, public progress updates, product
  announcements, or any content derived from internal product work. Also triggers on
  /confess (honest corrections), proof-led content, campaign drafts, and Buffer/Zapier
  publish flows. Never publish until provider readback proves the observable artifact.
---

# Sauce Guard — Founder Content Pipeline

## Mission

Let Juss publicly talk from his own products about his own products — progress,
discoveries, corrections, wins — without exposing the proprietary sauce.

## The pipeline

```
verified product evidence
  → Chief AI proposes public-safe story
  → Sauce Guard strips private machinery
  → classify every claim temporally (CURRENT / STALE / UNKNOWN)
  → Current You approves exact executable proposal
  → FCR revalidates truth at execution time
  → approved adapter/orchestration executes
  → provider readback proves external outcome
  → FCR stores receipt
  → observation-only analytics inform next proposal
```

Provider success ≠ published.
Published = provider readback proves the observable artifact exists.

---

## Public-safe content (always allowed)

- What changed (behavior, not mechanism)
- Problem solved (outcome, not implementation)
- What I learned
- Correction made (honest, not detailed)
- Why it matters (founder/user value)
- Approved public proof (screenshot, receipt, observable output)
- Honest next gate

---

## Keep private (never publish)

- Proprietary prompts or prompt architecture
- Private implementation mechanics
- Raw diffs or raw provider payloads
- Credentials / secrets / tokens
- Chain-of-thought / internal reasoning notes
- Private customer or user information
- Unreleased sensitive roadmap
- Private analytics not explicitly approved for publication
- Internal architecture decisions

---

## Temporal classification — required for every claim

Before any draft goes to Current You for approval, classify every load-bearing claim:

| Label | Allowed in public post? |
|---|---|
| CURRENT | Yes — with proof |
| HISTORICAL | Yes — with honest framing ("as of [date]") |
| STALE | No — must re-verify or reframe |
| SUPERSEDED | No — or disclose the correction |
| UNKNOWN | No — say "still figuring this out" or omit |

---

## Chief AI → Sauce Guard handoff

Chief AI proposes. It does NOT publish.

Sauce Guard review checklist before handing to Current You:

- [ ] Every claim classified temporally
- [ ] Zero private machinery visible
- [ ] No raw diffs, payloads, or credentials
- [ ] No invented metrics, users, revenue, or traction
- [ ] Proof attached for every CURRENT claim
- [ ] STALE / UNKNOWN claims removed or honestly reframed
- [ ] Content reads as founder voice, not AI template

---

## FCR revalidation at execution time

Before FCR executes the publish:

- Re-verify that CURRENT claims are still CURRENT (reality may have shifted since draft)
- Confirm the approved proposal is the exact one being executed (no silent edits)
- Confirm the destination (Buffer, LinkedIn, etc.) matches what was approved

---

## Provider readback — what counts as proof

| Platform | Proof |
|---|---|
| Buffer | Zapier exec ID + scheduled post ID |
| LinkedIn | Post URL visible in feed |
| GitHub | Commit SHA on target branch |
| Supabase | Row ID / migration version |
| Stripe | Payment intent / receipt ID |

Receipt stored in FCR. Analytics are observation only — they do not upgrade evidence class.

---

## Proof-led building content pattern

For Juss's LinkedIn "Proof-Led Building" campaign:

1. Start with one verified artifact (SHA, receipt, screenshot, log)
2. Describe what it proves (observable behavior)
3. Describe what you learned or corrected
4. State the honest next gate
5. Omit the sauce entirely — outcome is the story

No invented narrative. No forward-projecting unverified roadmap as current reality.

---

## /confess mode

When a previous public claim was wrong or stale:

1. State what was claimed
2. State what is actually true now (CURRENT evidence)
3. State what caused the gap (truth decay, not blame)
4. State the correction made
5. State the next honest gate

Corrections published via /confess are strength, not weakness. They are proof the system works.


---

## Protect Me Cyber Defense extension (source contract, not authority)

Sauce Guard remains the canonical founder content and IP boundary above. The
independently deployed protection products consume this policy through their
own runtime implementations; they do not gain enforcement powers from the skill.

- **Model One** (`jussray/juss-protect-me`) is personal and identity-scoped.
  The source-level reviewer is `security/sauce-guard.mjs`, `scope: personal`.
  Do not share its user/device/customer evidence, secrets or consent with Model Two.
- **Model Two** (`jussray/juss-protect-me-2`) protects owned applications,
  Workers, repositories, APIs, agents and infrastructure.
  It uses its own `security/sauce-guard.mjs` with `scope: infrastructure`.
  Its gateway must block detected sensitive outbound content, and public/external
  operations must move to an independently approved founder publication route.
- Both implementations must use the same policy schema
  `sauce-guard/security@1`, but have independent private deployments,
  authentication, storage, credentials and incident receipts.
  A safe-looking `REVIEW` verdict is **never** permission to publish or deploy.
- Public/external reviews fail closed on recognizable credentials, private
  customer identifiers, declared private implementation, unapproved metrics,
  missing/current-claim proof, and stale/unknown/superseded claims. The
  pattern-based screen is not full DLP, antivirus, a security audit, a guarantee
  of no leaks, or independent approval proof.
- Existing founder sign-in protects the console. Only its authenticated
  `/founder/sauce-guard` path may display private security state or accept a
  review request. Reject unauthenticated calls and cross-origin review posts.
  Never reflect inspected raw text or secrets in findings, logs or receipts.
- Use product-established colors and typography: Model One's gold/obsidian,
  Model Two's violet/obsidian, both under Juss & Co. Do not expose internal
  mechanisms on marketing, guest, welcome or enrollment screens.
- At every consequential action, record **REALITY / FIX / PROOF / RISK /
  ROLLBACK / NEXT GATE**, current source head, model scope, validation
  result, and separate provider readback. Public claims require execution-time
  revalidation and scoped current founder approval; no model or security tool
  may self-approve, merge, release, or infer production protection from tests.
- Minimum proof: isolated policy unit tests for both scopes, authenticated
  route and CSRF tests, a gateway deny test for Model Two, product-branded
  Playwright browser checks, exact-head CI and post-deploy runtime readback.
  If any is missing, report **UNKNOWN/BLOCKED**, not end-to-end protection.

No shared service token or cross-product customer profile is authorized by
this extension. Any future incident ingestion, enforcement action, Cloudflare
Access rule, or Supabase receipt persistence requires separate provider-specific
implementation, least-privilege scope, and production evidence.
