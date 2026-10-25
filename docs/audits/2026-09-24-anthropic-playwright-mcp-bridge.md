# Anthropic ↔ Playwright MCP bridge audit

Date: 2026-09-24

## Scope

Audit and repair the Founder Control Room operator relay so the canonical `claude-code` lane can optionally receive browser evidence through a remote Playwright MCP server without weakening FCR authority boundaries.

## Baseline

- Repository: `jussray/founder-control-room`
- Base branch: `main`
- Base SHA: `0c8eef9292deb3a15ee8ad73bb449d86d0f40f61`
- Feature branch: `fix/anthropic-playwright-mcp-bridge`
- Existing relay label: `claude-code`
- Existing provider implementation: Anthropic Messages API
- Existing relay authority: no external write, merge, deploy, publish, or provider mutation authority

## Findings

### VERIFIED

1. `fcr_relay_operator` routes the canonical `claude-code` peer through the server-side Anthropic provider adapter.
2. Before this repair, the `claude-code` label did not represent a Claude Code shell/browser runtime. It represented a bounded Anthropic Messages API call.
3. The existing relay envelope prevents provider text from changing operator identity, authority, or provenance.
4. Anthropic's current Messages API supports remote MCP servers through `mcp_servers` plus `mcp_toolset` using the `mcp-client-2025-11-20` beta contract.
5. Anthropic remote MCP URLs must be HTTPS; local STDIO MCP servers cannot be attached directly through the Messages API.
6. Playwright MCP provides open-source browser automation over MCP and can run as a remote HTTP/SSE service.

### FIXED ON THIS BRANCH

1. Added an opt-in Anthropic Playwright MCP attachment.
2. No MCP server is attached unless `FCR_RELAY_ANTHROPIC_PLAYWRIGHT_MCP_URL` is configured.
3. The configured MCP URL must be canonical HTTPS with no embedded username/password and no fragment.
4. Optional MCP bearer auth is supplied through `FCR_RELAY_ANTHROPIC_PLAYWRIGHT_MCP_TOKEN`, never in the relay prompt.
5. MCP tools default to disabled.
6. Only the read-only browser evidence allowlist is enabled:
   - `browser_navigate`
   - `browser_navigate_back`
   - `browser_snapshot`
   - `browser_find`
   - `browser_take_screenshot`
   - `browser_console_messages`
   - `browser_network_requests`
   - `browser_tabs`
   - `browser_wait_for`
7. Explicitly not enabled by this contract: click, type, form fill, file upload, arbitrary Playwright code, storage mutation, or network mocking.
8. Gemini, Codex/OpenAI, Perplexity, and DeepSeek adapters are unchanged.

## Authority boundary

A configured Playwright MCP server does **not** grant Claude founder approval or mutation authority.

This bridge is an observation/proof lane only. It may inspect pages and return evidence, but the current operator relay still reports and enforces:

- externalWrite: false
- merge: false
- deploy: false
- publish: false
- providerMutation: false

Any future browser-click/type/deploy capability must be introduced through a separate reviewed authority contract. Do not add those tools to this allowlist as a convenience patch.

## Evidence semantics

The existing text-provider adapter records one provider response evidence ref. Therefore:

- `provider:anthropic:<message-id>` proves an Anthropic relay response existed.
- MCP configuration proves Playwright was available to the request when configured.
- Neither fact alone proves that Claude actually invoked a specific Playwright tool.

Do not claim tool-level Playwright execution until the relay receipt model records MCP tool-use blocks or another immutable runtime artifact proves the tool call.

## Configuration

Optional environment variables:

```text
FCR_RELAY_ANTHROPIC_PLAYWRIGHT_MCP_URL=https://<trusted-playwright-mcp-host>/mcp
FCR_RELAY_ANTHROPIC_PLAYWRIGHT_MCP_TOKEN=<server-held-bearer-token-if-required>
```

These settings should point only to a trusted Playwright MCP deployment configured with its own origin/host restrictions. Do not use `--allow-unrestricted-file-access`, `--no-sandbox`, or `browser_run_code_unsafe` for this FCR evidence lane.

## Status

- Source repair: IMPLEMENTED ON FEATURE BRANCH
- Unit/integration test source: IMPLEMENTED ON FEATURE BRANCH
- CI: UNKNOWN until pull-request checks complete
- Remote Playwright MCP deployment: UNKNOWN / separately provisioned dependency
- Live Claude → Playwright tool invocation: UNKNOWN until remote MCP endpoint is configured and an immutable tool-use receipt is captured
- Production merge/deploy: NOT PERFORMED by this audit

## Rollback

Revert the feature branch commits or close the pull request. With the MCP URL unset, runtime behavior is intentionally identical to the pre-repair Claude relay.
