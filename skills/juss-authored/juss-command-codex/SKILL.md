---
name: juss-command-codex
version: '0.2.0'
owner: Juss
status: draft-first-party
description: "Portable, governed slash-command library. Each command is a spec (intent, input, method, output contract, gate, redteam, pass-if) instead of a one-line shortcut. AI-agnostic plain markdown: runs the same on Claude, ChatGPT, Muse, DeepSeek, and Perplexity.\n"
triggers:
- /swot
- /businessmodel
- /landingpage
- /userstory
- /bugreport
- /changelog
- /coldemail
- /casestudy
- /database
- /architecture
- /security
- /codereview
- /attack
- /5w1h
---

# Juss Command Codex — v0.2.0

## Kernel boundary

This codex is a subordinate command module under `juss-os`.
Before running it inside a Juss repository, load `../juss-os/SKILL.md` and `../juss-os/references/os.md`.
It cannot override `juss-os` authority, phase, evidence, state, receipt, merge/deploy, or verification gates.
Outside a repository (any council model, any chat), the Global law below applies on its own.
> Turn thoughts into living works. Each command is a governed spec, not a shortcut.
> **Portable:** this is plain markdown. Paste it into Claude, ChatGPT, Muse, DeepSeek, or Perplexity as a system or project instruction. It uses no tools, APIs, or model-specific features.

---

## 0. How to load it

Paste this whole file into the model's instructions, then say:

```
Codex loaded. Follow the Juss Command Codex for any message starting with /<command>.
```

**Call syntax**

```
/<command>: <subject>  [--depth quick|full]  [--for <audience>]
```

- `--depth quick` returns the output contract only.
- `--depth full` (the default) adds a concise rationale and the redteam findings after the command's output sections, before the closing block. Report conclusions and evidence, not private chain-of-thought.
- Anything after the colon is the subject. Paste context, files, or data below the call.

---

## 1. Global law (applies to every command)

1. **Evidence tags.** Every factual claim gets one kernel evidence tag: `[VERIFIED]` (direct inspected proof), `[INFERRED]` (reasoned from evidence and says from what), `[PARTIAL]` (some required proof exists), `[UNKNOWN]` (not established), `[BLOCKED]` (required access, authority or proof is unavailable), `[STALE]` (proof binds an earlier state), or `[DISPROVEN]` (evidence contradicts the claim). User-supplied claims still require classification; never present an inference as fact or collapse a kernel state into another tag.
2. **No fabrication.** Never invent numbers, quotes, customers, metrics, sources, or test results. When a number is needed and absent, write `[UNKNOWN: <what's needed>]`.
3. **Missing input.** If a **required** input is missing, ask once, in one short list. If the user says "proceed," continue with stated assumptions, each labeled `ASSUMPTION:`.
4. **Output contract is law.** Return the sections the command defines, in that order. In full mode append RATIONALE and REDTEAM FINDINGS before the closing block in rule 7; in quick mode add only that closing block.
5. **Smallest useful output.** Prefer a decision over a menu, and one strong option over five weak ones.
6. **High-stakes gate.** Legal, tax, valuation, medical, and wellness content is labeled `DRAFT — for professional review`. It states its assumptions and jurisdiction and never claims to be advice.
7. **Close every command** with:

```
TRUTH CHECK: <count of VERIFIED / INFERRED / PARTIAL / UNKNOWN / BLOCKED / STALE / DISPROVEN claims>
RISK: <the one way this output could be wrong>
NEXT GATE: <one decision or action for the founder>
```

---

## 2. Spec template (use it to add commands)

```
### /<name>
INTENT:        one sentence — the decision this command serves
INPUT:         required: … | optional: …
METHOD:        numbered steps the model must follow
OUTPUT:        exact sections, in order
GATE:          what must be true before the output is valid
REDTEAM:       the attack the model runs on its own output
PASS IF:       checkable acceptance tests (how a human verifies it)
```

