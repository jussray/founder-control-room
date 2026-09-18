# Proof-of-Ship Zap: Verified Build-in-Public → Email Draft
## Build Instructions (Copy-Paste)

**Goal:** On each meaningful commit (feat|fix|perf) that ships to production or merges to main,
this Zap validates the proof, drafts social copy, and emails it to the founder.
Terminal action: email. Founder decides whether/when/where to post.

NOTE: Email is the ONLY output. No automatic social publishing. publish_allowed=false is enforced
at the schema level and the policy level.

---

## Step 1: Webhooks by Zapier → Catch Hook
Trigger type: **Webhook** (Catch Raw Hook)
1. Click "Trigger" (first step)
2. Select **Webhooks by Zapier** → **Catch Hook** (or **Catch Raw Hook**)
3. Copy the generated webhook URL
4. Add this URL as a GitHub secret named `ZAPIER_CATCH_HOOK_URL` on all four repos:
   - jussray/founder-control-room (Settings → Secrets and variables → Actions → New repository secret)
   - jussray/jussbeautifulhair-site
   - jussray/untold-stories-storefront
   - jussray/chief-ai-machine

No configuration needed for this step beyond copying the URL.

---

## Step 2: Filter by Zapier
**Action:** Add a Filter step
1. Click **+** → **Filter** → **Zapier** → **Only continue if...**
2. Set up THREE conditions (ALL must match):
   - Condition A: `live_state` **(Text)** **Exactly matches** `verified`
   - Condition B: `publish_allowed` **(Boolean)** **Is false**
   - Condition C: `repo` **(Text)** **Does not contain** `Sekret-Bip`

**Rationale:** Only "verified" proofs and explicitly draft-only payloads continue.
Sekret-Bip (teen app) is permanently excluded from build-in-public automation.

---

## Step 3: Code by Zapier (optional but recommended)
**Action:** Validate payload against schema (before AI touches it)
If you want to add explicit schema validation (recommended for production):
1. Click **+** → **Code** → **Zapier** → **Run JavaScript**
2. Paste:
```javascript
const Ajv = require('ajv');
const schema = {
  "type": "object",
  "required": ["repo", "commit_sha", "commit_title", "commit_url", "live_state", "publish_allowed"],
  "properties": {
    "repo": {"type": "string", "pattern": "^[a-z0-9-]+/[a-z0-9-]+$"},
    "commit_sha": {"type": "string", "pattern": "^[a-f0-9]{40}$"},
    "commit_title": {"type": "string", "maxLength": 100},
    "commit_url": {"type": "string", "pattern": "^https://github\\.com"},
    "live_state": {"type": "string", "enum": ["verified", "merged"]},
    "publish_allowed": {"type": "boolean", "enum": [false]}
  }
};
const ajv = new Ajv();
const validate = ajv.compile(schema);
if (!validate(inputData)) {
  throw new Error('Payload validation failed: ' + JSON.stringify(validate.errors));
}
return {valid: true, data: inputData};
```
3. Input data: select from webhook step (typically `data` or just use the raw payload from Step 1)
4. This step will throw if the payload is malformed, preventing bad copy from being drafted.

**If you skip this step:** proceed directly to Step 4. Validation is optional but recommended.

---

## Step 4: ChatGPT (OpenAI) → Conversation
**Action:** Draft social copy from verified receipt
1. Click **+** → **ChatGPT** → **OpenAI** → **Conversation**
   (NOT "Conversation with Assistant" — that API is deprecated.)
2. **Model:** gpt-4o-mini
3. **Temperature:** 0.3 (low — deterministic output)
4. **User Message:** (copy-paste exactly)
```
You are Juss's build-in-public ghostwriter. Write a short first-person social post
about a shipped change. Hard rules:
- State ONLY what the receipts confirm. The work is verified live, so you may say
  "shipped"/"live." Never invent metrics, users, or impact.
- No hype, no emojis, no hashtags. Direct, technical-but-human.
- Include the commit link exactly as given; do not shorten or alter it.
- Output strict JSON only, no preamble:
  {"x":"<=270 chars, includes commit link","linkedin":"<=900 chars, includes commit link"}

Shipped change:
repo: {{repo}}
title: {{commit_title}}
commit: {{commit_url}}
live_state: {{live_state}}
```
5. **System Message:** (optional but recommended to enforce tone)
```
You are a technical ghostwriter for a solo founder. Be direct. No fluff.
```
6. Input the webhook payload fields as `{{repo}}`, `{{commit_title}}`, `{{commit_url}}`, `{{live_state}}`
   from the Catch Hook step.

