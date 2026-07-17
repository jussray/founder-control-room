# Johnstown Economic Opportunity Intelligence Pilot

**Founder Control Room goal:** #36  
**State:** Proposed  
**Operating mode:** `/truthmode /goal ULTRATHINK ARTIFACTS /billgates`  
**Branch:** `goal/johnstown-economic-opportunity-pilot`

## Decision

Treat the Johnstown work as a full-front portfolio initiative, not a one-off city pitch and not a generic AI dashboard.

The product thesis is:

> Johnstown does not need another directory of programs. It needs an evidence-backed operating layer that connects public investment, eligibility, resident and business needs, application pathways, local market signals, execution status, and measurable outcomes.

The first deliverable is a tightly bounded economic-opportunity intelligence pilot. It must prove one practical workflow before expanding into a citywide platform.

## Founder outcome

Create a demo-ready and procurement-aware system that helps a Johnstown stakeholder answer five questions quickly and truthfully:

1. **Money:** What grants, subsidies, loans, tax incentives, procurement opportunities, and technical-assistance programs are available now?
2. **Access:** Who is eligible, what evidence is required, who decides, and where does the applicant process break down?
3. **Need:** Which resident, business, property, workforce, and neighborhood needs are not matched to an existing pathway?
4. **Opportunity:** Which local and external trends create realistic product, service, workforce, or supplier opportunities for Johnstown?
5. **Proof:** What happened after a referral or investment, and which outcomes can be attributed without exaggeration?

## Reality

- An introductory email has been sent to Johnstown economic-development leadership.
- Founder Control Room is the correct portfolio governance surface, but its `main` branch does not yet contain the full frontend, mission-engine, federated-verification, MCP, Cloudflare-reasoning, or guarded-terminal work currently present in separate draft pull requests.
- Hosted GitHub Actions for this private repository have recently failed before executing runner steps. A green-looking workflow state without steps, logs, or exact-head evidence is not proof.
- The current task therefore starts as a proposed goal, research program, and artifact package on an isolated branch. It does not claim a deployed application, live city partnership, approved funding, production database, or operating contract.

## Red Team I: attack the premise

### Failure mode: “AI can fix subsidy distribution.”

That is too broad and politically loaded. The pilot cannot infer misuse, unfairness, waste, or administrative failure from fragmented public information. It can map programs, rules, pathways, timing, observable friction, and reported outcomes. Claims about allocation quality require source-level evidence and stakeholder validation.

### Failure mode: “One dashboard creates economic development.”

A dashboard without ownership, update cadence, data provenance, and a workflow after discovery becomes decorative software. Every screen must support a decision or action, identify its responsible party, and capture the next state.

### Failure mode: “More opportunities means more successful applicants.”

Discovery is only one constraint. Applicants may lack documents, matching funds, time, transportation, technical language, legal standing, credit, procurement readiness, or follow-through. The system must expose the actual bottleneck rather than celebrating search results.

### Failure mode: “The city is the only customer.”

The usable market may include economic-development staff, business owners, nonprofits, property owners, workforce organizations, schools, lenders, consultants, anchor employers, and residents. Product architecture should permit multiple buyers and users without sharing restricted data across roles.

### Failure mode: “Trend scanning becomes speculative idea generation.”

Trend outputs must be tied to evidence, local fit, time horizon, capital intensity, buyer, incumbent alternatives, execution requirements, and a falsifiable signal. Ideas without these fields remain hypotheses, not recommendations.

## Lindy screen

Prefer durable mechanisms:

- source records with publication and effective dates;
- explicit eligibility rules instead of opaque model scores;
- human-readable checklists and decision logs;
- stable program identifiers and version history;
- auditable referrals instead of untraceable recommendations;
- reversible pilots instead of citywide commitments;
- CSV, JSON, and documented APIs instead of platform lock-in;
- role separation, least privilege, and append-only evidence;
- one accountable owner per workflow stage;
- measurable service-level and outcome metrics.

## L99 system view

