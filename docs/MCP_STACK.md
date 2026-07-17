# Founder Control Room MCP stack

Last reviewed: 2026-07-14

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

- Playwright while the repository has no frontend. Add it when a real browser UI and synthetic test route exist.
- Figma while there is no active source-design implementation workflow.
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
