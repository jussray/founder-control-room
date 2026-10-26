# Founder Signal Engine — MCP-native campaign, media and reputation v1

**Status:** `IMPLEMENTED_AS_REVIEW_ONLY_SOURCE__UNVERIFIED_PROVIDER_AND_MEDIA`.

## Scope and standing conditions

Expand **Founder Control Room's existing Founder Signal Engine**, not a duplicate social-media operating system. The end-to-end goal is to turn one independently verified, privacy-safe founder/project signal into honest platform-native posts with relevant hashtags, original/licensed visuals or videos when appropriate, an approval review, and attributable post-outcome learning.

Preserve /human, /futureyou, /truthmode, /confess, 5W1H, Chief review, existing Content Lane System, Visual Wonder + Attack 2000, first-party post validator, Buffer draft-only firewall, content lifecycle authority, HubSpot association, proof receipts, and exact-current-you approval. No phase silently promotes simulated data into an observed production fact. Protect user dignity, privacy and future choices; no assumption that public exposure or commercial growth is appropriate for any age or situation.

## Current implemented connector slice

`/mcp/founder-signal-engine` now retains its original **`invoke_founder_signal_engine`** tool and adds **`plan_founder_signal_campaign`** and **`review_founder_signal_draft_handoff`**. The new tool is read-only, protected by the existing MCP bearer token and returns a single `fcr/founder-signal-campaign@v1` structured package. It does not call Zapier, OpenAI, Buffer, HubSpot, n8n, media renderers, or databases.

For one supplied public GitHub repo + exact SHA and a bounded, non-sensitive editorial brief, the new tool emits:
- One content thesis with documented founder voice (direct, human, technically clear, specific, no hype) and a current 5W1H.
- Platform-native finished **review drafts**, using the authoritative `contentLaneSystem.ts` platform list, field IDs and per-lane North Stars.
- Topic-derived **hashtags** tailored by platform. For LinkedIn, 3–5 relevant tags, never invented traction hashtags or growth hacks.
- Per-channel **media production direction**: 4:5 still/carousel, 9:16 short video, or text as applicable; caption/alt-text direction, motion, safe zones, media rights and proof-in-scene notes. `NOT_RENDERED` is mandatory until actual assets exist.
- An anti-repetition fingerprint keyed to the proposed thesis and provenance-linked recent public-post records. If no recent posts are supplied with links, style is **documented editorial intent**, not an observed history of the founder's actual publishing.
- Reputation-risk flags for outcome/endorsement claims, hard refusal of secrets or personal contact data in the brief, public-safe proof URL requirements and no suggestion that views equal customers.
- A non-secret continuity fingerprint for review/reconciliation only, not a cookie, tracking ID, consent artifact or authorization token.

This is **one planning package** aligned with the existing one-structured-AI-action contract. It does not consume an extra AI inference action. Its generated copy is deterministic from the supplied facts and may need a separate approved creative rewrite before founder review.

## Next implemented connector slice: first-party media draft handoff shape

