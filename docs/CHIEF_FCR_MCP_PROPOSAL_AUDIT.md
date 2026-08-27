# Audit — "Expose Chief and FCR as MCP servers" proposal

Audited 2026-08-24 against both repositories at exact heads:

| Repository | Role | Audited head |
| --- | --- | --- |
| `jussray/founder-control-room` (FCR) | Governance, evidence, execution authority | `5f0edb4d853c6921ffbeb8481af30bbdd7b8ca33` (branch `claude/chief-fcr-mcp-audit-03msx0`) |
| `jussray/chief-ai-machine` (Chief) | Reasoning, synthesis, capability composition | `2fd4fda0cab12e52ab5096e723884d98bcfe7d10` (`main`, shallow read-only clone) |

Evidence: source at both heads, blob hashes computed directly, and the test and contract runs
recorded in [Proof](#proof). This audit changed no code in either repository.

This audits an externally supplied build proposal recommending that "chief" and "fcr" be wrapped as
two new MCP servers, starting read-only, adding writes later behind a confirmation step.

**Verdict: do not implement as written.** Both repositories are already MCP servers. The proposal's
recommended end-state architecture is, in its essentials, what already exists — and the parts it
would add would weaken controls that are currently stronger. Four gaps it does not mention are in
[Gaps worth fixing](#gaps-worth-fixing); the most consequential is a stale pin that currently blocks
Chief AI previews at Chief's live head.

## Both systems already serve MCP

The proposal's core recommendation — build two MCP servers, prefer remote HTTPS, start read-only —
describes work that is already done, independently, on both sides.

### FCR serves three MCP endpoints

`src/worker/cf-entry.ts` mounts the whole Express app behind Cloudflare's Node HTTP adapter, so all
three are reachable over HTTPS in the deployed Worker. Each implements MCP JSON-RPC by hand against
protocol `2025-06-18`; there is **no `@modelcontextprotocol/*` dependency** in `package.json`.

| Endpoint | Tools | Gate |
| --- | --- | --- |
| `POST /mcp/read` | `list_read_servers`, `invoke_read_tool` | Bearer via `timingSafeEqual`, server-held project scope, refuses any non-read policy result |
| `POST /mcp/founder-signal-engine` | `invoke_founder_signal_engine` (write-capable, `readOnlyHint: false`) | Token middleware, review-only middleware, server-side standing-policy grant |
| `POST /mcp/founder-signal-x-engagement` | X engagement signal read | Separate read token, distinct credential root |

### Chief serves one MCP endpoint

`worker/proofmode-mcp.js` (197 lines, Cloudflare Worker) exposes a single read-only tool,
`audit_repository`, which classifies public GitHub repository evidence into what is claimed,
implemented, tested, deployed, and independently verified, and emits a `juss-proof/v1` receipt.

Its `initialize` handler states the boundary directly: ProofMode *"never promotes repository evidence
into live runtime verification."*

### Outbound, FCR is also an MCP client

`src/mcp/` (~2,000 lines with tests) is a policy-gated hub for calling other MCP servers.
`evaluateMcpPolicy` infers risk from the tool name and fails closed on inactive projects, non-enabled
projects, unconfigured endpoints, production use of development-only servers, paid capabilities,
denied patterns, non-allowlisted patterns, and any non-read risk. Endpoint authority resolves through
environment or Connection Vault (`src/mcp/vaultHub.ts`); receipts store hashes and structural
summaries, never raw payloads.

### One concrete capability difference worth copying

Chief negotiates the protocol version — `SUPPORTED_PROTOCOLS` holds `2025-06-18` and `2025-03-26`,
and `initialize` returns the client's requested version when supported. All three FCR endpoints
hard-code `protocolVersion: MCP_PROTOCOL_VERSION` and ignore what the client asked for. Chief also
validates an `MCP-Protocol-Version` header. FCR's endpoints would be more interoperable with Chief's
negotiation behavior; this is the one place the two implementations meaningfully disagree, and Chief
is the better model.

## Premise check

The proposal assumes two comparable external APIs available to be wrapped. Neither is external.

- **FCR is not an API to wrap — it is the control plane itself.** The Express app in
  `src/http/server.ts`, served in production by `src/worker/cf-entry.ts`. A wrapper would sit in
  front of the thing it is wrapping.
- **Chief is a real, separate repository, and is reachable.** It is a static site plus domain logic
  and a Worker: 49 test files, 266 tests, all passing at its current head. It has no `src/http` and
  no general API — only the ProofMode MCP Worker above.

The proposal also does not model the authority split that both repositories encode. From
`src/founder-os-lab/projectAdapters.ts`:

> Chief AI owns reasoning, synthesis, capability composition, recommendations, and executive
> judgment; Founder Control Room owns governance, evidence, coordination, and execution authority.

Chief AI proposals remain non-executing until FCR validates evidence and founder authority. Both
repositories carry a `founder-chief-pair.contract.json` and a `verify:founder-chief-pair` script
enforcing this. Giving Chief its own write tools, as the proposal's symmetric treatment implies,
would put execution authority on the reasoning side of that boundary.

Notably, the proposal's own preference for **two isolated servers** over one grouped server — its
reasoning being different users, credentials, permissions, and release lifecycles — is already the
de facto architecture, reached independently. Chief's ProofMode uses origin validation and is
unauthenticated because it reads only public data; FCR's endpoints use bearer tokens with project
scope. Two repositories, two lifecycles, two auth models, correctly chosen for what each exposes.

## Where the proposal would weaken current boundaries

**1. Caller-supplied approval identifiers.** The proposal's `create_record` example takes all
authority-bearing fields as tool arguments. FCR does the opposite: in `founderSignalEngineMcp.ts`,
`founderApprovalId` is documented as a *"Runtime-populated authorization receipt. Caller values are
rejected upstream."* Publication authority is minted server-side as
`standing-policy:<grantId>:<invocationId>` and is never authorized by caller text. Adopting the
proposal's argument shape would break approval binding — the exact failure `CLAUDE.md` names when it
says Claude "may not self-approve."

**2. "Require a confirmation step in your product flow" as the write control.** FCR is already past
read-only, and its write lane is gated by a server-held standing-policy grant plus trusted evidence.
A product-flow confirmation is client-side; substituting it for the grant gate is a downgrade, not
the "add writes after you have reliable auth" progression the proposal describes.

**3. Static API tokens in client config.** The proposal's `claude_desktop_config.json` hardcodes
`CHIEF_API_TOKEN` and `FCR_API_TOKEN`. FCR routes endpoint authority through Connection Vault
precisely to avoid this, and both repositories' `verify:mcp` scripts assert that no `Authorization`
header or credential `env` block is committed. The proposal contradicts this example in its own
later text — but the example is what a reader copies.

**4. Unverified protocol version.** The proposal cites a `2026-07-28` specification revision. Both
repositories pin `2025-06-18`. I did not verify that revision exists or what it changes; a citation
is not provider readback. Treat as **UNKNOWN**, not as a known upgrade.

**5. SDK package name error.** The proposal's template installs and imports
`@modelcontextprotocol/server`, while its own earlier section imports from
`@modelcontextprotocol/sdk/server/mcp.js`. These are different package names and the template as
written would not resolve — it was not executed before being handed over. Minor beside the authority
findings, but it bears on how much of the rest to trust.

## Gaps worth fixing

### 1. The Chief AI pin is stale, and it currently blocks Chief previews

This is the highest-priority finding, and it is only visible with both repositories present.

`src/founder-os-lab/projectAdapters.ts` pins `CHIEF_AI_AUDITED_HEAD` to
`fad147d1fbcc1cafbdf6e4d570a2a565c8335ce0`. Chief's live `main` is now
`2fd4fda0cab12e52ab5096e723884d98bcfe7d10`.

I hashed all five pinned contract blobs at Chief's current head. **All five match exactly:**

| Path | Pinned hash | At Chief `2fd4fda0` |
| --- | --- | --- |
| `src/domain/capability-plan.js` | `7b0c2e8d…` | matches |
| `src/domain/capability-registry.js` | `abb2daf0…` | matches |
| `src/domain/merge-intent.js` | `f4dd76e7…` | matches |
| `config/founder-chief-pair.contract.json` | `7aaff727…` | matches |
| `e2e/chief-capability-plan.pw.mjs` | `a2d42aeb…` | matches |

So the audited *contract surface* is unchanged; only the head SHA moved. But
`projectAdapters.ts:284` compares by **strict equality on the head**:

```ts
} else if (sourceCommitSha !== descriptor.auditedSourceHead) {
  errors.push(
    `${descriptor.id} source head ${sourceCommitSha} has not been audited; expected ${descriptor.auditedSourceHead}.`,
  );
}
```

Any Chief AI preview presenting Chief's real current head is therefore **rejected**, even though
every audited contract file is byte-identical. This fails closed, which is the right direction to
fail — but the practical result is that the Chief AI adapter does not function against live Chief,
and the reason is SHA drift rather than any change in substance. This is precisely the distinction
`CLAUDE.md` draws when it says a hash proves identity, not continued reality.

Refreshing `CHIEF_AI_AUDITED_HEAD` to `2fd4fda0cab12e52ab5096e723884d98bcfe7d10` is a one-line change
whose safety property is already demonstrated by the blob table above. It is *not* included in this
change, because moving an audited-head pin is an authority decision for Juss, not an audit finding to
self-apply.

### 2. The pair-contract CI is path-gated and cannot catch that drift

`.github/workflows/founder-chief-pair-contract.yml` does run the real cross-repository check: it
resolves Chief's SHA, checks Chief out, asserts the exact checkout, and runs with
`PAIR_CROSS_REPO_REQUIRED=true`. That part is well built — it even prefers a same-named Chief branch
on pull requests.

But it triggers only on changes to nine specific paths, and **`src/founder-os-lab/projectAdapters.ts`
is not among them**. The file holding the audited head and contract-blob pins is outside the trigger
set, so neither Chief moving nor an edit to the pin itself produces any CI signal. Gap 1 went
unnoticed for exactly this reason. Adding that path to the workflow closes it.

### 3. `/mcp/read` is configured by two environment variables documented nowhere

`FCR_REMOTE_MCP_READ_TOKEN` and `FCR_REMOTE_MCP_READ_PROJECTS` appear in exactly two files at FCR's
head — the implementation and its test. They are absent from `.env.example` (which *does* document
`FOUNDER_SIGNAL_ENGINE_MCP_TOKEN` and `FOUNDER_SIGNAL_READ_MCP_TOKEN`), from `docs/MCP_STACK.md`,
from `README.md`, and from `wrangler.worker.toml`. Without both set the handler returns `503`
permanently. Correct fail-closed behavior; but no operator can discover from documentation how to
open it.

### 4. No `verify:*` contract covers either repository's served MCP surface

`npm run verify:mcp` in **both** repositories validates only the outbound `.mcp.json` client config.
Nothing verifies that FCR's three inbound endpoints or Chief's ProofMode endpoint keep their auth
middleware, read-only annotations, or fail-closed behavior. FCR has such gates for nearly every other
subsystem (`verify:growth-inbox`, `verify:rls-contract`, `verify:terminal-contract`), which makes the
served MCP lane a conspicuous exception on both sides.

Related labeling risk: `docs/MCP_HUB_SECURITY_REVIEW.md` asserts "MCP Phase 1 is read-only." That
remains true of the outbound Hub it describes, but a write-capable served MCP tool now exists in a
different lane. The statement is not false; it is unqualified in a way that invites a reader to
conclude no MCP write path exists anywhere. Neither `README.md` nor `docs/MCP_STACK.md` documents
that FCR serves MCP endpoints at all.

## What to do instead

1. **Refresh the Chief AI audited head** to `2fd4fda0…` once Juss authorizes it — the blob table
   above is the evidence that the contract surface did not change.
2. **Add `src/founder-os-lab/projectAdapters.ts`** to the pair-contract workflow's trigger paths so
   the next drift is caught by CI rather than by an audit.
3. **Document `FCR_REMOTE_MCP_READ_TOKEN` and `FCR_REMOTE_MCP_READ_PROJECTS`** in `.env.example` and
   `docs/MCP_STACK.md`, and give `/mcp/read` a doc alongside its two documented siblings.
4. **Add a served-MCP verification contract** in each repository, pinning auth, tool annotations, and
   fail-closed behavior, wired into CI like their peers.
5. **Adopt Chief's protocol-version negotiation** in FCR's three endpoints.
6. **Extend `/mcp/read`'s tool surface** rather than standing up new servers, if more read capability
   is the real need — routing, scoping, evidence, and refusal logic already exist.
7. **Resolve the protocol-revision question by readback**, not citation, before moving `2025-06-18`.

## Proof

Executed at the two heads named above.

```bash
# FCR
npm ci
npx vitest run src/http/routes/__tests__/remoteReadMcp.test.ts \
  src/http/routes/__tests__/xEngagementSignalMcp.test.ts \
  src/http/routes/__tests__/founderSignalEngineMcp.test.ts \
  src/mcp/__tests__/
# 8 files passed, 48 tests passed
npm run verify:mcp          # configuration scoped, credential-free, repository-bound
npm run verify:founder-chief-pair
# Pair contract 2026-08-09.1 passed for Founder Control Room.

# Chief (read-only clone at 2fd4fda0)
npm ci && npx vitest run
# 49 files passed, 266 tests passed
npm run verify:mcp          # Prompt-ops MCP configuration is scoped, pinned, and credential-free.
npm run verify:founder-chief-pair
# Pair contract 2026-08-09.1 passed for Chief AI.

# Cross-repository, both directions, against the real counterpart contract
PAIR_CROSS_REPO_REQUIRED=true \
  PAIR_CONTRACT_PATH=<chief>/config/founder-chief-pair.contract.json \
  npm run verify:founder-chief-pair        # from FCR
PAIR_CROSS_REPO_REQUIRED=true \
  PAIR_CONTRACT_PATH=<fcr>/config/founder-chief-pair.contract.json \
  npm run verify:founder-chief-pair        # from Chief
# Both: "Cross-repository static policy alignment verified."

# Pin verification
git -C <chief> hash-object src/domain/capability-plan.js \
  src/domain/capability-registry.js src/domain/merge-intent.js \
  config/founder-chief-pair.contract.json e2e/chief-capability-plan.pw.mjs
# all five match CHIEF_AI_AUDITED_CONTRACT_BLOBS
```

**Not proven, and not claimed:** that any served endpoint in either repository is currently
configured, reachable, or authorized in a deployed environment. Tests prove tested behavior; the pair
scripts themselves report that "runtime behavior remains unverified." No provider readback was
performed. The `2026-07-28` protocol revision was not verified. The Chief clone is shallow
(`--depth 1`), so `fad147d1` is not present locally and I did not verify it is an ancestor of
`2fd4fda0` — only that the five pinned blobs match at the current head.

**Scope:** documentation only. No code, configuration, or served behavior changed in either
repository, and nothing was pushed to `jussray/chief-ai-machine` (this session has read-only access
to it).
