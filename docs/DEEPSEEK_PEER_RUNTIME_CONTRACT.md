# DeepSeek Peer Runtime Contract

**Status:** SUPERSEDED / DISABLED  
**Historical purpose:** records the retired experiment that exposed DeepSeek as a peer relay target.

## Current authority law

DeepSeek is not a peer operator in Founder Control Room.

- `deepseek` is not a member of `OPERATOR_RELAY_PEERS`.
- `fcr_relay_operator` must reject both `deepseek` and `deepseek-instructor` as peer targets.
- `deepseek-instructor` is the sole active DeepSeek operator identity and is governed by `docs/DEEPSEEK_INSTRUCTOR_CONTRACT.md` plus `src/lib/agentInterop.ts`.
- `deepseek-platform` may remain a provider identity, but provider availability never creates peer, implementation, mutation, merge, deploy, publish, spend, or founder authority.
- Server-side DeepSeek credentials or model selectors must not cause a peer relay adapter to be advertised.

This file is retained for lineage instead of deleted. It does not authorize or describe a live peer path.

## Current handoff path

```text
verified project state
-> ProjectStatePacket
-> deepseek-instructor
-> InstructionPacket
-> FCR policy / founder authority
-> separately authorized builder, if any
-> independent proof
```

A plain conversational request addressed to DeepSeek must route through the instructor membrane or return a precise blocked state. It must never be silently converted into peer relay.

## Verification

The instructor-only boundary is proven only when the exact candidate demonstrates:

1. `OPERATOR_RELAY_PEERS` excludes `deepseek` and `deepseek-instructor`;
2. the peer intent parser does not return a DeepSeek target;
3. peer adapter construction does not expose a `deepseek` adapter even when DeepSeek provider environment variables exist;
4. MCP peer schema derives from the canonical peer registry;
5. the agent registry gives `deepseek` no operator policy and keeps `deepseek-instructor` non-implementing;
6. focused tests and Playwright contract proof are green on the same exact head.

No historical DeepSeek peer receipt survives this supersession as current authority or runtime proof.
