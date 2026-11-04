# ELAX v1 — evidence-locked approval and execution

Status: `ISOLATED_CANDIDATE_NOT_WIRED_TO_MUSE_OR_LIVE_SCHEDULER`.

## Authority and scope

This module is a **deny-only dependency** for any authorized publishing adapter. It does not create founder approval, connect accounts, mutate the posting queue, schedule posts, suspend an active scheduler, or publish content. It complements `docs/PUBLIC_COMMUNICATION_TRUTH_CONTRACT.md` and the existing founder-content authorization firewall; it does not replace or weaken either.

The exact queue `hidden_files/posting-queue.json` is not in the inspected FCR default-branch source and is not assumed to be available to this module. A future Muse-specific adapter must securely read its authoritative queue, bytes, trusted founder approvals and platform response.

## Trusted adapters required to integrate

- `readCurrent(id)`: exact, versioned record, parent summary status and original media bytes; never rely on user-provided hashes as byte proof.
- `getVerifiedApproval(id,snapshot)`: **server-side** authentication and validation of an approval issued by the founder for an exact item, version, action, platform and account. Do not return a caller-supplied `verifiedBy` string without performing authentication. Check revocation/expiry and trust boundary.
- `getCurrentEvidence(id,snapshot)`: independent, current fact/privacy/brand/SEO-GEO-AEO/runtime checks, plus fresh commerce/checkout check for purchase-oriented content. Proof has to be observed from a trusted source; simply returning `status:'PASS'` is not independent validation.
- `isKillSwitchEnabled(id)`: server-side current kill-switch state; absence or unavailability blocks execution.
- `claimAtomically(binding)`: durable compare-and-set of *current* queue record version and manifest hash, approval receipt identity/state, schedule, kill switch, and idempotency key. Must prevent concurrent publish and edit/revoke between claim and provider dispatch. Mere in-process mutexes are insufficient across workers.
- `publish(record,bytes,lease)`: exact approved content via an authorized platform adapter only, with leased state. Do not call without a claim.
- `readBack(attempt)`: authoritative platform readback of post state, destination account, exact copy/media, URL and post ID. The adapter must validate the returned manifest hash against the readback content, not simply echo its input.
- `finalize(lease,receipt)`: append-only durable outcome receipt.

If any adapter is missing, unhealthy, stale or contradictory, live execution **must not** proceed.

## Content binding

Existing Muse legacy hash: SHA-256 over UTF-8 caption bytes + original media file bytes + UTF-8 CTA URL bytes in precisely that order. This is retained as an additional compatibility check, not as proof of authenticity.

ELAX manifest hash: SHA-256 of a canonical JSON object with a version marker, SHA-256 of original media bytes, and all item fields except operational status and approval/outcome metadata. This covers caption, target account, platform, media name, alt text, hashtags, destination and schedule. Stable recursive key ordering is required. New manifest versions require new approvals.

The approval receipt must match **both** hashes, the exact account, the platform and the publication action. An edited post or target is not grandfathered into authorization.

## Publication gates

`READY_TO_PUBLISH` requires matching parent/child statuses, authenticated unrevoked and unexpired founder approval, exact hashes, current facts, integrity, brand/privacy, SEO/GEO/AEO, runtime and active kill switch checks. Purchase-oriented text (`shop`, `buy now`, `order now`, `checkout`, `link in bio`) triggers the commerce gate even if a caller sets `purchaseIntent:false`. Purchase CTAs require an HTTPS destination and current checkout proof.

The generic gate **does not** establish the truth of a business claim or validate the source of a receipt. The trusted external adapters must do that. The scheduler must use the gate as the sole publication entrance, and cannot use existing scheduling actions to bypass it.

## Batch-specific launch restrictions

- Batch #1 B1-01–08: remain DRAFT; no account publication approved.
- Batch #1 B1-09–16: summary says APPROVED, individual records provided say DRAFT with `approved_at:null`. Current authority is disputed: block until observed queue and approval records reconcile. Do not silently rewrite or erase history.
- Batch #2 R1–R4: PENDING. No approval granted. Cards' hashes, proof and URLs are Muse-reported, not independently verified. R4's universal photo-provenance claim requires a full inventory or narrower copy.

The implementation of this module is not a claim that any batch's actual queue was changed or paused.

## Verification and release

Local unit tests use `node --test tools/founder-content-contracts/elax-gate.test.mjs`. Full repository tests/CI, authorized provider readback and source-vs-runtime parity are **separate** required gates before rollout.

No merge, Cloudflare deploy, Supabase change, new PR, queue update, publication, deletion or external-account change is authorized by this module. Founder-approved exact-head release plus independent runtime evidence is mandatory. Existing publishing behavior must remain unchanged until the trusted scheduler adapter and rollback path are actually integrated and verified.