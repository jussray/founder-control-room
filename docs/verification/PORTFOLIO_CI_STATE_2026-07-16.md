# Portfolio CI state — 2026-07-16

## Executive state

The active portfolio is not one giant red build. Four canonical repositories have exact executable green proof. Three private repositories remain blocked by GitHub-hosted runner provisioning, and one of those also has a focused source-repair draft.

The machine-readable companion artifact is:

```text
artifacts/portfolio-ci-state-2026-07-16.json
```

## Decision standard

A repository is **verified** only when repository-owned checks execute at one exact commit and pass. A GitHub job that finishes with `steps: null` and no logs is classified as **runner not provisioned**. It is neither passing evidence nor a source-code failure diagnosis.

External scanners do not replace Typecheck, tests, builds, migrations, or runtime proof. Optional external gates must skip cleanly when they are not configured.

## Current matrix

| Repository | Current state | Last exact executable proof | Next action |
| --- | --- | --- | --- |
| `jussray/Sekret-Bip` | Verified | PR #455 head passed Type Check, Quality Gate, Regression Tests, Pre-Push, CI/export, and Playwright | Continue physical-device and launch-policy proof separately |
| `jussray/jussbeautifulhair-site` | Verified | PR #14 head passed Quality Gate, Security Build, and deployment-boundary checks; PR #16 then added required MCP validation to that workflow | Keep checkout/Worker deployment evidence current |
| `jussray/chief-ai-machine` | Verified | PR #14 head passed Typecheck, Lint, Unit Tests, and browser prompt-library smoke | Keep server-side private execution declared planned until implemented |
| `jussray/l99-StoryEngine` | Verified | PR #24 head passed L99 Promotion Gates | Preserve real gate implementation; do not accept no-op green scripts |
| `jussray/untold-stories-storefront` | Blocked: private runner | Repository-side workflow/manifest/evidence repair merged in PR #15; rerun still returned `steps: null` | Resolve issue #13, commit a reviewed lockfile, then pass Typecheck + Production Build at one commit |
| `jussray/jbh-private` | Blocked: private runner | MCP verification was added to the locked private build in PR #7; rerun still returned `steps: null` | Resolve issue #6; keep payment/security PR #4 draft until full exact-head proof |
| `jussray/founder-control-room` | Repair draft + private runner blocker | Runtime and CI baseline fixes are isolated in draft PR #30; rerun still returned `steps: null` | Synchronize lockfile, resolve issue #22, then pass mandatory checks before promotion |

## Repairs completed in this pass

### Untold Stories

- removed mandatory jobs for scripts that do not exist;
- made Typecheck and Hydrogen Production Build the real required signals;
- added MCP verification;
- made Sonar credential-aware and pinned;
- added a Control Room manifest and dated runner artifact;
- merged PR #15 without changing storefront runtime.

### Juss Beautiful Hair private admin

- added MCP validation before typecheck/build;
- preserved lockfile-backed `npm ci`;
- added a dated runner artifact and issue #6;
- merged PR #7 without touching the payment Worker or private business records.

### Founder Control Room

Draft PR #30 now contains:

- missing middleware dependency declarations;
- exclusive controller lease repair;
- provider-event retry update repair;
- verified raw-webhook parsing and bounded lookup failure handling;
- forward database-function hardening;
- mandatory MCP verification;
- credential-aware Qodo/Sonar gates;
- a dated promotion checklist.

PR #30 remains draft because its package lock is not yet synchronized and private runners are not provisioning. This is an intentional stop condition, not unfinished reasoning.

## External runner blocker

The repeated private-repository failure pattern is identical:

- workflow run exists;
- jobs immediately become `completed` / `failure`;
- `steps: null`;
- no checkout or setup step;
- no logs.

Repositories and tracking issues:

- Founder Control Room: issue #22
- Untold Stories: issue #13
- Juss Beautiful Hair private admin: issue #6

Account/repository controls to inspect:

1. repository **Settings → Actions → General**;
2. whether GitHub-hosted runners are allowed;
3. private-repository Actions quota and spending controls;
4. payment-method state;
5. workflow approval requirements.

The connected repository tool can rerun jobs and inspect evidence but cannot modify GitHub billing or hosted-runner policy. That boundary remains human-controlled.

## Red-team stop conditions

Do not:

- mark `steps: null` as green;
- make a private repository public to obtain runner capacity;
- remove tests or builds to manufacture a passing badge;
- merge large security/runtime branches because their code looks plausible;
- treat optional vendor scanners as core repository truth;
- let one repository's approval authorize another repository's branch, merge, deployment, or migration.

## Next OODA cycle

1. Correct private Actions account/repository settings.
2. Re-run one small exact-head workflow in each blocked private repo.
3. Confirm real steps and logs appear.
4. Close only the infrastructure issue whose mandatory repository-owned signals pass.
5. Synchronize Founder Control Room's package lock and re-evaluate PR #30.
6. Keep the portfolio JSON artifact updated when any status changes.
