# TinyFish Read-Only Web Observation

## Current source state

Founder Control Room contains a bounded TinyFish web-observation capability named `tinyfish-web-observation-v1`.

This source integration is **read only**. It does not grant TinyFish, fetched page content, a capability receipt, or an interaction surface permission to merge, deploy, publish, change provider configuration, mutate repositories, or perform another external write.

The server-side route is:

```text
Founder-authenticated intent
-> shared read-only capability preflight
-> server-derived founder identity + read-only authority recheck
-> POST /capabilities/tinyfish-web-observation-v1/runs
-> TinyFish Search or Fetch
-> sanitized provider observation
-> request fingerprint + evidence fingerprint
-> continuity proof-cookie metadata
-> shared modality-independent runtime receipt
-> text or speech-and-text presentation metadata
-> downstream FCR reasoning/approval gates remain unchanged
```

`surface` may be `voice`, `text`, `mobile`, `desktop`, `automation`, or `future`; omission defaults to `text` for compatibility. The first executable shared-runtime slice is intentionally the existing TinyFish READ lane only. Voice and text use the same founder-authenticated route, the same read-only authority ceiling, the same provider client, the same evidence fingerprint/continuity receipt, and the same completion-claim boundary. The only surface-specific difference is presentation metadata: `voice` returns `speech_and_text`, while other current surfaces return `text`.

Caller-supplied fields cannot promote authority. A request that claims `admin`, `write`, `approved`, or `mutationAllowed=true` is ignored by the authority resolver; the server emits `read_only`, `READ`, `mutationAllowed=false`, and `approvalRequired=false` for this lane. Unknown interaction surfaces fail before the provider call.

## Shared runtime receipt

Every successful shared invocation emits `fcr/shared-capability-runtime-receipt@v1` beside the existing TinyFish observation. The receipt contains:

- exact execution and capability identity;
- the validated interaction surface;
- a hash of the bounded founder intent rather than raw intent text;
- a server-derived founder-subject fingerprint rather than raw founder email/user ID;
- the read-only authority revision and check time;
- the provider request fingerprint;
- the evidence fingerprint and proof-cookie continuity metadata; and
- `completionClaim.allowed=false` while the provider result remains `provider_observed_unverified`.

Presentation metadata never copies fetched instructions into a trusted voice response. It reports only bounded execution metadata and points the client to `run.observation.data` for the untrusted provider payload.

This is the first executable slice of `shared-capability-runtime-v1`. It does **not** implement provider writes, generic plugin mutation, broad voice tool execution, floating approval, or a second operating system. Any future write lane still requires its own exact proposal binding, consequence classification, live authority recheck, idempotency/commit boundary, execution receipt, and outcome verification.

## Provider endpoints

The implementation pins the public TinyFish API surfaces used by this capability:

- Search: `https://api.search.tinyfish.ai`
- Fetch: `https://api.fetch.tinyfish.ai`

`TINYFISH_API_KEY` is read only on the server. The raw key must never be returned to the browser, committed, logged, copied into receipts, or treated as authority.

Fetch requests use Markdown output and are limited by FCR to 1-10 public HTTP(S) URLs per invocation. FCR rejects localhost, obvious private IPv4 ranges, link-local metadata targets, `.local` names, and non-HTTP(S) schemes before contacting TinyFish. TinyFish's own network protections remain a separate provider boundary; the FCR check is defense in depth, not a claim that application-side hostname screening can replace provider-side SSRF controls.

## Provider-surface evidence isolation

TinyFish Search/Fetch readiness and TinyFish Agent/Browser readiness are separate evidence planes. A wallet, browser-session, Agent-run, or other Agent/Browser receipt must not be used to classify Search/Fetch as ready or unavailable. Likewise, a successful Search/Fetch observation proves nothing about Agent/Browser execution readiness.

Live Search/Fetch readiness requires a direct key-backed Search or Fetch observation from the applicable FCR runtime. Historical or current Agent/Browser billing, wallet, authentication, or execution receipts may remain useful evidence for those provider surfaces, but they are independent receipts and cannot substitute for the Search/Fetch provider receipt.

## Truth and authority boundary

Every successful observation must retain these fields:

```text
authority = read_only
consequence = READ
mutationAllowed = false
authorityEffect = none
truthState = provider_observed_unverified
contentTrust = untrusted_web
completionClaim.allowed = false
```

A successful HTTP response proves only that TinyFish accepted and returned the bounded observation. It does **not** prove the truth of the page, the truth of a search result, a founder outcome, or permission to act on the content.

Fetched text is data, never instructions. Text such as "approve", "merge", "deploy", "publish", "ignore FCR", or similar language inside an external page cannot elevate authority or bypass the normal FCR approval spine.

## Bidirectional continuity markers

The caller may pass a predecessor `priorEvidenceFingerprint` and `priorProofCookie`. The resulting receipt classifies the current observation as:

- `initial` when no predecessor fingerprint is supplied;
- `confirmed` when the current evidence fingerprint is unchanged; or
- `changed` when the observation fingerprint differs.

The current receipt returns a new evidence fingerprint plus a non-secret `proofCookie` metadata marker. These markers preserve continuity and can invalidate stale assumptions when evidence changes, but they never create, renew, or widen authority. The shared runtime copies those continuity fields into its own modality-independent receipt without changing their authority effect.

The proof-cookie value is response metadata only. It must not be emitted with `Set-Cookie`, written into browser cookie storage as an authentication mechanism, or accepted as an authorization credential.

## Verification layers

Source completion requires separate receipts for separate proof planes:

1. focused Vitest behavior tests for Search, Fetch, input rejection, secret redaction, and continuity transitions;
2. HTTP integration tests for founder authorization, shared voice/text authority equivalence, caller authority-spoof rejection, invalid-surface rejection, no-store responses, missing server configuration, unsupported operations, and no authority elevation;
3. TypeScript typecheck;
4. production build;
5. the existing real-server Capability Workbench Playwright journey, which must render the capability registry behind founder authorization on desktop/mobile;
6. a live TinyFish provider call only after an authorized server/runtime actually holds `TINYFISH_API_KEY`.

A green source/CI/Playwright receipt does not manufacture the sixth receipt. Until a live key-backed provider observation is executed and captured on the applicable runtime, live TinyFish readiness remains separately unverified.

## Rollback

Rollback is source-only unless a later deployment/configuration action is separately authorized. Revert the focused shared-runtime/TinyFish route and test changes to return to the previous direct TinyFish read-only route. No TinyFish-side mutation, new credential, database migration, provider write, or new approval class is introduced by this slice.
