---
name: control-room-cloudflare-agent-fleet
description: >
  Shared Cloudflare operating contract for ChatGPT, Codex, Claude Code, Cursor,
  GitHub Copilot, OpenCode, Windsurf, and LM Studio Bionic in Founder Control Room.
  Use for Cloudflare documentation, API Code Mode, Workers bindings, builds,
  observability, Wrangler, preview verification, deployment review, and rollback.
version: 1.1
status: active
scope: founder-control-room
owner: Juss
---

# Control Room Cloudflare Agent Fleet

## Mission

Give every approved agent the same Cloudflare source-of-truth, authority, and
verification contract without weakening Founder Control Room's provider
independence or founder approval gates.

## Fleet

- ChatGPT
- OpenAI Codex
- Claude Code
- Cursor
- GitHub Copilot
- OpenCode
- Windsurf
- LM Studio Bionic

Cloudflare currently publishes dedicated Agent Setup guides for the seven coding
agents. ChatGPT uses a separate remote-MCP app bridge and must not be described
as having a dedicated Cloudflare setup guide.

## Required Cloudflare MCP servers

```text
cloudflare                 https://mcp.cloudflare.com/mcp
cloudflare-docs            https://docs.mcp.cloudflare.com/mcp
cloudflare-bindings        https://bindings.mcp.cloudflare.com/mcp
cloudflare-builds          https://builds.mcp.cloudflare.com/mcp
cloudflare-observability   https://observability.mcp.cloudflare.com/mcp
```

Roles:

- `cloudflare`: account-scoped API Code Mode. Default to read-only inspection.
- `cloudflare-docs`: current public documentation. Never treat docs as runtime proof.
- `cloudflare-bindings`: Workers binding and project-wiring inspection.
- `cloudflare-builds`: build and deployment evidence. A successful build does not prove the user path.
- `cloudflare-observability`: minimized logs and telemetry. Do not copy raw sensitive payloads.

## Agent setup routing

- **Claude Code:** install the Cloudflare plugin from the Claude plugin marketplace.
- **Codex:** run `/plugins`, then install Cloudflare.
- **Cursor:** run `/add-plugin cloudflare` or use the repository `.cursor/mcp.json`.
- **GitHub Copilot:** install Cloudflare Skills with `npx skills add https://github.com/cloudflare/skills`; use `.vscode/mcp.json`, `.mcp.json`, or `.github/mcp.json` as supported by the client.
- **OpenCode:** install Cloudflare Skills and configure remote MCP servers in `.opencode.jsonc` or the user's OpenCode configuration.
- **Windsurf:** install Cloudflare Skills and merge the remote servers into the user's Windsurf MCP configuration.
- **LM Studio Bionic:** add the project and the remote Cloudflare MCP endpoint in Bionic's project UI.
- **ChatGPT:** use an approved custom remote-MCP app on an eligible workspace. Full custom MCP write/modify support is not a ChatGPT Plus capability. On Plus, ChatGPT coordinates and delegates repository execution to a connected coding agent rather than claiming direct Cloudflare mutation.

## Source-of-truth order

1. Current repository and exact branch/head.
2. Current Cloudflare build, deployment, binding, and observability evidence.
3. Current Cloudflare documentation through `cloudflare-docs` or Markdown docs.
4. Wrangler output for local and deployment behavior.
5. Assumptions, explicitly labeled.

Use Cloudflare's agent-friendly documentation. Prefer the docs MCP server,
`developers.cloudflare.com/llms.txt`, product-specific `llms.txt`, or an
`index.md` page over scraping HTML.

## Authority

MCP connectivity grants only the actions exposed by the server and authorized
through OAuth. It does not grant blanket approval.

Default posture:

- documentation and account inspection: allowed when relevant;
- minimized build/log inspection: allowed when relevant;
- branch edits: mission branch only;
- deploy, rollback, DNS, custom domains, Access, WAF, billing, credentials,
  production bindings, destructive API actions, and external publication:
  separate explicit founder approval required.

Grant the least Cloudflare OAuth scope that supports the task. Never commit or
print Cloudflare tokens, account secrets, service credentials, or OAuth artifacts.

## Public/private route invariant

Founder Control Room can contain both public customer surfaces and protected
operator surfaces. Cloudflare Access must be scoped to the protected surface,
not treated as a blanket domain switch.

For any public checkout, product, marketing, callback, webhook, health, or other
customer-facing route:

1. identify the exact hostname and path that must be public;
2. identify the exact hostname and path that must remain protected;
3. inspect the current Access application and policy before changing anything;
4. prefer a dedicated public hostname or the narrowest path-scoped bypass/public
   policy that preserves protection everywhere else;
5. never disable Cloudflare Access for the whole FCR domain merely to make one
   public route work;
6. verify the public path in an unauthenticated browser and verify a protected
   control-room path still requires the intended authentication;
7. record rollback as the exact policy, hostname, or route change to reverse.

A Shopify product being `ACTIVE` or published is not proof that a buyer can
reach it. For commerce, the acceptance path is:

`public URL -> product renders -> correct price -> add/buy action -> checkout`

Stop and report `BLOCKED` if Cloudflare Access intercepts the public path before
product content renders.

## Work loop

1. Confirm repository, branch, goal, suspected failure area, needed evidence, and stop condition.
2. Inspect existing Wrangler configuration, routes, bindings, build settings, and current provider evidence.
3. Use `cloudflare-docs` for current product behavior before adding architecture.
4. Choose one focused, reversible change.
5. Verify in this order:
   - syntax, typecheck, or lint for the touched area;
   - focused unit or integration tests;
   - targeted Playwright against the exact preview artifact for browser-visible changes;
   - Cloudflare preview/staging build and deployment evidence when applicable;
   - observability, screenshots, traces, and rollback evidence.
6. Report configuration proof, CI proof, and runtime proof separately.

## False-green defenses

- A valid MCP JSON file does not prove OAuth completed.
- OAuth completion does not prove the requested tools or scopes are usable.
- A successful Cloudflare build does not prove deployment, routing, auth, data, or UX.
- A local Wrangler run does not prove the deployed version.
- Logs do not authorize a mutation.
- A repository merge does not prove Cloudflare production changed.
- An active Shopify product does not prove the storefront route is publicly reachable.
- A public route does not justify weakening protection on unrelated FCR routes.

## Required report

```text
REALITY:
FIX:
PROOF:
RISK:
ROLLBACK:
NEXT GATE:
```

Include the exact repository, branch, head SHA, Cloudflare environment, provider
evidence, tests run, Playwright applicability/result, and the next approval gate.
