# Founder Control Room — MCP and GitHub Models

This repository uses a narrow AI-tooling stack. Connections provide evidence and experimentation; they do not bypass founder approval gates.

## MCP servers

- **GitHub:** repositories, issues, pull requests, Actions, code security, and secret protection only. Lockdown mode is enabled.
- **Supabase:** scoped to the Founder Control Room project `oojzfmmywbvficgybaxd`, read-only, database and documentation features only.
- **Cloudflare Docs, Builds, and Observability:** documentation and release evidence for the Control Room Worker.
- **Playwright:** pinned, isolated Chromium for public status and browser verification.

The Control Room MCP connection must never point at Se'kret Bip's Supabase project. The repository's own data boundary remains separate.

## GitHub Models

GitHub Models is not an MCP server. It is used for synthetic reasoning and proof-gate evaluation.

- The manual workflow uses the automatic `GITHUB_TOKEN` with only `contents: read` and `models: read`.
- Local or Codespaces use may set `GITHUB_MODELS_TOKEN` to a fine-grained PAT with only `models:read`.
- Never commit a token or copy a service-role key into a Models prompt.

Allowed inputs are invented portfolio states, sanitized public manifests, and synthetic proof records. Do not send repository credentials, service-role keys, webhook payloads, private project events, customer/user data, or unsanitized evidence from managed products.

A model response may recommend or evaluate an action. It may not create approval, carry approval forward, merge, deploy, roll back, rotate credentials, or mutate production state.
