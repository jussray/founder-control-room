# ULTRATHINK / ATTACK / GODMODE skill suite

This directory index adds four **companion skills** to Founder Control Room. It does not replace the existing Juss Founder OS, `juss-flow-launch-loop`, `devil`, TypeScript audit skills, or founder merge authority.

| Skill | Responsibility |
| --- | --- |
| [ultrathink-attack-godmode](../ultrathink-attack-godmode/SKILL.md) | Observe, attack assumptions, implement minimal authorized repairs, test |
| [repair-to-proof](../repair-to-proof/SKILL.md) | Exact-head CI/security review, proof matrix, release gate |
| [continuity-proof-ledger](../continuity-proof-ledger/SKILL.md) | Durable provenance, fingerprints, cookies, supersession and cross-agent handoffs |
| [urlfix](../urlfix/SKILL.md) | URL → browser test → issue ledger → authoritative root-cause repair → same-path proof |

## Routing
- `/ultrathink`, `/godmode`, `attack/godmode`, `implant fixes` → **ultrathink-attack-godmode**, then **repair-to-proof** for the verification boundary.
- `/repair-to-proof`, `merge review`, `exact-head gate` → **repair-to-proof**.
- `/continuity`, `/receipt`, `fingerprints and cookies` → **continuity-proof-ledger**.
- `/urlfix <url>` or a bounded live-site repair request → **urlfix**, then **ultrathink-attack-godmode** + **goalfix** semantics for repair and **repair-to-proof** for release truth.
- Cross-agent work should use the ledger after every meaningful action and preserve independent project boundaries.

## Authority and precedence
Before running, read the repo's [AGENTS.md](../../AGENTS.md), [Juss Founder OS](../../.ai/skills/juss-founder-os/SKILL.md), [Juss Flow Launch Loop](../../.ai/skills/juss-flow-launch-loop/SKILL.md), and [Founder Merge Authority](../../docs/FOUNDER_MERGE_AUTHORITY.md). No skill invocation, user shorthand, green CI, or `mergeable=true` grants merge approval. Each merge needs fresh founder approval for exact repository, PR, base SHA and head SHA.

## Verification status
This index registers **source-level routing guidance**. It is not evidence that an agent runtime, skill registry, FCR database, or other projects have automatically loaded these files. Prove activation and handoffs separately before claiming runtime integration.
