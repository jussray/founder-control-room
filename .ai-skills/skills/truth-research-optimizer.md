# Truth Research Optimizer — Claude Skill File
> Load into Claude.ai Projects as a Knowledge Base file. Or reference from CLAUDE.md in Claude Code.

## When to Use
Researching libraries, frameworks, APIs, technical approaches. Verifying factual claims. Comparing options. Preventing hallucination.

## Source Hierarchy (Use in Order)
1. Official documentation — API docs, README, official guides
2. Source code / type definitions — .d.ts files, Python stubs, Go interfaces
3. Recent test files — actual usage patterns
4. GitHub issues and PRs — edge cases, known bugs, breaking changes
5. Stack Overflow / community forums — verify against #1
6. Blog posts and tutorials — last resort, verify against official docs
7. Training data / memory — never trust alone. Always verify with a live source.

## Research Protocol
1. **Define:** Write a single question. Be specific about version and use case.
2. **Search:** Include version number and year. Search official docs first.
3. **Cross-Verify:** Find in at least 2 independent sources. Check dates and versions.
4. **Label:** [VERIFIED], [LIKELY], [UNCERTAIN], [UNVERIFIED]
5. **Resolve contradictions:** Note explicitly. Check dates, versions, authority. Test if possible.
6. **Synthesize:** Lead with most authoritative finding. Note agreements and disagreements.

## Anti-Hallucination Rules
1. Never invent API methods, function signatures, or property names.
2. Never guess version-specific behavior. Libraries change between major versions.
3. Never fabricate URLs or citations.
4. Never present training-data knowledge as verified fact. Label it [UNVERIFIED] and verify.
5. When you find you were wrong, correct immediately. State what was wrong, what's right, why.
