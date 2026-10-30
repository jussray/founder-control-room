# Juss Buffer Control Plugin

Private governed Buffer plugin for the Juss/FCR operating stack.

## What it is

This package connects an OpenAI plugin-capable environment to Buffer's official remote MCP server and adds the `buffer-control` skill that applies founder authority, campaign canon, evidence, and receipt rules around the provider tools.

Buffer remains the distribution transport. Founder Control Room and Chief remain the decision/evidence layer.

## Files

Portable package:

- `plugin.json` — portable Agent Plugins manifest.
- `mcp.json` — portable streamable-HTTP Buffer MCP connection.
- `skills/buffer-control/SKILL.md` — governed publishing behavior.

Compatibility fallback:

- `.codex-plugin/plugin.json` — legacy/OpenAI compatibility manifest.
- `.mcp.json` — legacy MCP compatibility configuration.

## Authentication boundary

The normal connection path is OAuth against Buffer's official MCP server at `https://mcp.buffer.com/mcp`. The plugin contains no Buffer credential, bearer token, or API key.

OAuth-capable ChatGPT/Codex clients should complete provider sign-in and consent directly with Buffer. If a different runtime is separately configured to use a Buffer API key instead, the key must remain an external runtime secret and must never be committed into this package.

## Current campaign canon

`JUSS SITE AUTOPSY` has three approved cinematic black/red campaign variants. The plugin skill treats those as the accepted set and selects among them by channel, placement, audience, and conversion goal. It must not regenerate them unless the founder explicitly asks for new creative.

## Publishing behavior

- Explicit "post now" may use `shareNow`.
- A Buffer posting request with no exact time uses `addToQueue` rather than silently publishing immediately.
- Exact future times use `customScheduled`.
- Review-only work stays draft-only.
- Requested media is never silently omitted. If Buffer cannot receive the approved asset, the affected write is blocked and reported as `MEDIA_TRANSPORT_BLOCKED`.
- Each channel receives its own Buffer `create_post` call and provider post ID.

## Proof gate

Source implementation alone is not runtime proof. Before calling this plugin live, verify all of the following on the actual MCP path:

1. the plugin loads and reaches `https://mcp.buffer.com/mcp`;
2. Buffer OAuth completes for the intended account;
3. `get_account` returns the intended account and organization;
4. `list_channels` resolves the intended social channels;
5. a non-public test draft returns a real Buffer post ID;
6. the created draft is visible/readable through Buffer provider readback;
7. campaign media can be transported without replacing the approved creative;
8. only then enable queue/schedule writes for the campaign.

Do not treat a request being sent as proof that Buffer accepted, scheduled, or published it.
