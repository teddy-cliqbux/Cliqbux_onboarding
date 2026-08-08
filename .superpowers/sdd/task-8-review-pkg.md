# Review package Task 8
Base: b51885e74af801441ac05f3b7bbd5ddcc3cf7cba
Head: 282bd286e17d1db7206cc541957f64d67fe316fa
## Commits
282bd28 docs(uw): W-9 underwriting request and Gmail send scopes

## Stat
 .superpowers/sdd/progress.md      | 15 +++++++++++++
 .superpowers/sdd/task-8-report.md | 40 +++++++++++++++++++++++++++++++++++
 AGENTS.md                         |  2 ++
 AI_CHANNEL.md                     | 44 ++++++++++++++++++++++++++++-----------
 docs/underwriting-inbox.md        | 33 +++++++++++++++++++++++++++--
 5 files changed, 120 insertions(+), 14 deletions(-)

## Diff
```diff
diff --git a/AGENTS.md b/AGENTS.md
index 94b246e..26813c5 100644
--- a/AGENTS.md
+++ b/AGENTS.md
@@ -440,10 +440,12 @@ MerchantAccount (HubSpot Tier-1 company)
 
 Quick Stage prompts for **parent company name** ΓåÆ creates HubSpot company + deal + MerchantAccount (no slug-only hubspotBypass path).
 
 **Deal Room v1 + phase 2:** `/admin/applications/:corporateId` ΓÇö notes, tasks, snapshot, **per-MID Elavon AWB + underwriting message threads**. Gmail sync of underwriting@ via `syncUnderwritingMail` (see `docs/underwriting-inbox.md`). Manual log works without Gmail env.
 
+**UnderwritingRequest W-9 (2026-08-07):** Deal Room **Underwriting requests** panel (selected MID) ΓÇö agent sends W-9 invite (email/SMS/both) via `manageUnderwritingRequest`; merchant signs at `/uw/:token` via `completeUnderwritingRequest` (in-house e-sign + stamped IRS PDF, not BoldSign). Signed PDF: Download or **Send to Elavon** from underwriting@ (Gmail **`gmail.send`** scope + optional env `UNDERWRITING_ELAVON_DOCS_TO` for default To). One active unsigned request per MID+`w9`; does **not** replace checklist **Request document**. Entity `UnderwritingRequest` must be republished in Base44. Spec: `docs/superpowers/specs/2026-08-07-underwriting-w9-request-design.md`; ops: `docs/underwriting-inbox.md` ┬º W-9.
+
 ### Architecture: MerchantMID
 Clean three-layer model: Profile Γ₧ö Locations Γ₧ö MerchantMIDs.
 
 ```
 MerchantCorporateProfile
diff --git a/AI_CHANNEL.md b/AI_CHANNEL.md
index a919ee6..140c3c6 100644
--- a/AI_CHANNEL.md
+++ b/AI_CHANNEL.md
@@ -3102,11 +3102,11 @@ Dry run OK (106 MIDs / 47 owners); **Confirm live sync** returned HTTP 500. Like
 
 **Waiting on:** Teddy (push + redeploy + live sync)
 ---
 
 ---
-**[CURSOR]** ╖ 2026-07-30
+**[CURSOR]** ┬╖ 2026-07-30
 **Type:** Fix
 **Re:** MSP live sync HTTP 500 ? chunked writes + error surfacing
 
 ### Symptom
 Dry run OK (106 MIDs / 47 owners); **Confirm live sync** returned HTTP 500. Likely Base44 write burst (rate limit / uncaught create) or timeout ? not MSP fetch.
