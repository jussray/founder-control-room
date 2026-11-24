# Source-to-Post Publish — workflow of record

**Author and owner: Raylene "Ray" — Juss & Co.**
**Workflow of record. © Raylene, Juss & Co. All rights reserved.**

**Status:** Standing workflow, ordered by Ray (founder) 2026-11-15. It governs any agent — Muse and every other AI agent working on Juss & Co projects — turning a source document into a public social post.
**Canonical source:** this file, in the export-systems goal workspace (`files/source-to-post-publish.md`). The repo copy at `systems/source-to-post-publish/SYSTEM.md` is an exported artifact — refreshed by PR, never edited in place as the source of truth.
**Proven live:** first executed end to end on 2026-11-15 — a founder-directed Facebook post published under this workflow and verified by the platform receipt (post ID and HTTPS permalink returned; no pending or processing state).

## Purpose

Turn one source document — a letter, an email with an attachment, a report, a notice — into one public post the founder stands behind, with the proof chain intact at every step: the source was actually read, every claim in the draft has a named origin, the approval binds the exact text and destination, and publication is proven by a native receipt, not assumed.

This workflow is a **composition, not a new stack**. FCR already carries the governing loop, the approval machinery, the lifecycle states, and the receipt semantics; this document wires them to the one layer they do not cover — a founder's own document and her own testimony — and authors only that layer fresh.

## What this workflow reuses (already in FCR — cite, never duplicate)

| Layer | FCR source | What it contributes |
|---|---|---|
| Governing loop | `docs/PUBLIC_COMMUNICATION_TRUTH_CONTRACT.md` | proposal → founder `confirm_exact_copy` → one-shot approval → atomic claim → temporal revalidation → provider mutation → readback → durable receipt. Approval or draft is never publication proof. |
| Approval packets | `docs/PORTABLE_FOUNDER_APPROVALS.md` | Hash-bound, one-time-consumption approvals with immutable receipts; the broker is non-authorizing by itself. |
| Claim-ledger method | `skills/fact-check-every-claim/SKILL.md` | Read the entire content; build a numbered claim ledger; stop if the content hash changes mid-run. Its external-publication evidence floor is **not** mechanically applied to first-person founder testimony (see the claim-origin ledger below). |
| Publication states | `src/lib/founderContentLifecycle.ts` (with `founderContentLifecycleStore.ts`, `founderContentPublicationSync.ts`) | `pending_approval / approved / publishing / posted / failed / outcome_unknown`. `verified_published` requires a post ID **and** an HTTPS permalink **and** a timestamp. |
| Hash / idempotency semantics | `src/lib/firstPartySocialPublisher.ts` | SHA-256 over the normalized package; a receipt must match platform + hash + source before it counts. This workflow reuses the semantics, **not** that module's repo/SHA field set. |
| Governed execution | `src/workflows/governedExecutionV1Contract.ts`, `src/workflows/governedExecutionJournal.ts` | Journaled, governed execution; no blind retry out of an UNKNOWN state. |
| Receipt shape | `systems/skills/local-runtime-kernel/references/receipt-schema.md` | 5W1H slots; states REQUESTED / AUTHORIZED / EXECUTED / OBSERVED / VERIFIED / DECIDED; proof grades PROVEN / CANDIDATE / UNKNOWN. |

## The Source-to-Post layer (authored fresh — no reusable equivalent exists in FCR)

### A. Source-coverage record

Before any drafting, record: the source artifact's ID, its SHA-256, exactly which pages and attachments were read, and every unread gap by name. A partial read is a partial record — drafting proceeds only with the gap named to the founder.

*Boundary:* FCR has no general document/PDF/attachment ingestion, and its Gmail runtime is metadata-only by design. Step 1 (below) is therefore an **external governed step** — performed by the executing agent against the source system (e.g. the Gmail connector) — until an ingestion adapter exists. The coverage record is what crosses the boundary into FCR's governed loop.

### B. Claim-origin ledger

Every factual claim in the draft gets a numbered ledger entry (the fact-check claim-ledger method) with exactly one origin:

- **SOURCE-DOCUMENT** — stated in the source artifact, cited to the page or passage the coverage record proves was read.
- **FOUNDER-STATED** — stated by the founder herself. First-person testimony is recorded as USER-REPORTED evidence and is **never upgraded** — not to VERIFIED, not by repetition, not by the agent's agreement.
- **AGENT-INFERENCE** — anything else. Inferences never enter the post as fact; they are cut, or the gap is named to the founder.

No invented details, dates, outcomes, or motives. Where the source is silent and the founder has not spoken, the draft stays silent.

