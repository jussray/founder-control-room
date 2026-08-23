# Lindy — Exact-Head Verification

Durable CI proves the artifact it claims to prove. Explicit commit identity, deterministic checkout, fail-closed required gates, and small reversible workflow changes survive provider churn better than relying on GitHub's event-default checkout behavior.

The repair prefers an explicit SHA invariant over additional tooling. The invariant remains valid even if the workflow matrix, test runner, or optional scanners change later.
