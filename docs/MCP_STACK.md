# Founder Control Room MCP stack

Last reviewed: 2026-08-18

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
| `cloudflare` | Cloudflare API/provider context | Read by default; mutations remain separately approved |
| `cloudflare-stack` | Supplemental Cloudflare Stack provider context at `https://stack.mcp.cloudflare.com/mcp` | Repository clients authenticate through their supported client flow; the in-app Hub stays fail-closed for generic `execute` and mutation-shaped tools |
| `cloudflare-docs` | Current Cloudflare product documentation | Documentation only |
| `cloudflare-bindings` | Inspect Worker bindings and project wiring | Binding mutations remain separately approved |
| `cloudflare-builds` | Inspect Control Room Worker build evidence | No deploy or setting changes without separate approval |
| `cloudflare-observability` | Inspect sanitized runtime logs and analytics | Never query or paste access tokens, service-role keys, founder sessions, or raw project payloads |

## In-app Control Room MCP Hub boundary

The repository-agent configuration above does **not** automatically make a remote server callable by the running Control Room.

The in-app Hub uses `src/mcp/defaultRegistry.ts`, environment/connection-vault authority, server-specific allowlists, and MCP evidence receipts. For Cloudflare Stack specifically:

- the runtime endpoint and any bearer credential are not committed;
- the server remains unavailable until its runtime authority is configured;
- read-shaped tool names may be considered by policy;
- generic `execute` and mutation-shaped tools are denied;
- provider/OAuth availability in an IDE does not prove production runtime authorization.

This intentionally prevents a generic Code Mode `execute` surface from being mislabeled as read-only merely because the provider connection exists.

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
