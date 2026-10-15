---
name: urlfix
description: >
  Given a live URL, inspect the real deployed experience with Playwright,
  reproduce material defects, collect browser/network/console/visual evidence,
  map each verified defect to its authoritative Juss-owned repository, apply
  the smallest reversible root-cause repair, and rerun the identical browser
  path until the fix is proven. External or unowned URLs are observation-only.
version: 1.0.0
status: active
scope: founder-control-room
category: engineering
owner: Juss & Co.
---

# URLFIX

## Mission

Turn a URL into a bounded repair loop:

```text
URL
→ resolve ownership + runtime identity
→ test the real browser path
→ capture reproducible issues
→ rank material defects
→ map defect to authoritative source
→ apply one smallest reversible repair
→ rerun the exact reproduction
→ verify the live URL when production truth matters
→ record proof and continue
```

Do not become a generic Lighthouse report generator. The goal is to repair verified defects in owned products while preserving project authority, user safety, rollback, and exact evidence.

## Activation

Use for:
- `/urlfix <url>`
- `urlfix <url>`
- `URL → Test → Find issues → Fix them`
- requests to test a live Juss-owned site and repair what is broken

Activation requests rigorous investigation. It does not create merge, deploy, provider-write, publication, payment, message-send, account-change, deletion, credential, or production-mutation authority.

## Compatibility and precedence

This skill composes with existing controls:
1. repository `AGENTS.md` and project-specific contracts
2. Juss Founder OS and portfolio authority
3. `ultrathink-attack-godmode` for adversarial execution
4. `goalfix` semantics for root-cause repair
5. `repair-to-proof` for exact-head and release truth
6. `continuity-proof-ledger` for fingerprints, cookies, drift, and handoff

Do not create duplicate authority, duplicate PRs, or a second source of truth.

## Input contract

Required:

```text
URL:
```

Optional:

```text
EXPECTED USER PATH:
KNOWN SYMPTOM:
VIEWPORT / DEVICE:
AUTH CONTEXT:
TARGET ENVIRONMENT:
STOP CONDITION:
```

If only a URL is supplied, infer the smallest safe test plan from the owned product's existing routes, tests, documentation, and browser configuration. Do not invent credentials, private test accounts, expected product behavior, or ownership.

## Phase 0: RESOLVE

Before testing or mutating source, establish:

```text
CANONICAL URL:
ORIGIN:
OWNERSHIP: VERIFIED_OWNED | EXTERNAL | UNKNOWN
PROJECT:
AUTHORITATIVE REPOSITORY:
TARGET BRANCH / SHA:
LIVE RUNTIME IDENTITY:
AUTH BOUNDARY:
EXPECTED CORE PATH:
MUTATION AUTHORITY:
PROOF REQUIRED:
ROLLBACK:
STOP CONDITION:
```

For a Juss-owned URL, resolve project and repository through current FCR portfolio/control-plane evidence or another authoritative project registry. A hostname resemblance, repo name, chat memory, page metadata, or generated claim is not sufficient ownership proof.

If ownership is `EXTERNAL` or `UNKNOWN`:

```text
TEST → DIAGNOSE → REPORT
```

Do not mutate source.

If ownership is `VERIFIED_OWNED` and repair authority exists:

```text
TEST → DIAGNOSE → PATCH → VERIFY → LIVE RECHECK
```

## Phase 1: BASELINE

Use a real browser. Prefer the repository's existing Playwright configuration, fixtures, authenticated state, device projects, and established runtime proof harness.

Capture the pre-fix state before changing source:
- final URL after redirects
- page status and visible load result
- representative desktop and mobile behavior when the product supports both
- screenshots for material visual failures
- browser console errors and warnings relevant to the path
- failed, 4xx, and 5xx network requests
- route transitions
- broken images, fonts, scripts, and other user-visible assets
- important navigation and links
- buttons or controls that do not produce their expected state transition
- forms, validation, loading, error, and empty states
- authentication and authorization boundaries
- obvious clipping, overlap, horizontal overflow, unreachable controls, or responsive breakage
- basic accessibility failures that materially block use
- the actual product-critical path relevant to that site

A successful HTTP response alone is not browser proof. A screenshot alone is not interaction proof. A preview build does not prove production.

## Consequential-action membrane

Testing must remain non-destructive by default.

For checkout, payment, purchase, publication, deletion, account changes, outbound messaging, external API writes, credential rotation, production data mutation, or another consequential action:
- exercise the path up to the side-effect boundary using existing safe fixtures, test modes, mocks, or sandbox environments when available;
- do not create a real external effect without separate exact authorization;
- record the boundary as `BLOCKED_BY_AUTHORITY` if the effect itself is required for proof and no safe authorized test lane exists.

Never bypass authentication, CAPTCHA, access controls, or provider restrictions merely to continue the loop.

## Phase 2: FIND

Convert only reproducible findings into the issue ledger.

### Severity
- **P0**: site or core runtime unusable
- **P1**: core user journey broken or materially unsafe
- **P2**: significant UX, responsive, accessibility, reliability, or correctness defect
- **P3**: polish, preference, or low-impact improvement

Auto-repair only P0/P1/P2 issues that are verified, owned, bounded, and safe to change. Record P3 without silently expanding scope.

### Issue ledger

```text
ISSUE:
SEVERITY:
REPRODUCTION:
URL / ROUTE:
VIEWPORT / DEVICE:
OBSERVED:
EXPECTED:
CONSOLE:
NETWORK:
SCREENSHOT / TRACE:
LIKELY SOURCE:
SOURCE CONFIDENCE:
OWNERSHIP:
CURRENT SHA:
STATUS: VERIFIED | INFERRED | UNKNOWN | BLOCKED | STALE
```

