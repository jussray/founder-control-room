# Provider Receipt Audit — external-truth workflow

Purpose: turn repo claims into evidence-backed operating truth by corroborating GitHub state with provider-origin receipts from the founder's connected email.

## Trigger
Use when asked to verify what is actually live, active, deployed, billed, connected, published, delivered, or blocked across projects.

## Window
Default to the requested time window. If the founder says "a month ago to today", resolve explicit start/end dates before searching.

## Work order
1. Read authoritative GitHub state first: repository, default branch, current main HEAD, relevant recent commits/PRs/workflows.
2. Search connected email across the same window for provider-origin evidence tied to the project/domain/service.
3. Separate evidence classes. Never flatten them together.
4. Reconcile provider evidence against the current repo HEAD and claim only the strongest truth both sources support.
5. Emit pain point + smallest reversible fix + proof gate.

## Evidence classes
- PROVIDER_VERIFIED: originated from the external provider that owns the claimed event (for example Cloudflare certificate/deploy notice, Stripe account requirement, Shopify connection state, LinkedIn publication/analytics receipt, Zapier run receipt).
- REPO_VERIFIED: read directly from current GitHub state, CI, artifact, commit, PR, or workflow.
- MONITORING_ONLY: internal/ChatGPT/task-update email. Useful for chronology, never independent proof of the provider event it describes.
- INFERRED: conclusion supported by evidence but not directly observed.
- UNKNOWN: lookup failed, provider receipt absent, coverage incomplete, or current exact-head evidence was not read. A null lookup is never proof of absence.
- BLOCKED: a named dependency prevents valid verification.

## Receipt identity
Whenever possible bind a receipt to: project/repo + provider + event type + timestamp + immutable provider/run/deploy/publication ID + commit SHA/domain/account identifier.
A receipt that cannot be tied to the claimed project/event is context, not proof.

## Freshness rule
Historical provider proof does not prove the newest main HEAD. If main advanced after the receipt, say exactly what remains unproved.

## Required output
REALITY: current evidence-backed state.
PAIN: exact gap between code and outside-world proof.
FIX: one smallest reversible action.
PROOF: exact receipt/test/runtime evidence required to call the fix complete.
RISK: remaining uncertainty.
ROLLBACK: safe reversal.
NEXT GATE: one founder decision/action.

## Product behavior
Founder Control Room should model each project as a proof chain:
code/merge -> CI -> deploy -> provider receipt -> customer/public outcome -> founder receipt.
Show the first missing link as the active pain point. Do not show downstream stages as green when an upstream link is UNKNOWN/BLOCKED.

## Safety gates
- No production claim from code alone.
- No publication claim from a Buffer/Zapier enqueue alone; require the destination platform/public URL receipt.
- No delivery claim from a send request alone; require provider delivery state when available.
- No account-active claim from marketing email alone.
- No deletion or production mutation as part of an audit.
- UI/runtime completion requires Playwright proof before merge.