@@ -3170,11 +3170,11 @@ Before MSPWare / portfolio / boarding / merchant-center: vault `_index.md` ? `pa
 1. Spec: docs/superpowers/specs/2026-07-31-admin-account-home-overview-design.md
 2. src/lib/accountOverview.js (+ tests) ? best deal by handoff stage, primary CTA map, dense summary (last-4 only; PCI/paperless/POS = unknown until real source)
 3. manageMerchantAccount get returns overview + primaryContact fields
 4. AdminMerchantAccountHome ? hero CTA + Account summary + existing deals/legal/MIDs; best deal highlighted
 
-**CTA:** needs_attention?Deal Room ╖ onboarding?Portal ╖ live?Locations ╖ prospect+deal?Deal Room ╖ prospect+no deal?Applications
+**CTA:** needs_attention?Deal Room ┬╖ onboarding?Portal ┬╖ live?Locations ┬╖ prospect+deal?Deal Room ┬╖ prospect+no deal?Applications
 
 **Waiting on:** Teddy (push via GitHub Desktop; redeploy manageMerchantAccount)
 ---
 
 ---
@@ -3261,19 +3261,19 @@ Set Base44 `QUO_FROM_NUMBER=+14154888853`, retry Remind ? Text. No code change r
 
 **Waiting on:** Teddy (redeploy + retry)
 ---
 
 ---
-**[CURSOR]** ù 2026-08-01
+**[CURSOR]** ┬ù 2026-08-01
 **Type:** Decision / Fix
-**Re:** #14 ù deselected owners still on portal People
+**Re:** #14 ┬ù deselected owners still on portal People
 
 ### Cause
 Applications prep saved `includedSignerIds` on `StagedApplication` only. Portal People / `manageSigner` list / boarding always loaded all `MerchantSigners`. Locations already honored `includedLocationIds`; signers did not.
 
-### Fix (repo ù redeploy before live verify)
-- `src/lib/dealSignerSelection.js` (+ tests) ù mirror location selection helper
+### Fix (repo ┬ù redeploy before live verify)
+- `src/lib/dealSignerSelection.js` (+ tests) ┬ù mirror location selection helper
 - `manageSigner` list: filter for merchant actors; admin Applications stays full roster
 - `OnboardingPortal` client filter (defense)
 - `signApplication` / `submitToMSP` / `refillMSPForms`: same filter for MSPWare `owners[]`
 - Applications Owners copy clarified (hide, don't delete)
 
@@ -3283,16 +3283,16 @@ Plan: `docs/superpowers/plans/2026-08-01-honor-included-signer-ids.md`
 
 **Waiting on:** Teddy (redeploy + UI confirm) ? then close #14
 ---
 
 ---
-**[CURSOR]** ù 2026-08-05
+**[CURSOR]** ┬ù 2026-08-05
 **Type:** Fix
 **Re:** Too many MSPWare signing packages / Prepare form HTTP 429 (Imas / Estorya)
 
 ### Cause
-`prepareMSPForms` / `submitToMSP` / `signApplication` walked **every** MerchantMID on the deal. Applications `includedMidIds` was saved but ignored ù junk MIDs (Test DBA, duplicate Estorya/Imas) got drafts + GET /form storms ? 429.
+`prepareMSPForms` / `submitToMSP` / `signApplication` walked **every** MerchantMID on the deal. Applications `includedMidIds` was saved but ignored ┬ù junk MIDs (Test DBA, duplicate Estorya/Imas) got drafts + GET /form storms ? 429.
 
 ### Fix (repo)
 - `src/lib/dealMidSelection.js` (+ tests): resolve `includedMidIds` (fallback `includedLocationIds`)
 - Wired into `prepareMSPForms`, `submitToMSP`, `signApplication` (incl. statusOnly poll)
 - Applications Locations copy clarified
@@ -3305,11 +3305,11 @@ Plan: `docs/superpowers/plans/2026-08-01-honor-included-signer-ids.md`
 
 **Waiting on:** Teddy (redeploy + cleanup + verify)
 ---
 
 ---
-**[CURSOR]** ΓÇö 2026-08-05
+**[CURSOR]** ├ó┬Ç┬ö 2026-08-05
 **Type:** Fix
 **Re:** Open feedback #18 / #19 / #17 (Applications desk + location Signed)
 
 ### Done (repo)
 1. **#18** Applications `visibleMids` now uses `resolveDealMidScopeFromStages` / `filterMidsByDealScope` (`includedMidIds` first). MSP health prefetch scoped the same way so junk MIDs do not drive stuck/Remind.
@@ -3317,19 +3317,19 @@ Plan: `docs/superpowers/plans/2026-08-01-honor-included-signer-ids.md`
 3. **#17** `deriveLocationStatus` adds `signed` from `portalLockStatus === all_signed` or `agreementSigned`. `getMerchantData` exposes `portalLockStatus`. `/locations` loads signers for CP signed check.
 
 ### Ops still on corp 338922234596 (#16)
 - Redeploy frontend + `getMerchantData` (+ boarding MID filter if not live)
 - Prep: only keep Imas Kusina Union City + Estorya; retract junk MID drafts
-- Prepare form ΓåÆ expect 2 rows
+- Prepare form ├ó┬å┬Æ expect 2 rows
 
 Plan: `docs/superpowers/plans/2026-08-05-open-feedback-issues.md`
 
 **Waiting on:** Teddy (push/redeploy + Imas cleanup verify)
 ---
 
 ---
-**[CURSOR]** ΓÇö 2026-08-05
+**[CURSOR]** ├ó┬Ç┬ö 2026-08-05
 **Type:** Fix
 **Re:** Post-sign logo crispness + Help & Feedback screenshot `color()` error
 
 ### Logo (AgreementSignedCelebration)
 - Stamp animation unchanged in motion path; final settle is upright (`rotate: 0`) then swaps to a **static** `<img>` so leftover GPU transforms don't leave the mark askew/soft.
@@ -3340,13 +3340,33 @@ Plan: `docs/superpowers/plans/2026-08-05-open-feedback-issues.md`
 
 **Waiting on:** Teddy push + redeploy frontend; re-test Capture on signed celebration page.
 ---
 
 ---
-**[CURSOR]** ΓÇö 2026-08-06
+**[CURSOR]** ├ó┬Ç┬ö 2026-08-06
 **Type:** Fix
 **Re:** No Unlock / forms-lock banner on post-signing Merchant Center
 
 Removed `FormsLockedBanner` (and Unlock & Modify) from `PostSubmissionDashboard`. Unlock remains on Applications / Deal Room only. Also hide the sticky lock banner on `OnboardingPortal` when `applicationStatus === Submitted`.
 
 **Waiting on:** Teddy push + redeploy frontend
 ---
+
+---
+**[CURSOR]** ΓÇö 2026-08-07
+**Type:** Note
+**Re:** Underwriting W-9 request plan shipped (Tasks 1ΓÇô7 on `feature/underwriting-w9-request`)
+
+### Shipped in repo
+Deal Room **Underwriting requests** panel + merchant `/uw/:token` W-9 e-sign + `manageUnderwritingRequest` / `completeUnderwritingRequest`. Gmail outbound for **Send to Elavon** needs **`gmail.send`** on underwriting@ (readonly alone is not enough). Optional env `UNDERWRITING_ELAVON_DOCS_TO` prefills Elavon To when CliqBux confirms the inbox.
+
+Docs: `docs/underwriting-inbox.md` (scopes + W-9 flow), `AGENTS.md` ┬º UnderwritingRequest, spec `docs/superpowers/specs/2026-08-07-underwriting-w9-request-design.md`.
+
+### Teddy ops (before live smoke)
+1. **Republish** `UnderwritingRequest` entity in Base44 Dashboard
+2. **Re-consent** underwriting@ OAuth: `gmail.readonly` + `gmail.send` ΓåÆ new refresh token ΓåÆ `UNDERWRITING_GMAIL_REFRESH_TOKEN`
+3. Set **`UNDERWRITING_ELAVON_DOCS_TO`** when Elavon docs address is confirmed (else agents type To in modal)
+4. Push + **redeploy** `manageUnderwritingRequest`, `completeUnderwritingRequest`, frontend
+5. **Smoke one test MID:** Send W-9 ΓåÆ sign link ΓåÆ Download PDF ΓåÆ Send to Elavon (self or test To) ΓåÆ confirm attachment + outbound thread row
+
+**Waiting on:** Teddy (publish + Gmail re-consent + redeploy + smoke)
+---
diff --git a/docs/underwriting-inbox.md b/docs/underwriting-inbox.md
index f878e16..4044f6e 100644
--- a/docs/underwriting-inbox.md
+++ b/docs/underwriting-inbox.md
@@ -49,19 +49,45 @@ Set in Base44 env:
 | `UNDERWRITING_GMAIL_CLIENT_SECRET` | OAuth client secret |
 | `UNDERWRITING_GMAIL_REFRESH_TOKEN` | Refresh token for underwriting@ |
 | `UNDERWRITING_GMAIL_USER` | Optional; default `underwriting@cliqbux.com` |
 | `UNDERWRITING_GMAIL_QUERY` | Optional Gmail search override |
 | `UNDERWRITING_GMAIL_ACCESS_TOKEN` | Optional short-lived token (skips refresh; testing only) |
+| `UNDERWRITING_ELAVON_DOCS_TO` | Optional default **To** for Deal Room **Send to Elavon** (signed W-9 PDF). Leave unset until CliqBux confirms the inbox ΓÇö agents fill To manually in the modal. Never invent an Elavon address. |
 
-Scopes needed: `https://www.googleapis.com/auth/gmail.readonly`
+**OAuth scopes (re-consent required when adding send):**
+
+- `https://www.googleapis.com/auth/gmail.readonly` ΓÇö inbound sync (`syncUnderwritingMail`)
+- `https://www.googleapis.com/auth/gmail.send` ΓÇö outbound W-9 forward to Elavon (`manageUnderwritingRequest` action `sendToElavon`)
+
+After upgrading scopes, generate a **new refresh token** for underwriting@ and update `UNDERWRITING_GMAIL_REFRESH_TOKEN` in Base44. A token minted with readonly-only consent will fail `sendToElavon` with an insufficient-scope error; the Deal Room panel surfaces that banner.
 
 Default search (when query unset) includes mail to underwriting@ **and** from Elavon status/escalation addresses:
 
 `to:underwriting@cliqbux.com OR from:(ApplicationStatus@elavon.com OR MSPFulSer@elavon.com OR FulSerCenter@elavon.com) newer_than:90d`
 
 Then redeploy `syncUnderwritingMail`. From Deal Room, **Sync inbox** matches by AWB on the current dealΓÇÖs MIDs.
 