Do not convert a suspicion into a defect merely because a console warning exists. Require user-visible or contract-relevant impact, a failing assertion, or another concrete violated expectation.

## Phase 3: TRACE

For each highest-severity independent issue, map:

```text
URL
→ project
→ authoritative repository
→ live deployment identity
→ route/page
→ component/service/API/config/provider boundary
→ smallest plausible root cause
→ relevant current diff/history if needed
```

Attack at most three credible hypotheses before patching. Prefer evidence that can falsify the suspected cause. Do not patch the first file whose name resembles the symptom.

## Phase 4: FIX

Repair one independent root cause at a time.

Rules:
- re-read current remote head before mutation;
- use the existing authorized repair carrier when one exists;
- do not create a duplicate PR merely because URLFIX found a defect;
- preserve unrelated work;
- use existing architecture and tests;
- apply the smallest reversible change that explains the evidence;
- add or tighten a regression witness for the reproduced defect;
- do not silence checks, hide console failures, loosen auth, disable security, weaken accessibility assertions, or replace a real failure with a mock-only green;
- do not bundle unrelated P2/P3 cleanup into a P0/P1 repair.

If the defect belongs to another independent Juss product, hand off to that product's canonical repository and local gates rather than absorbing its code into FCR.

## Phase 5: VERIFY SOURCE

Run proof proportional to the changed surface:
1. touched-area static/type validation
2. focused lint
3. focused unit test
4. focused integration/contract test
5. targeted browser test for the reproduced path
6. broader affected suite when justified
7. exact-head CI when release truth is requested

Record the exact candidate SHA for every proof claim.

## Phase 6: VERIFY THE SAME FAILURE PATH

The original failing reproduction is the regression witness. The same failing browser path must be rerun after the repair.

If baseline evidence was:

```text
viewport: 390px
route: /cart
action: click "Checkout"
request: POST /api/cart
result: 500
```

the repair is not proven by a generic home-page load. Rerun the same viewport, route, action, request boundary, and expected observable result.

Required comparison:

```text
BEFORE:
exact reproduction → verified failure

AFTER:
same reproduction → expected result
```

If the reproduction changes because source, environment, fixture, or route identity changed, explain why and classify predecessor evidence accordingly.

## Phase 7: VERIFY LIVE

When the requested outcome is production truth, prove each layer separately:

```text
SOURCE
→ BUILD
→ DEPLOY
→ LIVE IDENTITY
→ HEALTH
→ ORIGINAL URL + SAME PATH
→ OUTCOME
```

A merge does not prove deployment. A deployment event does not prove the live hostname serves that artifact. A live hostname serving the artifact does not prove the repaired user path.

Re-check the original URL only after the deployed identity is current enough to support the claim.

## Phase 8: LOOP

After one repair:
1. update the issue ledger;
2. expire stale evidence when head/runtime moves;
3. rerun the bounded browser sweep for affected paths;
4. continue with the next independent P0/P1/P2 issue if authority, time, and risk remain acceptable;
5. stop rather than accumulating unrelated refactors.

## Stop conditions

Stop when any of these is true:
- all verified material issues in the authorized scope are repaired and re-proven;
- remaining findings are P3/preferences;
- ownership cannot be verified;
- the next repair requires another repository or owner handoff;
- exact mutation, merge, deploy, provider, credential, or external-effect authority is missing;
- current head/runtime drift invalidates the proof and cannot be safely refreshed;
- a provider or infrastructure blocker prevents reliable reproduction;
- further changes would create more risk than the verified defect justifies.

## Attack checklist

Before declaring success, try to falsify it:
- Did the test hit the intended hostname after redirects?
- Is the browser testing the current candidate or an old preview?
- Did the same failing path actually rerun?
- Could cached assets hide the defect?
- Did mobile pass only because the broken control was off-screen?
- Did an error disappear because auth or data silently failed earlier?
- Did a mock replace the real boundary being claimed?
- Is a 200 response masking a broken client render?
- Did a console/network failure remain after the visible symptom disappeared?
- Did a provider accept a deployment while the custom domain still serves an older artifact?
- Did the patch weaken security, privacy, accessibility, validation, or evidence requirements?
- Did the repair accidentally cross product authority boundaries?
- Did a new head SHA make earlier proof stale?

## Continuity receipt

Record:

```text
URL:
PROJECT:
REPOSITORY:
BASE SHA:
CANDIDATE SHA:
LIVE SHA / ARTIFACT:
ISSUES VERIFIED:
ISSUES REPAIRED:
ISSUES REMAINING:
TESTS:
PLAYWRIGHT:
CONSOLE:
NETWORK:
DEPLOYMENT:
LIVE RECHECK:
AUTHORITY:
ROLLBACK:
FINGERPRINT:
CONTINUITY COOKIE:
NEXT GATE:
```

A fingerprint identifies the evidence subject. It does not make an unverified result true. A continuity cookie is a resumable pointer, never authorization.

## Output contract

```text
REALITY
ATTACK FINDINGS
ISSUE LEDGER
FIX
PROOF
LIVE RECHECK
RISK
ROLLBACK
NEXT GATE
```

Say explicitly whether source files changed, commits were pushed, browser tests actually ran, CI actually ran, a PR was merged, deployment occurred, and the original live URL was reverified. Never upgrade `INFERRED`, `UNKNOWN`, `BLOCKED`, or `STALE` to `VERIFIED` for narrative convenience.
