# External Code-Use 5W1H Ledger

## Goal

Founder Control Room discovers and lists public evidence that an outside repository,
package, website, deployment, document, or product may be using founder-owned GitHub
repository code. Every discovery is normalized into Who, What, Where, When, Why, and
How, stored in the Control Room's own Supabase project, and included in an hourly
Resend digest to `sekretbip@gmail.com`.

This system detects public evidence. It does not prove private copying, legal
infringement, ownership transfer, or damages.

## 5W1H contract

- **Who**: the public owner, organization, repository, site, or page associated with the evidence.
- **What**: the observed relationship, such as fork, reference, apparent copy, deployment, package, or derivative.
- **Where**: the public evidence URL.
- **When**: first seen, last seen, and the observation timestamp used in the 5W1H record.
- **Why**: the purpose stated by the public evidence, or an explicit `not verified` statement.
- **How**: the discovery provider and tool, with the privacy rule that only public repository names and URLs are searched.

## Discovery stack

### GitHub MCP

GitHub MCP is the repository-native source. The scanner capability-detects and uses
read-only fork, code-search, and repository-search tools when advertised. It excludes
the canonical repository and `jussray`-owned results.

### Exa Deep Search MCP

Exa is the public-web deep-search source. The committed endpoint is
`https://mcp.exa.ai/mcp`. The Control Room policy allows only search and fetch tools,
sets the paid budget to zero, and denies people/contact/email/phone enrichment. If the
free path is rate-limited or unavailable, the scan records a warning and preserves the
existing ledger rather than spending money or fabricating results.

### Resend

The hourly sender uses Resend's email API with the runtime secret `RESEND_API_KEY` and
a verified `EXTERNAL_USE_EMAIL_FROM` sender. The recipient is fixed in code and in the
database constraint to `sekretbip@gmail.com`.

Resend MCP remains read-only in Founder Control Room. It may inspect delivery, request,
domain, webhook, and bounce evidence, but general MCP send/create/update/delete tools
remain denied. The hourly sender is a purpose-bound code path, not a general email bot.

## Product surface

Founder-only API routes:

```text
GET /external-use/discoveries
GET /external-use/summary
GET /external-use/digests
```

Optional filters:

```text
/external-use/discoveries?project=sekret-bip
/external-use/discoveries?classification=confirmed&limit=50
```

The response shape is ready for a future Founder Control Room dashboard with:

- summary counts by confidence/classification and source;
- a searchable evidence list;
- a six-field 5W1H detail view;
- delivery history and warning state;
- explicit distinction between confirmed, probable, possible, and dismissed evidence.

No public dashboard or unauthenticated route is introduced by this change.

## Hourly execution

The existing Cloudflare cron still wakes every minute. The external-use scheduler
inserts a unique `digest_hour` reservation before searching or sending. Only one worker
can claim an hour, so overlapping isolates cannot produce duplicate hourly emails.

Each claimed cycle:

1. discovers public evidence through configured GitHub and Exa MCP tools;
2. deduplicates by project plus evidence hash;
3. inserts new evidence or refreshes `last_seen_at`;
4. renders the complete current list and marks how many entries are new this hour;
5. sends one Resend email to `sekretbip@gmail.com`;
6. records the Resend email ID, counts, warnings, and final status;
7. marks listed discoveries with `last_digest_at`.

A missing search provider does not erase evidence. A missing Resend key or verified
sender fails the digest visibly and stores a hashed error code without exposing the
secret or raw provider response.

## Required runtime configuration

```dotenv
MCP_GITHUB_URL=
MCP_GITHUB_TOKEN=
MCP_EXA_URL=https://mcp.exa.ai/mcp
MCP_RESEND_URL=https://mcp.resend.com/mcp
RESEND_API_KEY=
EXTERNAL_USE_EMAIL_FROM=
```

`EXTERNAL_USE_EMAIL_FROM` must be a sender on a Resend-verified domain. No key, OAuth
token, sender secret, or raw MCP payload belongs in GitHub.

## Data boundary

Stored:

- public evidence URL and sanitized summary;
- external public owner/repository when available;
- classification and confidence;
- complete 5W1H fields;
- timestamps, evidence hash, source tool, and delivery evidence.

Never stored or sent to search providers:

- private source-code fragments;
- secrets, API keys, tokens, or private prompts;
- teen, journal, voice, media, family, parent, customer, payment, or vendor data;
- raw MCP request or response payloads.

## Verification gates

Before merge:

```text
npm run typecheck
npm run lint
npm test
npm run build
npm run verify:mcp
npm run verify:rls-contract
```

After migration and deployment, runtime proof requires:

- the migration applied to the Founder Control Room Supabase project;
- configured MCP endpoints and Resend secret/sender bindings;
- one claimed digest hour;
- a stored discovery or an explicit zero-results digest;
- a real Resend email ID and delivery evidence;
- the founder-only list endpoints returning the same stored ledger.

## Rollback

Revert the feature commit and remove the external-use scheduler import from the Worker.
Do not delete evidence rows merely to make the ledger look clean. Disabling
`RESEND_API_KEY` or `EXTERNAL_USE_EMAIL_FROM` stops email delivery while preserving the
search and audit history. Dropping tables or deleting evidence requires separate,
explicit founder approval.