+## W-9 underwriting requests (outbound send)
+
+Deal Room **Underwriting requests** (per selected MID) lets agents request a signed IRS Form W-9 from a merchant contact (email and/or SMS), collect an in-house e-sign at `/uw/:token`, then **Send to Elavon** from underwriting@ with the signed PDF attached.
+
+| Step | Who | What |
+|---|---|---|
+| 1 | Agent | Deal Room ΓåÆ select MID ΓåÆ **Underwriting requests** ΓåÆ New W-9 ΓåÆ pick legal entity + recipient ΓåÆ Send |
+| 2 | Merchant | Opens magic link ΓåÆ reviews/edits prefilled fields ΓåÆ signs ΓåÆ download confirmation |
+| 3 | Agent | **Download** signed PDF; **Send to Elavon** (editable To / Subject / body; Subject prefilled with AWB when `MerchantMID.elavonAwb` is set) |
+| 4 | System | Gmail send logs an outbound row on the MID `UnderwritingMessage` thread |
+
+**Functions:** `manageUnderwritingRequest` (admin: list / create / send / resend / cancel / getSignedUrl / sendToElavon), `completeUnderwritingRequest` (token: get / saveDraft / submitSignature).
+
+**Entity:** `UnderwritingRequest` ΓÇö **republish in Base44** before live use (undeclared fields strip on save).
+
+**Design spec (canonical):** `docs/superpowers/specs/2026-08-07-underwriting-w9-request-design.md`  
+**Implementation plan:** `docs/superpowers/plans/2026-08-07-underwriting-w9-request.md`
+
+Inbound AWB status sync and W-9 outbound send share the same underwriting@ OAuth client but use different Gmail API methods (list/get vs send).
+
 ## Matching rules
 
 1. Parse AWB-like tokens from subject/body ΓÇö **subject-line AWB is the primary Elavon signal**
 2. Also substring-match any known `MerchantMID.elavonAwb` (ΓëÑ6 chars)
 3. Dedup by Gmail message id ΓåÆ `UnderwritingMessage.externalId`
@@ -69,8 +95,11 @@ Then redeploy `syncUnderwritingMail`. From Deal Room, **Sync inbox** matches by
 
 ## Entities / functions
 
 - `MerchantMID.elavonAwb`
 - `UnderwritingMessage`
+- `UnderwritingRequest` ΓÇö MID-scoped W-9 (and future doc types)
 - `manageApplicationDesk` ΓÇö `setMidAwb`, `logUwMessage`, `deleteUwMessage`, `requestStatusInquiry`, `refreshAwbFromMsp`
+- `manageUnderwritingRequest` ΓÇö W-9 create/send/resend/cancel; Gmail `sendToElavon` with PDF attachment
+- `completeUnderwritingRequest` ΓÇö merchant token page `/uw/:token`
 - `submitToMSP` / `pollMSPStatus` ΓÇö capture `elavonAwb` from MSP after submit
-- `syncUnderwritingMail` ΓÇö Gmail pull
+- `syncUnderwritingMail` ΓÇö Gmail pull (readonly scope)

```
