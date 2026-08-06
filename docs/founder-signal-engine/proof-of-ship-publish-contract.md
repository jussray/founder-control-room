# Proof-of-Ship Scheduled Publication Contract

## Purpose

Turn an allowlisted, verified production deployment into a build-in-public post that is scheduled through Buffer and can publish after the existing review window.

This is a separate path from the Founder Signal Engine metadata bridge. It uses its own Zapier Catch Hook secret and must not reuse the Worker bridge hook.

## Current activation boundary

The sender is implemented in the production deployment workflow for:

- `jussray/founder-control-room`
- `jussray/jussbeautifulhair-site`
- `jussray/untold-stories-storefront`
- `jussray/chief-ai-machine`

Only `jussray/founder-control-room` currently has the verified deployment and `/version` runtime proof required by this workflow. Do not install this workflow in the other repositories until their deployment authority, live URL, and exact-SHA endpoint are separately verified.

`jussray/Sekret-Bip` is excluded at the source and must remain excluded in the Zap filter.

## Sender gate

The GitHub Actions job runs after the existing production smoke test and stops before the webhook unless all of these are true:

1. The workflow was dispatched against the exact current `main` SHA.
2. The commit is meaningful: `feat`, `fix`, or `perf`; a merged-to-main change may also pass when it touches a non-document path.
3. The author is not Dependabot and the message does not contain `[skip ci]` or `[skip post]`.
4. The repository is in the allowlist and is not `jussray/Sekret-Bip`.
5. Every changed Supabase migration version is present in the remote `supabase_migrations.schema_migrations` table. If no migration changed, the receipt is `not_applicable`.
6. The live Worker `/version` response reports `service=founder-control-room` and `gitSha` equal to the deployed SHA.
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
  "requested_content_fields": ["x_draft", "linkedin_draft"],
  "repository_allowlist": [
    "jussray/founder-control-room",
    "jussray/jussbeautifulhair-site",
    "jussray/untold-stories-storefront",
    "jussray/chief-ai-machine"
  ],
  "excluded_repositories": ["jussray/Sekret-Bip"]
}
```

A `not_applicable` Supabase receipt is valid only when `migration_versions` is empty. A missing or mismatched Cloudflare receipt is never valid.

## Required Zap sequence

1. **Catch Hook** — use the dedicated `ZAPIER_CATCH_HOOK_URL`; the suggested grant value is `proof-of-ship-publish-v1`.
2. **Dedupe** — look up `idempotency_key` in Zapier Tables or Storage by Zapier; stop when already processed.
3. **Allowlist filter** — require `repository_allowed=true`, `live_state=verified`, `publish_allowed=true`, `PUBLISH_ALLOWED=true`, and reject `jussray/Sekret-Bip`.
4. **ChatGPT Conversation** — use the Responses API action. Feed only the verified change fields and receipts. Return JSON with `x` and `linkedin`; do not invent impact, metrics, or URLs.
5. **Output validation** — require the proof URLs in the generated copy to equal the supplied URLs. Reject unresolved prompts, empty copy, or altered URLs.
6. **Buffer Add to Buffer** — create one item per selected channel with `content_field`, `post_text`, `channel`, `proof_url`, `source_commit_sha`, `generated_at`, `scheduled_at`, `invocation_id`, `steering_grant_id`, `founder_approval_id`, `authorization_mode`, `schedule_policy_id`, and the batch fields derived from the channel fan-out. Keep the source `batch_id`; set `batch_size` to the number of final posts and `batch_index` to each post's 1-based position.
7. **Gmail campaign digest** — retain the existing private review notification and reply-ingress contract. A notification failure cancels the scheduled batch.

The existing `tools/zapier/buffer-content-firewall.cjs` is the final deterministic validator. The Zap must pass its required runtime receipt, source SHA, HTTPS proof URL, schedule policy, and content-field checks.

## Rollback

To stop publication, remove or rotate `PROOF_OF_SHIP_STEERING_GRANT_ID`, disable the dedicated Zap, and cancel scheduled Buffer items. Do not delete the GitHub Actions evidence. To return to fail-closed staging, set the workflow publication flag back to `false` in a reviewed change and keep the dedicated hook configured only for validation.

## Day 3 completion proof

Day 3 is complete only after one controlled real run records all of:

- GitHub Actions run URL and successful proof-of-ship job;
- Catch Hook receipt;
- Zapier run ID;
- dedupe record for the idempotency key;
- ChatGPT Conversation result with URL-integrity validation;
- Buffer post ID with `schedule`, `customScheduled`, and `saveToDraft=false`;
- Gmail review notification;
- final Buffer publication or an explicit founder cancellation during the 20-minute window.

A checked-in workflow and a successful GitHub deploy alone do not prove that Buffer published.
