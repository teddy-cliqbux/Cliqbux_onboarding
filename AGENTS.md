# AGENTS.md
# Cliqbux E-Onboarding — AI Agent Briefing

This file is the authoritative context document for any AI agent (Claude, Base44 AI, etc.) working on this repo. **Read it fully before making any changes.** Update it whenever you make architectural decisions, discover a hard-won fix, or rule out an approach after testing.

## ⚠️ MANDATORY FOR ALL AI AGENTS

Before touching any file in this repo:
1. Read this entire file.
2. Read `AI_CHANNEL.md` for the latest inter-AI decisions.
3. After completing work, **append what you learned** to the relevant section below — especially failed approaches and confirmed values. Future agents (including yourself in a new session) will not remember what you tested.
4. **Pull the latest commits BEFORE writing any repo file.** On 2026-07-09, Base44 AI republished an entity schema from a stale copy and silently deleted a newly added field (`customAuthPerCard`), plus overwrote two channel entries it had never read. Working from a stale tree destroys other agents' work.
5. **`AI_CHANNEL.md` is APPEND-ONLY.** Add new entries at the end; never rewrite, reorder, truncate, or delete existing entries.
6. **When you claim something is deployed/published, verify it with a real request against the live URL and quote the evidence** (status code + response snippet). On 2026-07-09, "GitHub sync auto-deploys functions" was reported as fact while live functions were demonstrably running old code.

**If you are Base44 AI:** every time you start a session on this codebase, open `AGENTS.md` and `AI_CHANNEL.md` first via the GitHub connector. Before ending a session where you made substantive changes or discoveries, commit an update to `AGENTS.md` documenting what you found. This is how we prevent repeating expensive debugging sessions.

---

## ⚠️ Edit in the repo only — test in Base44 wherever helpful

**Decided with Teddy 2026-07-03, after this exact mistake caused two merge conflicts in one session:**

Do not hand-edit the same function file in both the local git repo AND the live Base44 app sandbox. The live Base44 app auto-commits to the same GitHub repo Teddy works in via GitHub Desktop — writing the "same" change by hand in both places produces two textually-different commits (different comment wording, different line endings) that collide as a merge conflict the next time Teddy pulls. This happened twice on 2026-07-03.

