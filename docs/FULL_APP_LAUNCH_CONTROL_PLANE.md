# Founder Control Room full app launch control plane

Owner: Juss Ray
Date: 2026-07-30
Goal: full app launch without weakening founder authority, proof, privacy, rollback, or Bip flow.

## Operating lenses

These names are decision lenses, not decoration:

- **ULTRATHINK**: inspect the whole system before choosing the smallest safe move.
- **Steal**: reuse proven interaction, architecture, and operating patterns without copying protected expression or importing another product's trust assumptions.
- **Lindy**: prefer durable primitives, boring protocols, explicit contracts, and reversible changes.
- **OODA**: observe repository and provider truth, orient around the launch blocker, decide one bounded move, act, then refresh evidence.
- **L99**: preserve exact-head evidence, authority levels, provenance, rollback, and fail-closed behavior.
- **Bill Gates lens**: simplify the system, remove duplicate surfaces, measure the bottleneck, and make operational state legible.
- **Elon Musk lens**: delete unnecessary steps, compress cycle time, challenge inherited requirements, then automate only after the process is correct.
- **Juss flow**: direct, human, protective, founder-first language; one clear next move; no fake-green claims.

## Launch truth

The repository already contains a real static Control Room frontend in `public/control-room`, an Express API, founder authentication, missions, approvals, PromptOS, FutureYou, Goalfix, Design OS, guarded terminal, repository verification, Cloudflare reasoning, MCP, and Founder Signal Engine surfaces.

The current launch blocker is not "no app." It is fragmented product navigation plus repeated Cloudflare deployment failures and incomplete live runtime proof.

## Launch sequence

1. **Recover deployment truth**
   - prove the production Worker reports the exact merged SHA;
   - prove `/health`, `/version`, and `/guardrails.json` on the real deployment URL;
   - classify any missing Cloudflare, Supabase, KV, URL, or environment binding without exposing values;
   - retain the workflow run, job, exact SHA, and sanitized failure reason.

2. **Unify the product shell**
   - replace floating utility pills with one accessible launch dock;
   - keep the existing authenticated SPA intact;
   - expose Goalfix, FutureYou, Founder Signal Engine, GitHub Workspace, Command Bridge, Plugin Center, and Repository Settings as one coherent family;
   - preserve mobile reachability, keyboard navigation, visible focus, and reduced-motion behavior.

3. **Command Deck vertical slice**
   - answer: what matters now, what is blocked, what needs approval, what changed, and the safest next move;
   - use existing APIs before creating new storage or parallel state;
   - never imply live provider success from repository state alone.

4. **Chief AI vertical slice**
   - one intake;
   - mirror separated from advice;
   - 1–3 intent tags;
   - exactly one tiny move;
   - explicit memory control and provenance;
   - sensitive-content protection without presenting the system as therapy.

5. **Product Design gate**
   - brief and user outcome;
   - exactly three distinct visual directions for net-new surfaces;
   - founder-selected target;
   - responsive implementation;
   - source-to-render design QA;
   - WCAG 2.2 AA target;
   - desktop and mobile Playwright proof.

6. **Release loop**
   - typecheck;
   - lint;
   - unit and integration tests;
   - Playwright with non-zero test collection;
   - exact-head CI;
   - review threads resolved;
   - merge with expected head SHA;
   - production deployment proof;
   - rollback proof.

## Merge policy

Founder approval authorizes the intended work. It does not convert failed, stale, absent, or wrong-head evidence into permission to merge.

A PR may merge only when:

- its exact head is unchanged;
- required checks pass on that exact head;
- critical review findings are resolved;
- the diff matches the stated scope;
- no secret or sensitive founder content is exposed;
- rollback is explicit;
- user-facing changes include real browser proof.

## Loop policy

`/loop` means repeat the OODA cycle against fresh evidence. It does not mean spin indefinitely or report activity as progress.

Each loop iteration must produce one of:

- a verified state change;
- a newly classified blocker;
- a bounded code or configuration repair;
- a founder decision request;
- a truthful stop because the next action requires credentials, provider access, billing, legal acceptance, or another authority boundary.

## Definition of full launch

Full launch is achieved only when:

- the founder can sign in through the deployed product;
- the main product shell works on mobile and desktop;
- core surfaces are reachable through one coherent navigation model;
- critical flows pass Playwright;
- the deployed runtime reports the exact release SHA;
- provider state is distinguishable from repository state;
- approvals are exact-target and fail closed;
- evidence, provenance, privacy, rollback, and non-deletion rules remain intact;
- the release has a tested rollback path;
- the final launch receipt identifies what is proven, inferred, unknown, and blocked.
