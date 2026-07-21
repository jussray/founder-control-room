# Storefront CI Budget-Mode Head Refresh

## Context

The three storefront mission PR branches were patched to reduce GitHub Actions minute burn without removing the proof that matters.

The patch moved repeated heavy work into one exact-head proof path per storefront and kept browser/Product Design proof in the required path. It did not merge, deploy, expose private source, copy private repository contents into Founder Control Room, access secrets, change pricing, authorize checkout, or create customer/vendor data access.

## New storefront heads

| Mission | Repository PR | Previous expected head | New PR head |
| --- | --- | --- | --- |
| `ae933e98-ec1d-4a94-b9de-804c4fa78ab8` | `jussray/jbh-private#9` | `a77bdcd4314eb9753da6354ffd35d17df5ba6927` | `94ce1b365e38718b1a8372759d6f94909cbf08de` |
| `887083a2-e347-4b5f-9f11-758117752c46` | `jussray/jussbeautifulhair-site#18` | `9444483d63d1d10823b80323f3b4c796b444be0c` | `698fe6298eb6b30d0c803fac3970690644ccbc1e` |
| `07e07483-cb88-4ac5-9952-32fbb051f8d5` | `jussray/untold-stories-storefront#17` | `eb23d6e364a483b28e0ea8d6577d050b293b9930` | `d534a2f2fa75e7a8bfa5ffe26a814cf4e9decb18` |

## What the migration is allowed to do

The companion migration updates only `public.missions.policy_snapshot.expectedHeadSha` for the three sandboxed storefront missions.

It is guarded by:

- mission ID;
- repository name;
- pull request number;
- branch `codex/blend-brand-moat`;
- current status `sandboxed`;
- previous expected head SHA;
- exact row count of `3`.

## What remains blocked

The refresh does not create proof. These remain required after the migration is reviewed, merged, and applied:

- exact-head GitHub jobs or reviewed guarded terminal rows;
- `artifact_provenance`;
- typecheck proof;
- lint/unit proof where required;
- integration/security proof;
- desktop and mobile Playwright browser proof;
- negative cross-catalog assertions;
- MissionController transition from `sandboxed` to `in_review`;
- founder merge gate;
- expected-head squash merge.

## Commercial boundary

This refresh does not authorize deployment, pricing, outreach, spending, checkout, refunds, customer communication, customer data access, vendor data access, or production secrets access.
