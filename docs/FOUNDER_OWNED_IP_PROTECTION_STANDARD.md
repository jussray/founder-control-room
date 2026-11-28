# Founder-Owned Intellectual Property Protection Standard

**Status:** Proposed; founder review required  
**Authority:** Founder Control Room (FCR) governance source  
**Applies to:** Juss & Co. standalone products, agents, repositories, integrations, and AI-provider workflows  
**Version:** 1.0

## Governing rule

Juss & Co. retains ownership of intellectual property it owns or validly creates, subject to third-party rights, applicable law, and the actual agreements governing each contribution. Using an AI provider, application, model, SDK, or connected agent does not by itself establish that the provider owns the founder's pre-existing work. This standard does not create legal rights that do not otherwise exist and is not a substitute for reviewing provider terms, employment/contractor assignments, open-source licenses, or other third-party agreements.

**Default:** access is purpose-limited, least-privilege, and revocable. No agent or provider receives broader rights merely because it can technically access material.

## Six mandatory controls

### 1. Ownership and provenance
- Maintain provenance for founder-supplied materials, original code, designs, brand assets, datasets, prompts, workflows, and generated deliverables.
- Preserve repository history, authorship records, licenses, notices, and third-party attributions.
- Do not represent AI output as automatically exclusive, registrable, or free of third-party rights.
- Any assignment or transfer of IP requires a separate, explicit, recorded agreement approved by the founder.

### 2. Explicit licensing and permission boundaries
- Every integration must declare the specific purpose, data categories, operations, duration, and recipient for which access is granted.
- Permission to process data for a requested task is not permission to publish, sell, sublicense, train on, or reuse it for unrelated purposes.
- No implied sublicensing, redistribution, public release, or cross-product reuse.
- Permissions must be revocable where technically and contractually possible; revocation must stop future access and be recorded.

### 3. AI training and provider data use
- Before sending proprietary or confidential material to an AI provider, record the provider, product/plan, applicable terms URL and review date, retention/training settings, data region where known, and approved data classification.
- Prefer enterprise/API or other contractual configurations with suitable data-use commitments for confidential workloads.
- Consumer-plan privacy controls must not be assumed to equal contractual no-training or confidentiality guarantees.
- Do not submit secrets, credentials, regulated personal data, or highly confidential source material to a provider unless an approved, documented data path permits it.
- Provider terms and settings must be re-reviewed when they change; unknown terms or unknown training status mean the data path is not approved for confidential material.

### 4. Confidentiality and data isolation
- Classify data as Public, Internal, Confidential, or Restricted.
- Enforce product, tenant, user, and environment boundaries server-side; do not rely on UI hiding or client-supplied identity.
- Use least-privilege credentials, secret references, encryption in transit and at rest where supported, and auditable access.
- Do not share memory, prompts, files, embeddings, logs, or provider credentials across standalone products unless an explicit, scoped contract authorizes the flow.
- Minimize logs and redact secrets and sensitive content from telemetry and support artifacts.

### 5. Portability, export, and continuity
- Provide documented export paths for founder-owned content and project data in practical, machine-readable formats where feasible.
- Preserve source repositories, canonical assets, schemas, prompts, configuration, and provenance independently of any one model/provider.
- Avoid proprietary dependencies where a portable alternative is practical; document unavoidable lock-in.
- Provider termination or account loss must not silently erase the authoritative source of founder-owned work.

### 6. Auditability and enforcement
- Maintain an integration register with owner, purpose, data classification, provider, permissions, terms review, retention/training posture, and revocation path.
- Record access grants, approvals, exports, permission changes, and consequential provider actions with timestamps and actor identity; never log secret values.
- Fail closed when identity, scope, consent, provider posture, or provenance cannot be verified.
- Run focused automated checks for secret leakage, cross-tenant access, unauthorized outbound data flows, and missing integration metadata.
- Treat tests and checked-in policy as source evidence only. Production claims require exact-head CI, Playwright for browser flows, and provider/runtime readback.

## Required integration record

Each AI or third-party integration must document:
1. System and accountable owner
2. Business purpose and allowed operations
3. Data classifications and fields transmitted
4. Provider, product tier, terms URL, review date, and applicable data-use commitments
5. Training/retention settings and evidence source
6. Credential scope and storage location (reference only, never the value)
7. Tenant/product isolation boundary
8. Export and portability procedure
9. Revocation and incident-response procedure
10. Tests and latest runtime evidence

## Enforcement and rollout

- FCR is the governance registry and review surface; it does not silently become the owner of another standalone product's runtime or credentials.
- Chief AI Machine may inspect, diagnose, and propose. It cannot grant itself permission or execute a write solely from this standard.
- PromptOS may supply versioned policy/method metadata. It cannot independently grant provider access.
- SolContinuity may retain provenance and decision history within its approved scope. It cannot expand access or transfer authority.
- Each standalone product enforces its own server-side boundary and keeps its own data, credentials, and operational authority.
- Adoption proceeds by inventory, threat review, implementation, tests, and independent verification. Existing integrations remain **UNVERIFIED** until evidence is collected; this document alone does not certify them.

## Change control

Changes to this standard require a reviewed pull request and explicit founder approval. No automatic merge, deployment, provider-setting change, data deletion, credential rotation, or publication is authorized by this document.
