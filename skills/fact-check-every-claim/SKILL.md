---
name: fact-check-every-claim
version: 1.0.0
status: active
scope: founder-control-room
owners:
  - founder
review_cadence: quarterly
last_reviewed: 2026-07-30
---

# Fact Check Every Claim

## Purpose

Use this skill before externally publishing, sending, presenting, or automating content that contains factual claims. It is designed for Claude, ChatGPT, Codex, Perplexity MCP, and other approved agents working across Juss-owned systems.

Perplexity MCP is a fast research and source-discovery lane. It is not itself a source, approval, or proof artifact. The underlying primary and reputable secondary sources must be inspected and recorded.

## Non-negotiable rule

Fact-check line by line. Every factual claim must be extracted and verified. No skipping because a statement sounds obvious, familiar, likely, or harmless.

Opinions and analysis do not require verification. Factual claims embedded inside opinions do.

## Claim categories

Tag every extracted claim with one or more categories:

- `[NUMBER]`: dollar amounts, percentages, counts, dates, metrics, rankings, quantitative comparisons, historical baselines, and “since” claims.
- `[ACTION]`: a named person, organization, product, government, or team did, announced, completed, changed, cut, hired, launched, posted, or held a role.
- `[QUOTE]`: direct quotes, attributed statements, paraphrases, descriptions of what somebody said or wrote, and anonymous-source statements.

Split compound sentences. One sentence may contain several separately verifiable claims.

## Source floor

Every claim needs two credible, independent sources before it may be classified as fully verified.

Preferred evidence:

1. the primary source, such as a filing, report, dataset, official post, transcript, interview, court record, release, or published study; and
2. one reputable secondary source independently confirming the claim.

Two reputable secondary sources are acceptable only when they report independently. Two articles repeating the same release, filing, wire report, or earlier article count as one evidence chain, not two sources.

A single source is allowed only when it is the only possible primary source, such as the person’s own post, the company’s own filing, or the study’s original dataset. It must be reported under `SINGLE SOURCE ONLY`, never `VERIFIED (2+ sources)`.

AI summaries, snippets, unsourced blogs, circular citations, and “this sounds right” are not evidence.

## Verification workflow

### Step 1: Extract every claim

Read the entire content and create a numbered claim ledger. Include the source line or sentence and split every independent assertion.

Example:

```text
Line: Block spent approximately $68 million on a company-wide event in Q3 2025, causing G&A costs to rise 14% YoY.

Claim 1: [NUMBER] Block spent approximately $68 million on a company-wide event.
Claim 2: [NUMBER] The event occurred in Q3 2025.
Claim 3: [NUMBER] G&A costs rose 14% year over year.
```

### Step 2: Verify every claim

Use the narrowest search first:

- exact quote plus speaker, source, and date;
- person or organization plus action and year;
- exact metric plus the report, filing, dataset, or study that generated it.

For each source, record:

- source title;
- publisher or owner;
- source type: primary or secondary;
- publication/event date;
- URL or stable citation;
- exact supporting passage or data location;
- whether it is independent of the other evidence chain.

For people and actions, verify the exact title, actor, action, scope, status, and timing. Distinguish announcements from completed actions.

For quotes, require a word-for-word match for direct quotation. For paraphrases, determine whether the source supports the meaning without context distortion. Flag accurate words whose omitted context changes the speaker’s point.

For numbers, flag rounding, baseline differences, date windows, methodology differences, and cherry-picked start dates.

For anonymous claims, find the actual post, comment, filing passage, transcript, or other original location.

### Step 3: Resolve conflicts

When credible sources conflict, report both. Do not silently choose the more convenient number, date, title, or quote. Primary evidence wins only when it directly addresses the claim and is not contradicted by a stronger authoritative record.

### Step 4: Produce the report

Use this exact structure:

```text
## Fact-Check Report: [Content Title]
Checked: [number] claims across [number] lines

### VERIFIED (2+ sources)
- Claim [#]: "[exact claim]"
  Source 1: [citation] -- CONFIRMED
  Source 2: [citation] -- CONFIRMED
  Notes: [rounding, methodology, context, or none]

### SINGLE SOURCE ONLY
- Claim [#]: "[exact claim]"
  Source: [citation] -- CONFIRMED
  Why single: [reason]
  Risk: low | medium | high
  Recommendation: Accept as-is | Find second source | Soften language

### CORRECTED
- Claim [#]: "[exact claim]" -- WRONG
  Original: "[content wording]"
  Actual: "[source-supported wording]"
  Source 1: [citation]
  Source 2: [citation]
  Fix: [specific replacement]

### UNVERIFIED
- Claim [#]: "[exact claim]" -- NO SOURCE FOUND
  Searched: [queries and source classes checked]
  Recommendation: Remove | Soften | Verify manually

### SUMMARY
Total claims: [X]
Verified (2+ sources): [X]
Single source only: [X]
Corrections needed: [X]
Unverified: [X]
```

### Step 5: Correction gate

After the report, ask whether the founder wants the corrections applied automatically. Do not edit, publish, send, schedule, or overwrite the source content until that correction action is explicitly approved or covered by a valid portable founder approval receipt.

## Parallel research rule

For content with 40 or more claims, split research into parallel lanes:

- Lane A: `[NUMBER]` claims, dates, statistics, comparisons, and methodology.
- Lane B: `[ACTION]` and `[QUOTE]` claims, titles, roles, timelines, exact wording, and context.

Merge both lanes back into one numbered claim ledger. Deduplicate shared sources and test source independence before assigning final status.

## Founder Control Room provenance

A completed fact-check artifact should record:

- content identifier and content hash;
- exact source revision or file SHA when applicable;
- claim count and line count;
- agent and provider used for each research lane;
- source citations and independence decisions;
- report status counts;
- correction decision and approval receipt reference;
- timestamp, rollback path, and final output hash.

Do not store raw private transcripts, teen content, credentials, or sensitive family material in public source logs. Store minimized provenance and private references within the proper trust boundary.

## Mirror Engine integration

For Mirror Engine output:

```text
Friend Intake
→ Context Brain
→ Mirror Engine
→ Intent Finder
→ Tiny Move Maker
→ Fact Check Every Claim when external factual claims exist
→ Tone Guard
→ founder review or valid portable approval
→ external adapter
```

Tone Guard may improve phrasing. It may not convert an unverified claim into a verified one or erase uncertainty labels.

## Stop conditions

Stop external distribution when:

- any material claim remains unverified without explicit softened wording;
- a direct quote lacks an exact source;
- two required sources are not independent;
- source conflicts are unresolved or hidden;
- content hash changed after fact checking;
- the approval receipt targets different content, channel, branch, or SHA;
- the fact-check report or provenance audit could not be persisted.

## Agent-specific use

- **Perplexity MCP:** parallel current-source discovery and citation collection.
- **Claude:** exhaustive claim extraction, long-document comparison, context checks, and correction drafting.
- **ChatGPT:** orchestration, source-independence review, founder-readable report, and approved correction application.
- **Codex:** source-file edits, tests, contract enforcement, and exact-revision evidence.

No agent may self-certify its own unsupported output. Evidence decides.