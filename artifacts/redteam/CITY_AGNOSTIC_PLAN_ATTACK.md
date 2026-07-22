# Redteam II — Attack the Selected Implementation

## Selected plan

A generic jurisdiction registry, source/program/opportunity/outcome schema, deterministic scoring engine, public-safe contract/demo API, and Playwright portability proof.

## Attacks and controls

### The public scoring endpoint could become an unofficial decision authority
Control: it returns a deterministic score only. It does not persist, approve, fund, submit, or claim eligibility.

### Static fixtures could drift from database behavior
Control: fixtures prove API and scoring portability only. Production readiness additionally requires migration validation and a database-backed second-jurisdiction smoke test.

### JSON eligibility fields can become an ungoverned junk drawer
Control: JSON is allowed for variable rules, but authority level, owner, dates, status, and provenance remain normalized columns. A versioned eligibility schema is a later gate.

### Service-role-only tables may slow frontend delivery
Control: this is intentional. Founder-safe APIs are added before any direct client grants. Speed does not justify widening the trust boundary.

### One score can hide uncertainty
Control: evidence is a first-class signal, source provenance is mandatory, score version is retained, and low evidence can force the insufficient-evidence band.

### City identity can re-enter through UI code
Control: Playwright verifies a synthetic second jurisdiction and rejects Johnstown leakage. Future UI components must accept a jurisdiction object rather than import a city constant.

### CI can show red without executing
Control: a workflow result with no steps or logs is blocked infrastructure, not application evidence. Local Playwright evidence is reported separately and never mislabeled as hosted CI.

## Residual risks

- migration has not yet been applied to production;
- no live second jurisdiction has been onboarded;
- legal eligibility remains human-authoritative;
- hosted Actions may still fail before runner provisioning;
- frontend implementation must be checked for city constants when added.
