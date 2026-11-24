# Launch — Prompt Workflow Router

Release sequence:

1. mount route in `src/http/server.ts`;
2. source stop gate PASS;
3. focused Vitest PASS;
4. PR exact-head checks PASS;
5. merge only under existing repository governance;
6. deploy exact merged SHA through existing FCR deployment path;
7. verify `/version` returns that SHA;
8. run deployed Playwright runtime proof;
9. only then mark workflow selection LIVE.

A source commit, PR merge, CI green state, or deployment receipt alone is not sufficient to claim the user-facing runtime path works.
