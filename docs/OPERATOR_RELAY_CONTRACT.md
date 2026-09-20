# FCR Operator Relay Contract

Status: founder-approved bridge slice

## Purpose

Let a governed operator hand a bounded task to another governed peer operator through Founder Control Room so the founder does not have to copy/paste between Gemini, ChatGPT/Codex, Claude/Claude Code, and Perplexity.

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

A relay capability describes the requested work class. It is not mutation permission, spend permission, or a bypass around a stricter provider-cost policy. The current cost-control boundary may reject paid semantic `review` before provider dispatch; that blocker must remain explicit rather than being bypassed through the relay.

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

When the founder says, for example, `tell Gemini to attack this` or `tell Perplexity to attack this`, the active operator should be able to create a relay request, have FCR dispatch it to that exact requested operator when the provider/operator runtime is actually available and policy permits that request, validate the response, and return it to the active conversation without founder copy/paste.

If the target operator runtime is unavailable, unauthenticated, or blocked by current provider-cost policy, FCR must return a precise blocked state. It must never silently substitute a different provider and claim that the requested operator answered.

## Proof gate

The bridge is not proven by packet validation alone. Completion requires:

1. contract/unit tests;
2. the authenticated canonical FCR relay endpoint;
3. a real target-operator dispatch adapter;
4. a response bound to the exact request hash;
5. Playwright proof from the FCR surface that a founder-issued relay request reaches the requested operator and its validated response returns;
6. provider/runtime evidence showing which operator actually answered.

Until all six pass on the same exact deployed head, the status is `SOURCE_WIRED_LIVE_UNPROVEN`, not `VERIFIED`.
