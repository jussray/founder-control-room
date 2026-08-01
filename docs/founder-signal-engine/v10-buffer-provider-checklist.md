# v10 Buffer Provider Checklist

Canonical provider rules: [`buffer-provider-action-matrix.md`](./buffer-provider-action-matrix.md)

Before any live Zap or API test:

- [ ] Buffer Zapier action is `buffer_add_to_queue`.
- [ ] `method: draft # required; never rely on Buffer default`.
- [ ] Buffer GraphQL uses `saveToDraft: true`.
- [ ] `publish_allowed` remains `false`.
- [ ] Queue, schedule, share-next, share-now, and schedule-draft values are rejected.
- [ ] The test row contains no real customer, investor, teen, family, journal, voice, media, or private project data.
- [ ] The result is visible in Buffer Drafts with a genuine draft ID.
- [ ] No Queue, Sent, scheduled, or public permalink receipt exists.
- [ ] Any Requires Approval role is treated as optional Team-plan defense-in-depth, not as a free-plan guarantee.

A checked checklist does not authorize a live provider mutation. Founder approval remains separate.
