# Portfolio Conversion Tracking v1

## Purpose

Founder Control Room owns a minimal, provider-independent conversion-event contract for portfolio sites.

The first four approved events are:

- `call_click`
- `whatsapp_click`
- `pickup_request`
- `directions_click`

These are interaction counters, not identity records and not proof of a completed sale.

## Data boundary

Allowed payload fields are limited to:

- `project`
- `event_name`
- `page_path`
- `cta_location`
- `service_context`
- `occurred_at`

The collector intentionally does not store customer phone numbers, WhatsApp message text, email addresses, IP addresses, user-agent strings, cookies, device IDs, browser fingerprints, or user IDs.

The Cloudflare runtime may necessarily receive network metadata while serving the request, but this contract does not persist those values into the conversion database.

## Provider implementation

The bounded provider implementation is:

- Worker: `jussco-conversions`
- D1 database: `jussco-conversions`
- D1 binding: `DB`
- database id: `3b77c3d5-4068-4597-9d97-96009d339e73`
- source: `workers/jussco-conversions/worker.js`
- schema: `workers/jussco-conversions/schema.sql`

The generic ingestion route is `POST /v1/event`.

Pappa Razzy also has redirect helpers:

- `/pappa/call`
- `/pappa/whatsapp`
- `/pappa/pickup`
- `/pappa/directions`

Those routes record the matching event and then redirect to the existing business action.

## Pappa Razzy site wiring

The current ChatGPT Site source is a separate authority surface. A deployed collector does not prove that the live Site buttons call it.

Until the Site editor/source mutation surface is available and the CTA links or click hooks are updated, classify Pappa Razzy tracking as:

`COLLECTOR_CONFIGURED / SITE_WIRING_NOT_PROVEN / CONVERSION_OUTCOMES_NOT_PROVEN`

Do not report conversion counts from this service as Pappa Razzy site conversions before the live buttons are wired and exercised.

## Retention and deletion

Automatic event deletion is disabled.

This is intentional: founder material/history must not be deleted without explicit founder authorization for that deletion policy.

A future retention window may be added only after explicit approval, with the exact window and rollback recorded.

## Failure modes

- A public redirect can be requested by automation, so raw counts are interaction evidence, not unique-human evidence.
- CORS is a browser boundary, not authentication.
- A green repository test proves the contract shape, not live Cloudflare behavior.
- A successful Cloudflare upload proves provider configuration, not that a portfolio site is sending events.
- A Site click proves an interaction, not a completed purchase.

## Rollback

Safe rollback is additive/non-destructive:

1. stop wiring new site CTAs to the collector;
2. disable the Worker subdomain or deploy the previous Worker version;
3. preserve the D1 database and event history unless the founder separately authorizes deletion;
4. update this contract and provider receipt to mark the prior runtime historical.

No rollback step requires deleting the database or recorded events.
