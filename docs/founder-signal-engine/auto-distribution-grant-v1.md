# Founder Signal Engine automatic distribution grant v1

## REALITY

The current remote MCP bridge supports publication and sending only when each invocation carries a `founderApprovalId`. That is safe for review-mode operation, but it cannot represent Juss's standing approval for automatic build-in-public posts and qualified investor outreach.

This slice adds the reusable policy contract that the Zapier bridge must call before any automatic distribution.

## APPROVED OUTCOME

A verified build event may automatically become:

- a LinkedIn, Facebook, or Instagram progress post;
- a HubSpot-linked investor email to a preapproved potential-investor segment;
- an auditable Founder Control Room decision.

## GRANT MODEL

A standing automation grant is:

- **scoped** to named repositories, channels, and audience segments;
- **revocable** by setting `enabled` to `false`;
- **expirable** with `expiresAt`;
- **proof-gated** by a PR/deployment URL and exact source commit SHA;
- **5W1H-gated** before distribution;
- **recipient-specific** for investor email.

The policy returns one of three decisions:

| Decision | Meaning |
|---|---|
| `auto-distribute` | The event is inside the founder-approved scope and all proof/context gates pass. |
| `review-only` | The scope is valid, but evidence or message context is incomplete. Do not send. |
| `blocked` | The grant is disabled, expired, or the requested repository/channel/audience is outside scope. |

## INVESTOR EMAIL RULE

Automatic investor email is allowed only when all shared proof and 5W1H gates pass **and**:

1. the audience segment is preapproved;
2. a stable CRM recipient ID is present;
3. the message contains a recipient-specific reason the investor should care.

A generic scraped list or missing recipient thesis must never auto-send. It becomes `review-only` or `blocked`.

## SOCIAL RULE

Build-in-public posts may auto-distribute after verified evidence passes the same scope, proof, commit, and 5W1H checks. The Zapier layer remains responsible for channel formatting, duplicate prevention, scheduling, and retaining the final Buffer/post receipt.

## INTEGRATION GATE

The next focused patch must call `evaluateFounderSignalAutomation` from the remote MCP/Zapier invocation path and persist:

- grant ID;
- decision;
- decision reasons;
- source proof;
- downstream Zapier, Buffer, Gmail, and HubSpot receipts.

Until that integration patch is merged and real-path evidence is captured, this contract does **not** claim that live posts or emails are already running automatically.

## ROLLBACK

Disable or remove the configured grant. The policy then returns `blocked` before downstream distribution.