---

## Step 5: Formatter → Parse JSON
**Action:** Extract structured data from ChatGPT response
1. Click **+** → **Formatter** → **Utilities** → **Import/Parse JSON**
2. **Input:** Select the `text` field from the ChatGPT step (the model's reply)
3. This extracts `x` and `linkedin` as separate fields for the email body.

---

## Step 6: Gmail → Send Email
**Action:** Deliver draft to founder
1. Click **+** → **Gmail** → **Google Mail** → **Send Email**
2. **To:** Your email address
3. **Subject:**
```
[proof-of-ship] {{commit_title}} — {{repo}}
```
4. **Body** (HTML):
```html
<p>Shipped and verified live.</p>

<p><strong>COMMIT:</strong> <a href="{{commit_url}}">{{commit_url}}</a></p>

<h3>X (≤270 chars):</h3>
<pre>{{x}}</pre>

<h3>LinkedIn (≤900 chars):</h3>
<pre>{{linkedin}}</pre>

<p><strong>Action:</strong> Tap the commit link to view it live on GitHub. Copy the X or LinkedIn text and post when ready.</p>

<p><strong>⚠️ PUBLISH_ALLOWED=false — This is a DRAFT ONLY.</strong> You control when and where to post.</p>
```
5. Insert the `x`, `linkedin`, `commit_title`, `repo`, `commit_url` fields from the prior steps.

---

## Test Protocol (Four Receipts)
Before rolling ZAPIER_CATCH_HOOK_URL to the other three repos:

1. **GitHub Actions:** Push a real `feat:` commit to founder-control-room that touches `src/` or
   `supabase/migrations/`. Watch the proof-of-ship workflow run (GitHub Actions tab).
2. **Zapier webhook delivery:** Open Zapier → click on the Catch Hook step → "Task History."
   Confirm the payload arrived from GitHub Actions.
3. **ChatGPT response:** In the Zap task history, confirm the ChatGPT step returned valid JSON
   with `x` and `linkedin` fields (not a parse error).
4. **Email delivered:** Check your inbox. Confirm the email arrived with the draft copy and
   the commit link.

If all four receipts are green, the Zap is production-ready. Share `ZAPIER_CATCH_HOOK_URL` with jbh,
untold-stories, and chief-ai repos.

---

## Schema and Policy
This Zap is governed by:
- `ops/zapier/proof-of-ship-payload.schema.json` — payload validation (required fields, types, patterns)
- `ops/zapier/proof-of-ship-policy.md` — allowlist (4 repos), excluded (Sekret-Bip), invariants
  (publish_allowed=false, idempotency, validation)

Review both before activation.

---

## Troubleshooting

**Zapier says "No data received" when I push a commit**
- Confirm `ZAPIER_CATCH_HOOK_URL` is set correctly on the repo (Settings → Secrets → check value)
- Confirm the workflow step runs and prints "Posted verified proof-of-ship to Zapier"
- Check the repo's GitHub Actions logs for the proof-of-ship job

**ChatGPT returns text instead of JSON**
- Reread the User Message prompt; ensure it explicitly says "Output strict JSON only"
- Check temperature is 0.3 (lower = more deterministic)
- Rerun the Zap; may be a transient model behavior

**Email never arrives**
- Confirm Gmail is connected to Zapier (OAuth) and the email address is correct
- Check Zapier task history for the Gmail step; it will show any delivery error
- Confirm the repo's webhook actually called Zapier (check Catch Hook task history)

**Publish_allowed is true in the email**
- The schema validation step (Step 3) should reject this; if skipped, the payload passed anyway.
- Add the Code step (Step 3) if not present.
- The policy enforcement (Step 2 Filter) does not check publish_allowed — add it as a condition if needed.

---

## Done
Once all six steps are configured and the four-receipt test passes on founder-control-room,
the Zap is live. Commit the policy and schema files to each repo's ci/proof-of-ship-pipeline
branch, then share the webhook URL to the other three repos and enable their workflows.