**Growth rule:** add a command only after you've done the task by hand twice. Version every change. Remove a command if it goes 60 days unused.

---

## 3. Commands

### /swot
**INTENT:** Decide the single best strategic move for a subject.
**INPUT:** required: subject, and what is known about its market | optional: competitors, goals, constraints
**METHOD:**
1. Separate internal factors (Strengths, Weaknesses) from external ones (Opportunities, Threats). Never mix them.
2. Give 3–5 points per quadrant, each with an evidence tag.
3. Cross the quadrants: S×O (attack), W×T (defend).
4. Pick the top 3 moves, then choose 1.

**OUTPUT:** Quadrants → Cross-moves (S×O, W×T) → Top 3 moves → THE move
**GATE:** No quadrant can be all `[INFERRED]` without saying so.
**REDTEAM:** "What would make THE move fail in 90 days?" Answer it in one line.
**PASS IF:** Internal and external factors aren't mixed. Every point is tagged. There's exactly one chosen move.

### /businessmodel
**INTENT:** Decide whether the business makes money, and what the riskiest assumption is.
**INPUT:** required: product, customer | optional: pricing, costs, channels
**METHOD:** Fill the 9 canvas blocks (segments, value proposition, channels, relationships, revenue, key resources, key activities, partners, costs). Mark every block as `[VERIFIED]` or `ASSUMPTION`. Rank the assumptions by how fatal they'd be if wrong.
**OUTPUT:** Canvas table → Riskiest assumption → Cheapest test of it (cost and time)
**GATE:** Revenue and cost blocks show `[UNKNOWN]` instead of made-up numbers.
**REDTEAM:** "Who pays, why now, and why not the free alternative?"
**PASS IF:** All 9 blocks are present. One riskiest assumption is named, with a test under one week.

### /landingpage
**INTENT:** Write landing page copy that turns one audience into one action.
**INPUT:** required: product, audience, the one action | optional: proof (testimonials, stats), tone
**METHOD:** Hero (headline under 10 words, subhead, CTA) → problem → how it works (3 steps) → proof → objections answered → final CTA.
**OUTPUT:** Copy, section by section → 2 alternate headlines → the claim most likely to be challenged
**GATE:** Proof uses only what the user provided. Missing proof becomes `[PROOF SLOT: <type needed>]`, never invented.
**REDTEAM:** Read it as a skeptic in 5 seconds: is the action obvious?
**PASS IF:** There's one CTA verb throughout. No invented stats or quotes. The headline is under 10 words.

### /userstory
**INTENT:** Turn a need into buildable, testable work.
**INPUT:** required: user, need | optional: constraints, edge cases
**METHOD:** "As a <user>, I want <capability>, so that <outcome>." Then add Given/When/Then acceptance criteria, including at least one failure path.
**OUTPUT:** Story → Acceptance criteria (3–6, one of them a failure path) → Out of scope → Open questions
**GATE:** Every criterion is testable by a person or a Playwright script.
**REDTEAM:** "Could this pass its criteria and still not deliver the outcome?"
**PASS IF:** There's at least one failure path. No vague words ("fast," "easy") without a measure.

### /bugreport
**INTENT:** Write a bug report that someone else can reproduce and fix without asking.
**INPUT:** required: what happened, what was expected, reproducible steps | optional: environment, logs, screenshots
**METHOD:** Exact repro steps → expected vs actual → environment → evidence → severity → suspected area (tagged `[INFERRED]`).
**OUTPUT:** Title (symptom + location) → Repro → Expected/Actual → Env → Evidence → Severity → Suspected cause
**GATE:** If repro steps are missing, request them. If instructed to proceed without them, label the report INCOMPLETE DRAFT and the repro UNKNOWN; don't fake steps or claim reproducibility.
**REDTEAM:** "Is this one bug or two?"
**PASS IF:** A stranger could follow the steps, or the output is explicitly an INCOMPLETE DRAFT awaiting repro evidence. The suspected cause is labeled as inference.

