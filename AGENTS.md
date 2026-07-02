# AGENTS.md
# Cliqbux E-Onboarding — AI Agent Briefing

This file is the authoritative context document for any AI agent (Claude, Base44 AI, etc.) working on this repo. **Read it fully before making any changes.** Update it whenever you make architectural decisions, discover a hard-won fix, or rule out an approach after testing.

## ⚠️ MANDATORY FOR ALL AI AGENTS

Before touching any file in this repo:
1. Read this entire file.
2. Read `AI_CHANNEL.md` for the latest inter-AI decisions.
3. After completing work, **append what you learned** to the relevant section below — especially failed approaches and confirmed values. Future agents (including yourself in a new session) will not remember what you tested.

**If you are Base44 AI:** every time you start a session on this codebase, open `AGENTS.md` and `AI_CHANNEL.md` first via the GitHub connector. Before ending a session where you made substantive changes or discoveries, commit an update to `AGENTS.md` documenting what you found. This is how we prevent repeating expensive debugging sessions.

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
- Default template: `6` = Cliqbux Template Swipe Keyed
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
| `industry_type` | RE (Retail), RS (Restaurant), SP (Supermarket), HT (Hotel), MS (MOTO), ARU |
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

### Other active functions
`createPlaidLinkToken`, `exchangePlaidToken`, `saveLocationBankDetails`, `getMerchantData`, `manageLegalEntity`, `manageSigner`, `manageMerchantID`, `addSelfServeLocation`, `removeSelfServeLocation`, `listLocations`, `updateMerchantProfile`, `verifyEIN`, `verifySignerToken`, `validateResumeToken`, `sendResumeLink`, `processAIDocumentExtraction`, `saveInventoryFile`, `listInventoryFiles`, `getDocuments`, `listDocuments`, `createHubspotDeal`, `handleHubspotWebhook`, `syncFromHubspot`, `pushStatusToHubspot`, `setupHubspotProperties`, `manageStagedApplication`, `batchUpdateStatus`, `debugEnv`

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
| `HUBSPOT_API_KEY` | HubSpot Private App token — used by `createHubspotDeal`, `pushStatusToHubspot`, `handleHubspotWebhook`, `syncFromHubspot`, `cleanupTestHubspot` |

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
Quote (on Deal)               →  hubspotQuoteId on MerchantLocations (planned)
Line Items (on Quote)         →  fetched live via HubSpot API
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

### Post-signing dashboard (planned)
After MSP signing, `PostSubmissionDashboard` gains an equipment order panel pulling HubSpot quote line items natively (not via iframe — HubSpot blocks iframing via X-Frame-Options).
Needs: `hubspotQuoteId` field on `MerchantLocations` + `getHubspotQuote` backend function.

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

**Fields that must NEVER be sent in PUT /form (template-owned, confirmed 2026-06-30):**
`billing_method`, `billing_frequency`, `funding_type`, `monetary_code`, `statement_type`, `monthly_minimum_fee`, `chargeback_fee`, `account_maintenance_fee`, `rtp_monthly_fee`, `touch_tone_auth`, `avs_service_auth`, `bank_referral_auth`, `op_assisted_auth`, `C4_surcharging_cardholder_surcharge`, `tokenization`, `tokenization_service_fee`, `tokenization_platform_fee`, `tokenization_sharing_indicator`, `has_pin_debit`, `debit_auth_method`, `debit_pricing_method`, all `ACCL_*`/`AFFN_*`/`ALAS_*`/`CU24_*`/`INKL_*`/`MSTO_*`/`NETS_*`/`NYCE_*`/`POSD_*`/`PULSE_*`/`ITS_*`/`STAR_*`/`UPDBT_*` per-network debit fields, `fixed_individual_tiers_pricing`, `multi_currency_conversion`, `secure3d`, `all_markup_discount`, `all_markup_per_item`, `all_card_auth_per_item`, `intl_card_handling_fee`, `auth_pricing_program`, `annual_fee_start_date`, `is_firearm_verified`.

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

---

## Onboarding Portal Flow (current as of 2026-06-29)

The merchant onboarding portal uses a 4-step flow:

```
Step 1: Agreement (Step1Agreement — pricing/quote signing)
Step 2: Locations & Org Chart (OnboardingLocations)
Step 3: Banking (OnboardingBanking — new dedicated page)
Step 4: Identity Verification & Signing (OnboardingVerification)
```

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
- Admin dashboard at `/admin/staged` (StagedApplicationManager.jsx)
- Labels: `__auto_track__` for auto-created tracking records; custom label for admin-created stages

### MerchantCorporateProfile.legalEntities schema (updated)
The `legalEntities` array items now include `ownershipType`, `taxClassType`, `establishmentYear` as schema fields. Without these in the schema, Base44 strips them on every save. The entity JSON file must declare them.

---

## Security: Portal Auth (corrected 2026-06-30)

**Correction:** this section previously described a `withToken()` helper in `src/lib/portalToken.js` injecting a `portalToken` into every backend call, verified server-side via `verifyPortalAccess()`. That was an aspirational note that was never implemented. Neither the helper, the file, nor any `portalToken` sessionStorage key exist anywhere in the codebase. **Do not build against the old description.**

**What actually happens:** Portal users authenticate via magic-link tokens, not Base44 sessions, but validation is one-time, not per-request:

