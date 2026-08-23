# Continuity Fingerprint Protocol

Purpose: make future founder shorthand resolvable without guessing, while preserving current repository and provider evidence as authority.

## Resolution rule

Use shorthand as a retrieval signal, never as proof.

```text
founder shorthand
→ conversation/history fingerprints
→ candidate project
→ authoritative repository/provider verification
→ action
```

For Founder Control Room, high-signal fingerprints include: merge intent, evidence expiry, truth lease, authority, founder approval, control plane, release truth, agent registry, mission engine, approval engine, provider adapters, cross-repo coordination, and portfolio state.

If a fingerprint could belong to another project, verify the exact repo, branch, files, issue/PR, provider state, and current `main` before acting.

## Genesis fingerprint

When asked when this project started, do not infer genesis from the oldest visible chat. Resolve in this order:

1. GitHub repository `created_at`.
2. Root/first commit reachable from authoritative history.
3. Earliest substantive implementation commit.
4. Historical docs that reference earlier work.
5. Earliest available conversation about the project.
6. Earlier uploaded designs, files, or artifacts.
7. Founder testimony, clearly labeled as founder-reported rather than GitHub proof.

Keep idea genesis, repo genesis, first recorded build, first substantive build, launch/production milestones, and current state separate.

## Truth states

Always distinguish VERIFIED, INFERRED, REMEMBERED, UNKNOWN, STALE, and BLOCKED.

## Supersession and decay

A historical fix, approval, deployment, branch, screenshot, PR description, or conversation does not stay authoritative forever. If `main`, provider state, schema, runtime, or governing contract changed, revalidate before reusing the old conclusion.

Preserve the chain:

```text
prior decision
→ evidence then
→ validity conditions
→ superseding event
→ revalidation
→ current authority
```

## Reuse rule

Every correction should leave a reusable fingerprint so the same discovery cost is not paid twice. Prefer exact issue, PR, SHA, route, function, provider, evidence receipt, or prior decision before broad scans.

This protocol supplements `AGENTS.md`, Founder Intelligence, merge authority, truth-decay, public-communication, and portfolio-control-plane contracts. It never overrides stricter authority or grants mutation permission by itself.
