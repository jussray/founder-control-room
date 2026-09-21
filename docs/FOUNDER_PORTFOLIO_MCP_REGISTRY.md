# Founder Portfolio MCP Registry

Last reviewed: 2026-09-20

Founder Control Room exposes a small read-only MCP subregistry for the four systems that form the founder operating quartet:

- Founder Control Room
- Chief AI Machine
- SolContinuity
- PromptOS

## Registry URL

Use this URL in MCP clients that accept a registry endpoint:

```text
https://api.foundercontrolroom.org/mcp/registry/v0.1/servers
```

The registry catalog itself is public metadata and does not require a bearer token. It contains no MCP credential values.

For Lovable, the intended fields are:

```text
Registry URL: https://api.foundercontrolroom.org/mcp/registry/v0.1/servers
Display name: Juss Founder Portfolio
Bearer token: leave blank for registry discovery
```

## Advertised servers

| Logical server | Remote transport | Authentication |
| --- | --- | --- |
| Founder Control Room | `https://api.foundercontrolroom.org/mcp/portfolio/founder-control-room` | Required secret `Authorization` header using the dedicated FCR remote-read bearer credential |
| Chief AI Machine | `https://chief-ai.mcgill-raylene.workers.dev/mcp` | Native public read-only ProofMode MCP |
| SolContinuity | `https://api.foundercontrolroom.org/mcp/portfolio/solcontinuity` | Required secret `Authorization` header using the dedicated FCR remote-read bearer credential |
| PromptOS | `https://api.foundercontrolroom.org/mcp/portfolio/promptos` | Required secret `Authorization` header using the dedicated FCR remote-read bearer credential |

Registry remote metadata marks the `Authorization` value as required and secret so a compatible client can request it at connection time rather than storing a credential in the public catalog. Enter the value in standard `Bearer <token>` form only in the MCP client's secret field. Never commit or paste the raw token into source, docs, screenshots, issues, logs, or chat.

## Authority boundary

The three FCR-hosted logical servers reuse the existing static-token remote MCP transport but replace its server-held project scope with exactly one project slug. A caller cannot widen that project grant with a request argument.

This does **not** change the canonical `/mcp/read` active-portfolio scope. In particular, SolContinuity remains an external continuity identity under `src/config/portfolio.ts`; the new Sol endpoint is a narrow read/preview bridge only. It grants no portfolio membership, merge, deployment, provider-write, database mutation, publication, billing, deletion, or arbitrary execution authority.

Chief keeps its native ProofMode MCP because that endpoint already provides an independently bounded read-only repository evidence audit. FCR, SolContinuity, and PromptOS use the FCR bridge because they do not currently expose separate verified native remote MCP transports.

## Verification

The Playwright proof in `e2e/repository-settings-ruleset.spec.ts` exercises the registry response over HTTP, pins the four logical names and remote URLs, verifies that the three FCR bridges advertise a required secret `Authorization` header, and checks search behavior without retaining a credential value.

The canonical repository verification path remains:

```bash
npm run verify:mcp
npm run typecheck
npm test
npm run test:e2e
```

Source wiring is not deployment proof. The registry is live only after the exact source commit is deployed to the canonical FCR Worker and the public registry URL plus each selected remote transport is observed from that deployed runtime.