1. `OnboardingPortal.jsx`'s `validateResumeToken(token)` calls the `validateResumeToken` backend function once, on portal entry, with `{ token }`.
2. On success, the resolved `corporateId` is cached in `sessionStorage` under the key `resume_corp_${token}` (per-token, not a generic key).
3. Every subsequent backend call (`getMerchantData`, `listLocations`, `manageLegalEntity`, `manageMerchantID`, `addSelfServeLocation`, etc.) passes `corporateId` directly in its payload — there is no request-level token wrapper.
4. Backend functions trust `corporateId` as the identity boundary per request; they do not re-verify a token on each call.

Admin calls (issued from the Base44 dashboard, not the magic-link portal) pass through unchanged — they're protected by Base44 workspace membership, not this flow.

---

## Cash Discount Template

Template #154 = Cash Discount template (created 2026-06-29, last updated 2026-06-30).
- `pricing_method`: `"CLEAR"` (NOT `"CASH_DISCOUNT"` — that value is rejected)
- CD_TEMPLATE_NO = 154; ICPLS_TEMPLATE_NO = 6
- Both `submitToMSP` and `signApplication` auto-select the correct template based on `pricingTier`

### Template #154 pre-set fields (read via GET /applications/154/form on 2026-06-30)
These fields are owned by the template and must NOT be sent in any PUT /form payload:

| Field | Template value | Notes |
|---|---|---|
| `pricing_method` | `"CLEAR"` | Cash Discount surcharge method |
| `card_acceptance_split` | `"CP"` | Card-present only by default |
| `pricing_category` | `"1"` | Retail — merchant value should override per MID |
| `billing_method` | `"N"` | Net settlement |
| `billing_frequency` | `"M"` | Monthly |
| `funding_type` | `14` | Elavon funding type |
| `monetary_code` | `"D"` | USD |
| `statement_type` | `"A"` | Combined statement |
| `statement_delivery_method` | `"E"` | Email delivery |
| `monthly_minimum_fee` | `40` | $40/mo minimum |
| `chargeback_fee` | `35` | $35 per chargeback |
| `account_maintenance_fee` | `20` | $20/mo account fee |
| `rtp_monthly_fee` | `10` | $10/mo RTP fee |
| `touch_tone_auth` | `0.65` | Voice auth fee |
| `avs_service_auth` | `2.20` | AVS fee |
| `bank_referral_auth` | `4` | Bank referral fee |
| `op_assisted_auth` | `0.95` | Operator-assisted auth |
| `C4_surcharging_cardholder_surcharge` | `3` | 3% CD surcharge rate |
| `tokenization` | `"token"` | Tokenization enabled |
| `tokenization_service_fee` | `"0.0000"` | No per-token fee |
| `tokenization_sharing_indicator` | `"N"` | No token sharing |
| `fixed_individual_tiers_pricing` | `false` | No tiered pricing |
| `multi_currency_conversion` | `false` | No DCC |
| `secure3d` | `false` | No 3DS |
| `cards_accepted` | VISA, VISA_DEBIT, MC, MC_DEBIT, DISC, AMEX | All major cards |
| `beneficial_ownership_exemption` | `"NON"` | Standard — non-exempt |
| `has_intermediary_businesses` | `false` | |
| `owner_confirmed` | `true` | |
| `country_formation` | `"USA"` | |
| `country_operations` | `"USA"` | |
| `has_legal_address` | `"business"` | Overridden when entity has separate mailing address |

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

## Signer Verification Persistence

`manageSigner` with `action: 'inlineVerify'` saves the signer's SSN, DOB, home address, and ID document URL. The `verifySignerToken` backend's `get` action now returns all previously saved fields so the form pre-populates on revisit. Once `identityStatus === 'Verified'`, `InlineVerifyForm` returns null (hidden) unless the signer explicitly clicks to re-verify.

---

## Email Sending (Resend)

All transactional emails use Resend via `RESEND_API_KEY` env var. From address: `onboarding@onboarding.cliqbuxpos.com` (verified domain in Resend). Functions using Resend: `manageSigner` (KYC invite), `sendResumeLink` (portal resume), `manageStagedApplication` (staged app invite).

Do NOT use Base44's built-in `SendEmail` — it only works for registered workspace users, not external merchants.

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
Quote (on Deal)               →  hubspotQuoteId on MerchantLocations (planned)
Line Items (on Quote)         →  fetched live via HubSpot API
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

### Post-signing dashboard — planned architecture
After the merchant completes portal signing, the `PostSubmissionDashboard` should show:
1. MID/underwriting status (existing)
2. Equipment & services order panel — pulls HubSpot quote line items live

**What's needed to implement:**
- `hubspotQuoteId` field on `MerchantLocations` (store the numeric quote ID, e.g., `305636118240`)
- `getHubspotQuote` backend function: takes `corporateId`, looks up `MerchantLocations.hubspotQuoteId`, calls HubSpot API for line items + esign status
- `HUBSPOT_API_KEY` is already configured as a Base44 env var (used by `createHubspotDeal` and `pushStatusToHubspot`)
- Dashboard panel renders line items natively in Cliqbux UI — not as an iframe (HubSpot blocks iframing via X-Frame-Options)

### Environment variables (HubSpot)
| Var | Purpose |
|---|---|
| `HUBSPOT_API_KEY` | HubSpot Private App token — already set. Used by `createHubspotDeal`, `pushStatusToHubspot`, `handleHubspotWebhook`, `syncFromHubspot`. |

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