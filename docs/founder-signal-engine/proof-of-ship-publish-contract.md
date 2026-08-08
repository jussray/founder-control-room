# Proof-of-Ship Scheduled Publication Contract

## Purpose

Turn an eligible, verified production deployment into a build-in-public post that is scheduled through Buffer and can publish after the existing review window.

This is a separate path from the Founder Signal Engine metadata bridge. It uses its own Zapier Catch Hook secret and must not reuse the Worker bridge hook.

## Current activation boundary

The sender is implemented in the production deployment workflow for:

- `jussray/founder-control-room`
- `jussray/jussbeautifulhair-site`
- `jussray/untold-stories-storefront`
- `jussray/chief-ai-machine`

Only `jussray/founder-control-room` currently has the verified deployment and `/version` runtime proof required by this workflow. Do not install or activate this workflow in another repository until that repository's deployment authority, live URL, exact-SHA endpoint, and proof path are separately verified.

**No actively owned `jussray` repository is permanently excluded from earning a proof-of-ship post.** Repository eligibility is proof-gated, not name-gated. A repository that lacks verified deployment identity or runtime evidence remains ineligible until those proofs exist. This applies to Se’kret Bip too: its stricter privacy and release boundaries remain mandatory, but it is not a permanent social-post denylist entry.

## Sender gate

The GitHub Actions job runs after the existing production smoke test and stops before the webhook unless all of these are true:

1. The workflow was dispatched against the exact current `main` SHA.
2. The commit is meaningful: `feat`, `fix`, or `perf`; a merged-to-main change may also pass when it touches a non-document path.
3. The author is not Dependabot and the message does not contain `[skip ci]` or `[skip post]`.
4. The repository is owned by `jussray` and has the required deployment authority, exact-SHA runtime identity, live proof URL, and sender integration. There is no permanent hard-coded repo denylist.
5. Every changed Supabase migration version is present in the remote `supabase_migrations.schema_migrations` table. If no migration changed, the receipt is `not_applicable`.
6. The live runtime identity response reports the expected service/repository identity and `gitSha` equal to the deployed SHA.
7. `PUBLISH_ALLOWED=true`, the dedicated `ZAPIER_CATCH_HOOK_URL` secret is present, and the revocable `PROOF_OF_SHIP_STEERING_GRANT_ID` secret is present.

A failed proof exits non-zero. No webhook is sent and no post is generated.

## Publication semantics

“Publish” means scheduled publication under the checked-in Buffer contract:

- Zapier action: **Add to Buffer**
- method: `schedule`
- Buffer API sharing mode: `customScheduled`
- save to draft: `false`
- review window: 20 minutes
- scheduled time: `generated_at + 20 minutes`
- no `share_now` or immediate publish path
- the existing Gmail review/notification contract remains authoritative

This is intentionally not a draft-only path. It is also not an unreviewed “share now” path.

## LinkedIn rising-floor gate

LinkedIn has an additional strategy gate on top of publication safety.

The goal is not one-off virality. The goal is a steady or accelerating **verified floor** in attention quality, reach, profile/follower conversion, and warm business conversation.

Before `juss_rayy_linkedin` can enter the scheduled Buffer lane, the structured AI result and deterministic firewall must receive and validate:

```text
linkedin_rising_floor_ready=true
linkedin_baseline_ref
linkedin_growth_hypothesis
linkedin_24h_gate
linkedin_48h_gate
linkedin_next_mutation
```

Rules:

- `linkedin_baseline_ref` must identify the latest verified LinkedIn analytics export, LinkedIn platform recap, or equivalent authoritative measurement source.
- Missing or unverified analytics keep `linkedin_rising_floor_ready=false`.
- An incomplete day, partial export, or rolling-window replacement effect must not be labeled a true decline without a like-for-like comparison.
- The post hypothesis must aim to improve the prior verified floor without sacrificing engagement quality or business/investor relevance.
- The post should combine real build/operating proof, a founder-specific point of view, a business or investor consequence, and an honest unresolved truth or next gate.
- Relevant warm comments, messages, invitations, or partnership threads are conversion evidence. When they require a response, the analysis should surface that conversation action instead of treating impressions as the only objective.
- Visuals are used when they improve product comprehension or attention capture, not merely to decorate the post.
- Results are checked at 24 hours and 48 hours. The winning hook, proof mechanic, format, visual, CTA, or conversion behavior becomes an input to the next post.
- Numeric floors are not hard-coded here because the baseline must rise as the account improves.

If the LinkedIn gate is not ready, the generated copy may remain review-only in Founder Control Room/HubSpot, but the Buffer firewall must reject a scheduled LinkedIn action.

Other channels keep their existing publication contract and are not blocked by missing LinkedIn strategy fields.

## Catch Hook payload

The sender posts one JSON object to the dedicated Catch Hook:

