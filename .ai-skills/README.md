# AI Skill Suite — Cross-Platform Build Toolkit

A set of skills and instructions for maximizing build output across Claude, ChatGPT, and Perplexity Computer on free tiers. Built for incremental, working-code-first development with minimum token waste.

## What's Inside

### Perplexity Agent Skills (`perplexity-skills/`)

Five installable skills for Perplexity Computer:

| Skill | Purpose |
|-------|---------|
| **lean-build-orchestrator** | Max build output, min token usage, working code first, incremental shipping |
| **regression-stagnation-guard** | Prevent code regression, detect project stagnation, dependency drift, stuck loops |
| **truth-research-optimizer** | Source discipline, contradiction detection, confidence labeling, anti-hallucination |
| **intent-repair-reader** | Parse human intent from typos using context clues, keyboard analysis, phonics |
| **capability-mode-router** | Command system: /redteam, /lindy, /ooda, /human, /confess, /truth, /ultrathink, /artifact |

### Cross-Platform Adapters (`cross-platform/`)

| File | For | How to Use |
|------|-----|-----------|
| `claude-project-instructions.md` | Claude (claude.ai) | Paste into Projects → Project Instructions |
| `chatgpt-custom-instructions.md` | ChatGPT (chat.openai.com) | Paste into Settings → Custom Instructions |
| `universal-commands.md` | All three | Reference for command behaviors |
| `minimal-token-operating-protocol.md` | All three | Token economy strategy for free tiers |

## Quick Start

### On Perplexity Computer
1. Install each skill from `perplexity-skills/` (use `save_custom_skill`)
2. Skills auto-activate based on task context
3. Type command shortcuts like `/lindy /artifact` in any conversation

### On Claude
1. Create a Claude Project for each of your repos
2. Paste `claude-project-instructions.md` into Project Instructions
3. Add your repo files to the project knowledge base
4. Type commands like `/redteam` or `/ooda` in chat

### On ChatGPT
1. Go to Settings → Custom Instructions
2. Paste the "About You" section into the first box
3. Paste the "How to Respond" section into the second box
4. Or create a Custom GPT with the full instructions as system prompt
5. Type commands like `/lindy /artifact` in chat

## Command Reference

| Command | Effect |
|---------|--------|
| `/redteam` | Adversarial testing — attack the code, find failure points |
| `/lindy` | Prefer proven, boring technology over novel solutions |
| `/ooda` | Observe → Orient → Decide → Act decision loop |
| `/human` | Natural, direct, no AI-tells, match energy |
| `/confess` | Honest limitations, label guesses, admit unknowns |
| `/truth` | No hedging, direct truth, no false agreement |
| `/ultrathink` | Maximum reasoning depth for complex problems |
| `/artifact` | Must produce working code/file/test, not just text |

Commands stack: `/lindy /ooda /artifact` = proven-tech incremental build with decision loop, shipping code each cycle.

## Cross-Tool Workflow

```
Research → Perplexity (web search, source verification)
Build   → Claude (long context, code generation, Artifacts)
Iterate → ChatGPT (Code Interpreter, quick prototyping)
Verify  → Perplexity (fact-check, regression check)
Ship    → From whichever tool has the most current working state
Sync    → GitHub repo (commit from each tool, pull before starting)
```

## Academic Grounding

- **OODA Loop:** John Boyd's decision-making framework, extensively applied to AI and adaptive systems ([Sehgal, 2024](https://www.ijfmr.com/research-paper.php?id=26389); [Kayhan, 2026](https://dergipark.org.tr/en/doi/10.53451/ijps.1787330))
- **Lindy Effect:** Statistical tendency for things with longer pasts to have longer futures ([Ord, 2023](https://arxiv.org/abs/2308.09045))
- **Antifragility:** Systems that benefit from volatility and stress ([Taleb; Gershenson et al., 2019](https://arxiv.org/abs/1812.06760))
- **Honest Uncertainty:** Core principle in AI safety and meta-cognitive decision systems ([Badea & Gilpin, 2022](https://arxiv.org/abs/2210.00608))
- **Red Teaming:** Adversarial testing applied in cybersecurity OODA frameworks ([Imanimehr et al., 2024](https://ieeexplore.ieee.org/document/10843537/))

## Token Philosophy

Every token costs something. On free tiers, tokens are scarce. This suite optimizes for:

- **Working code over explanations** — code first, explanation only if asked
- **Smallest next increment** — one feature, tested, committed, then next
- **File-first state** — write specs and state to files, reference paths in chat
- **No filler** — no preamble, no postamble, no AI-tells
- **Tool switching** — use each AI tool for what it's best at, relay between them

## License

MIT — free to use, modify, and distribute.

## Author

Built for Kayla Smith (github.com/jussray) — projects: Sekret-Bip (wellness app), founder-control-room, solcontinuity.
