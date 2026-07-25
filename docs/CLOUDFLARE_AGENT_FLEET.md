# Cloudflare Agent Fleet

## Purpose

This document is the canonical setup and authority map for connecting Founder
Control Room to Cloudflare through ChatGPT, Codex, Claude Code, Cursor, GitHub
Copilot, OpenCode, Windsurf, and LM Studio Bionic.

The repository-wide operating rules remain authoritative:

- `AGENTS.md`
- `GLOBAL_AI.md`
- `.ai/skills/juss-founder-os/SKILL.md`
- `.agents/skills/founder-control-room-operator/SKILL.md`
- `.agents/skills/control-room-cloudflare-agent-fleet/SKILL.md`

## Shared Cloudflare MCP set

| Name | Endpoint | Purpose |
|---|---|---|
| `cloudflare` | `https://mcp.cloudflare.com/mcp` | Account-scoped API Code Mode |
| `cloudflare-docs` | `https://docs.mcp.cloudflare.com/mcp` | Current public documentation |
| `cloudflare-bindings` | `https://bindings.mcp.cloudflare.com/mcp` | Workers binding and project wiring |
| `cloudflare-builds` | `https://builds.mcp.cloudflare.com/mcp` | Build and deployment evidence |
| `cloudflare-observability` | `https://observability.mcp.cloudflare.com/mcp` | Minimized logs and telemetry |

Cloudflare authorization uses the supported client and OAuth flow. Begin with
the least scope needed for read-only inspection. Do not commit bearer headers,
Cloudflare API tokens, OAuth artifacts, account secrets, or service credentials.

## Agent setup

### Claude Code

From the repository root, start Claude Code and install Cloudflare from the
Claude plugin marketplace:

```text
/plugin marketplace add cloudflare/skills
/plugin install cloudflare@cloudflare
```

The plugin supplies Cloudflare Skills and MCP registrations. Claude must also
follow `CLAUDE.md` and `AGENTS.md`.

### OpenAI Codex

Start Codex from the repository root, run `/plugins`, then install Cloudflare.
Codex reads `AGENTS.md`; the Cloudflare plugin provides Skills and MCP servers.

### Cursor

Run `/add-plugin cloudflare` or use `.cursor/mcp.json`. The repository also ships
`.cursor/rules/cloudflare-agent-fleet.mdc` so Cloudflare authority and proof
boundaries remain active in project context.

### GitHub Copilot

Install Cloudflare Skills:

```bash
npx skills add https://github.com/cloudflare/skills
```

VS Code uses `.vscode/mcp.json`. Copilot CLI may use `.mcp.json` or a copied
project configuration supported by the current client. Repository behavior is
anchored by `.github/copilot-instructions.md` and `AGENTS.md`.

### OpenCode

Install Cloudflare Skills:

```bash
npx skills add https://github.com/cloudflare/skills
```

Copy `config/agent-fleet/opencode.jsonc` to `.opencode.jsonc` when a local
project-level OpenCode config is desired, then verify with:

```bash
opencode mcp list
```

### Windsurf

Install Cloudflare Skills:

```bash
npx skills add https://github.com/cloudflare/skills
```

Merge `config/agent-fleet/windsurf-mcp_config.json` into the user's supported
Windsurf MCP configuration. Do not overwrite unrelated user-level servers.

### LM Studio Bionic

Create or open a Code Project for this repository, add the remote Cloudflare MCP
endpoint in Bionic's project UI, and include `AGENTS.md` plus the fleet skill in
project context when supported. Add focused domain servers only when the client
supports them and the task requires them.

### ChatGPT

Cloudflare does not currently list ChatGPT as a dedicated Agent Setup guide.
ChatGPT connects through an approved remote-MCP custom app using
`https://mcp.cloudflare.com/mcp`.

Current OpenAI boundary:

- full custom MCP read/write apps are available on eligible ChatGPT Business,
  Enterprise, and Edu workspaces on the web;
- a ChatGPT Plus workspace must not be represented as having direct custom full
  MCP write access;
- on Plus, ChatGPT coordinates the work and delegates repository execution to a
  connected coding agent such as Codex, then reports only returned evidence.

For an eligible workspace, create the custom app in ChatGPT's Apps settings,
choose OAuth, scan tools, complete authorization, test read-only access first,
and publish only after the app and permissions are reviewed.

## Operating boundary

Connection is not authorization. Use the following split:

| Action | Default |
|---|---|
| Current Cloudflare docs lookup | Allowed when relevant |
| Read-only account/build/binding/log inspection | Allowed when relevant and minimized |
| Mission-branch repository edits | Allowed within the active task |
| Preview build or deployment | Separate gate unless already authorized for the exact task |
| Production deploy or rollback | Explicit founder approval |
| DNS, domain, Access, WAF, billing, credentials, destructive API actions | Explicit founder approval |

## Verification

Run:

```bash
npm run verify:mcp
```

For a repository change, also run the focused typecheck, lint, and tests that
cover the touched area. For any browser-visible behavior, run targeted
Playwright against the exact preview artifact and retain screenshots or traces.

Report these evidence layers separately:

1. configuration parses and passes repository verification;
2. MCP client discovers the expected servers;
3. OAuth completes with the intended scope;
4. the exact read operation succeeds;
5. any separately authorized write returns provider evidence;
6. the deployed user path passes Playwright when applicable.

## Rollback

Revert the mission-branch commit or remove the copied client configuration, then
revoke the Cloudflare OAuth grant when access should end. Removing a repository
config does not automatically revoke an existing provider authorization.

## Current official references

- Cloudflare Agent Setup: `https://developers.cloudflare.com/agent-setup/`
- Cloudflare Agent index: `https://developers.cloudflare.com/agent-setup/llms.txt`
- Cloudflare agent-friendly docs: `https://developers.cloudflare.com/llms.txt`
- OpenAI developer mode and MCP apps: `https://help.openai.com/en/articles/12584461`
- OpenAI Apps in ChatGPT: `https://help.openai.com/en/articles/11487775`

Re-check current official documentation before changing client-specific setup or
claiming plan availability because these surfaces can change.
