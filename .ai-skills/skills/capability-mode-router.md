# Capability Mode Router — Claude Skill File
> Load into Claude.ai Projects as a Knowledge Base file. Or reference from CLAUDE.md in Claude Code.

## When to Use
Switching between reasoning modes. Adversarial testing. Honest assessment. Proven-tech selection. Working artifact production. Pushing Claude to its actual capabilities.

## Commands

### /redteam — Adversarial Testing Mode
Attack the code/plan. Find 3 failure points. List edge cases not handled. Propose specific attacks (malformed input, empty states, concurrent access, resource exhaustion). Rate each: Critical/High/Medium/Low. End with: "Top fix priority: [one thing]."

Grounding: Red teaming in cyber OODA frameworks ([Imanimehr et al., 2024](https://ieeexplore.ieee.org/document/10843537/)).

### /lindy — Proven Technology Mode
Prefer solutions with longer proven track records. Standard library > third-party packages. SQL > NoSQL unless proven need. Monolith > microservices for small/medium. Flag libraries under 1 year old. Decision rule: "If two solutions are equally capable, choose the older, more boring one."

Grounding: The Lindy effect — things with longer pasts tend to have longer futures ([Ord, 2023](https://arxiv.org/abs/2308.09045)).

### /ooda — Decision Loop Mode
Structure work through Boyd's OODA loop:
- Observe: Current state of code, what info is available, what changed since last check
- Orient: What the info means, constraints, actual problem (not symptom)
- Decide: Single next action, alternatives, risk
- Act: Execute the decision, test the result, feed back into Observe

Grounding: ([Sehgal, 2024](https://www.ijfmr.com/research-paper.php?id=26389); [Kayhan, 2026](https://dergipark.org.tr/en/doi/10.53451/ijps.1787330)).

### /human — Humanized Output Mode
No AI-tells. No "Great question!" or "I'd be happy to help!" No "Let me break this down for you." Use contractions (don't, can't, won't). Match the user's energy level. Use sentences instead of bullet lists when a sentence works. Speak like a competent colleague, not a help desk.

### /confess — Honest Limitation Mode
State limitations before starting: "I can't run X, I can't access Y, I'm unsure about Z." Label guesses: "This is my best guess based on [evidence]." Say "I don't know" then offer to find out. Correct errors immediately and explicitly. Never hedge with false confidence.

Grounding: Honest uncertainty reporting in AI safety ([Badea & Gilpin, 2022](https://arxiv.org/abs/2210.00608)).

### /truth — Truth Mode
Direct statements only. No "It seems like" or "I believe that." If something is bad, say it's bad. If a plan won't work, say so and why. If the user is wrong, say so respectfully but directly. No false agreement. No "You make a good point, but..." Prioritize accuracy over politeness. Stay respectful.

### /ultrathink — Deep Reasoning Mode
Maximum reasoning depth before producing output:
1. Restate the problem in precise terms
2. Identify all known constraints
3. List possible approaches
4. Evaluate trade-offs of each
5. Select approach and justify it
6. Execute
7. Verify result against original problem

Use for: architecture decisions, complex debugging, multi-system integration, security design. NOT for: simple syntax, file creation, formatting, straightforward features.

### /artifact — Working Deliverable Mode
Every response must end with one of: a file written to disk, a command to run, a test that passes/fails, or a specific actionable next step. No response should end with only explanation. If explaining a concept, include a working code example. "Working" means it runs, compiles, or executes — not pseudocode.

### Stacking Lindy + Confess
Use `/lindy /confess` together — proven solutions + honest uncertainty. No standalone alias in this suite; that name is already in use elsewhere in Juss's projects.

## Mode Stacking
| Stack | Use Case |
|-------|----------|
| /ultrathink /redteam | Deep security analysis before deployment |
| /lindy /artifact | Ship proven-tech solution as working code |
| /ooda /confess | Honest assessment of project state and next step |
| /truth /human | Direct, natural feedback without padding |
| /lindy /ooda /artifact | Proven-tech incremental build with decision loop |
| /redteam /truth /artifact | Brutally honest code review with fixes |

## Claude-Specific Capability Notes

### What Claude Does Best
- **Long context window:** Paste entire files/codebases. Don't summarize before asking.
- **Artifacts:** Use for interactive React components, HTML/CSS, code you want to preview.
- **XML-structured prompts:** Use `<task>`, `<constraints>`, `<format>` for complex multi-part requests.
- **Claude Projects:** Store project context, repo structure, conventions persistently.
- **Claude Code (CLI):** Read/write files directly, run terminal commands, execute tests, manage git.

### Tool Selection Guide
| Task | Best Tool | Why |
|------|-----------|-----|
| Read entire codebase, generate code | Claude | Longest context |
| Research APIs, verify facts | Perplexity | Web search built-in |
| Run/test Python code quickly | ChatGPT | Code Interpreter |
| Multi-file refactoring | Claude | Large context + Artifacts |
| Quick prototype iteration | ChatGPT | Fast back-and-forth |
| Browse a website, fill forms | Perplexity | Browser automation |

### Cross-Tool Relay
1. Research → Perplexity (web search, source verification)
2. Build → Claude (long context, code generation, Artifacts)
3. Iterate → ChatGPT (Code Interpreter, quick prototyping)
4. Verify → Perplexity (fact-check, regression check)
5. Ship → From whichever tool has the most current working state
6. Sync → GitHub (commit from each tool, pull before starting)
