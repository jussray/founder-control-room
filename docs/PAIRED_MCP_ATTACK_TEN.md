# Paired MCP Attack Ten

Last reviewed: 2026-08-25

This matrix red-teams the external Chief AI + Founder Control Room MCP boundary. `SOURCE VERIFIED` means a repository test or static contract passes at the reviewed commit. It does not mean the provider configuration or deployed runtime has been proven.

| # | Attack | Required defense | Current proof |
| --- | --- | --- | --- |
| 1 | Unauthenticated discovery or tool call | Bearer challenge points to the protected-resource metadata URL; no tool dispatch | SOURCE VERIFIED: missing bearer tests return `401` with `WWW-Authenticate` |
| 2 | Forged, stale, premature, revoked, wrong-audience, or wrong-client token | Validate issuer, audience, client allowlist, `exp`, `nbf`, scope, project claim, current Supabase user, subject match, and founder allowlist | SOURCE VERIFIED: direct verifier tests cover issuer, audience, client, expiry, revocation, scope, and project grants. PROVIDER BLOCKED until OAuth is configured and exercised live |
| 3 | OAuth redirect or client-registration substitution | Canonical HTTPS resource metadata, exact issuer, exact client IDs, PKCE/provider controls | SOURCE VERIFIED for canonical metadata and client allowlist. PROVIDER BLOCKED for registered redirect URIs, PKCE, CIMD/DCR, and consent evidence |
| 4 | Protocol downgrade, request smuggling, or header/body confusion | Bounded JSON body, content type, supported-version allowlist, modern `_meta`, non-null ID, and matching protocol/method/tool headers | SOURCE VERIFIED by modern discovery, mismatch, null-ID, secret-input, and 64 KiB tests; legacy versions expose the same six-tool authority ceiling |
| 5 | Cross-project confused deputy | Intersect token `mcp_projects` with server-held project scope before dispatch; recheck the exact project inside each tool | SOURCE VERIFIED: cross-project call is denied before the data dependency runs |
| 6 | Mutation smuggled through a read/preview tool | No generic external nested invocation; fixed Chief ProofMode route; skill actions limited to inspect/plan/review/draft; execution always false | SOURCE VERIFIED by six-tool catalog, fixed-route, and rejected deploy-action tests |
| 7 | Prompt injection or private skill exfiltration | Treat repository/project text as untrusted data; expose sanitized evidence and route metadata only; never return raw `SKILL.md` content | SOURCE VERIFIED by the fixed response builders and absence of a raw-skill tool. RUNTIME PROOF REQUIRED with adversarial stored rows |
| 8 | Credential, payload, cookie, or device-fingerprint leakage | Reject secret-bearing argument keys recursively; never accept caller credentials; hash evidence inputs/results; no MCP cookies or probabilistic fingerprints | SOURCE VERIFIED by nested-secret rejection, cookie contracts, receipt privacy fields, and bounded payload tests |
| 9 | Success without an audit trail | Persist a redacted `mcp_tool_calls` receipt after every successful read/preview; fail the request closed if persistence is unavailable | SOURCE VERIFIED by evidence-failure test. DATABASE BLOCKED because the live migration ledger does not currently prove the required table |
| 10 | Stale-head, replayed-plan, or registry substitution | Return exact repository SHAs/hashes; bind route preview to full head SHA, registry hash, project, provider, and capability-plan contract; re-prove deployed exact head | SOURCE VERIFIED by FCR routing and paired-repository contracts. DEPLOYMENT BLOCKED until same-SHA Worker, Supabase, ChatGPT, and Claude evidence exists |

## Release rule

Do not call the paired MCP production-ready until every `BLOCKED` or `RUNTIME PROOF REQUIRED` cell has a timestamped, exact-head provider receipt. A source test cannot be promoted into evidence of a deployed OAuth flow, database schema, client connection, or runtime behavior.
