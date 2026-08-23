# Bill Gates Lens — Exact-Head Verification

The systems bottleneck is evidence identity. A broad test matrix is low value if jobs certify a synthetic merge ref while governance believes they certify the immutable PR head.

Standardize one invariant across required workflows: derive `EXPECTED_HEAD_SHA`, explicitly check out that SHA, verify `git rev-parse HEAD`, then execute the gate. Required migration lint must fail closed and block the production build. Optional vendor scanners remain advisory and cannot replace repository-native proof.

This reduces verification ambiguity without adding a new provider, runtime service, or product dependency.
