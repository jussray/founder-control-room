# MCP Hub — Phase 1

**Status:** read-only foundation  
**Host:** Founder Control Room  
**Authority:** founder approval engine  
**Budget:** $0 recurring spend by default

## Purpose

The MCP Hub lets Founder Control Room discover and invoke narrowly scoped,
read-only capabilities across the active portfolio without making any product
repository depend on a single model vendor or SaaS wrapper.

The Hub is not an autonomous editor. It is a policy broker and evidence layer:

```text
Founder request
→ Project Registry
→ MCP Registry
→ Project/tool policy
→ Capability discovery
→ Read-only invocation
→ Redacted evidence ledger
→ Founder-visible result
```

Git branches, patches, integration, deployment, rollback, DNS, secrets, database
mutations, creative publishing, and other side effects remain separate approval-
gated actions. No approval carries forward to the next action.

## Active portfolio

The bootstrap registry is in `src/config/portfolio.ts` and contains:

- Se’kret Bip
- Juss Beautiful Hair storefront
- Juss Beautiful Hair private operations
- L99 StoryEngine
- Chief AI Prompt Machine
- Untold Stories storefront
- Founder Control Room
- PromptOS

Legacy and duplicate repositories are quarantined and excluded from MCP
allowlists. Think Tank, SolContinuity, SleepWealth Agent, and Sweats remain
known continuity identities only; discovery does not promote them into the
active MCP authority allowlist.

The Control Room database remains the runtime source of truth after projects are
registered. The code registry prevents a cold-start or misconfigured database
from silently granting access to an obsolete repository.

## Declared servers

The executable runtime registry is `src/mcp/defaultRegistry.ts`.

| Server | Phase 1 role | Invocation policy |
|---|---|---|
| GitHub | Repository reading and review | Allowlisted read tools only |
| ProofMode | Federated repository evidence | `audit_repository` only; endpoint authority is Connection Vault |
| Exa | Public-web external-code discovery | Bounded search/fetch only |
| Componecat | Portfolio architecture and catalog context | Active-project catalog/read tools only; all mutations denied |
| Resend | Email-delivery evidence | Read/status tools only; sending denied |
| Playwright | QA snapshots and evidence | Non-mutating inspection only |
| Cloudflare API | Provider schema discovery | `search` only; generic execute denied |
| Figma | Design context and specification reading | Read tools only |
| Supabase Development | Schema and advisor inspection | Development-only, read-only |

A server remains disabled until its declared endpoint authority resolves.
Environment-backed servers require their endpoint variable; ProofMode instead
resolves its endpoint through Connection Vault. The registry stores authority
references and variable names, not endpoint secrets, tokens, or credentials.
Componecat remains limited to the authority-bearing active project set; catalog
visibility does not create merge, deploy, provider-write, or product authority.

## Environment

```bash
MCP_REQUEST_TIMEOUT_MS=10000

MCP_GITHUB_URL=
MCP_GITHUB_TOKEN=

# ProofMode endpoint authority is Connection Vault, not a standing env endpoint.

MCP_EXA_URL=https://mcp.exa.ai/mcp

MCP_COMPONECAT_URL=https://app.componecat.ai/api/mcp
COMPONECAT_MCP_TOKEN=

MCP_RESEND_URL=https://mcp.resend.com/mcp
RESEND_API_KEY=

MCP_PLAYWRIGHT_URL=
MCP_PLAYWRIGHT_TOKEN=

MCP_CLOUDFLARE_API_URL=https://mcp.cloudflare.com/mcp
FCR_CLOUDFLARE_MCP_READ_TOKEN=

MCP_FIGMA_URL=
MCP_FIGMA_TOKEN=

MCP_SUPABASE_DEV_URL=
MCP_SUPABASE_DEV_TOKEN=
```

Production endpoints must use HTTPS. Supabase Development MCP is disabled when
`NODE_ENV=production`.