**The rule going forward:**
1. Make code changes in the local repo only. Teddy pushes via GitHub Desktop as normal.
2. It's fine — encouraged, even — to use the live Base44 sandbox for **testing**: running `curl` against deployed functions, using `debugMSPFormRaw` to inspect real MSPWare data, querying/updating entities to set up a test case. None of that touches function source files, so it can't conflict.
3. If a fix genuinely needs to be verified against the live API before you're confident in it (e.g. confirming a new MSPWare field value actually clears a validation error), it's OK to push that one change directly to the Base44 sandbox temporarily to test it. But once confirmed, make sure the same final content is committed to the local repo, and if GitHub Desktop then shows a merge conflict from the two copies diverging, resolve it yourself (it's almost always a trivial same-code/different-comment conflict) — don't leave it for Teddy to untangle.
4. Once a value or fix is confirmed and documented (in code comments, `AGENTS.md`, or `docs/mspware-field-reference.md`), there's no need to keep re-verifying it live in future sessions — treat it as a known constant.

---

## 🚨 Critical Lessons — Do Not Repeat These Mistakes

These are hard-won findings from real debugging. Each one cost hours. Read them before touching the relevant code.

### 1. `is_firearm_verified` — OMIT from all PUT /form payloads
**The mistake:** We captured `"is_firearm_verified":"yes"` from MSPWare network traffic and added it to `submitToMSP` and `signApplication`. This was wrong.

**Why it's wrong:** That network capture came from MSPWare's internal `TestData.cfc` UI endpoint, which has different validation than the API's `PUT /applications/{no}/form`. The API rejects every value for this field (`"yes"`, `false`, `"N"`, `true`, `"YES"` — all tested, all cause the form to drop below 100%).

**The correct behaviour:** MSPWare template #6 (ICPLS) and #154 (Cash Discount) already have `is_firearm_verified` set to the correct internal value. `signApplication` GETs the form first — when the template default is intact, the form reads 100% and the PUT is **skipped entirely**, preserving the template value. Signing URLs then generate from the API with no manual MSP dashboard action required.

**Rule:** Never add `is_firearm_verified` to any API payload. If you see it in either function, remove it immediately.

---

### 2. Rate limiting — old admin bundle spam
**The mistake:** The old `EntityDetailsPanel` in `OnboardingLocations.jsx` had a runaway autosave timer (setTimeout inside a setForm updater) that called `manageLegalEntity` hundreds of times per minute, saturating the Base44 per-account `asServiceRole` limit and causing ALL functions to return `{"error":"Rate limit exceeded"}`.

**Rule:** Never put repeated API calls inside a React `setForm` updater, `useEffect` without proper deps, or `setInterval`. Autosave for entity-level dropdown fields must use an explicit Save button, not a debounce timer.

---

### 3. `manageLegalEntity` — portal users have no auth session
**The mistake:** `manageLegalEntity` required `base44.auth.me()`, which returns null for magic-link portal users. Every save appeared to succeed (no UI error) but silently returned 401 and wrote nothing to the database.

**Rule:** Any function callable from the merchant portal must use `asServiceRole` and must NOT call `base44.auth.me()` to gate writes.

---

### 4. `legalEntities` schema — declare all fields or Base44 strips them
**The mistake:** `ownershipType`, `taxClassType`, `establishmentYear` were not declared in the `legalEntities` array items schema in `base44/entities/Merchant Corporate Profile.jsonc`. Base44's platform strips undeclared keys from nested array objects on every save, silently losing the data.

**Rule:** Any field you want to persist inside a nested array (like `legalEntities`) must be declared in that array's item schema. Verify in `base44/entities/` before adding new fields to nested objects.

---

### 6. `pushStatusToHubspot` — same auth bug as `manageLegalEntity`
**The mistake:** `pushStatusToHubspot` called `base44.auth.me()` and returned 401 for magic-link portal users. The call site in `OnboardingPortal.jsx` uses `.catch(() => {})` (intentional fire-and-forget), so the 401 was silently swallowed. **HubSpot deal stages were never advancing for self-serve portal merchants.**

**The fix:** Removed the `auth.me()` check. The function only calls the HubSpot API using `HUBSPOT_API_KEY` from env vars — no Base44 entity access — so no user session is needed. The import of `createClientFromRequest` is kept for the upcoming enrichment step that will use `asServiceRole`.

**Rule:** Any function called from `OnboardingPortal.jsx` or any magic-link portal page must NOT use `base44.auth.me()`. Either remove the check entirely or use `asServiceRole`. Applies to: `pushStatusToHubspot`, `manageLegalEntity`, `removeSelfServeLocation`, `addSelfServeLocation`, `getMSPFormStatus`.

---

### 5. `mspApplicationNo` — only clear on explicit HTTP 404
**The mistake:** `signApplication` was clearing `mspApplicationNo` on any non-success API response (network error, rate limit, etc.), then creating a new duplicate draft in MSPWare, causing merchants to accumulate multiple applications.

**Rule:** Only clear a stored `mspApplicationNo` when MSPWare returns an explicit HTTP 404. All other errors (5xx, timeouts, rate limits) must leave the number intact.

---

### 7. Do not have an AI agent live-fill fields in the MSPWare UI to "discover" correct values
**The mistake (2026-07-03):** Investigating a validation error required inspecting MSPWare's live dashboard UI. An AI agent (Claude) was driving the same browser tab Teddy was also actively using, and an automated click+type collided with Teddy's own in-progress edit, changing a Pricing Method dropdown he hadn't finished setting.

**Why it's a problem:** MSPWare's live dashboard is a real production system, not a sandbox. Field values there don't have simple `value=` attributes in most cases (many are search-driven comboboxes, e.g. `entity_number` displays "48603 - Buy rate" but the real wire value is `'48603-17'` — the Client Group suffix is invisible in the UI). Reverse-engineering correct values by clicking around is slow, unreliable, and unsafe when a human might be using the same session.

**The correct process:**
1. A human confirms the correct value once, live in MSPWare (or via Fidano/MSPWare support).
2. Use `debugMSPFormRaw` (`POST /functions/debugMSPFormRaw { "appNo": "<id>" }`) to pull the **raw wire-format JSON** of a real application or template — this is the reliable way to see actual field names/values, not the UI's friendly labels.
3. Capture the confirmed value as a constant in `buildFormPayload` (`submitToMSP/entry.ts` and `signApplication/entry.ts`) AND in `docs/mspware-field-reference.md`.

**Rule:** Do not drive the live MSPWare dashboard via browser automation to fill fields or "figure out" values. Use `debugMSPFormRaw` against a real application/template number instead, and codify whatever is found into the repo (code + `docs/mspware-field-reference.md`) rather than re-deriving it each session.

---

### 8. `ownershipType` vs `taxClassType` — don't conflate them with `||`

**The mistake (2026-07-03):** Two related bugs, both caused by treating `ownershipType` (Business Entity Type — LLC, Corporation, Sole Prop, etc.) and `taxClassType` (IRS Tax Classification — how that entity is taxed) as interchangeable via a `||` fallback chain.

**Bug A — `llc_class` sent as "disregarded entity" when it should have been "Corporation":** `mapLlcClass` was called on a variable (`ownershipRaw`) that fell back through `profile.ownershipType || matchedEntity?.ownershipType || profile.taxClassType`. Since `profile.ownershipType` (`"LIMITED_COMPANY"`) always won and isn't a key in `mapLlcClass`'s table, it silently defaulted to `'D'` regardless of the merchant's actual chosen tax classification.
**Fix:** `llc_class` is now sourced from a dedicated `legalTaxClassType` variable — `matchedEntity?.taxClassType || profile.taxClassType` — never from `ownershipType`. Verified via `debugMSPFormRaw`: `llc_class: C` for an LLC-taxed-as-Corporation entity (was `D`).

**Bug B — General Partnership / Limited Partnership silently mapped to Corporation:** `mapOwnershipType`'s lookup table had no keys for `'GENERAL_PARTNERSHIP'` / `'LIMITED_PARTNERSHIP'` (our frontend's actual `OWNERSHIP_TYPES` dropdown values in `OnboardingLocations.jsx`) — only a generic `'PARTNERSHIP'` key that nothing ever sent. Both real values fell through to the `'CO'` default. Discovered by comparing our 6-option Business Entity Type dropdown against MSPWare's own ~13-option Ownership Type field live.
**Fix:** added `'GENERAL_PARTNERSHIP': 'PA', 'LIMITED_PARTNERSHIP': 'PA'` to `mapOwnershipType` in `submitToMSP/entry.ts` and `signApplication/entry.ts` (`refillMSPForms/entry.ts`'s copy already had this correctly). Verified live 2026-07-06 by temporarily setting a test merchant's `ownershipType` to `GENERAL_PARTNERSHIP`, running `submitToMSP`, and confirming via `debugMSPFormRaw` that the wire value is `ownership_type: PA` (test data reverted after).

**Frontend simplification (same root cause, different fix):** MSPWare's own "LLC Class" field only has 3 real options (Corporation / Disregarded Entity / Partnership). Rather than showing merchants the full generic `TAX_CLASS_TYPES` list when they've already chosen LLC as their Business Entity Type, `OnboardingLocations.jsx` now conditionally shows a dedicated `LLC_TAX_CLASS_TYPES` (3-option) list whenever `ownershipType === 'LIMITED_COMPANY'`. Pushed live 2026-07-06.

**Rule:** `ownershipType` (entity structure) and `taxClassType` (IRS classification) are different fields with different valid-value sets. Never fall back from one to the other with `||` — map each through its own dedicated function/lookup table.

---

### 9. Expanding Ownership Type options — confirm codes live before adding to the dropdown

**Context (2026-07-06):** Teddy compared MSPWare's real "Ownership Type" field (~13 options) against our 6-option `OWNERSHIP_TYPES` dropdown and asked to add the missing options. `mapOwnershipType` already had unconfirmed `'SUB_S_CORP'/'S_CORP' → 'SS'` and `'TRUST' → 'T'` entries sitting in the code from an earlier, undocumented session — no prior debugMSPFormRaw verification existed for either.

**What was done:** Added `SUB_S_CORP` ("Sub S Corp") and `TRUST` ("Trust") to `OWNERSHIP_TYPES` in `OnboardingLocations.jsx` and to the `MerchantCorporateProfile.ownershipType` schema enum, then verified both live using the same safe pattern as Critical Lesson #8's Partnership fix: temporarily set a test merchant's `ownershipType`, run `submitToMSP` (draft-only, `MSP_SUBMIT_ENABLED=false`, no signatures triggered), confirm no `ownership_type`/`llc_class` validation error, read the wire value back via `debugMSPFormRaw`, then revert the test data. Confirmed: `SUB_S_CORP → ownership_type: SS`, `TRUST → ownership_type: T`. Both pushed live and to the local repo.

**What was intentionally NOT added:** Estate, Government (Federal/State/Local), Unincorporated Association, and MSPWare's 3-way C-Corp split (Closely Held/Private/Public) are still missing from our dropdown. No wire codes for any of these exist anywhere in the codebase, and guessing them is riskier than the other fixes in this file — the C-Corp subtype in particular appears tied to `beneficial_ownership_exemption` (public companies typically have different BOI/KYC obligations than private ones), so sending the wrong code could misrepresent a merchant's compliance status to Elavon, not just cosmetically mislabel a dropdown. **Do not guess these codes.** Get them confirmed by Teddy or MSPWare/Fidano support first (the standard process at the top of `docs/mspware-field-reference.md`), then use the same test-and-revert pattern described above to verify before adding to the dropdown.

---

### 10. `debugMSPFormRaw` with `corporateId` is NOT read-only — it silently overwrites real application fields

**The incident (2026-07-06):** While verifying the Sub S Corp/Trust ownership fix, an AI agent called `debugMSPFormRaw` with `{"appNo": "194", "corporateId": "334558632649"}`, assuming (based on the function's "debug" name and its established safe read-only role earlier in this same session) that it only reads data. It does not. When `corporateId` is present, the function sends a REAL `PUT /applications/{appNo}/form` using its own hardcoded placeholder payload — including junk pricing values (`all_markup_discount: '0.0000'`, `all_markup_per_item: '0.000'`, `all_card_auth_per_item: '0.050'`, `auth_pricing_program: '49999'`, `intl_card_handling_fee: '0.60'`) — then attempts a REAL `POST /applications/{appNo}/signatures`.

**What actually happened:** Test application #194's markup fields, which were genuinely blank/required before the call, came back filled with these exact placeholder numbers immediately after — confirmed by diffing `submitToMSP` validation errors before (6 errors including `all_markup_discount` etc.) and after (only `is_firearm_verified`) the same call. This is NOT real Cliqbux pricing — it's meaningless debug data now sitting in a test application's fields. Checked via `debugMSPSignatures`: no signature package was actually created (404 — the attempt did not succeed or wasn't reached), so no BoldSign envelope exists. App #194 is a disposable test/dev record (TESTLEGALNAME/DBA Store), not a real merchant, so no merchant-facing harm occurred — but the same mistake against a real merchant's application would corrupt its pricing.

**Fix:** `debugMSPFormRaw` now requires an explicit `confirmFill: true` alongside `corporateId` to run the fill+signature path. Without `confirmFill: true`, `corporateId` is ignored and the function is pure read-only — safe to call with just `{"appNo": "<id>"}` against any real application, anytime, as established earlier in this file.

**Rule:** When calling any "debug" function for inspection purposes, read its actual source first (or check for a data-mutating code path) rather than assuming a diagnostic-sounding name means read-only. Prefer calling it with the minimal parameters needed (bare `appNo`, no `corporateId`) unless you specifically intend to trigger a fill.

---

### 11. ICPLS (Interchange Plus) pricing fields missing on template #6 — root cause, not a code bug

**Context (2026-07-06):** Teddy flagged that a live draft application showed "Authorization Pricing Program", "Markup Discount", "Markup Per Item", and "Auth Per Card" as required/blank under Interchange Plus pricing, while a reference template showed a fully correct, complete pricing section. His principle: merchant applicants must never touch pricing — every field must come from either the MSPWare template or a Cliqbux-prefilled payload.

**Root cause, confirmed via a clean `GET /applications/6/form` (template #6, "Cliqbux Template Swipe Keyed" — the default ICPLS template):** `auth_pricing_program` (`49999`), `intl_card_handling_fee` (`0.60`), and `billing_method` (`N`) ARE set correctly on the template. But `all_markup_discount`, `all_markup_per_item`, and `all_card_auth_per_item` are genuinely `null` on the template itself — no default value to inherit. `buildFormPayload` deliberately never sends any of these 5 fields for ICPLS pricing method (see the Strict Template Preservation Rule above) specifically to avoid corrupting template-owned data. The result: every fresh ICPLS application is born with exactly these 3 fields blank/required, because there's nothing for it to inherit and our code correctly doesn't try to fill them itself.

**This mirrors the Cash Discount / template #154 problem exactly** (see "Cash Discount Template" section below) — a Cliqbux-owned MSPWare template missing default pricing configuration, surfacing as a per-application validation error instead of a template-level fix.

**Resolved 2026-07-06 — there is no universal fix, because there's no universal rate.** Teddy clarified: Interchange Plus is **always** a custom-negotiated deal — there is no self-serve, off-the-shelf Interchange Plus pricing at Cliqbux, ever. So option 1 (fix the template's defaults) was never viable — there's no single correct default to put there. The real fix is option 2's spirit but per-merchant, not universal: `buildFormPayload` must source `all_markup_discount`/`all_markup_per_item` from that merchant's own negotiated `customMarkupPercentage`/`customPerTxFee` (already captured from HubSpot, previously never wired into MSPWare — see Critical Lesson #12), never from a static constant.

**Do not use test application #194 to verify a fix for this** — see Critical Lesson #10; its markup fields currently hold contaminated debug placeholder values, not a clean "freshly created from template #6" state. Create a new draft application (or a fresh test merchant) to test any fix.

---

### 12. Pricing structure model — 3 MSPWare pricing methods, 4 Cliqbux templates, one is on hold

**Clarified with Teddy 2026-07-06.** MSPWare supports 3 pricing methods Cliqbux actually uses: `ICPLS` (Interchange Plus), `FLAT` (Flat Rate), `TIERD` (used for Cash Discount's flat-rate schedule). `CLEAR` (Clear and Simple) is never used — see Critical Lesson #8's pricing note. Cliqbux's actual product lineup is 4 templates:

| # | Template | Self-serve? | Pricing source |
|---|---|---|---|
| 1 | Custom Flat Rate | No — always sales-assisted | Per-merchant negotiated rate (HubSpot → `customMarkupPercentage`/`customPerTxFee`) |
| 2 | Custom Interchange Plus | No — always sales-assisted, no off-the-shelf version exists | Same as above |
| 3 | Self-Serve Flat Rate | Would be, but **ON HOLD** | N/A — not built |
| 4 | Self-Serve Cash Discount | Yes | Fixed Cliqbux rate — see "Cliqbux Cash Discount Fee Schedule" |

**Template 3 (Self-Serve Flat Rate) is on hold as of 2026-07-06** — this was going to cover the old `Self_Swiped`/`Self_Keyed` self-serve tiers, but Teddy: "Elavon doesn't support it yet and we're unable to actually execute that agreement." **Do not build this template, do not route real merchants through it, and do not remove the existing `Self_Swiped`/`Self_Keyed` code paths** — they're just dormant, not deprecated; leave them as-is until Elavon adds support.

**A live incident this surfaced:** the self-serve pricing screens (`SelfServePricing.jsx` desktop, `MobilePricing.jsx` mobile) were actively offering a "Swiped & Keyed" card (advertising 2.49%+$0.10 / 2.89%+$0.30) as a real self-serve option in production — creating a real HubSpot deal with `pricingTier: 'TRADITIONAL'` that our backend maps to Interchange Plus, which per the above has no self-serve template at all. Real prospective merchants could pick an option Cliqbux couldn't actually fulfill end-to-end. **Fixed 2026-07-06:** removed the card from both files; Cash Discount is currently the only self-serve pricing option. Re-add a flat-rate self-serve card only once template 3 is actually built and Elavon support exists.

**pricingTier enum simplification (in progress 2026-07-06):** the old enum was a genuine mess — inconsistent casing across files (`CASH_DISCOUNT` in the entity schema/HubSpot flow vs. `Self_CashDiscount` in `OnboardingPortal.jsx`'s `SELF_SERVE_TIERS` check, meaning **self-serve Cash Discount merchants were never actually recognized as self-serve** due to the mismatch — a real bug found during this cleanup), plus `TRADITIONAL`/`STANDARD`/`PREMIUM`/`Custom` all really meaning the same thing (a sales-assisted deal whose actual method is either Flat or Interchange Plus). New simplified enum: `CUSTOM_FLAT_RATE`, `CUSTOM_INTERCHANGE_PLUS`, `SELF_SERVE_CASH_DISCOUNT`. `Self_Swiped`/`Self_Keyed` left untouched (dormant, see above).

**The "must never be blank" guard (updated 2026-07-09):** for `CUSTOM_FLAT_RATE` and `CUSTOM_INTERCHANGE_PLUS`, application creation/submission is blocked with a clear internal error unless `customMarkupPercentage`, `customPerTxFee`, AND `customAuthPerCard` are all set on the profile. ~~Auth Per Card does NOT need a separate custom field~~ — **superseded 2026-07-09**: Teddy now wants all three values (markup %, per-transaction fee, per-auth fee) prompted per-deal in HubSpot for both custom tiers. `customAuthPerCard` feeds `all_card_auth_per_item` in `buildFormPayload` (submitToMSP + signApplication). Cash Discount stays fixed: 3.3816% / $0.00 / $0.00, hardcoded in the TIERD schedule — no HubSpot values needed or read for CD.

**HubSpot deal-level pricing properties (reality-checked via API 2026-07-09):**
- `pricing_tier__` **NEVER EXISTED in HubSpot** — the code read it for weeks but the property was never created, so deal-level tier never synced. Kept as a legacy fallback only.
- The real deal property is `processing_pricing_tier`. `syncFromHubspot` reads it first, uppercases, and maps legacy option values (`custom` → CUSTOM_INTERCHANGE_PLUS, `zero_cash_discount` → SELF_SERVE_CASH_DISCOUNT). `standard_processing_249_010_289_030` is deliberately unmapped (on-hold self-serve flat rate).
- Negotiated values come from deal properties `custom_markup_percentage`, `custom_per_tx_fee`, `custom_auth_per_card` → profile fields `customMarkupPercentage`/`customPerTxFee`/`customAuthPerCard`. Sync fills blanks; only `force: true` overwrites.
- `custom_pertransaction_fee` (no underscores between "per" and "transaction") is a DUPLICATE property slated for deletion in HubSpot — never read it.

### 13. `cards_accepted` — another template-owned field we were incorrectly sending

**Found 2026-07-08**, right after switching `CD_TEMPLATE_NO` from 154 to 133. Both `submitToMSP` and `signApplication` hardcoded `cards_accepted: ['VISA', 'VISA_DEBIT', 'MASTERCARD', 'MASTERCARD_DEBIT', 'DISCOVER', 'AMEX']` in every PUT payload. Template #133 has `all_cards: true` (every card type, including UnionPay) as its intended default — but this hardcoded list silently overwrote that on every application, dropping UnionPay and unchecking "All Cards" in the MSPWare UI. Teddy caught it by comparing a fresh test application's Pricing tab against the template.

**Fix:** removed `cards_accepted` entirely from both `buildFormPayload` functions — same treatment as every other template-owned field. The template's `all_cards`/`cards_accepted` default now passes through untouched.

**Lesson generalized:** any field that a template pre-fills is a candidate for this bug, not just the fee/billing fields originally identified 2026-06-30. When template #133 was adopted, its full field set should have been diffed against what our code sends, not just the fee fields Teddy happened to be looking at. Worth a full pass over `docs/mspware-field-reference.md`'s "Fields we DO send" list against a fresh `debugMSPFormRaw` pull of #133 to check for any other silent overwrites of this kind.

---

### 14. Location address "not persisting" — frontend load projection stripped fields, then re-saved the blanks

**Found 2026-07-12** after Teddy reported location City/State/ZIP vanishing across refreshes. The DB and backend were fine — `updateLocationDetails` persisted all four structured fields and `listLocations` returned them. The bug was client-side: `loadAll` in `OnboardingLocations.jsx` re-mapped each loaded location to a slim projection (`id, entityId, dbaName, businessAddress, applicationStepStatus, elavonMID`) that silently dropped `businessStreet/City/State/Zip`. The inline location editor (added 2026-07-10) reads exactly those fields, so after any refresh it opened with blank City/State/ZIP — and hitting Save sent the blanks to `updateLocationDetails`, which dutifully overwrote the real values. Each edit round-trip destroyed data; mid-session edits looked fine because the save response was merged back into state.

**Fixes (2026-07-12):** (1) `loadAll` projection now carries the four structured fields; (2) `startLocEdit` parses the composed `businessAddress` string as a fallback for records already damaged by this bug; (3) `saveLocEdit` requires city / 2-letter state / 5-digit ZIP; (4) `updateLocationDetails` rejects address saves with empty city/state/zip so stale deployed frontends can't blank-wipe.

**Rule:** when a frontend load path re-maps API records into a projection, any field a downstream editor writes back MUST be in that projection. A projection that drops fields turns every edit-save cycle into silent data loss. Prefer spreading the record (`{ ...l, id: l.id || l.locationId }`) over hand-picking fields.

---

## What This App Does

Merchant onboarding portal for Cliqbux, an ISO/ISV that boards merchants to Elavon via **MSPWare/PulsePoint** (NOT Elavon's direct eBanking API). Merchants complete an online application, connect their bank account via Plaid, and their processing application is submitted to Elavon through MSPWare.

Base44 app slug: `cliqbux-onboard-prime`
Base44 App ID: `6a3dfa34316c4e5018c750f7`
Published function base URL: `https://cliqbux-onboard-prime.base44.app/functions/`

---

## Boarding Integration: MSPWare / PulsePoint

**Do NOT use the Elavon eBanking API directly.** That path was explored and abandoned. All boarding goes through MSPWare.

### Key constants
- MSPWare API base: `https://api.msppulsepoint.com/v2`
- Auth headers: `X-API-KEY: {MSP_APP_KEY}` and `X-App-ID: cliqbux`
  - Note: swagger shows `appkey`/`appid` as security scheme names — these are NOT the header names
- Application type: `24` = Elavon US Application
- Default (ICPLS) template: `209` = "Custom InterchangePlus Template" — **switched from #6 on 2026-07-09** (Teddy built #209 and confirmed it's the go-forward Custom Interchange Plus template; verified via `debugMSPFormRaw {"appNo":"209"}`: pricing_method ICPLS, auth_pricing_program 49999, entity_number 48603-17, all_cards incl UnionPay, tokenization none, markup fields blank for per-merchant fill). #6 ("Cliqbux Template Swipe Keyed") is retired — don't reference it for new work.
- Salesperson ID: `76764` (Teddy Elsenbaumer's MSPWare ID — NOT 86764 which is the old Elavon rep code)

### MSPWare boarding flow
1. `POST /applications` — create draft (returns `merchantapplicationno`)
2. `PUT /applications/{no}/form` — fill all required fields (see `submitToMSP`)
3. `PUT /applications/{no}/submit` — submit to Elavon (gated by `MSP_SUBMIT_ENABLED=true`)
4. `GET /applications/{no}/status` — poll for result (no webhooks; async, up to ~4 min)

### Safety gate
**Never submit a real merchant to Elavon unless `MSP_SUBMIT_ENABLED=true`** env var is explicitly set. This is enforced in `submitToMSP`. Do not remove or weaken this guard.

### Confirmed valid field values (hard-won from iterative API testing)
| Field | Valid values |
|---|---|
| `ownership_type` | SP, LL, CO, SS, PA, NP, T |
| `llc_class` | D (disregarded), P (partnership), C (corporation) — only when ownership_type=LL |
| `industry_type` | RE (Retail), RS (Restaurant), SP (Supermarket), HT (Hotel). ⚠️ `MS` (MOTO) was listed as valid from June testing but was REJECTED live by `PUT /form` on 2026-07-10 (app #210, template #209: "MS is not a valid option") — removed from the merchant dropdown; do not send without re-confirming live. `ARU` removed from the dropdown (not a Cliqbux category). Industry is auto-derived from MCC in the portal (5812/5813/5814→RS, 5411→SP, 7011→HT, else RE). |
| `has_legal_address` | `business` — NOT `same` |
| `chargebacks_retrievals_format` | `WM` (email) — NOT `E` |
| `billing_method` | N (Net), G (Gross) |
| `card_acceptance_split` | CP (card-present only), OMNI (mixed) |
| `business_address_type` | BSA |
| `owner_address_type` | PRA |
| `beneficial_ownership_exemption` | NON |
| `mcc` | Elavon MCC codes e.g. `5812`, `5411A`, `5999` |
| `pricing_category` | 1=Retail, 2=Lodging, 4=Supermarket, 5=ARU, 6=MOTO, 7=Restaurant, 13=Omni |
| `auth_pricing_program` | `49999` (Cliqbux account constant) |
| `is_firearm_verified` | **OMIT from PUT /form payload entirely.** MSPWare template #6 and #154 already have this field set to the correct internal value. Sending ANY value in the PUT (including `"yes"`, `"no"`, `false`, `"N"`, `"YES"`, `true`) overrides the template's value with something invalid, causing the form to DROP below 100% completion and blocking signing. The correct flow: `signApplication` GETs the form first — when the template default is in place the form is at 100%, the PUT is skipped entirely, and signing URLs are generated normally via the API with no manual MSP dashboard action required. The `"yes"` captured from the MSPWare network (2026-06-29) came from their internal `TestData.cfc` UI endpoint, which has different validation than the API's PUT /applications/{no}/form. `"no"` was tried on 2026-06-30 and also drops completion. There is no valid string — omit the field entirely. `debugMSPFormRaw` previously had `"yes"` hardcoded — removed 2026-06-30. |
| `debit_auth_method` | `"PNL"` (pinless) — required when `has_pin_debit=true` (template default). Confirmed valid 2026-06-29. |
| `debit_pricing_method` | `"ICPLS"` — confirmed valid 2026-06-29. |
| `has_pin_debit` | Send `false` in payload to attempt suppressing conditional debit fields. Template may override. |

---

## Entity Architecture

### Current entities
- **MerchantCorporateProfile** — legal entity, TIN, ownership type, signers
- **MerchantSigners** — individual owners/signers with SSN, DOB, address
- **MerchantLocations** — physical storefronts (address + bank details)
- **MerchantMID** — one per Elavon MID; links to a location
- **MerchantAccessTokens** — magic-link tokens for merchant portal access
- **StagedApplication** — admin-built targeted application invites for merchants
- **MerchantInventoryAssets** — equipment/inventory tracking
- **MerchantSigners** — individual owners/signers with SSN, DOB, address
- **User** — portal users

### Architecture: MerchantMID
Clean three-layer model: Profile ➔ Locations ➔ MerchantMIDs.

```
MerchantCorporateProfile
  └── legalEntities[] (embedded array — each has EIN, ownershipType, taxClassType, mailingAddress)
  └── MerchantLocations (physical address + bank account, FK corporateId)
        └── MerchantMID (one per MID — mcc, dba, status, elavonMID, FK locationId + corporateId)
```

A single physical location can have multiple MIDs (e.g. a grocery store with a Bakery MID and a Cafe MID). Each MerchantMID record maps to exactly one MSPWare application and one Elavon MID.

**Do NOT build new features against the flat `MerchantLocations` boarding fields.** Use `MerchantMID` for anything MID-related.

### legalEntities embedded array on MerchantCorporateProfile
Legal entities (EIN groups) are stored as an embedded array on the profile, NOT as a separate entity. Managed via `manageLegalEntity` function. Each entry has: `entityId` (UUID), `legalBusinessName`, `federalEIN`, `mailingStreet/City/State/Zip`, `ownershipType`, `taxClassType`, `establishmentYear`.

### MerchantLocations.entityId
Each location links to a `legalEntity.entityId` in the profile's embedded array. This determines which EIN group the location belongs to for MSPWare submission.

### Fields ON MerchantMID (not MerchantLocations)
- `mspApplicationNo` — MSPWare draft application number
- `elavonMID`
- `applicationStepStatus` — `In Review | Ready to Submit | Pending MID | Active | Active (Existing) | Error`
- `isExistingAccount` — true for pre-imported MIDs (skip boarding flow)
- `existingAccountSource` — `mspware_import | manual_claim | migration`
- `mccCode`, `industryType`, `pricingCategory`, `pricingMethod`, `monthlyCardSales`, `avgSaleAmount`, `highestTicketAmount`, `cardPresentPct`, `deliveryDelayDays`
- `bankDetails` — per-MID bank override (null = inherit from parent location)

### Fields DEPRECATED on MerchantLocations (do not use)
- `awb` / `boardingId` — DEPRECATED, no longer written
- `mspApplicationNo`, `elavonMID` — legacy copies only; primary home is `MerchantMID`

---

## Backend Functions

### Active boarding functions
| Function | Purpose |
|---|---|
| `submitToMSP` | Creates MSPWare draft + fills form + optionally submits. Idempotent: verifies existing `mspApplicationNo` via GET before reusing (only clears on explicit HTTP 404). |
| `signApplication` | Re-fills form + creates BoldSign signing package per principal. Does GET first; skips re-fill if already at 100%. Only clears stale `mspApplicationNo` on explicit 404. |
| `refillMSPForms` | Standalone re-fill of existing drafts by corporateId. Useful for patching stuck forms. |
| `pollMSPStatus` | Polls MSPWare status for all Pending MID records (both Locations and MerchantMIDs) |
| `importExistingMIDs` | TIN-matches MSPWare approved apps to a corporateId; creates MerchantMID records |
| `importMSPPortfolio` | Bulk-imports entire MSPWare portfolio — creates Profile + Locations + MerchantMIDs for all approved merchants. Groups by TIN. Admin-only, dryRun supported. |
| `migrateToMerchantMIDs` | One-time migration: copies any records left in the legacy MerchantProcessingConcept table into MerchantMID, and derives MerchantMID records from MerchantLocations boarding data for locations that still don't have one |
| `manageMSPTemplate` | Reads/fills MSPWare templates. Actions: `read`, `fill_icpls`, `fill_cd`, `create_cd`. Template #6 = ICPLS, Template #154 = Cash Discount (pricing_method: `"CLEAR"`). |
| `uploadSignerIDsToMSP` | Uploads signer ID document files to all pending MSPWare applications for a corporateId. Call after signers upload their IDs via the portal. |
| `getMSPFormStatus` | Merchant-facing form status check (no admin required). Returns completion %, errors, and raw form fields for a given `mspApplicationNo`. |
| `getHubspotQuote` | Portal-auth'd HubSpot quote + line items for EquipmentOrderPanel. Read-only; payment stays on HubSpot Payments / quote iframe. |

### Other active functions
`createPlaidLinkToken`, `exchangePlaidToken`, `saveLocationBankDetails`, `getMerchantData`, `manageLegalEntity`, `manageSigner`, `manageMerchantID`, `addSelfServeLocation`, `removeSelfServeLocation`, `listLocations`, `updateMerchantProfile`, `verifyEIN`, `verifySignerToken`, `validateResumeToken`, `sendResumeLink`, `processAIDocumentExtraction`, `saveInventoryFile`, `listInventoryFiles`, `getDocuments`, `listDocuments`, `createHubspotDeal`, `handleHubspotWebhook`, `syncFromHubspot`, `pushStatusToHubspot`, `getHubspotQuote`, `setupHubspotProperties`, `manageStagedApplication`, `batchUpdateStatus`, `debugEnv`

### Debug/admin-only functions (do not call from merchant portal)
`checkMSPEnv`, `readMSPTemplate`, `debugMSPForm`, `debugMSPFormRaw`, `cleanupTestHubspot`


### MID creation → auto MSPWare draft
When a new `MerchantMID` is created via `manageMerchantID` (action="add"), the function immediately calls `submitToMSP` with `{ corporateId, midIds: [merchantMID.id] }` in the background. This ensures the MSPWare draft exists before the merchant reaches the signing page. Non-fatal — failure is logged but the MID record is still returned.

### Deleted / do not recreate
- ~~`submitToElavon`~~ — replaced by `submitToMSP`
- ~~`pollBoardingStatus`~~ — replaced by `pollMSPStatus`
- ~~`elavonWebhook`~~ — MSPWare uses polling, no webhooks
- ~~`mspGetSchema`~~ — debug artifact, wrong base URL and auth headers
- ~~`manageConcept`~~ — unused duplicate of `manageMerchantID` with raw `concept`/`conceptId` naming, deleted 2026-07-01
- ~~`AddConceptModal.jsx`~~ — unused frontend component, not imported anywhere, deleted 2026-07-01
- ~~`migrateLocationsToConcepts`~~ — renamed to `migrateToMerchantMIDs` 2026-07-01, now also copies legacy MerchantProcessingConcept rows

---

## Environment Variables

| Var | Purpose |
|---|---|
| `MSP_APP_KEY` | MSPWare API key — never hardcode |
| `MSP_APP_ID` | `cliqbux` |
| `MSP_BASE_URL` | `https://api.msppulsepoint.com/v2` (optional override) |
| `MSP_SALESPERSON_ID` | `76764` |
| `MSP_SUBMIT_ENABLED` | `true` to actually submit to Elavon; omit for safe draft-only mode |
| `ELAVON_USERNAME` / `ELAVON_PASSWORD` | Only used by `getDocuments`/`listDocuments` (direct Elavon doc API) |
| `HUBSPOT_API_KEY` | HubSpot Private App token — used by `createHubspotDeal`, `pushStatusToHubspot`, `handleHubspotWebhook`, `syncFromHubspot`, `getHubspotQuote`, `cleanupTestHubspot` |

**Production credentials live in Base44 env vars only — never in code or committed files.**

---

## HubSpot Integration

### How HubSpot maps to Base44

HubSpot is the CRM/sales layer. Base44 is the operational layer. They are linked by `corporateId = HubSpot dealId`.

```
HubSpot                          Base44
──────────────────────────────────────────────────────────
Parent Company (Corporation)  →  MerchantCorporateProfile
  └─ Child Company (Brand)    →  (brand grouping — no entity yet)
       └─ Child Company (Loc) →  MerchantLocations
Deal (on Location company)    →  corporateId = dealId (the link)
Quote (on Deal)               →  hubspotQuoteId on MerchantLocations (+ hubspotQuoteUrl on profile)
Line Items (on Quote)         →  getHubspotQuote (live HubSpot API, TanStack 10-min cache in UI)
```

### 3-tier company hierarchy
HubSpot supports multi-level parent-child on Company records:
- **Tier 1 — Corporation**: top-level Company (Island Pacific, BAD BAKERS LLC, Tailwind Concessions)
- **Tier 2 — Brand**: child Company of Corporation (San Honore, Phil House, Boba Opa). Single-brand operators skip this tier.
- **Tier 3 — Location**: child Company of Brand or Corp. Convention: `"Brand - City"`. Tailwind and BAD BAKERS already follow this pattern (~229 child companies as of 2026-06-29).

**Critical constraint:** Legal entity structure is unknown until the merchant fills out the onboarding application. Don't pre-build the hierarchy during sales — build it retroactively when the merchant submits.

### `createHubspotDeal` — what it does
Called at portal self-serve sign-up. Creates: Contact + Company (dedups by email domain) + Deal (`"${businessName} — Self-Serve Onboarding"`) → associates them → creates `MerchantCorporateProfile` in Base44 with `corporateId = dealId`.

**Known bug:** Company dedup uses signer email domain. Testing with `@cliqbux.com` created 112 junk deals + orphan companies. `cleanupTestHubspot` admin function deletes these.

### `pushStatusToHubspot` — milestone → deal stage
Fire-and-forget from `OnboardingPortal.jsx`. Was silently broken (auth.me() check, fixed 2026-06-29). Now correctly advances deal stages on portal milestone events.

### Custom Company properties (already created by `setupHubspotProperties`, not yet written to)
`ein`, `ownership_type`, `state_of_formation`, `mcc_code`, `dba_name`, `monthly_card_sales`, `avg_ticket`, `card_present_pct`, `pricing_tier`
**Next step:** Enrich these on `application_submitted` milestone inside `pushStatusToHubspot`.

### HubSpot Quote line items — confirmed field names (from quote 305636118240)
`name`, `quantity`, `price`, `amount`, `hs_total_discount`, `hs_discount_percentage`, `hs_sku`, `description`
Quote-level: `hs_quote_link`, `hs_quote_esign_status`, `hs_esign_num_signers_completed/required`, `hs_quote_amount`, `hs_expiration_date`

**To pull line items:** `GET /crm/v3/objects/quotes/{quoteId}?associations=line_items` then `POST /crm/v3/objects/line_items/batch/read`

### Post-signing dashboard (hybrid quote UX — shipped 2026-07-13)
After application submit, `PostSubmissionDashboard` shows underwriting + `EquipmentOrderPanel`:
1. **Native invoice** via `getHubspotQuote` (portal-auth'd) — hardware (SKU) vs recurring SaaS vs one-time services
2. **HubSpot iframe** for e-sign + **HubSpot Payments** when `quoteUrl` is on `*.cliqbux.com` (frameable); otherwise new-tab CTA only
3. On `hs_payment_status === PAID`: collapse iframe, stamp `equipmentPaidAt`, fire `pushStatusToHubspot` milestone `closed_won` (also `handleHubspotWebhook` event `quote_paid`)

**Do not** set `MerchantMID.applicationStepStatus` to Active on quote payment — that means Elavon MID received. Payment ≠ processor go-live.

**Do not** build Stripe Elements for equipment checkout — Cliqbux uses HubSpot Payments on the quote. `@stripe/*` client libs remain unused for this flow.

---

## UI → Function Call Map

| UI action | Function called |
|---|---|
| Submit bank details / board merchant | `submitToMSP` |
| Verification page submit button | `submitToMSP` |
| Connect bank (Plaid) | `createPlaidLinkToken` → `exchangePlaidToken` |
| Load merchant data | `getMerchantData` |
| Add/edit signer | `manageSigner` |
| Add MID (UI) | `manageMerchantID` (action=add) → auto-calls `submitToMSP` |
| Add/edit legal entity | `manageLegalEntity` |
| View/fetch signing documents | `listDocuments` → `getDocuments` |

---

## Signing Flow (signApplication)

`signApplication` packages MSPWare applications for BoldSign e-signature and returns iframe-embeddable signing URLs.

### Flow
1. Load profile, signers, MIDs, locations
2. For all non-done MIDs (`Active`, `Active (Existing)`, `Pending MID` are skipped), verify their `mspApplicationNo` still exists in MSP — clear it **only on explicit 404** (not on network errors)
3. Auto-create MSPWare drafts for **all MIDs missing `mspApplicationNo`** (not just when zero signable exist)
4. Fill form via `PUT /applications/{no}/form`; re-check completion via GET after PUT
5. Create signature package via `POST /applications/{no}/signatures` with `sendEmail: false`
6. Fetch signing link per signer via `GET /applications/{no}/signatures/link?emailAddress=<email>`

### Critical signing link behavior
- The `POST /signatures` response body does NOT contain the signing URL — only the endpoint path
- The link endpoint (`/signatures/link?emailAddress=`) DOES return the BoldSign URL, but only after a brief delay after package creation
- **Always retry the link endpoint once after 1 second** if it returns null — BoldSign needs a moment after package creation
- When `envelopeStatus` is `"new"` and signer `status` is `"new"`, the link IS available — do not skip it
- Response `link` field is a full `https://app.boldsign.com/document/sign/?documentId=...` URL

### Signing URL debugging
- Use `debugMSPSignatures` function: `{ appNo: 165, email: "user@example.com" }` — returns raw signatures response + link by email + link by signerid
- A `-1%` form completion means the MID has no bank details (no routing/account number) — fix the data, not the code

### is_firearm_verified
⚠️ **CRITICAL — DO NOT CHANGE:** 

### MSPWare form field constraints (buildFormPayload)

These rules are enforced by MSPWare validation and will cause `success: false` / `-1%` completion if violated:

| Rule | Detail |
|---|---|
| `average_sales` < `monthly_sales` | average must be strictly less than monthly volume |
| `highest_ticket` > `average_sales` | highest ticket must be **strictly greater than** average (not equal) |
| `highest_ticket` < `monthly_sales` | highest ticket must also be less than monthly volume |
| `delayed_delivery` >= 1 | minimum value is 1 even when fulfillment is immediate |

**Correct cap logic:**
```js
const cap = Math.max(monthlyCardSales - 1, 1);
const avgSaleAmount = Math.min(rawAvg, cap);
const minHighest = avgSaleAmount + 1;           // strictly greater than average
const highestTicketAmount = Math.min(Math.max(rawHighest, minHighest), cap);
```

**Symptom of broken cap logic:** MSPWare returns `percent_complete: -1` or 98–99% after PUT with a data error like `"Must be Greater than Average Transaction Amount"` for `highest_ticket`. The GET after PUT will show -1% because MSPWare rolls back the entire form on validation failure.

### buildFormPayload — Strict Template Preservation Rule

**This is the most important rule governing MSPWare form fills. Violating it causes silent form corruption.**

MSPWare templates (#6 ICPLS, #154 Cash Discount) pre-fill a large set of fee schedule, equipment, and account configuration fields when a draft application is created. Sending ANY of those fields in a subsequent `PUT /form` payload **OVERWRITES the template value** — even if you send the exact same value the template already has. The overwrite corrupts internal template state, causing form completion to drop below 100% and blocking signing.

**The fix:** `buildFormPayload` in both `submitToMSP` and `signApplication` must send ONLY the merchant-specific fields listed in its header comment. Any field owned by the template must be completely absent from the PUT payload.

**Fields that must NEVER be sent in PUT /form (template-owned, confirmed 2026-06-30, updated 2026-07-08):**
`billing_method`, `billing_frequency`, `funding_type`, `monetary_code`, `statement_type`, `monthly_minimum_fee`, `chargeback_fee`, `account_maintenance_fee`, `rtp_monthly_fee`, `touch_tone_auth`, `avs_service_auth`, `bank_referral_auth`, `op_assisted_auth`, `C4_surcharging_cardholder_surcharge`, `tokenization`, `tokenization_service_fee`, `tokenization_platform_fee`, `tokenization_sharing_indicator`, `has_pin_debit`, `debit_auth_method`, `debit_pricing_method`, all `ACCL_*`/`AFFN_*`/`ALAS_*`/`CU24_*`/`INKL_*`/`MSTO_*`/`NETS_*`/`NYCE_*`/`POSD_*`/`PULSE_*`/`ITS_*`/`STAR_*`/`UPDBT_*` per-network debit fields, `fixed_individual_tiers_pricing`, `multi_currency_conversion`, `secure3d`, `all_markup_discount`, `all_markup_per_item`, `all_card_auth_per_item`, `intl_card_handling_fee`, `auth_pricing_program`, `annual_fee_start_date`, `is_firearm_verified`, **`cards_accepted`/`all_cards`** (added 2026-07-08 — see Critical Lesson below; sending an explicit card list overwrote template #133's `all_cards: true` default and silently dropped UnionPay on every application).

**How to verify before adding a new field:** `GET /applications/154/form` — if the field appears in the response with a non-null value, it is template-owned. Do not send it.

### -1% form completion after PUT
MSPWare rolls back the entire form and returns `percent_complete: -1` when **any** validation rule fails during PUT. The GET after a failed PUT looks identical to a blank form. Always check the PUT response body for `validation.errors.data` — the real error is there, not in the GET.

---

## What NOT to Do

- Do not call Elavon eBanking API directly (no `uat-buynow-na.elavon.net`, no `PAPI_USA_CLIQBUX1`, no AWB-based polling)
- Do not use `submitToElavon` — it is deleted
- Do not set `MSP_SUBMIT_ENABLED=true` in any automated test or dry-run context
- Do not add new boarding fields to `MerchantLocations` — use the `MerchantMID` entity
- Do not hardcode `86764` as salesperson ID — that is the old Elavon rep code; MSPWare ID is `76764`
- Do not use `appkey`/`appid` as MSPWare header names — use `X-API-KEY` and `X-App-ID`
- Do not send `is_firearm_verified` in the API payload at all — every value is rejected by MSPWare PUT /form. The "yes" captured from the MSPWare UI applies only to their internal TestData.cfc endpoint. Omit the field entirely.
- Do not add `catch (_) {}` silent error swallowing — always log errors and surface them to the user
- Do not call `manageLegalEntity` from `OnboardingBanking` on mount — use `getMerchantData` instead (3-in-1 safe call)
- Do not call `syncFromHubspot` in `fetchMerchantData` — it is already called in `initMerchantData`
- Do not call `getMerchantData` twice on portal load — `initMerchantData` now handles the full init flow
- Do not call `manageLegalEntity` with `action: 'create'` — the action is `'add'`
- Do not clear `mspApplicationNo` on any non-success from MSPWare GET — only clear on explicit HTTP 404. Other errors (rate limit, network) must not cause duplicate drafts.
- Do not send `is_firearm_verified: false` (boolean) — causes `canSave: false`, blocking the entire form fill
- Do not gate MID draft creation on bank details being present — create the draft even if banking hasn't been linked yet
- Do not call `base44.auth.me()` in `pushStatusToHubspot` — it is fire-and-forget from the magic-link portal and the check was silently returning 401. Auth check removed 2026-06-29.
- Do not iframe HubSpot quote URLs — HubSpot sends X-Frame-Options headers that block cross-origin embedding. Use a link button that opens in a new tab, or pull line items via the HubSpot API and render natively.
- Do not use `discount_percentage` as a HubSpot line item property name — the correct name is `hs_discount_percentage`
- Do not deduplicate HubSpot companies by email domain for real merchant data — the `createHubspotDeal` domain-based dedup only works for merchants with their own domains; testing with @cliqbux.com creates noise records
- Do not send `manageLegalEntity` from an authenticated-only path for portal (magic-link) users — they have no Base44 session. The function must use `asServiceRole`.
- Do not have an AI agent click through and fill fields in the live MSPWare dashboard to discover correct values — use `debugMSPFormRaw` against a real application/template number instead, and codify the result in `docs/mspware-field-reference.md`. See Critical Lesson #7.
- Do not send bare `entity_number: '48603'` — the correct wire value is `'48603-17'` (includes the Client Group ID). See `docs/mspware-field-reference.md`.
- Do not derive equipment/VAR fields from merchant/location data — Cliqbux always ships the same static hardware/VAR config. See `docs/mspware-field-reference.md` for the exact `eqp_hardware_section`/`eqp_var_section` values.

---

## Onboarding Portal Flow (REORDERED 2026-07-10 — quote signing moved to LAST)

**Decided by Teddy 2026-07-10:** the equipment quote is signed AFTER the merchant
account signing, and nothing in the application flow is gated on it. The flow is now:

```
Step 1: Locations & Org Chart (OnboardingLocations) — always unlocked
Step 2: Banking (OnboardingBanking) — unlocked when ≥1 location exists
Step 3: Identity Verification & Merchant Agreement Signing (OnboardingVerification) — unlocked when 1+2 done
Step 4: Equipment Quote signing — EMBEDDED IFRAME on PostSubmissionDashboard, after submission
```

- `Step1Agreement` is RETIRED (no longer imported/rendered anywhere). Do not route merchants to it.
- `applicationStatus: 'Incomplete'` no longer locks anything — it's just the pre-quote-signed state.
- **Quote iframing: the 2026-06-27 "CONFIRMED BLOCKED" finding is SUPERSEDED for custom-domain quotes.** Quotes served from `www.cliqbux.com` (HubSpot custom domain) send NO `X-Frame-Options`/`frame-ancestors` — verified via curl 2026-07-10 — so `PostSubmissionDashboard` embeds them directly. HubSpot's own `*.hs-sites-na2.com` URLs remain unframeable; if a quote URL ever isn't on cliqbux.com, fall back to the "Open in new tab" link (already rendered next to the iframe).
- Quote signature detection: `syncFromHubspot` reads the quote's `hs_quote_esign_status` and upgrades `applicationStatus` Incomplete → 'Quote Signed' (never regresses later statuses). The `quote_signed` HubSpot webhook remains a second path.

### Historical (pre-2026-07-10) flow — quote-first, for context only

The `STEP_SUMMARY` (review step) was removed — it was redundant.

**OnboardingBanking** (`src/pages/OnboardingBanking.jsx`) is a dedicated banking step that:
- Receives `initialLocations` from `OnboardingPortal` state (no blocking API call)
- Calls `getMerchantData` as a background refresh for bank details
- Passes `corporateId` directly in backend call payloads (see "Security: Portal Auth")

**OnboardingLocations** (`src/pages/OnboardingLocations.jsx`) is a 3-level org chart builder:
- Legal Entity → Locations → MIDs (MerchantMID records)
- All draggable/reorganizable
- Entity details (ownershipType, taxClassType, establishmentYear) are per-entity inline panels
- BusinessDetailsPanel was removed from the top-level — now inline per entity

**Progress tracker** (`src/components/onboarding/ProgressTracker.jsx`): 4-step clickable nav.

---

## New Entities (2026-06-29)

### StagedApplication
Admin-created or auto-tracked application staging records. Supports:
- Admin staging: pre-fill fields, select which locations/MIDs/signers appear
- Auto-tracking: `trackProgress` action upserts a record when merchant opens the portal
- Admin dashboard at `/admin/applications` (`ApplicationManager.jsx`). Tracks `__auto_track__` progress (currentStep / lastSeenAt), MSP form errors via `getMSPFormStatus`, and admin impersonation via `manageStagedApplication` action `impersonate`.
- Labels: `__auto_track__` for auto-created tracking records; custom label for admin-created stages

### MerchantCorporateProfile.legalEntities schema (updated)
The `legalEntities` array items now include `ownershipType`, `taxClassType`, `establishmentYear` as schema fields. Without these in the schema, Base44 strips them on every save. The entity JSON file must declare them.

---

## Security: Portal Auth (LOCKED DOWN 2026-07-09 — read this before touching any backend function)

**As of 2026-07-09, every merchant-facing backend function verifies the caller on every request.** The old model (trust whatever `corporateId` the browser sends) is gone — it let anyone who guessed a corporateId (= HubSpot deal ID, a guessable number) read/write another merchant's SSNs and bank details.

**How it works now:**
1. Merchant tokens (HMAC-signed JWTs bound to a `corporateId`) are issued by: `validateResumeToken` (magic resume links), `createHubspotDeal` (self-serve signup), `manageStagedApplication` action `validate` (staged application links, 7-day expiry), and `manageStagedApplication` action `impersonate` (admin-only, **30-minute** TTL for live sales guidance).
2. The frontend stores the token in sessionStorage (`merchant_jwt`) and attaches it as a Bearer header via `invokePortalFunction` (`src/lib/merchantAuthFetch.js`). When no merchant token exists, `invokePortalFunction` falls back to `base44.functions.invoke` so admin/workspace sessions still work through the same call sites.
3. Every merchant-facing function contains an **inlined** `getPortalActor(req, base44)` block (canonical copy + usage docs in `base44/functions/helpers/auth.ts` — it cannot be imported because Base44 bundles each function in isolation). It resolves the caller to `{ actor: 'merchant', corporateId }` (valid merchant JWT), `{ actor: 'admin' }` (Base44 workspace session), or `null` (reject 401). Merchant actors are only allowed to touch their own `corporateId`; ownership checks use the **token's** corporateId, never the request body's.
4. Functions keyed on something other than corporateId resolve ownership first: `removeSelfServeLocation` and `saveLocationBankDetails` load the location record and compare its corporateId to the token's; `getMSPFormStatus` checks the applicationNo belongs to one of the token's MIDs.
5. Admin-only functions (`deleteMerchant`, `debugEnv`, `debugMSPForm`, `debugMSPFormRaw`, `debugMSPSignatures`, `refillMSPForms`, `importExistingMIDs`, `readMSPTemplate`) require a workspace session and deliberately reject merchant tokens. Note: curl-testing these against the published URL now requires a workspace session.
6. `manageStagedApplication` never leaks `accessToken` to list/get/create/update responses (`sanitizeStage`). Public `validate` compares the token server-side and returns a sanitized stage + merchant JWT. Admin invite URLs come from `getInviteLink` or `send` only. Admin portal "View" uses `impersonate` (30-min JWT via `?corporateId=&impersonateToken=`), not the long-lived staged link. `OnboardingPortal` strips `impersonateToken` from the URL after storing it and sets `portal_impersonating` + the gold banner ("Saves write to the live record").
7. Still deliberately public: `validateResumeToken`, `verifySignerToken` (its own signer token), `sendResumeLink` (email-keyed, no data returned), `createHubspotDeal` (signup), `handleHubspotWebhook` (HubSpot webhook — TODO: verify HubSpot signatures).

**Rules:**
- Requires `MERCHANT_JWT_SECRET` env var in Base44 (already used by `validateResumeToken`). If it's unset, all merchant tokens fail verification and merchants get 401s.
- New merchant-facing functions MUST copy the `getPortalActor` block from `helpers/auth.ts` and gate on it. New portal call sites MUST use `invokePortalFunction`, not `base44.functions.invoke`.
- Do NOT “fix” a portal 401 by removing a gate — fix the missing/expired token instead. The pre-2026-07-09 lessons below about removing `auth.me()` checks are superseded by this model: `getPortalActor` already handles the no-session case gracefully.
- `pushStatusToHubspot`, `verifyEIN`, `syncFromHubspot`, `batchUpdateStatus` now accept merchant tokens (previously they either required a workspace session — silently 401ing portal users — or were wide open).

## Security: Portal Auth (HISTORICAL — superseded 2026-07-09, kept for context)

**Correction:** this section previously described a `withToken()` helper in `src/lib/portalToken.js` injecting a `portalToken` into every backend call, verified server-side via `verifyPortalAccess()`. That was an aspirational note that was never implemented. Neither the helper, the file, nor any `portalToken` sessionStorage key exist anywhere in the codebase. **Do not build against the old description.**

**What actually happens:** Portal users authenticate via magic-link tokens, not Base44 sessions, but validation is one-time, not per-request:

1. `OnboardingPortal.jsx`'s `validateResumeToken(token)` calls the `validateResumeToken` backend function once, on portal entry, with `{ token }`.
2. On success, the resolved `corporateId` is cached in `sessionStorage` under the key `resume_corp_${token}` (per-token, not a generic key).
3. Every subsequent backend call (`getMerchantData`, `listLocations`, `manageLegalEntity`, `manageMerchantID`, `addSelfServeLocation`, etc.) passes `corporateId` directly in its payload — there is no request-level token wrapper.
4. Backend functions trust `corporateId` as the identity boundary per request; they do not re-verify a token on each call.

Admin calls (issued from the Base44 dashboard, not the magic-link portal) pass through unchanged — they're protected by Base44 workspace membership, not this flow.

---

## Cash Discount Template

**⚠️ CD_TEMPLATE_NO switched from 154 to 133 (2026-07-07).** MSPWare has two similarly-named "Cash Discount" records, and this has caused confusion twice now — read carefully before touching either one.

- **#154 "Cliqbux Template Cash Discount"** — the OLD template. Confirmed via direct API pull on 2026-07-07 that it was missing key data and was never properly maintained. **No longer used anywhere in the code.** Do not edit it; do not reference it for anything going forward.
- **#133 "Cash Discount Template"** — the NEW/current `CD_TEMPLATE_NO`, as of 2026-07-07. Originally built by Teddy weeks ago as a scratch/reference copy (hence the generic name), it is a properly MSPWare-typed **Template** record (unlike #154, which was a plain "New"-status application being reused as a template source — that's why #154 never showed up in the MSPWare dashboard's Templates list, only under Applications). Teddy has since confirmed its field values and it is now the live source for every new Cash Discount application, in both `submitToMSP` and `signApplication`.
- Both `submitToMSP` and `signApplication` auto-select the correct template based on `pricingTier`.
- **Before editing fees or any template config in the MSPWare dashboard, always confirm the `merchantapplicationno` in the URL is 133, not 154 or any other record — the on-screen title alone isn't a reliable check.**

**⚠️ Cliqbux NEVER uses MSPWare's "Clear and Simple" pricing method.** Confirmed by Teddy 2026-07-03: "We do not use clear and simple for pricing method ever. Tiered only." `TIER_TO_METHOD` maps Cash Discount to `pricing_method: 'TIERD'` ("Tiered"). `buildFormPayload` (submitToMSP + signApplication) sends an explicit flat-rate Tiered fee schedule (3.3816% across all discount tiers, $0 per-item, flat PIN debit surcharge) when `pricingMethod === 'TIERD'` — see `docs/mspware-field-reference.md` for the full field list. Template #133 already natively defaults to `pricing_method: "TIERD"` (unlike old #154, which defaulted to `"CLEAR"` and required an explicit override), so this is now consistent end-to-end. Also confirmed: `tokenization: 'none'` is sent for all merchants ("No tokenization is available to us now" — Teddy).

### Template #133 pre-set fields (confirmed live via `debugMSPFormRaw {"appNo":"133"}` on 2026-07-07)
These fields are owned by the template and must NOT be sent in any PUT /form payload:

**✅ RESOLVED 2026-07-07:** `funding_type: "0"` and `billing_frequency: "D"` are both intentional, confirmed by Teddy via the MSPWare Bank Accounts screen — `"0"` is the wire code for **"True Daily (RTP)"** funding (paired with **"Daily Billing"**), not an unset/blank value. This is a deliberate, different funding product from old #154's Monthly/net-settlement setup, not a data gap.

| Field | Template value | Notes |
|---|---|---|
| `pricing_method` | `"TIERD"` | Tiered — native default on #133, no override needed |
| `card_acceptance_split` | `"OMNI"` | |
| `pricing_category` | `"1"` (implied; not set on #133's owners stub — verify per MID) | Merchant/MID value should override |
| `billing_method` | `"N"` | Net settlement |
| `billing_frequency` | `"D"` | **Daily Billing** — pairs with True Daily (RTP) funding above; confirmed intentional by Teddy 2026-07-07 (differs from old #154's Monthly setup) |
| `funding_type` | `"0"` | "True Daily (RTP)" — confirmed correct/intentional by Teddy 2026-07-07 |
| `monetary_code` ("Monetary Billing Method" in UI) | `"C"` (displays as "Card Discount") | Intentionally changed by Teddy 2026-07-07 |
| `statement_type` | `"A"` | Combined statement |
| `statement_delivery_method` | `"E"` | Email delivery |
| `monthly_minimum_fee` | `"0"` | Changed by Teddy 2026-07-07 |
| `chargeback_fee` | `"15"` | Changed by Teddy 2026-07-07 |
| `account_maintenance_fee` | `"0"` | Changed by Teddy 2026-07-07 |
| `return_item_fee` | `"15"` | Newly documented 2026-07-07 |
| `annual_fee` | `"0"` | Newly documented 2026-07-07 |
| `monthly_service_fee` | `"0"` | Newly documented 2026-07-07 |
| `rtp_monthly_fee` | `"0"` | Differs from old #154's `10` |
| `touch_tone_auth` | `"0"` | Differs from old #154's `0.65` |
| `avs_service_auth` | `"0"` | Differs from old #154's `2.20` |
| `bank_referral_auth` | `"0"` | Differs from old #154's `4` |
| `op_assisted_auth` | `"0"` | Differs from old #154's `0.95` |
| `C4_surcharging_cardholder_surcharge` | `3` | 3% CD surcharge rate — same as #154 |
| `tokenization` | `"none"` | Differs from old #154's `"token"` — matches the 2026-07-03 "no tokenization" decision |
| `tokenization_sharing_indicator` | `"N"` | No token sharing |
| `fixed_individual_tiers_pricing` | `false` | No tiered pricing |
| `multi_currency_conversion` | `false` | No DCC |
| `secure3d` | `false` | No 3DS |
| `cards_accepted` | VISA, VISA_DEBIT, MC, MC_DEBIT, DISC, UNIONPAY, AMEX | All major cards + UnionPay (old #154 lacked UnionPay) |
| `has_intermediary_businesses` | `false` | |
| `owner_confirmed` | `false` (template stub) | Our code always sends `true` per real merchant — this is fine since it's in the "DO send" list |
| `country_formation` | `"USA"` | |
| `country_operations` | `"USA"` | |
| `debit_auth_method` | `"FIXED"` | Differs from old #154 — verify against known-valid values in "MSPWare Form Fill: Known Valid / Invalid Values" below |
| `debit_pricing_method` | `"SURCH"` | Differs from old #154's `"ICPLS"` |
| `entity_number` | `"48603-17"` | Same as documented elsewhere |
| `settlement_option` | `"Net"` | |

**Fields we DO send (merchant-specific):**
`full_dba_name`, `legal_dba_name`, `products_or_services`, `year_business_established`, `ownership_years/months`, `ownership_type`, `tin`/`ssn`, `llc_class`, `industry_type`, `contact_first/last_name`, `business_phone/email/address/city/state/zip`, `owners[]`, `annual_revenue`, `monthly_sales`, `average_sales`, `highest_ticket`, `freq_highest_average_ticket`, `cp_percent`, `cnp_percent`, `int_percent`, `moto_percent`, `delayed_delivery`, `mcc`, `pricing_method`, `pricing_category`, `deposit_account_no/rtg/type`, `chargebacks_retrievals_format/email`, `state_of_formation`, `currently_processing`, `seasonal_business`, `refund_policy`

---

## MSPWare Form Fill: Known Valid / Invalid Values (2026-06-29)

| Field | Correct value | Notes |
|---|---|---|
| `is_firearm_verified` | **OMIT** | Every API value rejected. Must be checked in MSPWare dashboard UI. Form stays at ~99% but `canSave: true`. |
| `debit_auth_method` | `"PNL"` | Pinless. Required when `has_pin_debit=true` (template default). |
| `debit_pricing_method` | `"ICPLS"` | Accepted without error. |
| `has_pin_debit` | `false` | Sent to try to suppress debit required fields. Template may still assert true. |
| `delayed_delivery` | `"1"` minimum | Must be ≥ 1; MSPWare rejects `"0"`. |
| `cp_percent` + `cnp_percent` | Must sum to 100 | When `cardPresentPct` is null, default to 100/0 not 0/100. |
| `avg_sale_amount`, `highest_ticket` | Must be < `monthly_card_sales` | Use Math.min(x, monthly − 1). |
| `deposit_account_type` | `"CK"` (checking) or `"SA"` (savings) | Map from `bankDetails.accountType`. |
| `owner_state_usa` | Valid US state only | Strip US territories (GU, PR, VI, AS, MP) — send business location's state as fallback. |
| `owner_title` | `"CEO"`, `"OP"`, `"VP"`, etc. | Map from full enum (e.g., `CHIEF_EXECUTIVE_OFFICER` → `"CEO"`). |

**Sequential test data warning:** MSPWare rejects any TIN or SSN that is fully sequential (e.g., `123456789`). These cause silent form rejection — all fields appear to save but nothing sticks. Real merchant data will work.

**Duplicate MSP application prevention:** `signApplication` previously cleared `mspApplicationNo` on any non-success API response, causing duplicate drafts. Now only clears on explicit HTTP 404. Network errors, rate limits, and other transient failures must NOT clear the stored application number.

---

## manageMerchantID Function

`manageMerchantID` is the frontend-facing function for `MerchantMID` records. Actions: `list`, `add`, `update`, `delete`. The entity's own field names (`merchantName`, `dbaName`, etc.) are used directly — there is no translation layer between the frontend and the entity.

Status locking: `manageMerchantID` blocks `update` and `delete` when `applicationStepStatus` is in `LOCKED_STATUSES` (`['Pending MID', 'Active', 'Active (Existing)']`) with HTTP 403.

---

## Signer Verification UI + Persistence (reworked 2026-07-10)

**One modal per signer — `SignerDetailsModal.jsx`.** Teddy's direction 2026-07-10: splitting name/email/ownership editing (inline row fields) from identity verification (a separate expanding form) confused merchants, and ID upload/AI reading is unnecessary for now. Changes:

- `InlineVerifyForm.jsx` and `SignerIdUpload.jsx` are **DELETED**. Do not recreate them. `SignerRoster` now opens `SignerDetailsModal` from a single "Edit" button per row (and from a full-width amber "Complete Identity Verification" CTA for the unverified primary — keep that CTA prominent, see the 2026-07-07 lesson about testers missing small verify pills).
- The modal collects contact info (first/last/email/ownership %) plus, for the **primary signer only**, identity fields (DOB, SSN, address, title, phone). Saving the primary sets `identityStatus: 'Verified'` via one `manageSigner action: 'update'` call and syncs the profile's firstName/lastName via `updateMerchantProfile`. Non-primary signers get contact fields only — they verify themselves via the email invite (`/verify` page, `VerifyIdentity.jsx`, unchanged).
- **ID upload is removed from the UI everywhere** (no upload phase, no AI extraction via `InvokeLLM`, no per-signer "Government ID Document" dropzone). The `idDocumentUrl` entity field, the `manageSigner` `inlineVerify` action, and the `uploadSignerIDsToMSP` backend function all still exist — dormant, not deleted — so re-enabling upload later is a frontend-only change.
- The "returning signer detected" lookup (`manageSigner action: 'lookupByEmail'`) lives on in the modal.

`verifySignerToken`'s `get` action still returns all previously saved fields so the invited-signer form pre-populates on revisit.

---

## Email Sending (Resend)

All transactional emails use Resend via `RESEND_API_KEY` env var. From address: `onboarding@onboarding.cliqbuxpos.com` (verified domain in Resend). Functions using Resend: `manageSigner` (KYC invite), `sendResumeLink` (portal resume), `manageStagedApplication` (staged app invite).

Do NOT use Base44's built-in `SendEmail` — it only works for registered workspace users, not external merchants.

**Logo in email HTML (2026-07-13):** Do NOT hotlink `/brand/cliqbux-mark.png` (or any app URL). Mail clients often get 403/500 from Base44 static hosting and render a white "…" broken-image pill under the wordmark. Embed the mark as a Resend inline attachment (`content_id: cliqbux-logo`, HTML `cid:cliqbux-logo`). Canonical source: `helpers/emailBrand.ts` + `public/brand/cliqbux-mark-email.png` (regen via `scripts/gen-email-brand.mjs`). Copy the block into each email function — Base44 cannot import helpers.

---

## Rate Limiting — Critical Warning

Base44 enforces a per-account API rate limit on `asServiceRole` entity calls. This limit applies across ALL functions in the account.

**Root cause of past outages (2026-06-29):** The old `EntityDetailsPanel` in `OnboardingLocations.jsx` had a stale closure bug that caused it to call `manageLegalEntity` hundreds of times per minute (runaway autosave timer). This saturated the rate limit, causing ALL `asServiceRole` calls — including `getMerchantData` in the merchant portal — to fail with `{"error":"Rate limit exceeded"}`.

**Signs you've hit the rate limit:**
- Functions return HTTP 500 with body `{"error":"Rate limit exceeded"}`
- `getMerchantData` fails → merchant portal shows "Connection Error"
- Both `manageLegalEntity` AND `updateMerchantProfile` fail simultaneously

**Fix:** Stop whatever is spamming calls (usually a runaway frontend timer). The limit clears within a few minutes once the spam stops.

**Prevention:** Never schedule repeated API calls inside a React `setForm` updater, `useEffect` without proper deps, or `setInterval`. Always debounce autosave with `setTimeout` + `clearTimeout` via `useRef`.

---

## Frontend Patterns — Known Fixes

### EntityDetailsPanel (OnboardingLocations.jsx)
The `ownershipType`, `taxClassType`, and `establishmentYear` fields use a ref-based autosave pattern to avoid stale closures. Key points:
- Uses `useRef` for `entityIdRef`, `onUpdatedRef`, `timerRef` — NOT `useCallback` with `onUpdated` in deps
- `scheduleSave` clears and resets a 600ms debounce timer
- `executeSave` calls `manageLegalEntity` then `updateMerchantProfile` in sequence
- Do NOT put `setTimeout` inside a `setForm` updater (React anti-pattern — causes runaway calls)

### manageLegalEntity — legalEntities field
Base44 sometimes returns `profile.legalEntities` as a JSON string instead of a parsed array. The function includes defensive parsing:
```typescript
let rawEntities = profile.legalEntities ?? [];
if (typeof rawEntities === 'string') {
  try { rawEntities = JSON.parse(rawEntities); } catch { rawEntities = []; }
}
```
Do NOT remove this guard.

### OnboardingBanking data loading
The banking step uses `initialLocations` passed as a prop from `OnboardingPortal` (already loaded) as its primary data source. It calls `getMerchantData` only as a background refresh for bank details. This avoids a blocking dependency on `getMerchantData` succeeding before the step renders.

### OnboardingPortal init flow
`initMerchantData` calls `getMerchantData` exactly once (or twice if a HubSpot sync runs and we need fresh data). `fetchMerchantData` is a lightweight re-fetch used only after status changes. Do not add `syncFromHubspot` back to `fetchMerchantData`.

### manageLegalEntity — auth fix
`manageLegalEntity` previously called `base44.auth.me()` and returned 401 for portal (magic-link) users. The auth check was removed — the function uses `asServiceRole` throughout. Removing this was the root cause of legalEntities fields not persisting.

### legalEntities schema — must declare ownershipType etc.
`MerchantCorporateProfile.legalEntities` array items must have `ownershipType`, `taxClassType`, `establishmentYear` declared in the entity schema (`base44/entities/Merchant Corporate Profile.jsonc`). Without schema declarations, Base44's platform strips those keys on every save.

### EntityDetailsPanel autosave — use explicit Save button
Previous implementations used debounced autosave (800ms) for entity fields, which caused API call storms and rate limiting. The current implementation uses an explicit "Save Details" button. Do NOT revert to autosave for entity-level dropdowns.

### removeSelfServeLocation — must use asServiceRole
`removeSelfServeLocation` previously required `base44.auth.me()`. Fixed to use service role. Portal users can now delete their own locations.

### addSelfServeLocation — entity creation is server-side
Entity creation for new merchants happens inside `addSelfServeLocation` using service role. The frontend must NOT call `manageLegalEntity` to create entities (portal users have no auth session). Pass `newEntityName` and `newEntityEIN` to `addSelfServeLocation` instead.

### StagedApplication auto-tracking
`OnboardingPortal` calls `trackProgress` (action on `manageStagedApplication`) fire-and-forget on step transitions. Do NOT await it or let it block the UI. The label `__auto_track__` identifies these records. Do NOT merge `prefilledData` from auto-track records onto the profile — it contains tracking metadata (currentStep, lastSeenAt) not field data.

---

## HubSpot Integration

### Architecture: How HubSpot maps to Base44

HubSpot is the CRM/sales layer. Base44 is the operational layer. They are linked by `corporateId = HubSpot dealId`.

```
HubSpot                          Base44
──────────────────────────────────────────────────────────
Parent Company (Corporation)  →  MerchantCorporateProfile
  └─ Child Company (Brand)    →  (brand grouping field on Locations — no entity yet)
       └─ Child Company (Loc) →  MerchantLocations
Deal (on Location company)    →  corporateId = dealId (the link between systems)
Quote (on Deal)               →  hubspotQuoteId on MerchantLocations (+ hubspotQuoteUrl on profile)
Line Items (on Quote)         →  getHubspotQuote (live HubSpot API, TanStack 10-min cache in UI)
```

### 3-tier company hierarchy

HubSpot supports multi-level parent-child on Company records. The intended structure:

- **Tier 1 — Corporation**: top-level Company (Island Pacific, BAD BAKERS LLC, Tailwind Concessions)
- **Tier 2 — Brand**: child Company of Corporation (San Honore, Phil House, Boba Opa — children of Island Pacific). Single-brand operators skip this tier.
- **Tier 3 — Location**: child Company of Brand or Corp. Name convention: `"Brand - City"` (e.g., `"BAD BAKERS - Santa Ana"`). Tailwind and BAD BAKERS already follow this pattern.

**Critical constraint: the hierarchy is built progressively, not upfront.** Legal entity structure (which corporation owns which brands) is unknown during the sales stage — we only learn it when the merchant fills out their onboarding application. Don't try to pre-build the hierarchy. The Company record starts flat (whatever name the salesperson knows), and the portal retroactively enriches it with EIN, ownership type, and parent association when the merchant submits.

### Current company data in HubSpot (audited 2026-06-29)
- 688 company records total
- ~229 child companies exist, mostly Tailwind airport locations (all children of one Tailwind parent) and BAD BAKERS city locations — these are already using the correct pattern
- Deals are at mixed levels (some corporation-level, some brand, some location) — needs normalization
- Island Pacific exists only as a Deal, not a Company with brand hierarchy
- ~80 junk "Cliqbux — Self-Serve Onboarding" deals at $0/New Lead from portal testing — noise, not real merchants

### `createHubspotDeal` — what it does
Called at portal self-serve sign-up. Creates: Contact (from signerName/signerEmail) + Company (from businessName, domain = email domain) + Deal (`"${businessName} — Self-Serve Onboarding"`, stage: New Lead, amount: $0) → associates them → creates `MerchantCorporateProfile` in Base44 with `corporateId = dealId`.

**Known bug:** Company deduplication uses the signer's email domain (`signerEmail.split('@')[1]`). Testing with a `@cliqbux.com` email maps every test merchant to the `cliqbux.com` domain, creating dozens of duplicate companies or mis-associating to Cliqbux's own company record. Real merchants with their own domains will work correctly.

### `pushStatusToHubspot` — milestone → deal stage
Called fire-and-forget from `OnboardingPortal.jsx` on every step transition. Maps milestones to pipeline stages:

| Milestone | HubSpot stage |
|-----------|--------------|
| `link_sent` | onboarding_link_sent |
| `link_opened` | onboarding_link_opened |
| `agreement_filled` | merchant_agreement_filled |
| `agreement_signed` | merchant_agreement_signed |
| `locations_added` | locations_added |
| `application_submitted` | application_submitted |
| `closed_won` | closedwon |
| `closed_lost` | closedlost |

Returns 200 with `synced: false` (not an error) when the deal is not found in HubSpot — handles sales-led deals that haven't been self-served.

**Was silently broken:** `auth.me()` check blocked all portal users (magic-link). Fixed 2026-06-29 by removing the check. See Critical Lesson #6.

### Custom Company properties (created by `setupHubspotProperties`)
These already exist on HubSpot Company records but are **never populated yet** — the enrichment write-back is not implemented:
`ein`, `ownership_type`, `state_of_formation`, `mcc_code`, `dba_name`, `monthly_card_sales`, `avg_ticket`, `card_present_pct`, `pricing_tier`

**Next step:** When `pushStatusToHubspot` fires `application_submitted`, it should also: (1) fetch `MerchantCorporateProfile` via `asServiceRole`, (2) `GET /deals/${dealId}/associations/companies` to find the linked Company ID, (3) `PATCH` the Company with the above fields from the Base44 profile.

### HubSpot Quote line items — confirmed field names (2026-06-29)
Pulled from test quote 305636118240 ("Test Deal", $1,400 total):

| HubSpot field | Notes |
|---|---|
| `name` | Product/service name |
| `quantity` | Numeric |
| `price` | Unit price |
| `amount` | Line total (price × qty − discount) |
| `hs_total_discount` | Flat discount applied |
| `hs_discount_percentage` | % discount (use instead of `discount_percentage`) |
| `hs_sku` | SKU — may contain serial number for bundled hardware |
| `description` | Optional long description |

Quote-level fields: `hs_quote_link` (public signing URL), `hs_quote_esign_status` (`PENDING_SIGNATURE` / `SIGNED`), `hs_esign_num_signers_completed`, `hs_esign_num_signers_required`, `hs_quote_amount`, `hs_expiration_date`.

**To pull line items from the API:**
```
GET /crm/v3/objects/quotes/{quoteId}?associations=line_items
POST /crm/v3/objects/line_items/batch/read  (batch-fetch the line item details)
```

### Post-signing dashboard — hybrid architecture (shipped 2026-07-13)
After the merchant completes portal signing, `PostSubmissionDashboard` shows:
1. MID/underwriting status (existing)
2. `EquipmentOrderPanel` — native HubSpot line items via `getHubspotQuote` + conditional quote iframe for HubSpot Payments / e-sign

**Implemented:**
- `hubspotQuoteId` on `MerchantLocations` (synced from deal→quote associations)
- `equipmentPaidAt` on `MerchantCorporateProfile` (set when `hs_payment_status` is PAID)
- `getHubspotQuote` — portal `getPortalActor` gate; GET quote + batch/read line items
- Payment rail = **HubSpot Payments** on the quote page — not Stripe Elements
- `handleHubspotWebhook` event `quote_paid` → stamps `equipmentPaidAt` + dealstage `closedwon`
- Do **not** mark MerchantMID Active on quote payment

### Environment variables (HubSpot)
| Var | Purpose |
|---|---|
| `HUBSPOT_API_KEY` | HubSpot Private App token — already set. Used by `createHubspotDeal`, `pushStatusToHubspot`, `handleHubspotWebhook`, `syncFromHubspot`, `getHubspotQuote`. |

---

## AI Collaboration Channel

**Before making any changes in this repo, read `AI_CHANNEL.md` in the repo root.**

`AI_CHANNEL.md` is a shared message log between Claude (Cowork) and Base44 AI. It contains the latest decisions, questions, and action items from both sides. Respond by appending a new entry in the format specified at the top of that file and committing it.

---

## Base44 Dev Notes

- Use `base44 dev` to run backend + frontend together locally
- Use `npm run dev` for frontend-only against hosted backend
- SDK version in use: `@base44/sdk@0.8.31` — keep consistent across functions
- Publish via Base44 dashboard or `base44 publish` after pushing to GitHub
---

## Portal UI Overhaul — Design System (2026-07-12, approved by Teddy)

Visual-only redesign of the onboarding portal to mirror dashboard.cliqbux.com. **No data fields, form keys, validation rules, save-button semantics, or fetch paths were changed** — explicit Save buttons remain everywhere (Critical Lesson #2 still applies; never replace them with debounce/autosave).

**Design tokens:**
- Brand gold `#F0AD4E` (dashboard accent) — Tailwind's `amber` scale 300–600 is overridden in `tailwind.config.js`, so every existing `amber-*` class app-wide lands on-brand. Change it there, not per-component.
- Headings use Poppins via `--font-display` / `font-display` class (`index.css`); body/forms stay Inter.
- Surface family (blue-tinted charcoal, matches dashboard): page `#0E1319` (`.portal-bg`, includes ambient radial gold glow), card `#161C26` (`.portal-card`, hairline border + 18px radius), panels `#1A212C`, nested cards `#151B24`, inputs `#10151C`.
- Color language: gold = brand/actions/entity level; blue = MID-layer identity accent only; green = complete; red = error. Purple retired.
- Skeleton loaders: `.skeleton` class (shimmer) in `index.css` — used by OnboardingLocations/OnboardingBanking loading states.

**framer-motion is now in active use** (first real usage in the app): step transitions in `OnboardingPortal` (`AnimatePresence mode="wait"` keyed by step), milestone card entrances/hover, `ProgressTracker` connector fills + compact mobile variant, Banking accordion height animation and progress bar. Keep animations transform/opacity-only.

**/dev/portal-preview harness** (`src/pages/DevPortalPreview.jsx`, DEV-only route in `App.jsx`): mounts the REAL OnboardingLocations/OnboardingBanking plus ProgressTracker/ApplicationTracker/MilestoneCard states against mock data. It sets a fake `merchant_jwt` in sessionStorage and stubs `window.fetch` for `/functions/` URLs (both restored on unmount) so zero backend traffic occurs. Use it to eyeball any future portal UI change without a merchant session.

**Env lesson for AI agents:** the Cowork browser pane loads pages with `document.visibilityState === 'hidden'`, which pauses `requestAnimationFrame` — framer-motion entrance animations freeze at their initial frame (elements stuck at `opacity: 0`) and native screenshots time out. This is NOT a code bug; real visible tabs play animations normally. Verify styling via computed styles/read_page, and for image proof use html2canvas in-page after force-completing inline `opacity`/`transform`. The `/dev/portal-preview?capture=1` harness automates this: it force-completes frozen inline styles, then POSTs a JPEG of each `[data-capture]` section to a local receiver on `127.0.0.1:5199` (a tiny node script). Also fires automatically when that receiver is reachable (OPTIONS probe).

### Token design system (2026-07-13, approved by Teddy) — supersedes the ad-hoc palette above for migrated pages

A formal token layer now lives in `src/styles/tokens.css` (imported first in `index.css`), namespaced `--cb-*` so it never collides with the shadcn `index.css` variables. Exposed as Tailwind utilities in `tailwind.config.js`: `bg-cb-bg/surface/surface-raised`, `border-cb-border/-strong`, `text-cb-accent/-muted`, `text/bg-cb-success/-danger`, `shadow-cb-raised/-overlay`, `rounded-cb` (12px), and the type scale `text-cb-caption/-body/-body-lg/-title/-display`. **Approved token values live only in `tokens.css` — never hardcode the hex.** Accent is `#FEAC27` (website hero gold) here, vs `#F0AD4E` (dashboard) for the still-amber-based pages; unify later if desired.

**OnboardingLocations.jsx is fully migrated to `cb-*` tokens (2026-07-13, principal-designer restraint pass):** quiet surfaces + hairline borders (no heavy shadows on cards; `shadow-cb-overlay` only on modals), org hierarchy read via **indentation + 1px connecting rails + type weight**, not color — entity name in `font-display text-cb-title`, MID/location status shown as a small colored dot + plain caption (the blue MID pills and tinted status badges are gone from this file), stats collapsed to one text line, solid gold CTA (no gradient/glow). Verified: zero legacy hex/blue/purple/gradient leftovers; 6 hairline rails; no field/key/validation/save/fetch changes.

**OnboardingBanking.jsx is fully migrated to `cb-*` tokens (2026-07-13, same pass):** header matches Locations (caption + `text-cb-display` + `text-cb-body-lg`, ghost Back), progress bar is a thin solid `bg-cb-accent` fill (framer-motion spring + gradient removed; plain CSS width transition), entity group labels use `font-display text-cb-title`, location rows are quiet `bg-cb-surface-raised` with dot+caption status ("Plaid"/"Manual" green dot, "Needs bank" gold dot — the tinted pills and the Store/CheckCircle2 icon chips are gone), saved-bank summary is a calm bordered row (green gradient card removed), reuse banner + MID reference chips de-blued to neutral captions, segmented Plaid/Manual control uses `bg-cb-accent-muted`/`bg-cb-surface`, solid gold Save + Continue CTAs. The **functional accordion disclosure is kept** (framer-motion `AnimatePresence` height) — it's genuine UX, not decoration. Verified: zero legacy leftovers, `cb-accent` progress fill, no field/key/validation/save/fetch changes.

**OnboardingPortal Welcome Hub + ApplicationTracker migrated to `cb-*` tokens (2026-07-13, same pass):** the `MilestoneCard` component (named export, also used by /dev/portal-preview) now uses quiet `cb-surface-raised` cards with hairline borders for every state — done = `cb-success` number circle + a check+caption "Complete" (the green pill is gone), attention = `cb-accent` circle + gold-dot detail lines, unlocked = `cb-accent-muted` outlined number, locked = dimmed; CTAs are solid `cb-accent` (gradient/glow removed). The Welcome greeting (inner + shell), the impersonation banner, and the footer are tokenized. **The pricing-tier badge color-coding is retired** — `TIER_CLASSES` (blue/purple/green per tier) was deleted along with the `pricingTierClass` var; the badge is now one quiet bordered caption regardless of tier (`TIER_LABELS`/`pricingTierLabel` still supply the text). `ApplicationTracker.jsx` is fully tokenized (active/complete circles → `cb-accent`/`cb-accent-muted`, connectors → `var(--cb-accent)`/`var(--cb-border)`, hold banner → `cb-bg` + gold left rule). Kept: the framer-motion milestone entrance/hover and the step cross-fade in the shell. Verified: component-level scans show zero legacy blue/purple/green/gradient leftovers (the only amber hits are the dev harness's own `sectionTitle` chips, out of scope).

**Signer Verification step migrated to `cb-*` tokens (2026-07-13, same pass) — 5 files:** `OnboardingVerification.jsx` (header caption+display, locked/loading/error/all-signed states as `cb-surface-raised` + colored left-rule, progress pills as neutral/`cb-accent-muted`/`cb-success`-dot, iframe chrome tokenized, submit CTA solid `cb-accent` — the green→emerald gradient is gone), `SignerRoster.jsx` (status pills → dot+caption via `StatusBadge`, blue Users/Primary/invite chips → neutral, "Ready to submit"/"Verification needed" → dots, verify CTA solid gold), `SignerDetailsModal.jsx` + `SignerModal.jsx` (inputs → token `inputCls`, modal → `cb-surface-raised`+`shadow-cb-overlay`+backdrop-blur, blue returning-signer/invite banners → `cb-bg` + gold left-rule, green address-verified → neutral+`cb-success` check, segmented Verify-Now/Invite toggle → `cb-accent-muted`, CTAs solid gold), `SigningErrorGuide.jsx` (red container → `cb-surface-raised` + `cb-danger` left-rule, per-step color-coding retired to one neutral group — `STEP_COLORS` flattened, dead `SEVERITY_COLORS` removed, fix buttons purple/amber → solid gold). The step's purple accent is fully retired. Verified on harness: page-level scan zero legacy leftovers, solid-gold verify/submit CTAs, Signing-Locked + roster states render correctly. Removed now-dead icon imports (CheckCircle2/AlertCircle/Clock/Mail/Users in SignerRoster, ArrowLeft in SigningErrorGuide).

**ProgressTracker + motion + signature moments completed (2026-07-13):**
- `ProgressTracker.jsx` fully on `cb-*` tokens — no amber glow/shadow rings; active = muted gold fill + hairline border; complete = solid `cb-accent`; connector fill + mobile capsule use spring stiffness ~150. Hierarchy via type weight, not decoration.
- Directional step transitions in `OnboardingPortal.jsx` — forward slides left, back slides right (`goToStep` tracks direction via `STEP_ORDER`).
- Signature moment 1: bank-connected success in `OnboardingBanking.jsx` — spring check + "Bank connected" copy only on the just-saved transition (reloads stay quiet).
- Signature moment 2: post-submit celebration on `PostSubmissionDashboard.jsx` — spring success mark + "You're all set" hero, one gold `canvas-confetti` burst per session (`sessionStorage` keyed by corporateId, respects `prefers-reduced-motion`). Nav/shipping panel tokenized; quote iframe card stays white (document readability).

**Motion layer pass (2026-07-13):** Principles — motion communicates state, never decorates; spring `{ stiffness: 150, damping: 20 }`. (1) Step transitions via `AnimatePresence mode="wait"` + directional `goToStep`. (2) ProgressTracker: single `layoutId="cb-progress-capsule"` gold capsule glides under the active step; connectors grow with the same spring. (3) Org tree (`OnboardingLocations`): spring height accordions on MID edit / location MIDs / entity details / mailing; `layout` on EntitySection, LocationCard, MidCard so siblings displace smoothly. Banking accordion uses the same spring. (4) Async fetch states use `.skeleton` placeholders (Locations, Banking, Verification signing prep, LocationStatusTable, PostSubmissionDashboard, LoadingScreen). No mouse-tracking, canvases, or shimmer borders.

**Still optional / not blocking:** ~~full `cb-*` restyle of remaining post-dashboard widgets~~ **DONE 2026-07-13 (Prompt 5/6):** `UnderwritingTracker`, `LocationStatusTable` (status → dot+caption), `InventoryUpload`, `LegacyPOSBridge`, `FormCard`, quote "Open in new tab" link; plus entry/pricing: `PortalEntry`, `SelfServePricing`, `MobilePricing`. Cash Discount remains the only self-serve card; pricing keys / createHubspotDeal payloads unchanged. Quote iframe card stays white for document readability.

All merchant-facing onboarding surfaces (steps + ProgressTracker + post-submit dashboard chrome + entry/pricing) are now on the token system.

### Post-signing Equipment Order (2026-07-13)
`EquipmentOrderPanel` on `PostSubmissionDashboard`: native invoice from `getHubspotQuote` (TanStack `staleTime` 10 min) + HubSpot custom-domain iframe for sign/pay. HubSpot Payments only — no Stripe checkout in this flow.
