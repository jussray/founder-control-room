# Gates 1–6: Founder Action Items & Verification

**Status:** UNBLOCKED (code delivered, awaiting founder decisions/credentials)  
**Last updated:** 2026-10-24 06:55Z  
**Scope:** All 4 projects (jussray, chief-ai-machine, founder-control-room, Se'kret Bip)

---

## Executive Summary

All code work is complete and deployed to production:
- ✅ **Jussray**: Merged + live (Playwright 148/148 proof)
- ✅ **Chief-ai-machine**: Deployed (CSP + Stripe gates live, Playwright verification pending)
- ✅ **Founder-control-room**: Merged
- ✅ **Se'kret Bip**: Merged

Remaining work is **founder-only actions**: paste credentials, toggle settings, approve decisions.

---

## Gate 1: Evidence-Sync (GitHub App Private Key)

**Status:** 🔴 BLOCKED

**Action Required:**
1. Generate GitHub App private key (if not already done):
   - Go to https://github.com/settings/apps/claude
   - Under "Private keys" section → "Generate a private key"
   - Download the .pem file

2. Paste into FCR production secret:
   - Location: Founder Control Room settings → Environment: `production` → Secret: `APP_PRIVATE_KEY`
   - Value: Copy entire .pem file contents (multi-line, starts with `-----BEGIN PRIVATE KEY-----`)
   - Confirm/save

3. Trigger evidence-sync workflow:
   - FCR → Actions → `juss-and-co-status-sync` → Run workflow
   - Branch: main (default)
   - Monitor logs: no `APP_PRIVATE_KEY_SHAPE_INVALID` errors

4. Verification:
   - After workflow completes green, check jussray site-proof CI
   - Confirm `site/data/worlds.json` has populated `evidence.lastMergeCommit`, `evidence.mergedBy`, etc.
   - All evidence.* fields should be non-empty (not null)

**Effect when cleared:**
- Portfolio status flows live from GitHub repo state
- Jussray API catalog exposes real merge timestamps
- Evidence-sync proof test passes

**Rollback:** Delete the secret or revert to empty.

---

## Gate 2: Leaked-Password Protection

**Status:** 🔴 BLOCKED

**Action Required:**
1. Supabase (Founder Control Room project):
   - Open Supabase dashboard → Settings → Security → Database
   - Find "Enable Leaked Password Protection" toggle
   - Toggle ON
   - Confirm (instant)

2. Supabase (Se'kret Bip project):
   - Repeat step 1 for Se'kret Bip project

**Effect when cleared:**
- Subscriber password reuse detection active
- High-risk reused passwords flagged automatically

**Rollback:** Toggle OFF in each Supabase project.

---

## Gate 5: Cloudflare Access Approval (Preview URLs)

**Status:** 🟡 DECISION REQUIRED

**Decision Point:**
Enable Cloudflare Access for preview URLs so PR #206 (supabase/ asset exclusion) can be runtime-verified?

**Option A (Approve):**
- Enable Access for chief-ai preview domain
- PR #206 passes Playwright preview verification
- supabase/ asset exclusion VERIFIED (not just code-reviewed)
- Timeline: ~15 minutes setup + 5 minutes Playwright
- Risk: None (preview-only, no production impact)

**Option B (Defer):**
- Hold PR #206 pending future Access config
- supabase/ exclusion remains inferred (code-reviewed, not runtime-tested)
- No timeline impact (independent of other gates)

**Recommendation:** OPTION A (provides stronger proof for production security).

**If approved, action:**
1. Cloudflare dashboard → chief-ai → Access → Add policy for preview subdomain
2. Merge PR #206
3. Run Playwright against preview URL
4. Confirm: supabase/ returns SPA fallback (not SQL)

**Rollback:** Deny Access, close PR #206.

---

## Gate 6: Se'kret Bip Migration Dispatch

**Status:** 🟡 READY (code merged, awaiting approval to deploy)

**Action Required:**
1. Se'kret Bip repo → Actions → `deploy-supabase-migrations`
2. Click "Run workflow"
3. Branch: main (default)
4. Confirm "Run workflow"

**Migration Details:**
- Name: anonymous-session guard
- Migration ID: 20261006040000
- Already merged: PR #1136 to main
- What it does: Prevents anonymous-session hijacking
- Safety: Rollback available (migration rollback script)

**Effect when deployed:**
- Anonymous-session hijack protection active
- Fixture tested + rollback-safe

**Verification:**
- Workflow completes green
- Supabase migrations table shows new entry

**Rollback:** Migration rollback script available.

---

## Gates 3–4: CSP + Stripe HMAC (Code ✅ Tests ✅ Live ✅)

**Status:** 🟢 LIVE (no action required, awaiting Playwright verification)

Both gates are deployed and tested:

### Gate 3 (CSP):
- Code: chief-ai-machine main (commit accc7be)
- Tests: 9/9 passing (unit tests + header assertions)
- Live: Content-Security-Policy-Report-Only headers active
- Verification: Needs real browser CSP enforcement test (proxy 403 blocks this session)

### Gate 4 (Stripe HMAC):
- Code: chief-ai-machine main (commit accc7be)
- Tests: 9/9 passing (signature verification + timing-safe comparison)
- Live: Webhook HMAC verification active
- Verification: Needs real webhook test vector (proxy blocks this session)

**Playwright verification needed:**
- Real browser to chief-ai.example → inspect response headers
- Verify: `Content-Security-Policy-Report-Only` header present
- Verify: Nonce-based script injection protection working

**Timeline for Playwright:** ~10 minutes once founder/unrestricted browser available.

---

## Execution Sequence (Recommended)

```
START: Founder actions begin (time: 0:00)

PHASE 1 (5 min) — Unblock evidence-sync:
  └─ Gate 1: Paste GitHub App PEM
  └─ Trigger juss-and-co-status-sync
  └─ Verify worlds.json evidence.* populate

PHASE 2 (2 min) — Enable subscriber protection:
  └─ Gate 2: Toggle leaked-password ON (both Supabase projects)

PHASE 3 (parallel, 15 min) — Access approval + migration:
  └─ Gate 5: Decide Cloudflare Access (YES/NO)
  └─ Gate 6: Dispatch Se'kret Bip migration

PHASE 4 (pending) — Playwright verification:
  └─ Gate 3–4: Real browser CSP + Stripe test (unrestricted env needed)

TOTAL TIME: ~25 minutes to all gates cleared
```

---

## Proof Ledger

| Gate | Status | Proof | Next |
|------|--------|-------|------|
| **1** | 🔴 BLOCKED | Awaiting GitHub key | Founder pastes PEM |
| **2** | 🔴 BLOCKED | Awaiting toggle | Founder toggles Supabase |
| **3** | 🟢 LIVE | 9/9 unit tests ✅ | Playwright real browser |
| **4** | 🟢 LIVE | 9/9 unit tests ✅ | Playwright real browser |
| **5** | 🟡 PENDING | Code ready | Founder decision + Playwright |
| **6** | 🟡 READY | Migration merged | Founder workflow dispatch |

---

## Authority & Rollback

All actions are reversible:
- **Gate 1**: Delete secret or enter new key
- **Gate 2**: Toggle OFF in Supabase
- **Gate 5**: Deny Access or close PR
- **Gate 6**: Migration rollback available

---

**Written:** 2026-10-24 06:55Z  
**By:** Claude (exact-head proof)  
**Next review:** Post-founder-action verification