## Postiz Content Manager boundary

Postiz is deliberately **not** registered as a generic write-capable Phase 1 MCP
server. Founder Content uses a separate provider adapter boundary:

```text
Founder Content lifecycle
→ server-side Postiz credential present
→ Postiz MCP integrationList / postsListTool
→ minimized provider evidence
→ FCR lifecycle receipt
```

Current Postiz capability is bounded to `list_accounts` and `get_post_status`.
`schedulePostTool` and lifecycle `publish_now` are not exposed through this
adapter. A Postiz-reported `PUBLISHED` state is retained as provider-reported
state only because the current Postiz post-list response does not provide the
destination-native permalink required by FCR's terminal publication contract.

The runtime bindings are:

```bash
MCP_POSTIZ_URL=https://mcp.postiz.com/mcp
POSTIZ_API_KEY=
```

`POSTIZ_API_KEY` is server-only bearer material. It must never appear in source,
logs, browser configuration, receipts, screenshots, or public artifacts.

## Founder-only API

```text
GET  /mcp/servers
GET  /mcp/servers/:serverId/capabilities?projectId=<slug>
POST /mcp/servers/:serverId/tools/:toolName/preview
POST /mcp/servers/:serverId/tools/:toolName/invoke
```

Preview and invoke bodies use this shape:

```json
{
  "projectId": "sekret-bip",
  "missionId": "optional-uuid",
  "approvalId": "optional-uuid",
  "arguments": {
    "owner": "jussray",
    "repo": "Sekret-Bip",
    "query": "RoomBackground"
  }
}
```

The backend rejects argument keys that look like credentials. Tool names must
be advertised by the remote server and must also pass the local allowlist.

## Evidence contract

Migration `20260715_mcp_hub_phase1.sql` adds:

- `mcp_servers`
- `mcp_project_policies`
- `mcp_tool_calls`

The evidence ledger stores:

- project, mission, approval and server identifiers
- tool name and inferred risk
- policy decision and status
- deterministic request hash
- argument key names and byte count
- response type and byte count
- duration, estimated cost and redacted error code

It does **not** store raw arguments, raw results, bearer tokens, API keys,
journals, voice transcripts, teen messages, customer data, private vendor data,
story drafts, or companion conversations.

## Repository observation fix

`ProjectController` now uses the same central `RepositoryProviderFactory` as the
founder API. It observes real repository metadata and root manifests rather
than writing a decorative placeholder observation.

`GitHubProvider` remains the deterministic implementation for approved branch,
patch, compare and integration operations. GitHub MCP is an agent-facing read
capability; it does not replace the provider layer.

## Cost and failure policy

- Default monthly MCP budget is `$0`.
- A declared paid capability returns `requires_approval`.
- Unknown tools fail closed.
- Unconfigured servers fail closed.
- Development-only servers fail closed in production.
- Responses are capped at 1 MB.
- Requests time out between 500 ms and 60 seconds; default is 10 seconds.
- A missing evidence write fails the request rather than claiming unproven work.

## Next custom MCPs

### Story Artifact Factory

For `l99-StoryEngine`:

- screenplay, stage play, e-book, e-novel and song packages
- canon and continuity checks
- EPUB/Fountain/PDF compilation
- scene, character, location, prop, wardrobe and shot breakdowns
- visual prompt manifests and Figma/Canva handoffs
- provider, model, prompt, cost, source and fallback provenance

### Companion Reply Studio

For Se’kret Bip:

- expand approved fallback-response coverage offline
- score Raylene, Rylane, Night and Cloud voice consistency
- detect copy bleed, question-first behavior and duplicates
- safety and reading-level linting
- publish versioned, founder-approved reply packs

It must never use raw private teen content to build the packs, and generated
candidates never become live canon without validation and approval.

## Verification

```bash
npm run typecheck
npm test
npm run lint
```

A passing agent message is not evidence. CI and runner output are the proof.
