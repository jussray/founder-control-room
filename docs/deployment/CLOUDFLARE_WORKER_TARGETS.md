# Cloudflare Worker Deployment Targets

## Purpose

Keep the Founder Control Room root application, API-subdomain application, and deletion queue from overwriting one another during Cloudflare Git deployments.

## Canonical targets

| Cloudflare Worker | Domain / role | Wrangler config | Build command | Deploy command | Cron |
|---|---|---|---|---|---|
| `founder-control-room` | `foundercontrolroom.org` application and reconciliation owner | `wrangler.toml` | `npm run build` | `npm run deploy` | every minute |
| `founder-control-room2` | `api.foundercontrolroom.org` API and remote MCP surface | `wrangler.api.toml` | `npm run build` | `npm run deploy:api` | none |
| `founder-control-room-deletion-queue` | account-deletion processing | `wrangler.deletion-queue.toml` | `npm run build` | `wrangler deploy --config wrangler.deletion-queue.toml` | every 6 hours |

All three Worker names are immutable deployment identities. A config must never reuse another target's `name`, route, preview URL, or scheduled trigger.

The API Worker intentionally has no scheduled trigger. Running the same reconciliation cron in both HTTP Workers would duplicate control-loop work.

## Cloudflare Git project configuration

Each Cloudflare Git project must invoke the deploy command that names its own Wrangler file. Do not connect multiple projects to plain `npx wrangler deploy`, because that command uses the root `wrangler.toml` and can replace another project's name, domain, preview, route, or trigger settings.

Recommended project commands:

```text
founder-control-room
Build:  npm run build
Deploy: npm run deploy

founder-control-room2
Build:  npm run build
Deploy: npm run deploy:api

founder-control-room-deletion-queue
Build:  npm run build
Deploy: npx wrangler deploy --config wrangler.deletion-queue.toml
```

The deletion target must remain dormant until its exact-head gate passes and a separate production approval confirms the required runtime bindings. A repository merge alone does not deploy it.

## Required bindings per HTTP Worker

Configure these separately in the secret store for each intended HTTP Worker:

```text
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
SUPABASE_PUBLISHABLE_KEY
GITHUB_WEBHOOK_SECRET
FOUNDER_ALLOWED_ORIGINS
FOUNDER_API_URL
```

Configure one GitHub authentication path:

```text
Preferred production path:
GITHUB_APP_ID
GITHUB_PRIVATE_KEY

Fallback path:
GITHUB_TOKEN
```

`GITHUB_APP_ID` and `GITHUB_PRIVATE_KEY` are a pair. A partial pair fails closed even when a fallback token exists, because half-configured production authentication is configuration drift.

## Required deletion queue bindings

Configure these only in the `founder-control-room-deletion-queue` Worker secret/binding plane:

```text
NEXT_PUBLIC_SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
CF_API_TOKEN
CF_ACCOUNT_ID
CF_SESSIONS_KV_NAMESPACE_ID
CF_FEATURE_FLAGS_KV_NAMESPACE_ID
```

The two KV namespace identifiers are optional only when that namespace does not exist. When either namespace identifier is configured, `CF_ACCOUNT_ID` and `CF_API_TOKEN` are required and every non-2xx delete fails the scheduled run.

## Founder Signal Engine remote bridge

The API Worker also needs these provider-held secrets before the ChatGPT fallback bridge can be activated:

```text
FOUNDER_SIGNAL_ENGINE_MCP_TOKEN
ZAPIER_FOUNDER_SIGNAL_ENGINE_HOOK_URL
```

Optional:

```text
FOUNDER_SIGNAL_ENGINE_HOOK_TIMEOUT_MS
```

The existing OpenAI key reference remains `zapier-founder-signal-engine`. It is not stored in this repository and must not be recreated merely because a direct Zapier connector is absent.

## Verification gate

A repository merge does not prove deployment. Close the Cloudflare incident only after all of the following are captured:

1. exact source SHA for each intended Worker;
2. successful `npm run build`;
3. successful deploy using the target's named Wrangler config;
4. no missing-binding validation error;
5. root-domain `/health` response;
6. API-subdomain `/health` response;
7. deletion queue scheduled test proves failed entries remain failed and make the run fail visibly;
8. remote MCP discovery works on the API subdomain without exposing credentials;
9. the Founder Signal Engine remains review-only until separate publication and CRM approval authority exists.

## Safety and rollback

- Never commit secret values or copy them into GitHub issues, PRs, logs, screenshots, HubSpot, Buffer, or Founder Control Room evidence.
- Do not rotate keys merely to repair a missing Worker binding. Restore the existing provider-held secret reference unless a separate credential incident proves rotation is needed.
- If an HTTP Worker config routes incorrectly, redeploy the prior known-good Worker version and preserve the failed build evidence.
- If the deletion target is activated incorrectly, disable its cron first, preserve failed queue evidence, and redeploy the prior named deletion Worker version. Never point the deletion config at either HTTP Worker name.
- Do not disconnect or delete any Cloudflare project until its role is confirmed from private dashboard evidence.
