# App Store & Google Play Compliance Checklist

> **Founder Control Room** — Store Compliance Proof Document  
> Last updated: 2026-07-19

## Apple App Store Requirements

### 4.2 — Account Deletion
- [x] In-app account deletion available without contacting support → see `ACCOUNT_DELETION.md §1`
- [x] Deletion removes all personal data → see `ACCOUNT_DELETION.md §2`

### 5.1 — Privacy
- [x] Privacy Policy URL provided: `docs/compliance/PRIVACY.md`
- [x] App Privacy nutrition label data types declared in App Store Connect
- [x] No data sold to third parties → see `PRIVACY.md §4`
- [x] Data minimization: only necessary data collected → see `PRIVACY.md §2`
- [x] No cross-app tracking (ATT not triggered; no IDFA use)

### 2.1 — App Completeness
- [x] Support URL configured → `SUPPORT.md §4`
- [x] In-app feedback mechanism exists → `SUPPORT.md §1`

### 1.4 — Physical Harm Prevention
- [x] No user-generated content surfaced without moderation layer
- [x] Safety flags in agent outputs — see `SAFETY.md §2`

### 3.1 — Payments
- [x] In-app purchases (if any) use StoreKit 2 / Apple IAP
- [x] No external payment links in app UI

---

## Google Play Requirements

### Data Safety Section
- [x] Data types collected declared in Play Console Data Safety form
- [x] Data deletion instructions provided: in-app + web URL → `ACCOUNT_DELETION.md`
- [x] No sensitive permissions without clear user benefit

### Target API Level
- [x] Targets Android API 34+
- [x] `READ_MEDIA_*` permissions scoped correctly

### Deceptive Behavior
- [x] No hidden functionality
- [x] No misleading app description

### Family Policy
- [x] App not directed at children; age gate at sign-up → `PRIVACY.md §7`

---

## Compliance Evidence Cross-Reference

| Requirement | Document | Status |
|---|---|---|
| Safety controls | `SAFETY.md` | ✅ |
| Privacy policy | `PRIVACY.md` | ✅ |
| Account deletion | `ACCOUNT_DELETION.md` | ✅ |
| Device management | `DEVICE_MANAGEMENT.md` | ✅ |
| Supabase data controls | `SUPABASE.md` | ✅ |
| Cloudflare security | `CLOUDFLARE.md` | ✅ |
| Support channels | `SUPPORT.md` | ✅ |
| Store checklist | This document | ✅ |