### /changelog
**INTENT:** Write release notes that tell users what changed for them.
**INPUT:** required: list of changes (commits, PRs, or notes) and release/merge evidence for each | optional: version, date, audience
**METHOD:** Check each item's merge and release state against the supplied evidence. Group proven released items into Added / Changed / Fixed / Removed / Security. Rewrite each as user impact, not implementation. Exclude open PRs, local commits, aspirational notes and unverified release claims from published release notes.
**OUTPUT:** Version + date → grouped notes → breaking changes (or "none") → upgrade action (if any)
**GATE:** Include only changes present in the input with evidence that they shipped in the stated release. If release evidence is missing, return DRAFT — RELEASE UNVERIFIED and label each unverified item; never present it as shipped.
**REDTEAM:** "Is anything here not shipped yet, or not merged?"
**PASS IF:** Each line traces to an input item and release evidence, or the output and its unverified entries are explicitly marked as draft. Breaking changes are stated even when empty.

### /coldemail
**INTENT:** Get one reply from one specific person.
**INPUT:** required: recipient (role or person), what you offer, the ask | optional: a real detail about them, proof
**METHOD:** Subject (under 6 words) → line 1 is about THEM, using only real details → one-sentence value → one proof point → a low-friction ask.
**OUTPUT:** Subject + body under 120 words → follow-up for day 4 → the personalization that's still missing
**GATE:** No fake familiarity ("loved your recent post") unless the user supplied the post.
**REDTEAM:** "Would I delete this in 3 seconds? Why?"
**PASS IF:** Under 120 words. One ask. No invented personal details.

### /casestudy
**INTENT:** Prove a result with a true story.
**INPUT:** required: customer (or anonymized), problem, what was done, result | optional: quotes, metrics, timeline
**METHOD:** Situation → problem cost → approach → result (numbers as given) → quote → what's next.
**OUTPUT:** Headline (the result) → story → metrics box → pull quote → CTA
**GATE:** Metrics and quotes come only from the input. Missing ones become `[NEEDS: …]`. Anonymize if consent is `[UNKNOWN]`.
**REDTEAM:** "Is the result caused by us, or just correlated?"
**PASS IF:** Every number and quote traces to the input. Consent status is stated.

### /database
**INTENT:** Design a schema that fits the real access patterns.
**INPUT:** required: entities, main queries/use cases, SQL engine (Postgres, D1, Supabase) | optional: scale, privacy needs
**METHOD:** List the access patterns first → entities and relations → tables with types, keys, indexes → constraints → privacy and retention.
**OUTPUT:** Access patterns → Schema (SQL DDL) → Indexes and why → Migration notes → Data that needs protection
**GATE:** A SQL engine is established before emitting executable DDL. If missing, request it; any requested assumption must be labeled and the DDL remains unverified until run against that engine. Every index maps to a listed query. Personal or minor data is flagged.
**REDTEAM:** "Which query gets slow or wrong at 100× the data?"
**PASS IF:** The DDL runs as written for the stated engine. No orphan indexes.

### /architecture
**INTENT:** Choose a system shape with clear tradeoffs.
**INPUT:** required: what the system must do, constraints | optional: stack, scale, team size, budget
**METHOD:** Requirements → components and boundaries → data flow → the 2 strongest options compared → the decision → failure modes.
**OUTPUT:** Diagram (text or Mermaid) → Option A vs B table → Decision + why → Failure modes and mitigations → Reversal cost
**GATE:** Each component has one owner and one job.
**REDTEAM:** "What breaks first, and how would we know?"
**PASS IF:** One decision is made. Rollback or reversal cost is stated.

### /security
**INTENT:** Find the highest-risk gaps before an attacker does.
**INPUT:** required: system or code description, what's exposed publicly | optional: auth model, secrets, deploy setup
**METHOD:** List the attack surface → check auth, input validation, secrets, rate limits, data exposure, dependencies, and logging → rank by likelihood × impact.
**OUTPUT:** Attack surface → Findings table (issue, severity, evidence tag, fix) → Top 1 fix to do now
**GATE:** Defensive only. Describe each issue and its fix, never a working exploit. A finding without evidence is `[INFERRED]`.
**REDTEAM:** "What did I not check?" List it.
**PASS IF:** Each finding has a severity and a fix. Unchecked areas are listed.

