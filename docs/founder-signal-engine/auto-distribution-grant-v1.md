# Founder Signal Engine automatic distribution grant v1

## REALITY

The remote MCP bridge supports publication and sending only when each invocation carries a `founderApprovalId`. That is safe for review-mode operation, but it cannot represent Juss's standing approval for automatic build-in-public posts and qualified investor outreach.

This slice adds the reusable policy contract that the Zapier bridge must call before any automatic distribution.

## APPROVED OUTCOME

A verified build event may automatically become:

- a LinkedIn, Facebook, or Instagram progress post;
- a HubSpot-linked investor email to an explicitly approved potential investor;
- an auditable Founder Control Room decision.

## GRANT MODEL

A standing automation grant is:

- **scoped** to named repositories;
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
| `blocked` | The grant is disabled, expired, outside scope, or targets an unapproved investor recipient. |

## INVESTOR EMAIL RULE

Automatic investor email is allowed only when all shared proof and 5W1H gates pass **and**:

1. Gmail plus the investor audience segment is an explicitly approved route;
2. the CRM recipient ID appears in the standing grant's approved recipient list;
3. the message contains a recipient-specific reason the investor should care.

A self-labeled segment, generic scraped list, arbitrary contact ID, or missing recipient thesis must never auto-send. It becomes `review-only` or `blocked`.

## SOCIAL RULE

Build-in-public posts may auto-distribute only through an explicitly approved social-channel plus build-in-public route. The evidence receipt must be verified by a trusted provider and match the candidate repository, commit, and proof URL. The Zapier layer remains responsible for channel formatting, duplicate prevention, scheduling, and retaining the final Buffer or platform receipt.

## INTEGRATION GATE

The next focused patch must call `evaluateFounderSignalAutomation` from the remote MCP/Zapier invocation path and persist:

- grant ID;
- policy decision and reasons;
- trusted evidence provider and receipt;
- approved CRM recipient ID when applicable;
- downstream Zapier, Buffer, Gmail, and HubSpot receipts.

Until that integration patch is merged and real-path evidence is captured, this contract does **not** claim that live posts or emails are already running automatically.

## ROLLBACK

Disable or remove the configured grant. The policy then returns `blocked` before downstream distribution.
