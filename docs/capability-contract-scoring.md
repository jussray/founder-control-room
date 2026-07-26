# Capability Contract scoring

Founder Control Room computes readiness from capability claim states, not health colors.

| State | Weight |
| --- | ---: |
| verified | 1.0 |
| partial | 0.5 |
| unverified | 0.2 |
| blocked | 0.0 |
| not_applicable | excluded |

The score is the rounded weighted average across applicable capabilities.

## Truth rules

- `verified` requires at least one evidence ID.
- Every evidence ID must resolve to an item in `proof`.
- A verified rollback requires a matching rollback evidence item.
- Health states are operational signals and never substitute for proof.
- `not_applicable` does not improve or reduce readiness.
- The score is deterministic and contains no model judgment.

## UI contract

Portfolio and repository views should display the numeric score beside the underlying counts. The founder must be able to see verified, partial, unverified, blocked, and excluded claims without opening source files.
