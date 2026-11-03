# Grafana IRM + GitHub portfolio: guarded implementation

**State:** source-only candidate on `integration/grafana-irm-portfolio-20261103`. No verified Grafana OAuth, live GitHub-to-IRM delivery, Telegram activation, or production deploy.

## Scope and ownership

- The existing `Portfolio Actions and Stale Evidence Audit` examines only accessible GitHub App installation repositories. It does not assume every repo is accessible, and its receipt reports limited CI evidence rather than production health.
- This integration reads that audit's generated receipt and sends only the audit classification and the numeric count of accessible repositories to Grafana IRM. It never forwards `items`, private repository names, branches, commit SHAs, customers, logs, credentials, or raw receipt JSON.
- `alert_uid` is stable (`fcr-portfolio-actions-audit`) to group changes in audit state. A successful HTTP response proves acceptance at the endpoint, **not** Telegram delivery, acknowledgment, or resolution.
- This is a cross-repository **monitoring** bridge, not a cross-repository code-writing or deployment agent. Chief AI remains independently governed.

## Grafana Cloud MCP (human OAuth required)

- Official hosted MCP endpoint: `https://mcp.grafana.com/mcp` (HTTP Streamable, not SSE). This is included without any account URL or credential in `.mcp.json`, `.mcp.example.json`, `.vscode/mcp.json`, and scoped skill routing.
- A human must connect the MCP client and authorize their **own** Grafana identity with **read** access only. Configuration does not establish a ChatGPT app connection, and the client must enforce the chosen OAuth access.
- In an eligible ChatGPT workspace, configure a custom MCP connection using the same official endpoint and perform browser-based authorization. If the workspace lacks custom MCP support, this step is **blocked**, not bypassed.
- Do not authorize write scopes, unrestricted logs, private tenant data access, or a shared founder OAuth session for customer accounts. Each account uses its own authorization boundary.

## Grafana IRM setup — done through the account owner

1. In Grafana IRM, create a dedicated **Formatted Webhook** monitoring-system integration and bind it to the intended team. Enable **Require a Grafana service account token** for the integration.
2. Create an external Grafana service account with only `grafana-irm-app.alert-groups:write` and mint a token; do not paste the token into a file, issue, PR, chat, or repository.
3. In `jussray/founder-control-room` repository settings, configure GitHub Actions **secrets** `GRAFANA_IRM_WEBHOOK_URL` (the private full incoming integration URL) and `GRAFANA_IRM_BEARER_TOKEN` (the `glsa_` token). No secret values are supplied by this repository.
4. After the branch is reviewed, checks are green, and founder-authorized merge occurs, opt in with the repository Actions **variable** `GRAFANA_IRM_ENABLED=true`. Before then, the notification code remains inert.
5. In IRM, set the notification route, dedicated escalation chain and on-call schedule. Create a **private** Telegram channel and unique linked discussion group, add the Grafana IRM bot with minimum posting rights, and activate the channel with a **fresh** verification code; the previously photographed code must not be reused.
6. Send a synthetic test alert from IRM and a controlled GitHub audit condition. Verify webhook HTTP acceptance, IRM grouping/routing, Telegram arrival, human acknowledgement, and resolution separately.

## Evidence and failure handling

- `node --test scripts/grafana-irm-portfolio-notifier.test.mjs` checks endpoint validation, data minimization, no network while disabled, strict missing-secret behavior, redirects, authentication errors, and failure responses. These are **offline contract tests**, not live provider tests.
- With `GRAFANA_IRM_ENABLED` unset or false the step emits `GRAFANA_IRM_BRIDGE_DISABLED_UNVERIFIED` and does **not** send.
- With `GRAFANA_IRM_ENABLED=true`, missing/invalid credentials, invalid receipt, provider non-2xx, redirect or network error causes a failing step, without printing secret values or the webhook URL.
- The script does not follow redirects and only permits an HTTPS `*.grafana.net` formatted-webhook endpoint. Logs contain only generic status codes; never print a webhook URL or authorization header.
- Do not treat the audit state `OBSERVED_CHECKS_ONLY` as production health. It only sends Grafana's `ok` state for the **CI evidence audit alert**, which has no authority over release or incident closure.
- Passing repository tests, adding Grafana MCP configuration, and HTTP 2xx do not prove end-to-end alert delivery.

## Official references

- Grafana Cloud MCP: https://grafana.com/docs/grafana-cloud/ai-tools/mcp-servers/cloud-mcp/
- Grafana IRM formatted incoming webhook: https://grafana.com/docs/grafana-cloud/observe-and-act/respond-to-incidents/integrations/custom-integrations/incoming-webhooks/oncall-webhooks/
- Grafana IRM Telegram: https://grafana.com/docs/grafana-cloud/observe-and-act/respond-to-incidents/integrations/chat-and-collaboration/telegram/
- Grafana Cloud GitHub integration: https://grafana.com/docs/grafana-cloud/observe-and-act/monitor-infrastructure/integrations/integration-reference/integration-github/
- ChatGPT custom MCP: https://help.openai.com/en/articles/12584461-connecting-custom-mcp-servers-in-chatgpt