The **read-only** \`review_founder_signal_draft_handoff\` MCP tool reconstructs the exact planned campaign from its source brief and checks a selected platform, account label, declared image/video assets and proposed copy against the existing \`validateFirstPartySocialPost\` function in \`src/lib/firstPartySocialPublisher.ts\`. It does **not** bypass the canonical publisher or create a parallel Buffer adapter.

A proposed media handoff must contain public-safe media URLs without signed-token queries, alt text, an image/video type consistent with the creative plan, declared media SHA-256, claimed original/licensed/owner-provided rights and a rights receipt, and a named Visual Wonder verdict whose claimed SHA matches the asset reference. Accounts with no known platform limit require an explicit bounded limit; this remains caller-supplied and is not a provider check. Campaigns already blocked for reputation or thesis repetition cannot be promoted. Missing, mismatched or unrendered media stays HOLD.

Even when all local checks pass, the result is \`LOCAL_DRAFT_SHAPE_VALID__PROVIDER_UNVERIFIED\` with \`handoffReady: false\` and all provider/creation/publication authority set to false. URL strings, licensing metadata, visual-verdict flags and media hashes are **self-attested** until authenticated source, asset-byte/rights, founder-review and provider checks are completed by distinct trusted systems.

**No image or video has been generated, read back or independently inspected by this connector. No local draft, Buffer draft, HubSpot record or publication has been created by this tool.** Later provider execution requires a separately reviewed adapter with actual permission and exact-payload Current You approval.

## Implemented source-evidence step: bounded live public GitHub readback

The authenticated Founder Signal MCP endpoint exposes **`verify_founder_signal_public_source`**. The tool performs read-only GitHub public API GET requests to fixed `api.github.com` paths for `jussray/<repository>`. It accepts an exact source SHA and the matching canonical `https://github.com/jussray/<repository>/commit/<sha>` link. It requires the repository metadata to identify the same **public** repository, then reads the exact commit and checks the returned SHA and canonical permalink. Nonpublic/missing repos, mismatches, malformed responses, HTTP errors and rate limits return `HOLD_UNVERIFIED`, never an inferred success.

A successful `VERIFIED_PUBLIC_GITHUB_COMMIT` is narrowly factual: public repo visibility and immutable commit existence were observed *at that time*. It is not a cryptographically signed authorization; it does not prove the actual product claim, source branch head, PR merge, CI, deploy, runtime behavior, user traction, account ownership, media license, social publication or partner/customer activity. It grants no local draft, Buffer draft, HubSpot mutation, sending, schedule, spending, merge or publication authority.

The service must not copy an arbitrary caller-supplied success JSON into later steps as trusted proof. Any subsequent authorized executor must independently repeat the authoritative source and completed-media checks at its own action boundary. This tool uses no GitHub credential and cannot access private repositories; the *MCP endpoint* retains its independent bearer authentication. No external accounts or posts are mutated.

## Source-level media byte-integrity stage (not yet connected to trusted asset storage)

`src/lib/founderSignalMediaByteCheck.ts` adds `checkFounderSignalMediaBytes`, a bounded, asynchronous-stream byte checker designed for **future use by a separately authenticated media storage reader**. It compares SHA-256 against the exact media bytes, checks basic file container signatures (PNG, JPEG, WebP, MP4), enforces hard image/video byte limits, and fails closed on mismatches or reader errors. Streaming avoids retaining entire large media blobs inside the planner. It does not fetch URLs, read the network, invoke a decoder, check license or rights, perform visual/reputation review, or create a draft.

The successful output is intentionally `LOCAL_BYTES_HASH_AND_SIGNATURE_MATCH__UNTRUSTED_ORIGIN` and marks `sourceAuthenticated=false`, `decodedMediaValidated=false`, `contentReviewed=false`, `privacyAndRightsVerified=false`, `founderApprovalVerified=false`, and all provider/publication authorities false. A matching hash for malicious, manipulated, copyrighted or fake visual content is **not an acceptable release decision**. A media reader must be authenticated, bind storage asset ID to the expected SHA, perform a full media decode/inspection and separately prove asset provenance/rights and Visual Wonder verdict before passing the handoff to an authorized draft executor.

**Status:** source-level byte-integrity helper and local tests only; not invoked from MCP, Media Router, Buffer or production. No actual user media has been inspected. See `npm run verify:fse-campaign`.

## Target end-to-end path (already-governed stages, not newly activated)

```
public-safe GitHub signal + exact SHA + current visibility policy
→ source proof and product truth classification (provider verification REQUIRED)
→ one ME + FutureYou + Chief + 5W1H decision (decision lenses, not factual proof)
→ plan_founder_signal_campaign (read-only MCP package)
→ existing content foundry / Visual Wonder creative brief
→ original/licensed stills, covers, carousels or real footage/rendered short video
→ rendered-asset hash, visual Attack 2000, accessibility, rights and truth checks
→ per-account/per-platform copy + relevant hashtags + rights-cleared media
→ authenticated Current You review on the exact frozen payload
→ existing Buffer draft-only source firewall / first-party lifecycle (separate authorization)
→ native Buffer Drafts identity + content/media readback
→ HubSpot deal-associated note/task and FCR correlated receipt
→ provider-native 24h and 48h measurement; compare only like-for-like periods
→ preserve winning mechanics, misses, corrections, provenance and next gate
```

