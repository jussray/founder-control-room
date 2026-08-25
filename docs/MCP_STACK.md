# Founder Control Room MCP stack

Last reviewed: 2026-08-25

This file governs which MCP servers an AI agent may use while **developing this repository**. It is different from the Control Room's own **MCP / Connector Hub** (`project_connections` + `GET /agents` + `GET /authority-levels`), which records connectors and authority for managed projects. Do not conflate the repository agent fleet with the in-app Connector Hub.

The Control Room is a private, repository-agnostic governance service. Its standing repository MCP stack supports repository inspection, current implementation documentation, browser proof, design context, its own database schema, and Cloudflare provider/deployment evidence.

## Connected repository-agent servers

| Server | Purpose | Boundary |
| --- | --- | --- |
| `github` | Repository, PR, Actions, code-security, and secret-protection context | Selected toolsets only; no committed PAT or Authorization header |
| `context7` | Current implementation/library documentation | Documentation only; no private project payloads or secrets |
| `playwright` | Browser-visible verification and recovery-path proof | Browser/runtime evidence; it does not authorize code or provider mutations |
| `figma` | Design context and implementation handoff | Design evidence only; no deploy, migration, spending, or external-action authority |
| `supabase` | Inspect the Control Room's own schema and Supabase documentation | Project `oojzfmmywbvficgybaxd`, read-only, `database,docs` only |
| `cloudflare` | Official Cloudflare API MCP at `https://mcp.cloudflare.com/mcp` | Provider-supported OAuth/API-token connection. Read by default; mutations remain separately approved |
| `cloudflare-stack` | User-supplied supplemental endpoint at `https://stack.mcp.cloudflare.com/mcp` | Experimental repository-client context only. It is not current provider authority because no matching Cloudflare documentation or source-of-truth registration has been verified |
| `cloudflare-docs` | Current Cloudflare product documentation | Documentation only |
| `cloudflare-bindings` | Inspect Worker bindings and project wiring | Binding mutations remain separately approved |
| `cloudflare-builds` | Inspect Control Room Worker build evidence | No deploy or setting changes without separate approval |
| `cloudflare-observability` | Inspect sanitized runtime logs and analytics | Never query or paste access tokens, service-role keys, founder sessions, or raw project payloads |

## Served remote read MCP boundary

Founder Control Room also serves a separate read-only MCP gateway at `POST https://api.foundercontrolroom.org/mcp/read`. This is the remote bridge intended for external MCP clients that need governed repository/provider reads without inheriting Founder Control Room execution authority.

- Authentication uses the dedicated Worker secret `FCR_REMOTE_MCP_READ_TOKEN`. It must not be reused for the write-capable Founder Signal Engine MCP or any provider credential.
- Production project scope is server-held as `FCR_REMOTE_MCP_READ_PROJECTS=chief-ai-machine,founder-control-room`. Callers cannot add or substitute a project slug in order to widen the grant.
- The gateway advertises only `list_read_servers` and `invoke_read_tool`; both remain behind the in-app MCP registry and policy boundary.
- Provider tools still have to pass the configured server allowlist/denylist. A tool name matching create/update/delete/merge/write authority remains blocked by the underlying FCR MCP policy.
- Mission IDs, approval IDs, bearer tokens, and other authority-bearing fields are not accepted as tool arguments. Nested secret-bearing arguments are rejected before the provider boundary.
- If either the dedicated token or server-held project scope is absent, the endpoint fails closed rather than falling back to a broader grant.
- The secret value belongs in the surviving `founder-control-room` Worker secret store only. Do not commit it to `.env`, Wrangler config, MCP client config, issues, screenshots, logs, or proof artifacts.

This gateway is intentionally narrower than the full portfolio registry. Expanding it beyond Chief AI + Founder Control Room requires a separate authority decision and matching contract update.

## In-app Control Room MCP Hub boundary

The repository-agent configuration above does **not** automatically make a remote server callable by the running Control Room.

The in-app Hub uses `src/mcp/defaultRegistry.ts`, environment/connection-vault authority, server-specific allowlists, and MCP evidence receipts. For Cloudflare:

- runtime provider authority is the documented `https://mcp.cloudflare.com/mcp` endpoint;
- the bearer credential is a dedicated least-privilege read token referenced as `FCR_CLOUDFLARE_MCP_READ_TOKEN` and is never committed;
- the normal Hub may use the provider's `search` tool for API/schema discovery;
- generic Code Mode `execute` remains denied in normal Hub policy because its tool name alone cannot prove that the embedded request is read-only;
- the exact-head `Cloudflare API MCP Read Diagnostic` is the only standing lane allowed to call `execute`, and the repository-owned probe hard-codes a single `GET /accounts/{account_id}` request before recording a redacted receipt;
- the user-supplied `stack.mcp.cloudflare.com` endpoint is not registered as in-app provider authority;
- provider/OAuth availability in an IDE does not prove production runtime authorization.

This keeps Cloudflare provider proof useful without turning a generic code-execution tool into an accidentally privileged Control Room capability.

## Deliberately excluded

- DBHub and generic database MCP servers. The project-scoped read-only Supabase server covers the current schema-inspection need.
- Netdata while the service runs on managed infrastructure without claimed persistent hosts.
- GitHub Insiders and local Docker GitHub MCP as committed defaults.
- Any cross-project Supabase connection. The Control Room must never point its standing MCP configuration at Bip's database.

## Data boundary

The Control Room may inspect its own operational schema and sanitized repository/provider metadata. Do not send or retrieve raw Se'kret Bip teen/parent content, Juss Beautiful Hair customer/vendor data, Stripe payloads, production credentials, or other project secrets through this stack.

## Verification prompts

```text
Use GitHub MCP to inspect this repository's provider boundary and report where GitHub-specific assumptions leak past RepositoryProvider. Do not change code.
```

```text
Use Context7 to verify the installed Octokit, Supabase JS, Express, Vitest, TypeScript, and Wrangler APIs before proposing changes.
```

```text
Use Supabase MCP to list the configured Control Room project's tables, migrations, and advisors. Do not execute SQL or modify data.
```

```text
Use Cloudflare provider MCPs to inspect current bindings, build state, Access/provider configuration, and sanitized runtime evidence. Prefer provider truth over screenshots or stale documentation. Do not mutate provider state without the separately approved authority path.
```

```text
Use Playwright for any user-facing UI/runtime claim before merge.
```

## Validation

```bash
npm run verify:mcp
npm run typecheck
npm test
npm run build
```

See `docs/REPO_STACK_POLICY.md` for the cross-repository OODA and red-team decision framework.
