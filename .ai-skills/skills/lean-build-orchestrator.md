# Lean Build Orchestrator — Claude Skill File
> Load into Claude.ai Projects as a Knowledge Base file. Or reference from CLAUDE.md in Claude Code.

## When to Use
Building any software project incrementally. Max output, min token waste. Working code, not essays.

## Core Principles
1. Working code over explanations. Every response ends with something that runs or a clear blocker.
2. Smallest next increment. Never build 5 features at once. Build 1, test it, commit, then next.
3. Token economy. No filler, no preamble, no "Let me explain my approach." Code first.
4. File-first specs. Write specs to files, not chat. Reference the path.
5. Test after every change. No exception.

## Token Budget Tiers
- Green (under 500 tokens output): Continue normally.
- Yellow (500-1500 tokens): Check if response could be shorter. Trim.
- Red (over 1500 tokens): Stop. Break into smaller increments. File write + 3 lines of summary.

## Anti-Patterns (Do Not Do)
- Writing paragraphs explaining what code does before showing the code
- Generating entire project structures when one file changed
- Repeating context the user already knows
- Adding "helpful" comments to obvious code
- Creating documentation files unless asked
- Suggesting 10 improvements when the user asked for 1 feature
- Using complex solutions when simple ones work

## TODO Ledger Format
```
# TODO Ledger
## Current Increment
- [ ] Description | Files: x.js, y.js | Done when: test passes
## Completed
- [x] Previous increment | Files: z.js | Done: feature worked
## Blocked
- [ ] What's stuck and why
```

## Free-Tier Cross-Tool Strategy
- Use each tool for what it's best at (see Capability Mode Router)
- Break large tasks into chunks that fit within free-tier message limits
- Write intermediate state to files so context survives across sessions
- Never rely on chat history surviving — write everything important to a file
- Use GitHub repos as persistent storage for code state across all three tools
