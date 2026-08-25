# Founder Control Room MCP stack

Last reviewed: 2026-08-25

This file governs which MCP servers an AI agent may use while **developing this repository**. It is different from the Control Room's own **MCP / Connector Hub** (`project_connections` + `GET /agents` + `GET /authority-levels`), which records connectors and authority for managed projects. Do not conflate the repository agent fleet with the in-app Connector Hub.

The Control Room is a private, repository-agnostic governance service. Its standing repository MCP stack supports repository inspection, current implementation documentation, browser proof, design context, its own database schema, and Cloudflare provider/deployment evidence.

## External paired MCP for ChatGPT and Claude

The Control Room source now defines an external connector boundary:

- canonical resource: `https://api.foundercontrolroom.org/mcp`;
- protected-resource metadata: `/.well-known/oauth-protected-resource` and `/.well-known/oauth-protected-resource/mcp`;
- transport: stateless Streamable HTTP with MCP `2026-07-28`, plus initialization-based `2025-11-25`, `2025-06-18`, and `2025-03-26` compatibility;
- canonical auth: Supabase OAuth access tokens validated for issuer, audience, expiry/not-before, `client_id`, `mcp:read`, `mcp_projects`, current Supabase user validity, and the server-side `founder_users` allowlist;
- temporary compatibility auth: `/mcp/read` with a dedicated static token and the same server-held project scope;
- evidence: every successful external tool call must persist a redacted `mcp_tool_calls` receipt or the call fails closed.

The external tool catalog is intentionally small and deterministic:

1. `chief_audit_repository`
2. `chief_list_capabilities`
3. `chief_preview_capability_plan`
4. `fcr_list_projects`
5. `fcr_get_current_truth`
6. `fcr_preview_skill_route`

There is no external generic `invoke_read_tool`. Callers cannot choose an arbitrary nested provider, tool name, mission, approval, credential, mutation action, or project outside the intersection of the OAuth token grant and the server-held allowlist. Skill content remains private: capability results expose metadata/evidence only, never raw `SKILL.md` prompt text.

MCP identity uses the validated subject, OAuth client ID, JSON-RPC request ID, exact project, and redacted request/result hashes. It uses no browser session cookie, tracking cookie, device fingerprint, or probabilistic fingerprint. Raw MCP arguments and results are not written to the evidence ledger.

### Activation gate

Source readiness is not production readiness. Before deployment, all of the following must be verified at the same exact commit:

- reconcile the live Supabase migration ledger so `mcp_servers`, `mcp_project_policies`, and `mcp_tool_calls` actually exist with the checked-in RLS/grant contract;
- enable/configure Supabase OAuth and a custom access-token hook that emits the exact audience, `mcp:read`, and bounded `mcp_projects` claims;
- register/allow the exact ChatGPT and Claude client IDs (CIMD where supported; DCR only for legacy compatibility);
- configure `FCR_REMOTE_MCP_*` and `CHIEF_AI_BASE_URL` without reusing provider/deploy credentials;
- prove the Chief URL/binding and FCR Worker SHA, then run the Attack Ten auth/scope/replay/header/evidence/client matrix;
- connect ChatGPT and Claude only after provider evidence proves the resource metadata, OAuth flow, tools list, and calls from the deployed exact head.

The source and provider attack matrix is maintained in `docs/PAIRED_MCP_ATTACK_TEN.md`.

No migration, OAuth dashboard change, Worker secret/binding change, merge, or deployment is authorized merely by this document or by source tests.

### GitHub Truth v0 classifier foundation

The source-only [GitHub Truth MCP v0 contract](MCP_GITHUB_TRUTH_V0.md) adds a deterministic PR/CI evidence classifier without adding a seventh external tool or a new route. It fails closed on old-head passes, missing or non-success CI, stale/malformed/future observations, expected-head mismatch, head movement during collection, and contradictory current-head evidence.

This is not a live GitHub integration or receipt path. GitHub App read permissions, repository allowlisting, bounded collection, durable receipt persistence, catalog/OAuth expansion, provider configuration, and deployed ChatGPT/Claude proof remain separate future gates.

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
