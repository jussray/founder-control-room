# Founder Content Value Attribution v1

## Goal

Every investor-facing or product-facing post is a measured experiment, not a one-off broadcast.

Founder Control Room binds each targeted outcome observation to the exact content identity plus one explicit target:

```text
POST
-> WATCH
-> MEASURE
-> TARGET ACTION
-> CONNECTION / CONVERSION / RETENTION
-> LEARN
-> COMPOUND OR KILL
```

The contract extends `fcr/founder-content-outcome-observation` without creating a second analytics system.

## Target identity

A targeted observation carries:

- `scope`: `portfolio` or `product`;
- `subject_id`: the portfolio or product identity whose learning ledger owns the observation;
- `audience`: `investor` or `product_user`;
- optional `campaign_id` for a bounded content experiment.

`product_user` observations must be product-scoped. This prevents a strong reaction to one product from silently becoming evidence for another product.

## Measurement lanes

The existing distribution and connection metrics remain available:

- impressions;
- reactions;
- comments;
- profile views;
- attributed visits;
- qualified conversations;
- attributed contacts;
- attributed deals.

Targeted observations add downstream metrics without turning absence into zero.

### Product-user lane

- proof-link clicks;
- signups;
- activations;
- completed core actions;
- returning users;
- referrals;
- paid conversions.

### Investor lane

- proof-link clicks;
- qualified investor connections;
- investor conversations;
- investor introductions;
- investor meetings.

Metrics from one lane cannot be inserted into the other lane. Missing metrics remain `UNKNOWN`. An observed zero remains zero.

## Evidence roles

The current founder workflow assigns three explicit evidence roles:

| Role | Default tool | What it proves |
| --- | --- | --- |
| Source/proof truth | GitHub | Source identity, commit/PR/test/provenance evidence actually observed |
| Owned-channel performance | Metricool | Post/channel distribution and interaction evidence for connected accounts actually observed |
| External discovery/reaction | Exa | Public indexing, mentions, references, and outside-world signals actually observed |

A role with no evidence reference is `UNKNOWN`, not failure and not zero. Tool availability never manufactures a provider connection or outcome.

Metricool currently being connected for one brand does not prove the other portfolio products are connected. Each product must earn its own provider/account evidence before provider-native measurement is called current.

## Value rule

Reach is distribution, not value by itself.

For product-user content, stronger evidence moves toward activation, core use, return, referral, and paid conversion.

For investor content, stronger evidence moves toward qualified connection, real conversation, introduction, meeting, and later independently proven capital outcomes.

A smaller post that creates a qualified user or investor action can be more valuable than a high-impression post that creates none.

## Authority ceiling

Target attribution is observation and learning only.

It cannot:

- publish or schedule content;
- change approved copy;
- contact an investor or user;
- spend money;
- merge or deploy code;
- change product authority;
- infer missing metrics as zero;
- move evidence from one product or audience lane into another.

Public proof may be shown. Private PromptOS logic, Council internals, control-room mechanics, routing/scoring internals, private fingerprints/cookies, raw provider payloads, private messages, customer-private data, and implementation playbooks remain outside this observation contract.