### C. Approval tuple

Approval binds a SHA-256 over four components: **source artifact hash + exact final text + platform + destination/account**. The founder is shown the full draft word for word; nothing publishes on a description, a summary, or a topic approval. The approved text is staged verbatim in a file so not one character can shift between approval and publish. Any edit — to the text, the platform, or the destination — produces a new tuple and a new approval (one-shot consumption, per the portable-approvals machinery).

### D. Run receipt

Shaped on the runtime-kernel receipt schema (5W1H; REQUESTED → AUTHORIZED → EXECUTED → OBSERVED → VERIFIED → DECIDED). It records: the approval-tuple hash, the approved-text hash, the connector's post ID, permalink, and returned state, and the verification timestamp. The receipt's identity is the approval tuple — **no repo SHA is forced into it**; this workflow publishes posts, not commits. An `outcome_unknown` run is reconciled by readback against the surface and the receipt-matching rule (platform + hash + source), never by a blind re-post.

## Procedure — the five steps

1. **Read the source fully.** Pull the originating document or message; decode and read it completely — every page, every attachment that carries substance. Produce the source-coverage record (A). Never draft from a filename, a subject line, or a summary of a summary.
2. **Draft from the ledger.** Build the claim-origin ledger (B) and draft only from SOURCE-DOCUMENT and FOUNDER-STATED entries. This is the truth contract's *proposal* state.
3. **Approval bound to the tuple.** Show the founder the exact text; on her `confirm_exact_copy`, compute and record the approval tuple (C) and stage the text verbatim. State: `pending_approval → approved`.
4. **Publish through the connector's approval card.** Publish via the Facebook connector — `facebook-cli post create --message <the exact staged text>` — through its native approval card, which displays the exact post and audience. Personal profile by default; Page or Group only as the founder directs. State: `publishing`.
5. **Verify by receipt.** `posted` is claimed only at `verified_published`: post ID + HTTPS permalink + timestamp, matched against the approval tuple, and written into the run receipt (D). Report the URL to the founder. A failed or empty read after a confirmed receipt never justifies posting again; an uncertain outcome lands in `outcome_unknown` and is reconciled by readback — the duplicate-post guard, and governed execution's no-blind-retry rule, are the same rule stated twice.

## Boundaries — stated plainly

- **FCR has no native Facebook personal-profile publisher.** `firstPartySocialPublisher.ts` is authorized-Facebook-Page-only; the direct executor is LinkedIn/X-only; Postiz is readback-only, and a Postiz PUBLISHED state without a native permalink is **not** terminal proof. The Muse `facebook-cli` publish is an **external execution boundary**: FCR governs the approval, the tuple, and the receipt; the mutation itself happens outside FCR until a native adapter exists.
- **Step 1 is external for the same reason:** no FCR ingestion of documents, PDFs, or attachments exists today (Gmail runtime is metadata-only by design). The source-coverage record is the contract across that boundary.
- **Workspace-canonical systems:** ELAX v1.0, the Social Operating Rules, and the local-founder-content-system skill are canonical in the **workspace** (staged copies sit under the export goal). They are **not** current FCR files — `systems/` in this repo holds the export index, court-council, prevent-the-pile, and skills only — and are cited here as canonical-workspace references that bind this workflow wherever it runs, and as repo references only when their own exports land. ELAX supplies the evidence classes this workflow's ledger uses (VERIFIED / OBSERVED / USER-REPORTED / INFERRED / UNKNOWN / BLOCKED); the Social Operating Rules supply the account boundaries — personal accounts are used only when the founder explicitly directs a post there, as she did for this workflow's first run; the founder content system remains the governed lane for business-account queue content, which this workflow does not bypass.

## Hard rules

- **Full-source read.** No coverage record, no draft. A partial read is reported as partial.
- **Origin on every claim.** A claim without a ledger origin does not ship.
- **Founder testimony stays founder testimony.** FOUNDER-STATED is never upgraded past USER-REPORTED.
- **Exact-text, exact-destination approval.** Approval attaches to the tuple; a changed tuple is a new approval.
- **Receipt or it didn't happen.** Publication is claimed only at `verified_published`.
- **No duplicates, no blind retries.** One approval, one publish attempt; UNKNOWN is reconciled by reading, never by re-posting.

## Inputs / outputs

**Inputs:** the source artifact and its attachments; the founder's stated facts and direction; the target surface (Facebook personal profile by default; Page or Group only as directed).
**Outputs:** one published post on the directed surface; the run receipt (approval tuple, post ID, permalink, state, timestamps); the source-coverage record and claim-origin ledger behind the draft.
