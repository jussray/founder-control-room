# Claude Permission Expiry Repair Receipt — 2026-09-25

## REALITY

- Repository: `jussray/founder-control-room`
- Authoritative base observed before mutation: `main@960df4a6f76435b5adbace4643e647a65824561f`
- Repair branch: `fix/retire-expired-claude-permissions`
- Pre-receipt repair head: `47daea397802a1dfbae66fa8ef99a4d9b44a59c1`
- Branch compare at verification: 2 commits ahead / 0 behind current main.
- `.claude/temporary-permissions.json` records the direct-main push and issue-close allowances as temporary and expired on 2026-07-20.
- The historical temporary-permission ledger is preserved unchanged as provenance.

## FIX

1. `.claude/settings.json`
   - removes both expired allow rules;
   - leaves the ordinary allow list empty;
   - explicitly denies `Bash(git push origin main)` so the expired direct-main exception cannot silently return.
2. `scripts/verify-guarded-terminal-contract.mjs`
   - parses the checked-in Claude settings and temporary-permission ledger;
   - rejects direct-main push if it appears in `allow`;
   - requires direct-main push to remain in `deny`;
   - rejects any expired temporary permission that still appears in `allow`;
   - fails closed on malformed temporary permission entries or invalid expiry timestamps.

No provider, database, secret, deployment, DNS, publication, billing, auth/RLS, or user-data mutation is part of this repair.

## PROOF

- GitHub compare: exactly two functional files changed, branch 0 behind observed main.
- Focused local policy harness against the committed settings/ledger semantics: PASS with zero failures.
- Negative regression harness reintroduced both expired allowances and removed the direct-main deny: PASS by producing four expected failures (direct-main allowed, direct-main deny missing, and both expired permissions still allowed).
- Playwright policy proof using system Chromium: PASS. Rendered evidence asserted `directMainDenied=true`, `expiredStillAllowed=0`, and terminal state `VERIFIED`.
- Exact-head GitHub Actions / repository Playwright matrix: UNKNOWN because no pull request was opened and this repository emitted no workflow run for the repair branch head. This receipt does not promote local focused proof into repository-wide CI proof.

## RISK

- The repair is SOURCE IMPLEMENTED on the branch, not merged into `main`.
- Repository-wide typecheck, full tests, Quality Gate, and canonical Playwright remain unproven on this branch until an existing lawful carrier or other repository-supported exact-head proof path is available.
- No stale or unrelated open PR was reused merely to obtain CI.

## ROLLBACK

Before merge: delete/abandon `fix/retire-expired-claude-permissions`; `main` remains unchanged.

After a lawful merge: revert the focused settings/verifier commits. Preserve this receipt and the temporary-permission ledger as historical provenance rather than deleting the record.

## NEXT GATE

Bind this exact focused branch to a lawful existing integration/proof path without reintroducing direct-main push or contaminating an unrelated stale PR. Require fresh exact-head repository checks and the repository Playwright lane before merge. Merge authority and deployment authority remain separate.
