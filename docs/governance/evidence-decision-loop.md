# Evidence Decision Loop v1

Contract: `juss/evidence-decision-loop@v1`

Founder Control Room is the durable evidence/decision adapter for the portable PromptOS workflow. It records what was observed, which proof plane supports it, what conclusion is allowed, and the next gate. It does not let analysis silently become execution authority.

## FCR adapter

```text
Observe exact subject + fingerprint
-> Orient around human goal + primary signal + authority ceiling
-> Redteam stale proof / vanity signals / provider-only acceptance
-> Decide smallest next gate
-> Act only under separately granted authority
-> Verify execution and outcome independently
-> Classify VERIFIED / OBSERVED / INFERRED / UNKNOWN / BLOCKED
-> Report Reality / Bound / Decision / Proof / Risk / Rollback / Next Gate
```

Proof planes are `source`, `execution`, and `outcome`.

Execution proof is not outcome proof. A founder-confirmed action is legitimate observed execution evidence, but it does not independently prove platform behavior or human/business outcome. A changed commit SHA, runtime identity, proposal hash, experiment subject, or comparable fingerprint invalidates predecessor proof for the changed subject.

Secondary or vanity signals may inform a decision, but they cannot declare the primary success signal achieved by themselves.

## LinkedIn thesis-comment lane

The thesis-comment experiment is the first live adapter. Its primary signals are qualified conversations, profile views, and follower movement. Reactions, author replies, and comment impressions are supporting signals. Raw impressions alone cannot declare the lane a winner.

The lane remains founder/manual execution only. FCR may record a founder-confirmed comment as execution evidence while keeping the experiment outcome `UNKNOWN` until later analytics and qualified-response evidence exist.

## Merge review adapter

For merge review, bind every recommendation to the exact current head SHA. Inspect the current diff, executed CI/Playwright evidence, independent review requirements, and merge authority. Any head movement invalidates predecessor review proof. A green recommendation is still a proposal until current founder authority permits the merge.
