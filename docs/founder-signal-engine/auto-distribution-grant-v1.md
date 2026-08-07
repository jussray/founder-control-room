# Founder Signal Engine automatic distribution grant v1

## REALITY

The remote MCP bridge originally accepted publication and sending only when an invocation carried a `founderApprovalId`, while the deployed write-gate middleware blocked every publish, send, and HubSpot mutation before the bridge could run. Caller-supplied approval-looking text was never a trustworthy standing authorization mechanism.

The runtime gate now has a bounded standing-policy path. It still fails closed unless a server-held grant, exact-commit trusted evidence, complete 5W1H context, route scope, and recipient scope all pass.

## APPROVED OUTCOME

A verified build event may automatically become:

- a LinkedIn, Facebook, or Instagram progress post;
- a HubSpot-linked investor email to an explicitly approved potential investor;
- an auditable Founder Control Room decision.

## GRANT MODEL

A standing automation grant is:

- **scoped** to every repository owned by `jussray` by default through `repositoryScope.mode: all_owned`; an explicit repository list is only a deliberate narrowing, never the portfolio default;
- **route-scoped** to explicit channel and audience combinations rather than independent lists;
- **recipient-scoped** to approved CRM contact IDs for investor email;
- **revocable** by setting `enabled` to `false`;
- **expirable** with `expiresAt`;
- **proof-gated** by a trusted GitHub or Cloudflare receipt bound to the repository, exact commit SHA, and proof URL;
- **5W1H-gated** before distribution;
- **recipient-specific** for investor email.

The policy returns one of three decisions:

| Decision | Meaning |
|---|---|
| `auto-distribute` | The event is inside the founder-approved scope and all proof/context gates pass. |
| `review-only` | The route is valid, but evidence or message context is incomplete. Do not send. |
| `blocked` | The grant is disabled, expired, outside scope, mismatched, or targets an unapproved investor recipient. |

## RUNTIME AUTHORIZATION

The deployed MCP endpoint evaluates write actions in `founderSignalEngineWriteGate.ts` before the existing bridge handler runs.

For every `publish_or_send` action or HubSpot mutation, the gate:

1. rejects caller-supplied `founderApprovalId` text;
2. loads `FOUNDER_SIGNAL_AUTOMATION_GRANT_JSON` from the Worker secret store;
3. accepts an `automationCandidate` containing the channel, audience, proof URL, 5W1H fields, and optional CRM recipient fields;
4. resolves evidence from signed, passing `repository_verification_runs` records at the exact repository and commit;
5. requires the proof URL to match a retained runner or check details URL;
6. calls `evaluateFounderSignalAutomation`;
7. writes the policy decision to `project_events` before any downstream provider call;
8. mints a one-invocation internal authorization receipt only for `auto-distribute` decisions.

The caller cannot supply an `evidenceReceipt`. That field is rejected rather than trusted.

## WORKER GRANT SECRET

`FOUNDER_SIGNAL_AUTOMATION_GRANT_JSON` uses this shape:

```json
{
  "id": "founder-approved-auto-distribution-v1",
  "enabled": true,
  "routes": [
    { "channel": "linkedin", "audienceSegment": "build-in-public" },
    { "channel": "facebook", "audienceSegment": "build-in-public" },
    { "channel": "instagram", "audienceSegment": "build-in-public" },
    { "channel": "gmail", "audienceSegment": "preapproved-potential-investors" }
  ],
  "repositories": [],
  "repositoryScope": { "mode": "all_owned", "owner": "jussray" },
  "approvedRecipientIds": [],
  "expiresAt": null
}
```

Keep `approvedRecipientIds` empty until each HubSpot contact has been deliberately qualified and approved. Social distribution can be activated independently of investor email.

## INVESTOR EMAIL RULE

Automatic investor email is allowed only when all shared proof and 5W1H gates pass **and**:

1. Gmail plus the investor audience segment is an explicitly approved route;
2. the CRM recipient ID appears in the standing grant's approved recipient list;
3. the message contains a recipient-specific reason the investor should care.

A self-labeled segment, generic scraped list, arbitrary contact ID, or missing recipient thesis must never auto-send. It becomes `review-only` or `blocked`.

## SOCIAL RULE

Build-in-public posts may auto-distribute only through an explicitly approved social-channel plus build-in-public route. Repository coverage is portfolio-wide: every `jussray` repository can produce a proof signal, including repositories created or launched later. Repository visibility, sensitive-data flags, and missing public proof change the output mode or hold state; they do not silently remove the repository from observation. The evidence receipt must be verified by a trusted provider and match the candidate repository, commit, and proof URL. The Zapier layer remains responsible for channel formatting, duplicate prevention, scheduling, and retaining the final Buffer or platform receipt.

## REMAINING PROOF GATE

Merging the runtime integration does not prove that production distribution is active. Activation still requires:

- the Worker grant secret to be configured;
- the current deployment to contain this exact commit;
- a passing signed repository verification record with an exact proof URL;
- one controlled social invocation with a retained Zapier and platform receipt;
- separate recipient-level qualification before any investor email test.

Until those receipts exist, report the system as **wired but not live-proven**.

## ROLLBACK

Set the configured grant's `enabled` field to `false` or remove the Worker secret. The gate then blocks downstream distribution before any provider call.
