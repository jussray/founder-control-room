# Audit — "Expose Chief and FCR as MCP servers" proposal

Audited head: `5f0edb4d853c6921ffbeb8481af30bbdd7b8ca33` (branch `claude/chief-fcr-mcp-audit-03msx0`, base `main`).
Audited: 2026-08-24. Evidence: repository source at that head, plus executed tests recorded below.

This audits an externally supplied build proposal that recommends wrapping "chief" and "fcr" as
two new MCP servers, starting read-only, then adding writes behind a confirmation step.

**Verdict: do not implement as written.** Its premise is wrong for this repository, and the
majority of what it recommends already exists here in a stronger form. Three real gaps it does
not mention are recorded in [Gaps worth fixing](#gaps-worth-fixing).

## Premise check

The proposal assumes `chief` and `fcr` are two comparable external APIs available to be wrapped.
Neither assumption holds at this head.

| Proposal's assumption | Repository evidence |
| --- | --- |
| `fcr` is an external API to wrap | FCR **is this repository** — the Express app in `src/http/server.ts`, served in production by the Cloudflare Worker entry `src/worker/cf-entry.ts`. There is no external FCR API to place a wrapper in front of. |
| `chief` is an external API to wrap | Chief AI is a **separate repository**, `jussray/chief-ai-machine`. It exists here only as a governed project adapter pinned to audited head `fad147d1fbcc1cafbdf6e4d570a2a565c8335ce0` with per-file contract blob hashes (`src/founder-os-lab/projectAdapters.ts`). |
| Both can be built together now | The Chief AI repository is **not in this session's repository scope**. A `chief-mcp` server authored here would rest on assumed endpoints, not observed ones. |

`src/founder-os-lab/projectAdapters.ts` also records the division of authority that the proposal
does not model at all:

> Chief AI owns reasoning, synthesis, capability composition, recommendations, and executive
> judgment; Founder Control Room owns governance, evidence, coordination, and execution authority.

Chief AI proposals are explicitly non-executing until FCR validates evidence and founder authority.
Exposing Chief as a peer MCP server with its own write tools would place execution authority on the
reasoning side of that boundary, which inverts the architecture rather than extending it.

## What already exists

The proposal's "Recommended rollout" steps 1–5 are substantially built at this head.

### Outbound — FCR as MCP client (`src/mcp/`, ~2,000 lines with tests)

A policy-gated hub for calling *other* MCP servers: `evaluateMcpPolicy` in `src/mcp/policy.ts`
infers tool risk from the tool name (`inferToolRisk` classifies destructive/write verbs), then
fails closed on inactive projects, non-enabled projects, unconfigured endpoints, production use of
development-only servers, paid capabilities, denied patterns, non-allowlisted patterns, and any
non-read risk. Endpoint authority resolves through environment or Connection Vault
(`src/mcp/vaultHub.ts`), and invocations produce evidence receipts that store hashes and structural
summaries rather than raw payloads (`src/mcp/types.ts`, `McpEvidenceInput`).

### Inbound — FCR as MCP server (three endpoints, already served)

Because `cf-entry.ts` mounts the whole Express app behind Cloudflare's Node HTTP adapter, all three
are already reachable over HTTPS in the deployed Worker. The proposal's "build a remote Streamable
HTTP MCP endpoint" step has no missing infrastructure to add.

| Endpoint | Tools | Gate |
| --- | --- | --- |
| `POST /mcp/read` | `list_read_servers`, `invoke_read_tool` | Bearer token via `timingSafeEqual`, server-held project scope, refuses any non-read policy result |
| `POST /mcp/founder-signal-engine` | `invoke_founder_signal_engine` (write-capable, `readOnlyHint: false`) | Token middleware, review-only middleware, server-side standing-policy grant |
| `POST /mcp/founder-signal-x-engagement` | X engagement signal read | Separate read token, distinct credential root |

All three implement MCP JSON-RPC by hand against protocol version `2025-06-18`. There is **no
`@modelcontextprotocol/*` dependency** in `package.json` — the hand-rolled implementation is a
deliberate choice, and adopting the proposal's SDK-based template would add a dependency the
repository has so far avoided.

## Where the proposal would weaken current boundaries

These are the findings that matter most. Each one is a place where following the proposal would
replace something stronger with something weaker.

**1. Caller-supplied approval identifiers.** The proposal's `create_record` example accepts all
authority-bearing fields as tool arguments. This repository does the opposite. In
`founderSignalEngineMcp.ts`, `founderApprovalId` is documented as a *"Runtime-populated
authorization receipt. Caller values are rejected upstream."* Publication authority is minted
server-side as `standing-policy:<grantId>:<invocationId>` and is never authorized by caller text.
Adopting the proposal's argument shape would break approval binding — the exact failure mode
`CLAUDE.md` names when it says Claude "may not self-approve."

**2. "Require a confirmation step in your product flow" as the write control.** The repository is
already past read-only, and its write lane is gated by a server-held standing-policy grant plus
trusted evidence, not by a UI confirmation. A product-flow confirmation is a client-side control;
substituting it for the grant gate is a downgrade, not the "add write operations after you have
reliable auth" progression the proposal describes.

**3. Static API tokens in client config.** The proposal's `claude_desktop_config.json` example
hardcodes `CHIEF_API_TOKEN` and `FCR_API_TOKEN`. The repository routes endpoint authority through
Connection Vault (`src/mcp/vaultHub.ts`, `/mcp/vault`) precisely to avoid this, and
`scripts/verify-mcp-config.mjs` actively asserts that no `Authorization` header or credential `env`
block is committed for the outbound servers. The proposal's own later section contradicts this
example, warning against static bearer tokens — but the example is what a reader would copy.

**4. Two servers with separate credentials, as the recommended shape.** The proposal argues for
isolating `chief-mcp` and `fcr-mcp` when systems "have different users, credentials, permissions,
or release lifecycles." Here that would mean standing up a second credential root and a second
served surface for a repository this session cannot observe, while the existing Chief AI adapter
already carries a pinned, hash-verified contract. The isolation argument is sound in general and
inapplicable to the actual pair.

**5. Unverified protocol version.** The proposal's citations reference a `2026-07-28` specification
revision; this repository pins `2025-06-18`. I did not verify whether that revision exists or what
it changes. Under this repository's own truth rules a citation is not provider readback, so the
pinned version should not be moved on the strength of the proposal's footnotes. Treat this as
**UNKNOWN**, not as a known upgrade.

**6. SDK package name error.** The proposal's template installs and imports
`@modelcontextprotocol/server`, while its own earlier section imports from
`@modelcontextprotocol/sdk/server/mcp.js`. These are not the same package name and the template as
written would not resolve. Minor next to the authority findings, but it confirms the template was
not executed before being handed over.

## Gaps worth fixing

Three real gaps that the proposal does not mention. All three are documentation/verification gaps,
not defects in the served code — the code paths are tested and pass.

**1. `/mcp/read` is configured by two environment variables that are documented nowhere.**
`FCR_REMOTE_MCP_READ_TOKEN` and `FCR_REMOTE_MCP_READ_PROJECTS` appear in exactly two files at this
head — the implementation and its test. They are absent from `.env.example` (which *does* document
`FOUNDER_SIGNAL_ENGINE_MCP_TOKEN` and `FOUNDER_SIGNAL_READ_MCP_TOKEN`), from `docs/MCP_STACK.md`,
from `README.md`, and from `wrangler.worker.toml`. Without both set, the handler returns `503`
permanently. This fails closed, which is correct behavior, but an operator cannot discover from
documentation how to open it. This is the single highest-value fix in this audit.

**2. There is no `verify:*` contract for the served MCP surface.** `npm run verify:mcp` validates
`.mcp.json` — the outbound repository-agent config — and the Cloudflare read contract. Nothing
verifies that the three inbound endpoints keep their auth middleware, their read-only annotations,
or their fail-closed behavior. Nearly every other subsystem in this repository has such a gate
(`verify:growth-inbox`, `verify:rls-contract`, `verify:terminal-contract`, and others), which makes
the served MCP lane a conspicuous exception.

**3. Documentation Truth: the repository does not say it is an MCP server.** `README.md`'s "MCP and
capability governance" section covers capability declarations; `docs/MCP_STACK.md` explicitly
distinguishes the repository agent fleet from the in-app Connector Hub, and covers both — but
neither describes the three endpoints FCR *serves*. Two of the three have dedicated docs
(`docs/founder-signal-engine/remote-mcp-bridge.md`, `docs/founder-signal-engine/x-engagement-signal-v1.md`);
`/mcp/read` has none.

One scope-labeling risk worth flagging alongside these: `docs/MCP_HUB_SECURITY_REVIEW.md` asserts
"MCP Phase 1 is read-only." That remains true of the outbound Hub it describes, but a write-capable
served MCP tool now exists in a different lane. The statement is not false; it is unqualified in a
way that invites a reader to conclude no MCP write path exists anywhere.

## What to do instead

If the goal is broader MCP reach for Chief and FCR, the work is not a new pair of servers.

1. **Close gap 1** — document `FCR_REMOTE_MCP_READ_TOKEN` and `FCR_REMOTE_MCP_READ_PROJECTS` in
   `.env.example` and `docs/MCP_STACK.md`, and give `/mcp/read` a doc alongside its two siblings.
2. **Close gap 2** — add a `verify:served-mcp` contract pinning auth middleware, tool annotations,
   and fail-closed behavior for all three endpoints, and wire it into CI like its peers.
3. **Extend `/mcp/read`'s tool surface** rather than standing up a new server, if more read
   capability is the actual need. The routing, scoping, evidence, and refusal logic already exist.
4. **Leave Chief where it is.** Any Chief AI MCP surface belongs in `jussray/chief-ai-machine`,
   under its own review, reached from here through the existing pinned adapter — not authored in
   this repository against assumed endpoints.
5. **Resolve the protocol version question by readback**, not by citation, before changing the
   pinned `2025-06-18`.

## Proof

Checks actually executed at head `5f0edb4d853c6921ffbeb8481af30bbdd7b8ca33`:

```bash
npm ci
npx vitest run src/http/routes/__tests__/remoteReadMcp.test.ts \
  src/http/routes/__tests__/xEngagementSignalMcp.test.ts \
  src/http/routes/__tests__/founderSignalEngineMcp.test.ts \
  src/mcp/__tests__/
# 8 files passed, 48 tests passed

npm run verify:mcp
# [verify:mcp] Control Room MCP configuration, Playwright proof authority, and
#   Cloudflare agent-fleet routing are scoped, credential-free, and repository-bound.
# [verify:cloudflare-mcp-read] official endpoint, exact-head workflow, GET-only witness,
#   dedicated credential, and fail-closed runtime policy are pinned.
```

**Not proven, and not claimed:** that any of the three served endpoints is currently configured,
reachable, or authorized in a deployed environment. Passing tests prove tested behavior; they do
not prove provider or runtime state. No provider readback was performed for this audit. The
`2026-07-28` protocol revision was not verified.

**Scope:** this audit changed no code, no configuration, and no served behavior. It adds this
document only.