```text
Public sources and verified partner data
        ↓
Source registry and provenance ledger
        ↓
Program, funding, eligibility, deadline, and decision-owner model
        ↓
Applicant or business need profile
        ↓
Deterministic eligibility and readiness checks
        ↓
Opportunity ranking with explainable factors
        ↓
Human review and referral
        ↓
Application / assistance / procurement workflow
        ↓
Outcome and bottleneck evidence
        ↓
Trend and portfolio learning loop
        ↓
Founder and stakeholder decision
```

### Authority boundaries

| Action | Authority |
|---|---|
| Read and cite public sources | Allowed during approved research |
| Draft hypotheses, schemas, screens, and artifacts | Allowed on isolated branch |
| Contact external stakeholders | Separate founder approval per communication |
| Create or change a production database | Separate founder approval |
| Access confidential applicant or city data | Contract, legal basis, data-minimization review, and separate approval |
| Merge to `main` | Separate founder approval with exact-head proof |
| Deploy to Cloudflare or another host | Separate founder approval |
| Change DNS, domain, billing, or credentials | Separate founder approval |
| Purchase data or services | Separate founder approval |
| Make automated eligibility or funding decisions | Out of scope for the pilot |

No approval carries forward.

## Bill Gates platform lens

The leverage is not the first dashboard. The leverage is a reusable economic-opportunity operating standard that can serve multiple cities, programs, and portfolio products.

### Standardize the nouns

- jurisdiction
- organization
- stakeholder
- program
- funding source
- funding round
- benefit type
- eligibility rule
- required evidence
- application step
- decision owner
- deadline
- geographic boundary
- business need
- resident need
- opportunity hypothesis
- trend signal
- referral
- assistance interaction
- application
- award
- procurement event
- outcome
- source record
- artifact
- approval
- audit event

### Standardize the proof

Every important claim should be able to answer:

- What source supports it?
- When was that source published, updated, or effective?
- Is the record current, expired, proposed, or historical?
- Who owns the decision?
- Which geography and population does it cover?
- What eligibility rule is explicit versus inferred?
- What action followed?
- What outcome was observed?
- What remains unknown?

### Build the feedback loop

```text
verified funding and market signals
→ matched needs
→ prioritized opportunity
→ assisted action
→ measured bottleneck or outcome
→ improved rules and product design
→ stronger next intervention
```

That loop is the moat. A static list is not.

## Full-front product surfaces

### 1. Founder Command Center

Purpose: portfolio-level truth, phase status, evidence freshness, blockers, approvals, costs, and next decisions.

Core views:

- mission scorecard;
- artifact ledger;
- source freshness and confidence;
- workstream dependencies;
- risk and approval gates;
- stakeholder engagement timeline;
- pilot readiness;
- product opportunity portfolio.

### 2. Funding and Subsidy Explorer

Purpose: make programs understandable and actionable.

Core capabilities:

- search and filters by geography, applicant type, use of funds, benefit type, status, deadline, and readiness;
- plain-language program summaries linked to authoritative sources;
- explicit eligibility rules;
- required-document checklist;
- responsible agency and contact role;
- source freshness and update history;
- related technical assistance and prerequisite programs.

### 3. Opportunity Match

Purpose: connect a business, organization, property, project, or resident need to plausible programs and assistance.

Pilot constraint: matching is advisory and explainable. It does not approve, deny, or guarantee eligibility.

### 4. Application Readiness and Referral Router

Purpose: identify the next missing requirement and route the user to the correct human or service.

Possible states:

- discovery;
- potentially eligible;
- missing evidence;
- needs technical assistance;
- ready to apply;
- submitted;
- under review;
- awarded;
- declined;
- withdrawn;
- expired;
- outcome follow-up.

### 5. Local Trend and White-Space Scanner

Purpose: convert external and local signals into bounded product hypotheses.

Each hypothesis must include:

- signal and source;
- local problem or demand;
- likely buyer and user;
- incumbent alternative;
- why now;
- capital and capability requirements;
- time to first proof;
- public-funding fit;
- portfolio-product fit;
- risks and disconfirming evidence;
- next cheapest test.

### 6. Outcome and Bottleneck Ledger

Purpose: show whether referrals and investments progressed and where they stopped.

The pilot should prefer operational metrics over inflated impact claims:

- programs verified;
- records stale or unresolved;
- users routed;
- readiness gaps identified;
- referrals accepted;
- applications initiated;
- applications completed;
- time to next action;
- technical-assistance hours;
- awards reported by a verified source;
- private capital or matching funds reported;
- jobs or revenue only when source and attribution are explicit.

