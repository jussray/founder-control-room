# Cloudflare tunnel flow map: DRAFT, NOT APPLIED

Status: plan only. Nothing in this document has been applied. No tunnel was created. No DNS record, Cloudflare Access app, Worker route, or custom domain was changed.

## Authority

- Cloudflare owns live DNS, Access, route, and tunnel state. Repo docs do not.
- This document cannot authorize or prove a DNS, Access, route, tunnel, credential, or deployment change. See `docs/CLOUDFLARE_REASONING.md`.
- Live hostname and proxy state stays `UNKNOWN` until the manual `Cloudflare Worker Git Authority Audit` runs successfully against an exact, current `main` SHA. Do not infer live state from this file.
- Canonical hostnames already in the repo: the `CNAME` file names `foundercontrolroom.org`, and `SITES.md` names `www.foundercontrolroom.org` as the public domain. This document does not override either.

## Rule

- A tunnel is for origins you run yourself: a dev server, a home machine, or a private service.
- Worker-hosted and Pages-hosted hostnames get NO tunnel record.
- A proxied CNAME to `<TUNNEL_UUID>.cfargotunnel.com` on a hostname that a Worker already serves conflicts with that Worker.

## Scope of this public document

This repository is publicly readable. It therefore carries only the rules, the config template, the verification plan, and the public front doors below. Unlaunched, unclear, or unmapped hostnames and the current front-door access posture are deliberately excluded. They are tracked in the private working draft, not here.

## Public front doors (name match only, unverified)

| Hostname | Product | Likely host (name match, unverified) | Tunnel record | Live state |
|---|---|---|---|---|
| foundercontrolroom.org (and www) | Founder Control Room | Worker or Pages, route binding unknown | No | UNKNOWN until audit |
| app.sekretbip.net | Se'kret Bip | `bip` Worker, route binding unknown | No | UNKNOWN until audit. Front-door access is under active work (#485, #925). Do not change routes here. |
| jussbeautifulhair.com | Juss Beautiful Hair | `jussbeautifulhair-site` Worker, route binding unknown | No | UNKNOWN until audit |

## Config template (NOT for apply)

```yaml
tunnel: <TUNNEL_UUID>                  # create the tunnel in the dashboard first; not created here
credentials-file: /etc/cloudflared/<TUNNEL_UUID>.json
ingress:
  # Private origins only. None of the public front doors above qualifies.
  # - hostname: <private-host>
  #   service: http://localhost:<PORT>   # PORT not yet known
  - service: http_status:404             # catch-all, must stay last
```

Validate: `cloudflared tunnel ingress validate`
Test one URL against the rules: `cloudflared tunnel ingress rule <url>`

## Verification plan (run only after authority is granted)

1. Live inventory: run the manual `Cloudflare Worker Git Authority Audit` against an exact current `main` SHA. Record its receipt. Do not treat this document as the receipt.
2. Per hostname: `curl -I https://<host>/`. Record status, server header, and `cf-ray`.
3. Browser: a Playwright load of each public front door, with a trace or screenshot. Required before any hostname is called live. Use the repo's `playwright-proof` skill.
4. Tunnel rules, if any: `cloudflared tunnel ingress validate`, then `cloudflared tunnel ingress rule https://<host>/` against each private rule.

## Blockers

1. No live route-binding readout exists in this document. The audit or a dashboard export is required.
2. No tunnel, DNS, or Access write authority is granted to this document or to the session that produced it.
3. The private working draft contains entries that are unlaunched or unclear. They are not mapped here.

## Rollback

Nothing applied, so there is nothing to roll back. If a change is applied later under separate authority: remove the ingress rule, delete the proxied CNAME for that host, and restore any Worker route that changed.

## Next gate

Founder decisions, in order:

1. Confirm the public and private split of hostnames.
2. Name any origin that is not a Worker or Pages site. If there are none, the tunnel config stays empty by design.
3. Authorize any provider action separately. Merging this document is a separate decision.
