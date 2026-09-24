# FCR Operator Relay Contract

Status: founder-approved bridge slice

## Purpose

Let a governed operator hand a bounded task to another governed peer operator through Founder Control Room so the founder does not have to copy/paste between ChatGPT/Codex, Claude/Claude Code, Gemini, and Perplexity.

## Peer operator lane

Peer relay operators:

- `gemini`
- `codex`
- `claude-code`
- `perplexity`

Allowed relay capabilities:

- `research`
- `propose`
- `review`
- `implement`

A relay capability describes the requested work class. It is not mutation permission.

## DeepSeek boundary

`deepseek-instructor` is not a peer relay operator. It remains the bounded instructor/adversary lane defined by `src/lib/agentInterop.ts` and `docs/DEEPSEEK_INSTRUCTOR_CONTRACT.md`.

DeepSeek may challenge, teach, synthesize, and extract portable patterns. Its instruction output returns to FCR as proposal data and never becomes direct repository/provider/tool authority.

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

## Intended conversational behavior

When the founder says, for example, `tell Claude to build this`, `ask Gemini to attack the visual direction`, or `tell Perplexity to research this`, the active operator should be able to create a relay request, have FCR dispatch it to the exact requested provider/operator runtime when available, validate the response, and return it to the active conversation without founder copy/paste.

If the target operator runtime is unavailable or unauthenticated, FCR must return a precise blocked state. It must never silently substitute a different provider and claim that the requested operator answered.

## Proof gate

The bridge is not proven by packet validation alone. Completion requires:

1. contract/unit tests;
2. an authenticated FCR relay endpoint;
3. a real target-operator dispatch adapter;
4. a response bound to the exact request hash;
5. Playwright proof from the FCR surface that a founder-issued relay request reaches the requested operator and its validated response returns;
6. provider/runtime evidence showing which operator actually answered.

Until all six pass on the same exact head, the status is `PARTIAL`, not `VERIFIED`.
