# Cloudflare Worker Deployment Targets

## Purpose

Keep the Founder Control Room root application, API-subdomain application, and deletion queue from overwriting one another during Cloudflare Git deployments.

## Canonical targets

| Cloudflare Worker | Domain / role | Wrangler config | Build command | Deploy command | Cron |
|---|---|---|---|---|---|
| `founder-control-room` | `foundercontrolroom.org` application and reconciliation owner | `wrangler.toml` | `npm run build` | `npm run deploy` | every minute |
| `founder-control-room2` | `api.foundercontrolroom.org` API and remote MCP surface | `wrangler.api.toml` | `npm run build` | `npm run deploy:api` | none |
| deletion queue Worker | account-deletion processing | `wrangler.deletion-queue.toml` | repository-specific | `wrangler deploy --config wrangler.deletion-queue.toml` | config-owned |

The API Worker intentionally has no scheduled trigger. Running the same reconciliation cron in both HTTP Workers would duplicate control-loop work.

## Cloudflare Git project configuration

Each Cloudflare Git project must invoke the deploy command that names its own Wrangler file. Do not connect both projects to plain `npx wrangler deploy`, because that command uses the root `wrangler.toml` and can replace the second project's name, domain, preview, and route settings.

Recommended project commands:

```text
founder-control-room
Build:  npm run build
Deploy: npm run deploy

founder-control-room2
Build:  npm run build
Deploy: npm run deploy:api
```

## Required bindings per HTTP Worker

Configure these separately in the secret store for each intended Worker:

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
7. remote MCP discovery works on the API subdomain without exposing credentials;
8. the Founder Signal Engine remains review-only until separate publication and CRM approval authority exists.

## Safety and rollback

- Never commit secret values or copy them into GitHub issues, PRs, logs, screenshots, HubSpot, Buffer, or Founder Control Room evidence.
- Do not rotate keys merely to repair a missing Worker binding. Restore the existing provider-held secret reference unless a separate credential incident proves rotation is needed.
- If the API config routes incorrectly, redeploy the prior known-good Worker version and preserve the failed build evidence.
- Do not disconnect or delete either Cloudflare project until its role is confirmed from private dashboard evidence.