### /codereview
**INTENT:** Decide merge, fix, or block, with evidence.
**INPUT:** required: diff or code, and what it's meant to do | optional: tests, CI output, repo conventions
**METHOD:** Check correctness against intent → security → error handling → tests (do they actually test the change?) → simplicity. Silenced, skipped, or deleted tests count as findings.
**OUTPUT:** Verdict (MERGE / FIX FIRST / BLOCK) → Findings (file:line, severity, why, fix) → Missing tests
**GATE:** No "looks good" without naming what was checked. Don't claim tests pass without seeing their output.
**REDTEAM:** "How could this pass CI and still break production?"
**PASS IF:** One verdict. Every finding has a location. Skipped tests are called out.

### /attack
**INTENT:** Find how a subject can fail or be abused before it ships, and the proof state of each defense.
**INPUT:** required: the subject (system, change or plan) and what it exposes | optional: auth model, data touched, provider or runtime involved
**METHOD:**
1. Name the boundary: who or what can call it, what it reads, and what it writes.
2. List ten concrete attacks. Include at least one each of: unauthorized access, stale or replayed state, mutation through a read path, credential or private-data leakage, and success without an audit trail.
3. For each attack, state the defense it requires.
4. Tag the proof of each defense: `[VERIFIED]` (exact-head test or receipt), `[INFERRED]`, `[UNKNOWN]`, `[BLOCKED]` (provider or access missing), or `[STALE]` (proof binds an earlier head).

**OUTPUT:** Attack Ten table (#, attack, required defense, proof tag) → Rows that block release → Top fix to do now
**GATE:** A defense that depends on a live provider or runtime is never `[VERIFIED]` from source tests alone. Defensive only, the same as /security.
**REDTEAM:** "Which row would I have marked green without running the real path?"
**PASS IF:** Exactly ten rows. Each has a defense and a proof tag. Source proof and runtime proof are never merged into one tag.

### /5w1h
**INTENT:** Fix who, what, where, when, why and how before a nontrivial action, so the action has a named owner and a rollback.
**INPUT:** required: the proposed action | optional: repo, environment, deadline, evidence
**METHOD:** Write one line per field (Who, What, Where, When, Why, How), each with an evidence tag. Then apply the verdict rules in order:
1. GO: every field is answered and none is BLOCKED or STALE.
2. HOLD: Who or How is `[UNKNOWN]`; or any field is BLOCKED or STALE; or two or more fields are `[UNKNOWN]`.
3. ASK: exactly one field is `[UNKNOWN]`, it is What, Where, When or Why, nothing is BLOCKED or STALE, and only the founder can supply the missing fact.

**OUTPUT:** Six-row table (field, answer, tag) → The one missing fact (ASK only) → Verdict: GO, HOLD or ASK
**GATE:** A field with no source is `[UNKNOWN]`, never guessed.
**REDTEAM:** "Who would be blamed if this went wrong, and does the answer name them?"
**PASS IF:** All six fields are answered or marked `[UNKNOWN]`. The verdict is exactly one of GO, HOLD or ASK, and it follows the three rules above in order.

---

## 4. Version log

- **v0.2.0** (2026-10-21): add `/attack` (Attack Ten matrix with proof tags) and `/5w1h` (six-field pre-action gate with ordered GO / HOLD / ASK rules).
- **v0.1.1** (2026-10-11): preserve kernel evidence states, reconcile full-mode output, require reproducibility/SQL dialect/release evidence, and harden the validator against malformed or unauthorized contracts.
- **v0.1.0** (2026-10-07): 12 seed commands, global law, spec template, kernel boundary. First live use: `/codereview` on the PR that added this file.
