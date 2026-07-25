# GitHub Copilot Instructions

Read and follow the repository-root `AGENTS.md`, `GLOBAL_AI.md`, and
`.agents/skills/founder-control-room-operator/SKILL.md` before nontrivial work.

For Cloudflare tasks, also read:

- `.agents/skills/control-room-cloudflare-agent-fleet/SKILL.md`
- `docs/CLOUDFLARE_AGENT_FLEET.md`

Use current Cloudflare documentation and connected MCP tools rather than stale
assumptions. Keep changes focused, reversible, and on the active mission branch.
Never expose credentials or perform production deployment, rollback, DNS,
domain, billing, auth, or destructive account actions without the required
founder approval.

Configuration, CI, and runtime are separate proof layers. Any browser-visible
change requires targeted Playwright verification against the exact preview
artifact. Report `REALITY`, `FIX`, `PROOF`, `RISK`, `ROLLBACK`, and `NEXT GATE`.
