---
name: fact-check-every-claim
version: 1.0.0
status: active
scope: founder-control-room
owners:
  - founder
canonical: ../../../skills/fact-check-every-claim/SKILL.md
---

# Fact Check Every Claim — Agent Entry Point

Read and obey the canonical skill at:

[`skills/fact-check-every-claim/SKILL.md`](../../../skills/fact-check-every-claim/SKILL.md)

This entry point exists so repository agents discover the same contract without copying or drifting the rules.

Minimum invariants:

- extract every factual claim line by line;
- classify `[NUMBER]`, `[ACTION]`, and `[QUOTE]` claims;
- require two credible independent sources for fully verified status;
- use `SINGLE SOURCE ONLY`, `CORRECTED`, or `UNVERIFIED` when the evidence floor is not met;
- use Perplexity MCP for source discovery, not as the underlying source;
- do not publish, send, or auto-apply corrections without the applicable founder authority and exact content hash.