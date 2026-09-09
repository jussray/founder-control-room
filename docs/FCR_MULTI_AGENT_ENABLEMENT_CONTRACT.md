# FCR Multi-Agent Enablement Contract

**Status:** founder-approved additive operator contract  
**Authority host:** `jussray/founder-control-room`  
**Applies to:** Codex / ChatGPT, Claude / Claude Code, Perplexity  
**Canonical product rules:** FCR master specification plus the v1.4 ULTRATHINK Self-Attack addendum

## Boundary

Founder Control Room is the sole implementation host for the current first slice. Claude and Perplexity are enabled as governed operator lanes alongside Codex/ChatGPT. Enabling an operator means FCR may assign it bounded research, proposal, review, or implementation work when the current session and repository policy authorize that work.

It does **not** mean the operator becomes a source of truth, gains founder approval authority, gains credentials, gains merge/deploy/publish authority, or may mutate another portfolio repository merely because it can read it.

## Operator / provider separation

These are different capability classes:

- `claude-code`, `codex`, and `perplexity` are bounded operator identities.
- `anthropic-platform` and `openai-platform` are replaceable server-side model-provider identities.
- Operator enablement does not automatically enable the corresponding model provider.
- Model-provider availability does not grant operator or mutation authority.

The current Friend Intake slice remains model-free:

```text
Founder auth
-> privacy choice
-> deterministic Mirror
-> editable tags
-> exactly one Move
-> provenance
-> timeline receipt
-> usefulness feedback
```

For that slice, Claude, ChatGPT/Codex, and Perplexity may help inspect, implement, test, review, and verify the repository, but the live product path must not call OpenAI, Anthropic, Perplexity, or another external model.

## Enabled operator capabilities

Each enabled operator may be assigned:

- `research`
- `propose`
- `review`
- `implement`

Every external write still requires the exact repository/provider authority applicable to that action. Capability is not permission.

## Shared invariants

All enabled operators must preserve:

1. FCR as the portfolio truth/authority host for this slice.
2. Contract -> behavior -> evidence -> usefulness -> federation.
3. No cross-repository constitutional ports before the FCR usefulness receipt is proven.
4. No Chief privileged-write expansion while its current semantic/security gate is unresolved.
5. No weakening of Se'kret Bip teen/family/privacy/RLS rules.
6. No raw founder input in `project_events`.
7. `process_without_saving` means zero raw persistence, raw embedding, raw timeline content, or raw provenance payload.
8. Exactly one Move per intake.
9. Sensitive input may produce only `protective_move` or `clarifying_question`.
10. Green founder-facing truth requires compatible, fresh evidence.

## Tool-specific overlays

Claude must also obey:

- `CLAUDE.md`
- `docs/CLAUDE_FOUNDER_CONTROL_ROOM_MASTER_BUILD_SPEC.md`

Perplexity must also obey:

- `PERPLEXITY.md`
- `docs/PERPLEXITY_MCP_FOUNDER_CONTROL_ROOM_MASTER_BUILD_SPEC.md`

Codex/ChatGPT remains governed by the repository entry contracts, `GLOBAL_AI.md`, and the same canonical FCR v1.4 boundary.

When tool-specific instructions conflict with the canonical FCR product/authority contract, the stricter applicable canonical rule wins.

## Proof rule

Agent participation is bookkeeping/provenance until the exact work is independently evidenced. A model or operator statement that something passed is not test, CI, provider, browser, deployment, or outcome proof.

The first-slice completion gate remains real desktop/mobile Playwright plus the seven acceptance gates. No operator may self-declare those gates green without the corresponding evidence.
