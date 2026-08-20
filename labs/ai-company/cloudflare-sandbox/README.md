# FCR Cloudflare Sandbox substrate

This is an optional Cloudflare-backed sibling to `labs/ai-company/process-sandbox/`.

The existing local Docker sandbox remains the deterministic isolation proof. This subproject proves that the same zero-ambient-authority posture can be carried onto Cloudflare Sandbox/Containers without changing the current FCR production Worker.

## Current authority

- Cloudflare Sandbox exists as an isolated runtime substrate only.
- Generic `/v1/exec` is deliberately blocked with `execution_authority_not_wired`.
- The only executable path is an authenticated fixed `/v1/probe` used to prove the Sandbox can start, run a fixed Node command, return bounded output, and be destroyed.
- No FCR route, service binding, project adapter, terminal route, L99 capability, or user request currently invokes this Worker.

## Isolation floor

- Workers Paid / Containers are required before provider activation.
- `workers_dev` is disabled and no custom route is declared.
- `max_instances` is 1.
- public internet egress starts disabled with `enableInternet = false`.
- no Supabase, GitHub, OpenAI, Cloudflare provider, or other portfolio credential is passed into the Sandbox container.
- output and runtime are bounded.
- every probe destroys its Sandbox afterward.

## Proof

```bash
npm install
npm run check
```

The repository workflow performs a Wrangler container dry-run only. It does not deploy the Worker or create a live Container.

## Next authority gate

Do not enable generic execution or wire this Worker into FCR until the current L99/approval contract provides a verifiable exact execution envelope. At that point, the caller must prove the approved target, operation, exact source/release identity, expiry, and founder-required authority before the Sandbox is allocated.

Long-lived credentials must remain in the trusted Worker runtime. If future sandboxed code needs outbound provider access, use explicit outbound handlers rather than injecting secrets into the container.
