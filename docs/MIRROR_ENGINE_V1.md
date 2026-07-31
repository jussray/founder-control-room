# Mirror Engine V1

## Purpose

Mirror Engine turns one founder transcript into:

- one voice-preserving headline;
- a summary of at most three short sentences;
- 1–3 intent tags;
- one realistic 5–15 minute move;
- an optional ready-to-review script;
- a Tone Guard rewrite of that script;
- a factual-claim ledger that blocks unsupported external use;
- model and prompt provenance.

V1 deliberately runs the four model stages in one structured OpenAI Responses API call. This keeps latency, cost, prompt drift, and partial-failure surfaces lower while preserving logical stage boundaries.

```text
Friend Intake
→ supplied transcript and related-memory context
→ Mirror + Intent + Tiny Move + Tone Guard
→ factual-claim detection
→ draft-only response
→ Fact Check Every Claim when required
→ founder review or portable founder approval
→ separately gated external adapter
```

V1 does not transcribe audio, generate embeddings, query a vector database, publish, send, schedule, merge, or deploy. Those are separate adapters and gates.

## Endpoint

```http
POST /mirror/run
Authorization: Bearer <founder-supabase-access-token>
Content-Type: application/json
```

The route requires both a valid founder session and the `founder_users` allowlist.

## Request

```json
{
  "transcript": "I’m done putting all my time into everybody else’s emergency. I need today aimed at Bip, Founder Control Room, and the money path.",
  "relatedMemories": [
    "Founder Control Room is the governing command layer.",
    "The strongest current investor lead asked about provenance and revocation."
  ],
  "timeEnergyContext": "Tired, interrupted by kids, about 10 minutes available.",
  "recipientContext": "A LinkedIn reply to an aligned investor lead.",
  "voiceProfile": "Direct Philly founder voice. Preserve natural words such as bip, machine, money, and the hood. Do not manufacture slang."
}
```

### Bounds

- `transcript`: required, 1–20,000 characters.
- `relatedMemories`: optional array, at most 5 items, 1–4,000 characters each.
- `timeEnergyContext`: required, 1–500 characters.
- `recipientContext`: null or 1–1,500 characters.
- `voiceProfile`: null or 1–2,000 characters.

The API never writes raw transcript or memory text into `project_events`. Audit metadata records lengths, flags, result categories, and provider provenance only.

## Response

```json
{
  "version": "mirror-engine-v1",
  "runId": "4f71658c-ef5f-4d90-9cec-b23cab4219fe",
  "headline": "I’m building my machines, not carrying everybody else",
  "summary": "I need my time aimed at the builds and people that move my life forward. The noise is expensive, and I’m done letting it run the day.",
  "intentTags": ["money", "build"],
  "actionText": "Reply to the strongest investor lead with one proof-backed sentence.",
  "script": "I shipped the proof path and can show you the exact build receipt.",
  "timeEstimateMinutes": 7,
  "goal": "money",
  "confidence": 0.82,
  "toneGuardedScript": "I shipped the proof path and can show you the exact build receipt.",
  "containsExternalFactualClaims": true,
  "factualClaims": [
    "The proof path shipped."
  ],
  "distribution": {
    "mode": "draft_only",
    "factCheckStatus": "required_before_external_use",
    "externalActionAllowed": false
  },
  "provenance": {
    "provider": "openai",
    "model": "gpt-5-mini",
    "responseId": "resp_...",
    "promptVersion": "mirror-engine-v1-2026-07-30",
    "storedByProvider": false
  }
}
```

## Error contract

```json
{
  "error": "Mirror Engine model provider is not configured",
  "code": "OPENAI_NOT_CONFIGURED"
}
```

Important codes:

- `MIRROR_PROJECT_UNAVAILABLE`: Founder Control Room project registry lookup failed.
- `OPENAI_NOT_CONFIGURED`: backend provider key absent.
- `OPENAI_TIMEOUT`: provider timeout.
- `OPENAI_HTTP_ERROR`: provider returned a non-success status.
- `INVALID_MODEL_OUTPUT`: structured output failed local contract validation.
- `AUDIT_PERSISTENCE_FAILED`: required audit could not be written, so output is withheld.

Provider error details are not echoed to clients or written into public audit metadata.

## OpenAI request boundary

The adapter uses:

- `POST /v1/responses`;
- server-side `OPENAI_API_KEY` only;
- `store: false`;
- strict JSON Schema Structured Outputs;
- bounded response size;
- a configurable timeout;
- configurable `MIRROR_ENGINE_MODEL`;
- no raw provider key, transcript, or related memories in audit logs.

The direct Mirror Engine key is separate from the existing Zapier-held `zapier-founder-signal-engine` key reference.

## Fact-check gate

When `containsExternalFactualClaims` is true:

1. pass the draft and `factualClaims` ledger into `skills/fact-check-every-claim/SKILL.md`;
2. verify each claim with the required independent source floor;
3. bind the fact-check artifact to the draft content hash;
4. apply corrections only after founder approval;
5. invalidate the prior report when the factual content changes;
6. keep distribution blocked until the corrected exact content is approved.

Tone Guard runs on phrasing. It cannot turn an unsupported claim into evidence.

## Portable approvals

A ChatGPT, Claude, Perplexity, or Founder Control Room conversation may carry Juss’s exact decision through a registered adapter. Execution requires the packet described in `docs/PORTABLE_FOUNDER_APPROVALS.md`.

Plain copied chat text, model recommendations, old broad approvals, and memory are not valid mutation receipts.

## Verification commands

The required repository proof floor for this slice is:

```bash
npm run typecheck
npm run lint
npm test -- src/http/routes/__tests__/mirror.integration.test.ts
npm run verify:ai-skills
npm run build
```

Playwright is not required for the API-only V1 route because no user-facing browser path changes in this slice. It becomes required when the Mirror Engine UI, audio intake, action card, approval card, or browser workflow is implemented.

## Rollback

Before merge, revert the feature-branch commit(s) or abandon the branch. After merge, revert the focused Mirror Engine commit. Do not delete audit history or approval receipts.