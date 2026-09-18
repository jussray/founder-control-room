# Proof-of-Ship Policy
#
# Explicit allowlist and enforcement rules for proof-of-ship automation.
# MUST be reviewed before activating the Zapier webhook URL across repos.

## Allowed Repos
Only these repos are permitted to send proof-of-ship webhooks:
- jussray/founder-control-room (Supabase + Cloudflare receipt)
- jussray/jussbeautifulhair-site (Cloudflare receipt only)
- jussray/untold-stories-storefront (Hydrogen/Oxygen receipt)
- jussray/chief-ai-machine (merged commit only, no live backend)

## Excluded Repos
The following repos MUST NOT send proof-of-ship webhooks, even if they attempt to:
- **jussray/Sekret-Bip** (teen app — no marketing automation, COPPA compliance, excluded from build-in-public)
- Any fork or test repo

Enforcement: Zapier webhook consumer MUST validate `repo` field against this allowlist
BEFORE processing. Reject anything not in the list.

## Invariants
- `publish_allowed` MUST equal `false`. Terminal action is email to founder. No downstream
  social publishing.
- `idempotency_key` MUST be `repo:commit_sha` for deduplication. Do not post the same commit twice.
- Schema validation (ops/zapier/proof-of-ship-payload.schema.json) MUST pass before AI copy generation.
- Se'kret Bip is excluded at the policy level, not a string filter. If Sekret-Bip ever sends
  a webhook, it is rejected before validation.

## Proof Levels
- `live_state: "verified"` — a live endpoint (Supabase migration applied, Cloudflare /version,
  Oxygen /version) confirmed this commit SHA is live in production.
- `live_state: "merged"` — commit is merged to main, but no live backend to verify (chief-ai).
  Still counts as proof-of-ship, but not as "verified live."

## Email Delivery
When validation passes and schema is satisfied, ChatGPT drafts a copy and the Zap emails
to the founder with both X (<=270 chars) and LinkedIn (<=900 chars) versions. Founder
taps the commit link to review it live, then decides whether/when/where to post.

Email is terminal. No Zapier action publishes to social. No automatic posting.

## Testing Gate
Before rolling ZAPIER_CATCH_HOOK_URL to jbh, untold-stories, and chief-ai, the
founder-control-room Zap must complete end-to-end with four verified receipts:
1. GitHub Actions workflow execution (log visible on the repo)
2. Zapier webhook delivery (Zapier task history shows payload received)
3. ChatGPT Conversation response (JSON parse succeeds)
4. Email delivered to founder (inbox receipt)

Only after those four are confirmed should the same secret be shared across the
remaining three repos. Repo-specific secrets (e.g., OXYGEN_DEPLOYMENT_TOKEN for
untold-stories) may differ, but ZAPIER_CATCH_HOOK_URL is the same for all four.
