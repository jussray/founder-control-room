# Portfolio Control Room

**Observed:** 2026-07-12  
**Authority:** `jussray/founder-control-room`  
**Manifest contract:** `control-room/manifest.schema.json`

## Decision

The portfolio uses a federated Control Room model:

- every repository remains authoritative for its own code, runtime, release, and rollback evidence;
- the standalone Founder Control Room stores only sanitized operational metadata;
- portfolio observation is read-only by default;
- branch, merge, deploy, rollback, secret, DNS, and destructive-data actions require separate founder gates;
- missing or stale evidence produces `blocked` or `at-risk`, never an optimistic success state.

The hub does not query Se'kret Bip private content, copy L99 story data, ingest customer records, or become a universal service-role holder.

## OODA

### Observe

| Repository | Role | Evidence state | Risk | Dominant blocker |
|---|---|---|---|---|
| `founder-control-room` | portfolio control plane | at risk | high | GitHub Actions jobs fail before runner steps start; guardrail and Cloudflare reasoning branches remain open |
| `Sekret-Bip` | product Control Room | integrated | high | production exact-release and remaining authorization proof |
| `l99-` | runtime Control Room | at risk | high | tenant-safe auth, creator/operator separation, stale stacked PRs |
| `chief-ai-machine` | product workbench | blocked | medium | broad quality gate and separate deployment proof |
| `jussbeautifulhair-site` | commerce surface | at risk | high | broad quality failures and unverified order/rollback flow |
| `untold-stories-storefront` | commerce surface | blocked | high | credential rotation plus stacked foundation/guardrail sequence |
| `sekret-bip-demo` | non-authoritative demo | demo | low | must never be treated as production evidence |

### Orient

The portfolio has three distinct operational layers:

1. **Portfolio authority:** the standalone Founder Control Room indexes evidence and proposes actions.
2. **Repository authority:** each repo owns its implementation, CI, deployment, and rollback truth.
3. **Data authority:** Se'kret Bip and the Founder Control Room retain separate Supabase projects and trust boundaries.

Trying to centralize all writes, secrets, databases, and deployments would create one catastrophic credential and one misleading status surface. The useful common layer is the evidence contract, not shared superuser access.

### Decide

1. Standardize one manifest schema across active repositories.
2. Harden the standalone Supabase project as server-owned.
3. Register repository and public project-reference connections without secrets.
4. Merge manifests only after repository-local checks run.
5. Import a manifest into `project_manifests` only from a reviewed default-branch commit.
6. Keep material mutations behind separate founder approvals.

### Act

- Live database hardening applied and verified with five catalog checks.
- Seven projects and nine sanitized connections registered.
- One manifest PR prepared per active repository.
- Central registry and schema prepared in this repository.
- Stale or overlapping feature branches remain unmerged until equivalence and CI evidence exist.

## Bill Gates operating lens

### Bottleneck

The portfolio bottleneck is not lack of dashboards. It is inconsistent evidence and failing repository gates. The standalone Control Room cannot responsibly automate around CI runs that fail before allocating a runner.

### Leverage

A small machine-readable manifest gives every repository the same minimum management language:

- authority;
- local Control Room surfaces;
- immutable evidence commit;
- current evidence state;
- blockers;
- next gate.

### Standardization

Standardize the contract, not the implementation. Se'kret Bip, L99, storefronts, workbenches, and demos should not be forced into one runtime architecture.

### Scale control

The hub may read sanitized manifests and evidence. It may not inherit production credentials or direct product-database access merely because another repository joins the portfolio.

## Redteam I: premise attack

- A repository existing does not make it active.
- A deployed URL does not prove the intended commit is live.
- A green focused test does not erase a red broad quality gate.
- A local Control Room panel does not make the standalone hub redundant.
- A central dashboard does not become authoritative by displaying more cards.

## Redteam II: plan attack

- Manifests can become stale. Therefore each snapshot carries an immutable commit and observation date.
- Repositories can self-report flattering status. Therefore the hub treats manifests as claims until CI/deployment evidence validates them.
- Central registration can become a secret dump. Therefore connection configs permit identifiers and modes, not credentials.
- A portfolio reasoner can drift into deployment automation. Therefore every material mutation remains a separate approval type with no carry-forward authority.

## Import rule

A repository manifest is eligible for `project_manifests.validation_status = 'valid'` only when:

1. it exists on the repository default branch;
2. its commit is immutable and recorded;
3. it validates against schema version `1.0`;
4. repository-local checks relevant to the change have passed;
5. its evidence state does not exceed the linked proof;
6. it contains no secrets, private user data, or raw product content.
