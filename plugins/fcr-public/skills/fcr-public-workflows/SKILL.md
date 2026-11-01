---
name: fcr-public-workflows
description: Use Founder Control Room's user-scoped MCP tools to inspect only the connected user's permitted project evidence and prepare non-authorizing recommendations.
---

# Founder Control Room public workflows

Use only the tools advertised by the **public** MCP server after the connected user completes OAuth. Do not route public requests to the founder-only `/mcp`, compatibility `/mcp/read`, private registry bridges, or FCR provider-administration endpoints.

## Allowed workflow

1. Ask the connected MCP server for available user-owned projects. Do not infer a project grant from its name, a model answer, or repository visibility.
2. Read only exact project IDs returned for the current authenticated user. Bind any conclusions to returned timestamps and provenance.
3. Summarize observed evidence and distinguish `source`, `verified`, `deployed`, and `unknown` states. Never promote code presence into live runtime truth.
4. Prepare an optional plan or draft only when a published public tool explicitly allows it; never run external actions.

## Permission boundary

- Do not call founder-only tools or request access to the founder portfolio.
- Do not request, accept, echo, log, or copy bearer tokens, private credentials, private prompts, or raw private customer content into project prompts.
- Never claim that installing this plugin authorizes repository mutation, branch creation, PR merges, provider writes, deployment, billing, communications, or deletion.
- Never send project contents to another model/provider without a separate, informed user action and approved tool authority.
- If authentication expires, scopes are missing, project IDs do not match, or evidence persistence fails, report the blocker; do not bypass it.

## Current release status

This package is a **pre-release integration candidate**. The public `/mcp/public` server, per-user authorization, test tenancy, and live proof must be deployed and verified before installation or publication is recommended. A ZIP or manifest alone does not make it live.
