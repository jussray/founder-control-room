# skills/juss-authored

Review-only export of Juss-authored skills, originally prepared 2026-11-03. The receipt checker and its tests have since received scoped integrity repairs; source variants outside this folder remain unchanged. `SHA256SUMS.txt` inventories export bytes, but is not an authorship or provenance signature.

## Sources

- 11 skills from the account-synced copies: godmode-devil-ultrathink, godmode, goalfix, truth-decay, sauce-guard, futureyou-me-v10, juss-command-codex, runtime-kernel, founder-action-implant-verify, patch-implant-verify, l99-v21-transactional-authority.
- juss-os: exported tree from jussray/ULTRATHINK- main @894bea7 (v3.1.1), with subsequent receipt-checker security repairs. Formal `FOUNDER ACCEPT` canonicalization remains UNKNOWN. The account copy (v3-DRAFT) was not used.
- confess, truthmode, reasoning-stack, juss-af-skills-pack: from jussray/ULTRATHINK- main @894bea7.

## Existing skills in this repo

Unchanged: `.agents/skills/`, `.ai/skills/`, and `skills/` outside this folder. In particular, `.ai/skills/goalfix` (a different variant) is not overwritten.

## Known differences, not reconciled

- godmode-devil-ultrathink and juss-command-codex: jussray/ULTRATHINK- main holds different bytes from the account copies used here.
- goalfix: the account copy is 3115 bytes. This repo's `.ai/skills/goalfix` is a different variant.
- `.agents/skills/l99-v21-transactional-authority` and `.agents/skills/devil` already exist here. This export does not replace them.

## Not included

- Memory-only frameworks (mode/lens stack, ACTUAL-FLOW V4, receipt.mjs). Their source was not located.

## Status

The isolated receipt checker and inventory regression suites passed 21/21 tests locally against the repaired files; that is not a production result. The existing FCR CI `Python tests` lane now checks the export integrity and rejects missing/stale manifest entries. Hosted exact-head CI, actual skill activation, runtime/provider proof, and integration into FCR are still UNVERIFIED until separately observed.
