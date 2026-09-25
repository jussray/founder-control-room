# Evidence Ladder

1. Source readback: proves files exist at a branch SHA.
2. Deterministic source gate: proves required contracts are present.
3. Focused Vitest: proves selector/authority/route behavior in test process.
4. Server mount gate: proves the real FCR server includes the route.
5. PR exact-head CI: binds tests to the reviewed head.
6. Deployment `/version`: binds runtime to an exact SHA.
7. Playwright runtime proof: proves the authenticated deployed route behaves as claimed.

Higher rungs do not retroactively make lower-rung claims broader than their evidence.