```json
{
  "repo": "jussray/founder-control-room",
  "commit_sha": "40-char-lowercase-sha",
  "source_commit_sha": "40-char-lowercase-sha",
  "commit_title": "feat(checkout): add express pay",
  "commit_body": "Safe, redacted summary",
  "commit_url": "https://github.com/jussray/founder-control-room/commit/...",
  "pr_url": "https://github.com/jussray/founder-control-room/pull/271",
  "commit_type": "feat",
  "changed_paths_summary": "src/checkout/*",
  "live_state": "verified",
  "supabase_state": "verified",
  "supabase_migration_version": "20250103054303",
  "supabase_receipt": "schema_migrations: 20250103054303",
  "cloudflare_live_sha": "40-char-lowercase-sha",
  "cloudflare_receipt": "https://api.example/version -> gitSha=...",
  "proof_url": "https://github.com/jussray/founder-control-room/actions/runs/123",
  "idempotency_key": "jussray/founder-control-room:40-char-lowercase-sha",
  "repository_eligible": true,
  "repository_policy": {
    "mode": "all_owned_proof_gated",
    "owner": "jussray"
  },
  "publish_allowed": true,
  "PUBLISH_ALLOWED": true,
  "invocation_id": "uuid",
  "batch_id": "uuid",
  "steering_grant_id": "proof-of-ship-publish-v1",
  "founder_approval_id": "standing-policy:proof-of-ship-publish-v1:uuid",
  "authorization_mode": "standing-policy",
  "schedule_policy_id": "buffer-20-minute-review-v1",
  "notification_mode": "gmail_campaign_digest",
  "generated_at": "2026-08-05T12:00:00Z",
  "scheduled_at": "2026-08-05T12:20:00Z",
  "review_deadline": "2026-08-05T12:20:00Z",
  "review_window_minutes": 20,
  "destination_mode": "schedule",
  "buffer_provider_action": "buffer_add_to_queue",
  "buffer_method": "schedule",
  "buffer_save_to_draft": false,
  "buffer_api_sharing_mode": "customScheduled",
  "share_now_allowed": false,
  "content_mode": "proof-led-build-in-public",
  "requested_channels": ["x", "linkedin"],
  "requested_content_fields": ["x_draft", "linkedin_draft"]
}
```

A `not_applicable` Supabase receipt is valid only when `migration_versions` is empty. A missing or mismatched runtime receipt is never valid.

## Required Zap sequence

1. **Catch Hook** — use the dedicated `ZAPIER_CATCH_HOOK_URL`; the suggested grant value is `proof-of-ship-publish-v1`.
2. **Dedupe** — look up `idempotency_key` in Zapier Tables or Storage by Zapier; stop when already processed.
3. **Repository + proof filter** — require `repository_eligible=true`, `live_state=verified`, `publish_allowed=true`, and `PUBLISH_ALLOWED=true`. Repository eligibility comes from verified ownership and runtime proof, not a permanent name denylist.
4. **ChatGPT Conversation** — use the Responses API action. Feed only the verified change fields and receipts. Return JSON with platform-native copy. For LinkedIn, also return the rising-floor strategy fields from the latest verified analytics context; if that context is unavailable, return `linkedin_rising_floor_ready=false`. Do not invent impact, metrics, baselines, or URLs.
5. **Output validation** — require the proof URLs in the generated copy to equal the supplied URLs. Reject unresolved prompts, empty copy, altered URLs, or invented metrics. For `juss_rayy_linkedin`, additionally require the rising-floor fields and a true readiness gate.
6. **Buffer Add to Buffer** — create one item per selected channel with `content_field`, `post_text`, `channel`, `proof_url`, `source_commit_sha`, `generated_at`, `scheduled_at`, `invocation_id`, `steering_grant_id`, `founder_approval_id`, `authorization_mode`, `schedule_policy_id`, and the batch fields derived from the channel fan-out. For LinkedIn, also pass `linkedin_rising_floor_ready`, `linkedin_baseline_ref`, `linkedin_growth_hypothesis`, `linkedin_24h_gate`, `linkedin_48h_gate`, and `linkedin_next_mutation`. Keep the source `batch_id`; set `batch_size` to the number of final posts and `batch_index` to each post's 1-based position.
7. **Gmail campaign digest** — retain the existing private review notification and reply-ingress contract. A notification failure cancels the scheduled batch.

The existing `tools/zapier/buffer-content-firewall.cjs` is the final deterministic validator. The Zap must pass its required runtime receipt, source SHA, HTTPS proof URL, schedule policy, content-field checks, and the LinkedIn rising-floor gate when the LinkedIn channel is selected.

## Rollback

To stop publication, remove or rotate `PROOF_OF_SHIP_STEERING_GRANT_ID`, disable the dedicated Zap, and cancel scheduled Buffer items. Do not delete the GitHub Actions evidence. To return to fail-closed staging, set the workflow publication flag back to `false` in a reviewed change and keep the dedicated hook configured only for validation.

To roll back the LinkedIn strategy gate, revert the shared output contract, budget/config assertions, firewall change, and focused tests together. Do not leave the docs claiming a gate the runtime no longer enforces.

## Day 3 completion proof

Day 3 is complete only after one controlled real run records all of:

- GitHub Actions run URL and successful proof-of-ship job;
- Catch Hook receipt;
- Zapier run ID;
- dedupe record for the idempotency key;
- ChatGPT Conversation result with URL-integrity validation;
- for LinkedIn, a validated rising-floor baseline/hypothesis/24h/48h/next-mutation receipt;
- Buffer post ID with `schedule`, `customScheduled`, and `saveToDraft=false`;
- Gmail review notification;
- final Buffer publication or an explicit founder cancellation during the 20-minute window.

A checked-in workflow and a successful GitHub deploy alone do not prove that Buffer published.
