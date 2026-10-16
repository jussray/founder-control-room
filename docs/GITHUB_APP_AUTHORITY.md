# GitHub App installation and MCP handoff

The GitHub App installation and FCR MCP client authorization are **separate**.

- GitHub post-installation **Setup URL**: `https://foundercontrolroom.org/control-room/plugin-center.html`
- Signed webhook URL after runtime verification: `https://api.foundercontrolroom.org/webhooks/github`
- FCR MCP endpoint: `https://api.foundercontrolroom.org/mcp`, using its separate Supabase OAuth contract.
- Do **not** use the MCP URL as the GitHub OAuth Redirect URI. GitHub user OAuth and Device Flow are not required for installation-token authentication.
- Install on the exact `jussray/founder-control-room` repository. A GitHub App owned by `JussAndCo` cannot be installed on `jussray` while configured for “Only on this account”; app ownership and installability must be reviewed.

GitHub setup query parameters are untrusted input. The existing Plugin Center verifies the configured App's installation ID and repository through a founder-authenticated, provider-backed GitHub read. An unauthenticated visitor or mismatched installation never becomes “verified”. The setup check never grants installation scope, MCP OAuth access, approvals, merge, deploy, or publication rights.

FCR Worker secrets: `GITHUB_APP_ID` and `GITHUB_PRIVATE_KEY`. Trusted GitHub Actions uses `APP_ID` and `APP_PRIVATE_KEY` and maps these at runtime. Never expose secret material in Pages HTML, OAuth connectors, repository files, logs, or proof output.

Capability-aware provider construction checks GitHub-observed repository permissions before issuing a permission-scoped installation token and returns the current **read-only GitHub genealogy adapter**. Capability is not authority. The original PR #852 was 574 commits behind `main` when audited on 2026-10-16. To reconcile, preserve current `main` files and intentionally replay only the GitHub App permission contract, tests, and setup handoff. Historical branch commits remain linked as merge ancestry; outdated README, CI config and documentation receipts are not blindly replayed.

Exact-head checks, independent review, signed webhook delivery proof, runtime deployment, and Playwright verification remain separate gates.