## Portfolio product alignment

The mission must evaluate where existing portfolio capabilities can be reused without forcing every product into the pitch.

| Portfolio capability | Potential role | Required proof |
|---|---|---|
| Se’kret Bip coordination and assistance patterns | guided intake, next-action support, accessible explanations | privacy, user testing, bounded domain behavior |
| Founder Control Room | mission, evidence, approval, artifact, provider, and release governance | exact-head verification and operational readiness |
| PromptOS | reusable research, red-team, stakeholder, and reporting workflows | versioning, provenance, evaluation |
| L99 / StoryEngine capabilities | narrative and communication artifacts where appropriate | separation from factual source-of-truth records |
| Chief AI Machine / agent orchestration | research and synthesis behind approval gates | cost controls, source constraints, auditability |
| Juss Beautiful Hair and commerce work | local merchant and product-market test patterns | separate catalog, customer, financial, and brand boundaries |

No private consumer data, teen data, journals, voice, parent visibility, customer records, or unrelated product data may enter this pilot.

## Prioritization model

Score candidate pilot workflows from 0 to 5 on:

1. verified need;
2. number of affected users or transactions;
3. severity of current friction;
4. source availability;
5. ability to produce a useful next action;
6. time to first proof;
7. implementation cost;
8. legal and privacy complexity;
9. stakeholder ownership;
10. repeatability in other jurisdictions;
11. portfolio reuse;
12. measurable outcome.

The first pilot should maximize evidence, actionability, and learning while minimizing confidential data, policy discretion, integration burden, and procurement complexity.

## Candidate first pilots

### Candidate A: Small-business funding readiness

Guide an owner from business need to relevant programs, document readiness, technical assistance, and next contact.

### Candidate B: Property and corridor improvement pathway

Connect property or storefront needs to façade, rehabilitation, code, demolition, redevelopment, energy, and financing pathways.

### Candidate C: Local procurement opportunity navigator

Help small businesses identify public and anchor-institution purchasing opportunities and readiness requirements.

### Candidate D: Youth and workforce pathway navigator

Map training, credential, apprenticeship, employer, supportive-service, and funding pathways without storing sensitive youth records in the pilot.

### Candidate E: Funding portfolio intelligence for administrators

Track program inventory, deadlines, utilization, overlap, source freshness, assistance demand, and reported outcomes.

The selection remains open until source and stakeholder evidence are scored.

## Full-front phases

### Phase 0: Truth foundation

Artifacts:

- source and citation standard;
- public funding inventory;
- stakeholder map;
- terminology and status model;
- claims ledger;
- data-risk classification;
- assumptions and unknowns register.

Exit proof:

- authoritative source links captured;
- dates and geographic scopes verified;
- expired and proposed programs separated from active programs;
- no unsupported allocation or impact claims;
- first pilot candidates scored.

### Phase 1: Opportunity intelligence

Artifacts:

- money-flow and program map;
- applicant journey maps;
- bottleneck taxonomy;
- local trend signal brief;
- white-space opportunity portfolio;
- recommended first pilot and rejected alternatives.

Exit proof:

- one workflow has a verified user, owner, need, action, data source, and measurable outcome;
- red-team review identifies why the workflow may fail;
- stakeholder validation questions are ready.

### Phase 2: Product contract

Artifacts:

- product requirements document;
- user and role model;
- service blueprint;
- domain model;
- API and integration boundaries;
- privacy and security model;
- analytics and success-metric specification;
- accessibility requirements;
- demo script.

Exit proof:

- smallest useful pilot is defined;
- non-goals are explicit;
- no automated benefit determination;
- data minimization and retention are defined;
- acceptance tests are testable.

### Phase 3: Data and Control Room plane

Artifacts:

- project registration proposal;
- separate Supabase architecture decision;
- schema and RLS proposal;
- source ingestion and deduplication contract;
- mission, artifact, approval, and evidence contracts;
- cost and rate-limit controls;
- rollback plan.

Exit proof:

- schema supports multiple jurisdictions and programs;
- exposed tables have reviewed RLS;
- privileged operations are server-side;
- no service-role secret reaches a public client;
- production mutation remains separately approved.