MCP plan output is *not* itself accepted by Buffer or the first-party publication adapter. A future separately reviewed adapter must translate the exact reviewed, rendered package into the existing canonical `FirstPartySocialPostInput`, run `validateFirstPartySocialPost`, verify media identity and rights, obtain current founder approval and native provider readback. It must not bypass the Buffer draft-only mode by mapping review drafts to queue, schedule, share-next or publish.

## Media and reputation guardrails

Do not publish ordinary project status as "launched", "deployed", "used by customers", "has investor partners", or "produced revenue" without exact applicable evidence. Be careful with security, health, minors, customer identities, proprietary roadmaps, project secrets, claims about funding, partner logos or endorsements, manipulated screenshots, AI-generated fake people, synthetic testimonials and misinformation. No private personal photos or face/voice cloning without specific consent and appropriate safeguards. No engagement bait, spam tags, borrowed copyrighted clips, fabricated public interfaces or guaranteed outcomes.

`visual-wonder-contract.cjs` remains the only canonical creative-brief/rendered-artifact acceptance contract. Its `evaluateVisualWonderArtifact` must run **after** an actual render is available and independently inspected. Copy and media must be checked together, and must match the exact approved campaign receipt. False-green JSON, a generated graphic or a planned storyboard do not prove a rendered asset is safe or published.

Perfect reputational safety or guaranteed audience growth cannot be promised. Default: **hold until specific review**; maintain correction/rollback paths.

## Release gates and known missing proof

1. **SOURCE:** Gate the current GitHub event using independently observed repository visibility and exact commit. Tool input is user-supplied and is always labeled `USER_SUPPLIED_UNVERIFIED`.
2. **HISTORY:** Read authentic recent posts/metrics from authorized provider sources before claiming actual founder posting patterns or a LinkedIn rising floor. The initial tool doesn't fetch those.
3. **AI:** Verify output provenance of the canonical single AI action. Tool does not perform model inference or pretend it does.
4. **MEDIA:** Produce and inspect actual licensed image/video; run the canonical visual artifact gate and store the asset hash. No assets are rendered by this MCP change.
5. **REVIEW:** Show exact final copy, hashtags, media and destination/account to founder and obtain new exact-payload approval for any actual scheduling or publication class.
6. **PROVIDER:** Restore missing secure Zapier hook binding only through a separately authorized secret-store action. Observe a real Zapier run; confirm a native Buffer Drafts readback, not queue or publish. Never print credentials.
7. **CRM:** Reconcile the exact HubSpot account/deal/record and FCR receipt; no write from planning.
8. **MEASURE:** Provider-native insights at comparable 24h/48h snapshots, qualified replies and attributable actions. Separate attention from customer/partner outcomes. Do not promise outcomes.

## Testing

Run `npm run verify:fse-campaign` on exact candidate SHA. Tests also cover missing media, manipulated asset hashes, absent rights, unsafe media URLs, unverifiable visual verdicts and isolated no-provider handoff behavior. Tests cover per-platform copy, hashtags, image/video directions, unverified/provenance states, hold-on-repeated-thesis, secret/contact rejections, mandatory-media mismatch, MCP additive discovery and absence of provider calls or database writes. Existing `verify:buffer-content`, Visual Wonder, first-party publisher, public communication truth, role/approval and repository CI gates remain independently required.

This feature is source-level **review planning only**, not a live social automation completion claim. Nothing here grants merge, deploy, publishing, partner contact, credential installation, tracking or background automation. Rollback: revert the named planner, tests, MCP additive tool, middleware advisory path, documentation and test command; existing production tools remain unchanged.
