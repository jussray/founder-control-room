# Founder Control Room MCP stack

Last reviewed: 2026-07-19

This file governs which MCP servers an AI agent (e.g. Claude Code) may use
while **developing this repository**. It is a different thing from the
Control Room's own **MCP / Connector Hub** (`project_connections` +
`GET /agents` + `GET /authority-levels`), which is a data registry of
connectors for the PROJECTS the Control Room manages (Se'kret Bip and
future projects) — inventory and authority-level bookkeeping, not a live
tool connection. Don't conflate the two: this file is about what tools help
build the Control Room; the Connector Hub is about what the Control Room
records regarding each managed project's own tool surface.

The Control Room is a private, repository-agnostic governance service. Its default MCP stack supports repository inspection, current implementation documentation, its own database schema, and its own Cloudflare deployment evidence.

## Connected servers

| Server | Purpose | Boundary |
| --- | --- | --- |
| `github` | Repository, PR, Actions, code-security, and secret-protection context | Selected toolsets only; no committed PAT or Authorization header |
| `context7` | Current documentation for Octokit, Supabase JS, Express, TypeScript, Vitest, Wrangler, and related libraries | Documentation only; no private project payloads or secrets |
| `supabase` | Inspect the Control Room's own schema and Supabase documentation | Project `oojzfmmywbvficgybaxd`, read-only, `database,docs` only |
| `cloudflare-docs` | Current Cloudflare product documentation | Documentation only |
| `cloudflare-builds` | Inspect Control Room Worker build evidence | OAuth; no deploy or setting changes without separate approval |
| `cloudflare-observability` | Inspect sanitized runtime logs and analytics | Never query or paste access tokens, service-role keys, founder sessions, or raw project payloads |

## Deliberately excluded

- Playwright — the exclusion condition ("no frontend") is now false: `public/control-room/` is a real, tested, served frontend as of 2026-07-19. Reconsider adding it for browser-verified proof of UI changes. Not added automatically here — enabling a new MCP server for this repo's Claude Code sessions is the founder's call, not something to change unprompted.
- Figma — still excluded. There is no active source-design implementation workflow in this repo (no Figma files, no Code Connect mapping). Reconsider once one exists.
- DBHub and generic database MCP servers. The project-scoped read-only Supabase server covers the current schema-inspection need.
- Netdata while the service runs on managed infrastructure without claimed persistent hosts.
- GitHub Insiders and local Docker GitHub MCP as committed defaults.
- Any cross-project Supabase connection. The Control Room must never point its standing MCP configuration at Bip's database.

## Data boundary

The Control Room may inspect its own operational schema and sanitized repository metadata. Do not send or retrieve raw Se'kret Bip teen/parent content, Juss Beautiful Hair customer/vendor data, Stripe payloads, production credentials, or other project secrets through this stack.

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
Use Cloudflare Builds and Observability to report the latest Control Room Worker build and sanitized runtime errors. Do not deploy or change settings.
```

## Validation

```bash
npm run verify:mcp
npm run typecheck
npm test
npm run build
```

See `docs/REPO_STACK_POLICY.md` for the cross-repository OODA and red-team decision framework.