### Phase 4: Experience and executive artifacts

Artifacts:

- Figma prototype;
- design system subset;
- clickable critical path;
- Canva executive deck;
- one-page leave-behind;
- economic opportunity map;
- pilot scorecard;
- stakeholder FAQ.

Exit proof:

- prototype covers the selected workflow end to end;
- source provenance is visible;
- accessibility and plain-language review completed;
- deck claims match the evidence ledger;
- mockups are clearly labeled as prototypes.

### Phase 5: Build and integration

Artifacts:

- isolated implementation branch;
- reviewed migrations;
- source ingestion worker;
- matching and readiness logic;
- role-protected interfaces;
- audit events;
- unit, integration, browser, and security tests;
- exact-head machine evidence.

Exit proof:

- required checks execute on the exact candidate commit;
- failures, skips, and missing runners are visible;
- no confidential production data is required for the demo;
- merge gate remains separate.

### Phase 6: Pilot readiness

Artifacts:

- deployment architecture;
- Cloudflare bindings and route plan;
- environment and secret inventory;
- security and privacy review;
- data-quality report;
- disaster and rollback procedure;
- operator runbook;
- live demo and fallback demo;
- stakeholder pilot proposal.

Exit proof:

- deployment has its own approval;
- runtime health and expected commit are verified;
- rollback is tested or explicitly untested;
- success metrics, owner, duration, and exit conditions are defined;
- no broad citywide claim exceeds pilot evidence.

## Red Team II: attack the selected plan

### Risk: premature multi-surface build

Mitigation: design the shared nouns and proof contract, but implement only one end-to-end workflow first.

### Risk: data freshness burden

Mitigation: source records require owner, retrieval date, effective date, next review date, and freshness status. The UI must surface stale records rather than silently serving them.

### Risk: ambiguous government terminology

Mitigation: retain authoritative program language, add plain-language explanations separately, and record the source passage and interpretation.

### Risk: confidential application data expands the trust boundary

Mitigation: the first demo uses public and synthetic data. Any real applicant data requires a new privacy, contract, retention, security, and access-control decision.

### Risk: AI hallucination changes eligibility guidance

Mitigation: deterministic rules and source-linked summaries are authoritative. Generative outputs may explain or draft, but cannot create eligibility criteria or hide source conflicts.

### Risk: vendor lock-in

Mitigation: provider adapters, portable schemas, exportable artifacts, and separate deployment/data boundaries.

### Risk: impressive prototype with no operator

Mitigation: every workflow names the responsible role, expected response time, escalation, and terminal state.

### Risk: the initiative absorbs all portfolio focus

Mitigation: Founder Control Room tracks explicit phase gates, budget, time allocation, dependencies, and stop conditions. Work pauses when the next proof requires stakeholder access or separate founder authority.

## Stop conditions

Pause and reorient if any of the following occurs:

- no stakeholder owns the selected workflow;
- authoritative data cannot be maintained at acceptable cost;
- the workflow requires automated eligibility or benefit decisions;
- real value depends on confidential data unavailable under a proper agreement;
- the selected pilot duplicates a functioning system without a measurable improvement;
- the city or target partner identifies a higher-value problem that invalidates the current priority;
- expected operating cost exceeds the approved budget;
- legal, procurement, privacy, or security constraints make the pilot disproportionate.

## Proof report required for every completed phase

1. Reality inspected
2. Files and external artifacts created
3. Behavior or decision changed
4. Sources and evidence
5. Tests and reviews performed
6. Failures, skips, stale evidence, and unknowns
7. Security and privacy impact
8. Provider and cost impact
9. Rollback or deletion path
10. Unresolved risk
11. Next founder approval gate

## Immediate next actions

1. Build the verified Johnstown funding and subsidy source register.
2. Map stakeholders and applicant journeys.
3. Score the five candidate pilots.
4. Define the first product contract.
5. Produce the first Figma flow and Canva executive narrative only after the evidence base is sufficient.

## Current next approval gate

This branch may proceed through research, documentation, schema design, and prototype creation. Production database mutation, merge, deployment, DNS, credentials, paid services, and additional external communication remain separately gated.