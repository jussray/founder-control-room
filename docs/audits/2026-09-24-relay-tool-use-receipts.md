# Operator Relay Tool-Use Receipt Hardening — 2026-09-24

## Goal

Make the FCR Claude/Playwright bridge distinguish four different facts without collapsing them:

1. the `claude-code` operator identity was selected;
2. the current relay runtime is Anthropic Messages API;
3. a read-only remote Playwright MCP server was configured for the request;
4. Anthropic actually invoked an allowlisted Playwright MCP tool and received a correlated result.

## Authority

This change does not grant provider mutation, shell, merge, deploy, publish, or founder-approval authority.

The canonical operator ID remains `claude-code` for routing compatibility. The canonical registry now states that the current FCR relay runtime is Anthropic Messages API and that optional Playwright MCP evidence tools do not create a Claude Code shell.

## Receipt model

Provider response identity:

`provider:anthropic:<message-id>`

Configured read-only MCP attachment:

`runtime:anthropic-messages-api:mcp:playwright:configured-readonly-v1`

Actual allowlisted MCP use:

`mcp-tool-use:playwright:<tool-name>:<tool-use-id>`

Correlated MCP result:

`mcp-tool-result:playwright:<tool-name>:<tool-use-id>:<success|error>`

Configuration is never sufficient to emit a tool-use receipt.

## Adversarial rules

Tool-use receipts are ignored unless all of the following are true:

- the content block type is `mcp_tool_use`;
- `server_name` is exactly `playwright`;
- the tool name is in the FCR read-only Playwright allowlist;
- the tool-use ID matches the bounded receipt-safe identifier format.

A result receipt is emitted only when its `tool_use_id` correlates to an accepted Playwright tool-use block in the same Anthropic response.

Disallowed mutation-capable tools such as `browser_click`, `browser_type`, `browser_fill_form`, `browser_file_upload`, and arbitrary unsafe browser code are not promoted into evidence even if a provider response attempts to claim them.

## StoryEngine federation freshness recovery

The first exact-head audit of this follow-up proved the local FCR browser harness but stopped at the existing immutable StoryEngine freshness gate.

Observed values:

- predecessor FCR pin: `35a1855798b4dd059b45f67911280966a09f7be8`
- observed StoryEngine `refs/heads/main`: `dd1521547c81c1a16d9777e1fc254c6bf9c7d6b9`
- compare status: `ahead`
- ahead: `2`
- behind: `0`

The two StoryEngine successor commits are the resident Council contract changes, including `fix(council): make Council resident in host and Control Room`. The FCR Playwright workflow therefore refreshes only `STORYENGINE_PEER_SHA` to `dd1521547c81c1a16d9777e1fc254c6bf9c7d6b9`.

This repin is freshness recovery only. It does not inherit predecessor browser/federation green proof. The changed FCR head must earn a new exact-head Playwright result, including the live-ref equality check, exact peer checkout, runtime identity, and FCR↔StoryEngine federation proof.

## Files

- `src/lib/operatorRelayAnthropicMcp.ts`
- `src/lib/operatorRelayModelProviders.ts`
- `src/lib/operatorRelayProvider.ts`
- `src/lib/agentRegistry.ts`
- `src/lib/__tests__/operatorRelayAnthropicMcp.test.ts`
- `.github/workflows/playwright.yml`

## Truth status

- **VERIFIED:** PR #874 previously merged the governed read-only Anthropic remote MCP attachment into `main`.
- **VERIFIED:** this follow-up differentiates MCP configuration from response-level MCP use/result content.
- **VERIFIED:** spoof resistance is encoded in tests for wrong server, disallowed tool, and configuration-without-use.
- **VERIFIED on predecessor candidate:** unit tests, typecheck, lint, Python tests, RLS, Cloudflare authority contract, CodeQL, Verification Core, and the local browser harness passed before the StoryEngine freshness gate stopped the long federation workflow.
- **VERIFIED:** the StoryEngine predecessor pin is an ancestor of live `main`, with the observed live head two commits ahead and zero behind.
- **UNKNOWN until successor CI completes:** exact-head proof for the FCR candidate after refreshing the StoryEngine peer SHA.
- **UNKNOWN until live Anthropic runtime:** a real production response containing Playwright `mcp_tool_use` / `mcp_tool_result` from the configured trusted endpoint.

## Rollback

Revert the follow-up PR/merge commit. The prior PR #874 behavior remains the predecessor state: read-only MCP attachment with provider-message evidence but without tool-level receipt promotion. The StoryEngine peer pin would also revert to its predecessor value and would again fail freshness if StoryEngine `main` remains advanced.
