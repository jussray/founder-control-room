# Cross-repository MCP stack policy

Last reviewed: 2026-07-14

## Decision rule

A repository receives only the MCP capabilities required by a current, evidence-producing workflow. Do not copy a full stack from another project. Each server must have:

1. a live use case;
2. the smallest practical permission boundary;
3. a verification prompt;
4. a credential-handling rule;
5. an explicit condition for removal or deferral.

The default posture is read-only inspection. Writes, migrations, deployments, merges, destructive actions, production-data access, and temporary escalations require separate founder approval.

## OODA workflow

### Observe

- Identify whether the repository is a live product, operational control plane, framework, prototype, backup, duplicate, or archived migration copy.
- Read its current runtime, data store, deployment target, CI, privacy boundary, and active work.
- Check for an existing `.mcp.json`, `.vscode/mcp.json`, validator, and stack documentation.

### Orient

- Map each real workflow to one capability.
- Prefer official remote servers with OAuth or project-scoped read-only access.
- Treat public repositories, private user data, payment data, vendor intelligence, production logs, and database access as separate trust boundaries.

### Decide

Add a server only when its evidence value exceeds its authority and data-exposure cost. A repository being technically compatible with a server is not a reason to connect it.

### Act

- Create a branch and draft pull request.
- Add project, example, and VS Code configuration where the host formats differ.
- Pin local packages.
- Add a validator that rejects drift, credentials, `@latest`, and unjustified servers.
- Document synthetic-data and production-data rules.
- Require exact-head CI and founder review before merge.

## Capability selection

| Capability | Add when | Do not add when |
| --- | --- | --- |
| GitHub MCP | The repo uses GitHub source, PRs, Actions, or security scanning | Never grant unbounded toolsets or commit a PAT |
| Context7 | Work depends on fast-moving libraries, SDKs, frameworks, or CLIs | Do not send private product/user data; documentation questions only |
| Playwright | There is a browser surface or web-rendered mobile flow worth testing | No frontend, no synthetic test path, or package cannot be pinned and isolated |
| Figma | A live implementation must be compared with source design nodes | No active Figma source-of-truth workflow |
| Supabase MCP | The repo has its own Supabase project and schema/doc inspection is currently useful | Never point one repo at another product's database; default read-only and project-scoped |
| Cloudflare Docs | The repo uses Cloudflare products | Documentation-only questions |
| Cloudflare Builds | The repo owns a Cloudflare deployment needing build evidence | The deployment belongs to another repository |
| Cloudflare Observability | The repo owns a Worker/Pages runtime needing logs or analytics | No owned Cloudflare runtime, or logs would expose raw private data without sanitization |
| DBHub | A bounded direct database investigation cannot be satisfied by the platform-specific scoped tool | Never a standing default; private local read-only configuration with a removal condition only |
| Netdata | The project owns persistent hosts, containers, or a server fleet with Netdata agents | Managed-only infrastructure such as Cloudflare/Supabase, temporary Codespaces, or no claimed nodes |
| GitHub Insiders | A named experimental tool is required for a temporary private session | Never a repository-wide default |
| Docker GitHub MCP | Remote HTTP/OAuth is unavailable or enterprise/local constraints require it | Do not duplicate the hosted GitHub server in the same default stack |

## Current repository classification

### Live products, frameworks, and control planes

- `jussray/Sekret-Bip`: full guarded product stack; app, Supabase, Cloudflare, Figma, Playwright, Context7.
- `jussray/jussbeautifulhair-site`: public storefront stack; GitHub, Context7, narrow Cloudflare evidence, isolated Playwright.
- `jussray/jbh-private`: private admin stack; GitHub, Context7, isolated Playwright; no standing deployment or database MCP.
- `jussray/founder-control-room`: governance/control-plane stack; GitHub, Context7, its own read-only Supabase project, narrow Cloudflare evidence.
- `jussray/chief-ai-machine`: public prototype-SPA stack; GitHub, Context7, isolated Playwright; add deployment/data tools only after a private backend is selected and implemented.
- `jussray/l99-StoryEngine`: public runtime/framework stack; GitHub, Context7, isolated Playwright for synthetic dashboard verification; add Netdata only after persistent monitored hosts exist.

### Inspect on the next material implementation change

- `jussray/untold-stories-storefront`: inspect its actual commerce/runtime architecture before selecting storefront capabilities.

### Do not automatically modify

- `jussray/do-not-use`
- `jussray/promptos` while empty
- `jussray/Se-kretBip`
- `jussray/sekret-bip-demo`
- `jussray/SekretBip_refactor_start`
- duplicate or backup Juss Beautiful Hair repositories unless one is formally promoted as source of truth

These repositories must first be promoted, consolidated, archived, or assigned a current purpose. Adding tool authority to stale copies increases drift and makes agents act on the wrong source of truth.

## Red-team failure modes

Reject a proposed stack when it:

- copies another repo's database project reference;
- adds a broad database server because schema work might happen someday;
- uses `@latest`, unreviewed bridges, or committed bearer headers;
- gives a public frontend direct production database authority;
- sends customer, teen, parent, vendor, payment, journal, voice, safety, or credential data into documentation or model-evaluation tools;
- treats MCP connectivity as release evidence;
- connects multiple tools that provide the same authority without a clear fallback purpose;
- adds monitoring for infrastructure the project does not own;
- changes an obsolete clone rather than the canonical repository.

## Opportunity trigger

When a material PR introduces a new runtime, database, deployment provider, browser surface, design source of truth, or recurring operational investigation, review this policy and add or remove the relevant capability in that same PR or a linked governance PR.
