# Universal Commands Reference

> These commands work across Claude, ChatGPT, and Perplexity Computer. Type them at the start of your message to activate a behavioral mode. Modes can stack (e.g., `/lindy /artifact`).

## Command Quick Reference

| Command | Name | Effect | Token Cost |
|---------|------|--------|------------|
| `/redteam` | Adversarial Testing | Attack code/plan, find failure points, rate severity | Medium |
| `/lindy` | Proven Technology | Prefer boring, proven solutions over novel ones | Low |
| `/ooda` | Decision Loop | Observe → Orient → Decide → Act cycle | Medium |
| `/human` | Humanized Output | Natural, direct, no AI-tells, match energy | Low |
| `/confess` | Honest Limitations | State what you can't do, label guesses, admit unknowns | Low |
| `/truth` | Truth Mode | No hedging, direct, no false agreement | Low |
| `/ultrathink` | Deep Reasoning | Maximum reasoning depth, systematic analysis | High |
| `/artifact` | Working Deliverable | Must produce runnable code/file/test/command, not just text | Medium |

## Detailed Usage

### /redteam
**When to use:** Before deploying, after writing a security feature, when reviewing architecture.

**What the AI does:**
1. Identifies the 3 most likely failure points
2. Lists edge cases not handled
3. Proposes specific attacks (malformed input, empty states, concurrent access)
4. Rates each: Critical / High / Medium / Low
5. Ends with: "Top fix priority: [one thing]"

**Example:** `/redteam this auth function` → AI attacks the function, finds token expiry not handled, missing rate limiting, plaintext password comparison. Rates severity. Suggests top fix.

---

### /lindy
**When to use:** Choosing between libraries, frameworks, or approaches.

**What the AI does:**
- Prefers solutions with longer proven track records
- Standard library > third-party package
- SQL > NoSQL (unless specific proven need)
- Monolith > microservices (for small/medium projects)
- Flags libraries under 1 year old: "Novel — consider [proven alternative]"
- Decision rule: "If two solutions are equally capable, choose the older, more boring one."

**Grounding:** The Lindy effect — things with longer pasts tend to have longer futures ([Ord, 2023](https://arxiv.org/abs/2308.09045)).

---

### /ooda
**When to use:** Starting a work session, making architecture decisions, when stuck.

**What the AI does:**
- **Observe:** Current code state, available info, what changed since last check
- **Orient:** What the info means, constraints, the actual problem (not symptom)
- **Decide:** The single next action, alternatives, risk assessment
- **Act:** Execute the decision, test the result, feed back into Observe

**Grounding:** John Boyd's OODA loop, extensively applied to AI systems and decision-making ([Sehgal, 2024](https://www.ijfmr.com/research-paper.php?id=26389)).

---

### /human
**When to use:** Always, unless you need structured/formal output.

**What the AI does:**
- Removes all AI-tells: "Great question", "I'd be happy to", "Let me break this down"
- Uses contractions (don't, can't, won't)
- Matches your energy level
- Uses sentences instead of bullet lists when a sentence works
- Talks like a competent colleague, not a help desk

---

### /confess
**When to use:** At the start of any task where capabilities matter.

**What the AI does:**
- States limitations upfront: "I can't run X, I can't access Y, I'm unsure about Z"
- Labels guesses: "This is my best guess based on [evidence]"
- Says "I don't know" — then offers to find out
- Corrects its own errors immediately and explicitly
- Never hedges with false confidence

**Grounding:** Honest uncertainty reporting is core to AI safety ([Badea & Gilpin, 2022](https://arxiv.org/abs/2210.00608)).

---

### /truth
**When to use:** When you need honest assessment, not encouragement.

**What the AI does:**
- Direct statements only. No "It seems like" or "I believe that"
- If something is bad, says it's bad
- If a plan won't work, says so and explains why
- If you're wrong, says so respectfully but directly
- No false agreement or social lubrication

---

### /ultrathink
**When to use:** Complex architecture, tricky bugs, security design, multi-system integration.

**When NOT to use:** Simple syntax, file creation, formatting, straightforward features.

**What the AI does:**
1. Restates the problem in precise terms
2. Identifies all known constraints
3. Lists possible approaches
4. Evaluates trade-offs of each
5. Selects approach and justifies it
6. Executes
7. Verifies result against original problem

**Note:** Uses more tokens. Use sparingly.

---

### /artifact
**When to use:** Always, unless you specifically want explanation only.

**What the AI does:**
- Ensures every response ends with something usable:
  - A file written to disk
  - A command you can run
  - A test that passes or fails
  - A specific, actionable next step
- "Working" means it runs, compiles, or executes — not pseudocode

---

### Stacking Lindy + Confess
Use `/lindy /confess` together — prefer proven solutions AND honestly state when you're not sure. No standalone alias in this suite; that name is already in use elsewhere in Juss's projects.

---

## Mode Stacking Examples

| Stack | Use Case |
|-------|----------|
| `/ultrathink /redteam` | Deep security analysis before deployment |
| `/lindy /artifact` | Ship proven-tech solution as working code |
| `/ooda /confess` | Honest assessment of project state and next step |
| `/truth /human` | Direct, natural feedback without padding |
| `/lindy /ooda /artifact` | Proven-tech incremental build with decision loop |
| `/redteam /truth /artifact` | Brutally honest code review with fixes |

---

## Platform-Specific Notes

### On Claude
- `/artifact` pairs with Claude's Artifacts feature (interactive code preview)
- Long context window means you can paste entire files with the command
- Use Claude Projects to store these instructions persistently

### On ChatGPT
- `/artifact` pairs with Code Interpreter (actually runs the code)
- Use Custom GPTs to store these instructions as system prompts
- DALL-E integration available for UI mockups alongside code

### On Perplexity Computer
- All commands available as Agent Skills (see perplexity-skills/ directory)
- `/artifact` pairs with file system — writes actual files to workspace
- Browser automation available for testing flows
- Subagents for parallel work with different modes active
