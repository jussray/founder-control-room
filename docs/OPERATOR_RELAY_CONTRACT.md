# FCR Operator Relay Contract

Status: founder-approved bridge slice

## Purpose

Let a governed operator hand a bounded task to another governed peer operator through Founder Control Room so the founder does not have to copy/paste between ChatGPT/Codex, Claude/Claude Code, Gemini, Perplexity, and DeepSeek.

## Peer operator lane

Peer relay operators:

- `gemini`
- `codex`
- `claude-code`
- `perplexity`
- `deepseek`

Allowed relay capabilities:

- `research`
- `propose`
- `review`
- `implement`

A relay capability describes the requested work class. It is not mutation permission.

## DeepSeek dual-role boundary

`deepseek` is a governed peer relay operator subject to the same zero-authority relay ceiling as every other peer.

`deepseek-instructor` is a separate bounded instructor/adversary identity defined by `src/lib/agentInterop.ts` and `docs/DEEPSEEK_INSTRUCTOR_CONTRACT.md`. It is not a peer mutation operator and must never be silently substituted for `deepseek`.

The instructor lane may challenge, teach, synthesize, and extract portable patterns. Its output returns to FCR as proposal data and never becomes direct repository/provider/tool authority.

## Relay authority

Every peer relay request carries this exact authority ceiling:

```json
{
  "externalWrite": false,
  "merge": false,
  "deploy": false,
  "publish": false,
  "providerMutation": false
}
```

The receiving operator can analyze or return proposed implementation content, but it cannot inherit mutation authority merely because another operator requested work.

## Continuity binding

Each relay request binds:

- source operator
- target operator
- capability
- goal
- bounded context summary
- optional source reference
- context fingerprint
- sensitivity
- creation and expiry time
- canonical request hash

Each relay response binds back to the exact relay id and request hash, reverses the operator direction, carries evidence references and unresolved items, requests no authority, and has its own canonical response hash.

A hash protects packet identity only when the canonical input and persisted expected hash are trusted. Authenticated transport/runtime identity must separately prove which configured operator/provider actually answered.

## Conflict handling

FCR does not select a winner merely because one operator answered first, sounded more confident, or produced a more fluent explanation.

When valid peer responses materially conflict, FCR must:

1. preserve each response independently with its operator identity, relay id, request hash, response hash, evidence references, unresolved items, and provider/runtime provenance;
2. expose the disagreement instead of synthesizing false consensus;
3. classify the governing outcome as `consensus`, `conflict`, `blocked`, or `invalid` at the council/adjudication layer without changing the underlying relay receipts;
4. prefer an objective discriminator such as tests, typecheck/lint, build output, Playwright, provider logs, security checks, or a bounded verification relay;
5. keep the conflict unresolved until the discriminator or founder decision is recorded with evidence.

A relay response is evidence, not authority. Disagreement never grants any peer permission to merge, deploy, publish, spend, or mutate a provider.

## Intended conversational behavior

When the founder says, for example, `tell Claude to build this`, `ask Gemini to attack the visual direction`, `tell Perplexity to research this`, or `tell DeepSeek to attack this`, the active operator should be able to create a relay request, have FCR dispatch it to the exact requested provider/operator runtime when available, validate the response, and return it to the active conversation without founder copy/paste.

If the target operator runtime is unavailable or unauthenticated, FCR must return a precise blocked state. It must never silently substitute a different provider or a different role and claim that the requested operator answered.

## Proof gate

The bridge is not proven by packet validation alone. Completion requires:

1. contract/unit tests;
2. an authenticated FCR relay endpoint;
3. a real target-operator dispatch adapter;
4. a response bound to the exact request hash;
5. Playwright proof from the FCR surface that a founder-issued relay request reaches the requested operator and its validated response returns;
6. provider/runtime evidence showing which operator actually answered.

Until all six pass on the same exact head, the status is `PARTIAL`, not `VERIFIED`.
