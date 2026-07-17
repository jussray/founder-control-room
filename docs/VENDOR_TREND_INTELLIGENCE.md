# Vendor & Trend Intelligence

## Goal

Add a founder-controlled sourcing system that discovers, compares, verifies, and tracks vendors and product trends for each portfolio project without exposing private supplier data or automatically publishing products.

## 5W1H

### Who

- Founder is the final approval authority.
- Founder Control Room performs normalized discovery, scoring, alerts, and evidence tracking.
- Each project owns its own sourcing profile and approved vendor records.

### What

The system must:

- discover vendor and product candidates from approved marketplaces, directories, Shopify apps, and manual research;
- normalize supplier, product, pricing, MOQ, shipping, lead-time, sample, certification, and marketplace evidence;
- match candidates to the correct portfolio project;
- score quality, margin, risk, trend strength, and project fit;
- create founder-review cards and email digests;
- create Shopify product drafts only after an explicit founder action;
- never publish, purchase, contact, or approve a vendor automatically.

### Where

- Shared orchestration and cross-project dashboard: Founder Control Room.
- Juss Beautiful Hair private supplier identities, pricing, outreach, samples, and vendor documents: `jbh-private` only.
- Untold Stories vendor pipeline and product-specific sourcing notes: `untold-stories-storefront`, with secrets and private negotiations kept outside the public storefront.
- Se’kret Bip: rewards, branded merchandise, packaging, journals, cards, apparel, and other age-appropriate physical goods only; no access to private teen or parent content.
- Chief AI, L99, PromptOS, and Control Room: software/API/service vendor evaluation rather than consumer-product sourcing.

### When

- Scheduled discovery may run daily or weekly depending on source limits.
- Founder alerts should be batched by default.
- Immediate alerts are reserved for high-confidence opportunities, major price changes, supplier-risk changes, or approved-stock problems.
- Existing vendors must be rechecked periodically because pricing, ratings, policies, and lead times change.

### Why

- Prevent repeated manual vendor searches.
- Preserve sourcing knowledge as company-owned intelligence.
- Compare landed cost and quality rather than headline price.
- Detect trends early without copying competitors or violating platform rules.
- Keep vendor evidence and approvals auditable across the portfolio.

### How

Use official APIs, approved partner integrations, CSV imports, and manual evidence capture. Do not depend on scraping or deprecated marketplace endpoints.

Normalize every candidate into a common contract:

```text
vendor_id
project_id
source
source_vendor_id
supplier_name_private
supplier_display_name
product_category
product_url
country_or_region
business_type
verified_status
supplier_age
marketplace_rating
review_count
moq
unit_cost
sample_cost
shipping_cost
landed_cost_estimate
lead_time_days
customization_options
certifications_claimed
quality_evidence
trend_evidence
ip_risk
compliance_risk
margin_estimate
confidence
status
last_checked_at
metadata
```

Workflow:

```text
discovered
→ screened
→ shortlisted
→ outreach approved
→ sample approved
→ quality tested
→ vendor approved
→ Shopify draft approved
→ publish separately approved
→ monitored or retired
```

## Project sourcing profiles

### Juss Beautiful Hair

Categories:

- hair bundles, closures, frontals, wigs;
- raw Vietnamese and Indian hair;
- edge control, lace products, hair oil;
- packaging and private-label supplies.

Primary scoring:

- sample quality and batch consistency;
- authentic origin evidence;
- lace and construction quality;
- domestic versus international fulfillment;
- landed margin, shipping time, dropship support, branding, and MOQ.

The existing private vendor-sourcing master document remains the starting source of truth. New research must extend it rather than duplicate it.

### Untold Stories

Categories:

- print-on-demand and embroidery;
- premium blanks and cut-and-sew apparel;
- caps, hoodies, tees, denim, children’s apparel, totes, inserts, packaging, and later footwear.

Primary scoring:

- sample-first availability;
- embroidery and print quality;
- fabric weight and certification evidence;
- customization, labels, hang tags, and packaging;
- low-MOQ validation before production inventory;
- Shopify fulfillment integration and margin.

The existing phased vendor pipeline remains authoritative until evidence supports a change.

### Se’kret Bip rewards and merchandise

Categories:

- journals, cards, stickers, stationery, apparel, plush concepts, packaging, and reward items appropriate for the product audience.

Primary scoring:

- product safety and age appropriateness;
- privacy-safe fulfillment;
- no collection or transmission of private app content;
- low-MOQ testing, quality, durability, shipping, and margin;
- brand/IP control and no unauthorized character production.

### Software products

Chief AI, Founder Control Room, L99, and PromptOS should evaluate:

- model providers;
- hosting, databases, observability, email, payments, authentication, and security services;
- cost, portability, privacy, exportability, lock-in, reliability, and contractual risk.

## Source policy

- Alibaba/1688: supplier and wholesale discovery where approved access exists.
- AliExpress: sample and product-signal research only through current approved access; do not make deprecated dropshipping interfaces a core dependency.
- Amazon: catalog, price, competition, and demand evidence for authorized seller contexts; do not treat marketplace listings as verified manufacturers.
- Shopify: downstream product drafts, metafields, workflow actions, and approved fulfillment apps.
- Manual research: allowed when source, date, screenshots/documents, and confidence are recorded.

## Scoring

Suggested weighted score:

```text
25% quality evidence
20% landed margin
15% project/brand fit
10% lead time and fulfillment
10% supplier reliability
10% sample accessibility
5% trend strength
5% compliance and IP posture
```

Any critical safety, compliance, counterfeit, authorization, or privacy risk blocks promotion regardless of total score.

## Alerts

Email and Control Room alerts should include:

- project and category;
- vendor candidate and source;
- why it matched;
- evidence age and confidence;
- landed-cost and margin estimate;
- quality or compliance flags;
- recommended next action;
- approve, reject, watch, or request-sample controls.

Do not email raw secrets, private customer data, private teen/parent content, full vendor negotiation history, or service-role credentials.

## Definition of done

- project sourcing profiles are versioned;
- at least one approved source connector or import path works end to end;
- normalized vendor records and evidence are stored safely;
- duplicate suppliers and stale evidence are detected;
- founder review and separate approval gates are enforced;
- email digests are tested without leaking private data;
- Shopify integration creates drafts only;
- no purchase, outreach, publication, or irreversible action occurs without explicit founder approval;
- each project can export its vendor intelligence without provider lock-in.
