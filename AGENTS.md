# AGENTS.md
# Cliqbux E-Onboarding — AI Agent Briefing

This file is the authoritative context document for any AI agent (Claude, Base44 AI, etc.) working on this repo. Read it fully before making changes. Update it when you make architectural decisions.

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

---

## Entity Architecture

### Current entities
- **MerchantCorporateProfile** — legal entity, TIN, ownership type, signers
- **MerchantSigners** — individual owners/signers with SSN, DOB, address
- **MerchantLocations** — physical storefronts (address + bank details)
- **MerchantProcessingConcept** — one per Elavon MID; links to a location (replaces the old `MerchantID` entity name — same concept, renamed for clarity)
- **MerchantAccessTokens** — magic-link tokens for merchant portal access
- **StagedApplication** — admin-built targeted application invites for merchants
- **MerchantInventoryAssets** — equipment/inventory tracking
- **MerchantSigners** — individual owners/signers with SSN, DOB, address
- **User** — portal users

### Architecture: MerchantProcessingConcept (was MerchantID)
Three-layer model (migration complete):

```
MerchantCorporateProfile
  └── legalEntities[] (embedded array — each has EIN, ownershipType, taxClassType, mailingAddress)
  └── MerchantLocations (physical address + bank account, FK corporateId)
        └── MerchantProcessingConcept (one per MID — mcc, dba, status, elavonMID, FK locationId + corporateId)
```

A single physical location can have multiple Concepts (e.g. a grocery store with a Bakery MID and a Cafe MID). Each Concept maps to exactly one MSPWare application and one Elavon MID.

**Do NOT build new features against the flat `MerchantLocations` boarding fields.** Use `MerchantProcessingConcept` for anything MID-related.

### legalEntities embedded array on MerchantCorporateProfile
Legal entities (EIN groups) are stored as an embedded array on the profile, NOT as a separate entity. Managed via `manageLegalEntity` function. Each entry has: `entityId` (UUID), `legalBusinessName`, `federalEIN`, `mailingStreet/City/State/Zip`, `ownershipType`, `taxClassType`, `establishmentYear`.

### MerchantLocations.entityId
Each location links to a `legalEntity.entityId` in the profile's embedded array. This determines which EIN group the location belongs to for MSPWare submission.

### Fields ON MerchantProcessingConcept (not MerchantLocations)
- `mspApplicationNo` — MSPWare draft application number
- `elavonMID`
- `applicationStepStatus` — `In Review | Ready to Submit | Pending MID | Active | Active (Existing) | Error`
- `isExistingAccount` — true for pre-imported MIDs (skip boarding flow)
- `existingAccountSource` — `mspware_import | manual_claim | migration`
- `mccCode`, `industryType`, `pricingCategory`, `pricingMethod`, `monthlyCardSales`, `avgSaleAmount`, `highestTicketAmount`, `cardPresentPct`, `deliveryDelayDays`
- `bankDetails` — per-concept bank override (null = inherit from parent location)

### Fields DEPRECATED on MerchantLocations (do not use)
- `awb` / `boardingId` — DEPRECATED, no longer written
- `mspApplicationNo`, `elavonMID` — legacy copies only; primary home is `MerchantProcessingConcept`

---

## Backend Functions

### Active boarding functions
| Function | Purpose |
|---|---|
| `submitToMSP` | Creates MSPWare draft + fills form + optionally submits |
| `signApplication` | Packages a filled MSPWare application for e-signing; returns iframe-embeddable signing URL per principal. Call after submitToMSP, before final Elavon submit. |
| `pollMSPStatus` | Polls MSPWare status for all Pending MID records (both Locations and MerchantIDs) |
| `importExistingMIDs` | TIN-matches MSPWare approved apps to a corporateId; creates MerchantID records |
| `importMSPPortfolio` | Bulk-imports entire MSPWare portfolio — creates Profile + Locations + MerchantIDs for all approved merchants. Groups by TIN. Admin-only, dryRun supported. |
| `migrateLocationsToMerchantIDs` | One-time migration: lifts MerchantLocations boarding data into MerchantID records |

### Other active functions
`createPlaidLinkToken`, `exchangePlaidToken`, `saveLocationBankDetails`, `getMerchantData`, `manageLegalEntity`, `manageSigner`, `addSelfServeLocation`, `removeSelfServeLocation`, `listLocations`, `updateMerchantProfile`, `verifyEIN`, `verifySignerToken`, `processAIDocumentExtraction`, `saveInventoryFile`, `listInventoryFiles`, `getDocuments`, `listDocuments`, `createHubspotDeal`, `handleHubspotWebhook`, `debugEnv`

### Deleted / do not recreate
- ~~`submitToElavon`~~ — replaced by `submitToMSP`
- ~~`pollBoardingStatus`~~ — replaced by `pollMSPStatus`
- ~~`elavonWebhook`~~ — MSPWare uses polling, no webhooks
- ~~`mspGetSchema`~~ — debug artifact, wrong base URL and auth headers

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

**Production credentials live in Base44 env vars only — never in code or committed files.**

---

## UI → Function Call Map

| UI action | Function called |
|---|---|
| Submit bank details / board merchant | `submitToMSP` |
| Verification page submit button | `submitToMSP` |
| Connect bank (Plaid) | `createPlaidLinkToken` → `exchangePlaidToken` |
| Load merchant data | `getMerchantData` |
| Add/edit signer | `manageSigner` |
| Add/edit legal entity | `manageLegalEntity` |
| View/fetch signing documents | `listDocuments` → `getDocuments` |

---

## Signing Flow (signApplication)

`signApplication` packages MSPWare applications for BoldSign e-signature and returns iframe-embeddable signing URLs.

### Flow
1. Load profile, signers, concepts, locations
2. For all non-done concepts (`Active`, `Active (Existing)`, `Pending MID` are skipped), verify their `mspApplicationNo` still exists in MSP — clear it **only on explicit 404** (not on network errors)
3. Auto-create MSPWare drafts for **all concepts missing `mspApplicationNo`** (not just when zero signable exist)
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
- A `-1%` form completion means the concept has no bank details (no routing/account number) — fix the data, not the code

### is_firearm_verified
⚠️ **CRITICAL — DO NOT CHANGE:** Must always be the string `"no"` — not boolean `false`, not `"N"`, not `"yes"`. Any other value triggers the firearms MCC validation rule and blocks signing for ALL merchants in that application.

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

### -1% form completion after PUT
MSPWare rolls back the entire form and returns `percent_complete: -1` when **any** validation rule fails during PUT. The GET after a failed PUT looks identical to a blank form. Always check the PUT response body for `validation.errors.data` — the real error is there, not in the GET.

---

## What NOT to Do

- Do not call Elavon eBanking API directly (no `uat-buynow-na.elavon.net`, no `PAPI_USA_CLIQBUX1`, no AWB-based polling)
- Do not use `submitToElavon` — it is deleted
- Do not set `MSP_SUBMIT_ENABLED=true` in any automated test or dry-run context
- Do not add new boarding fields to `MerchantLocations` — use `MerchantID` entity (now `MerchantProcessingConcept`)
- Do not hardcode `86764` as salesperson ID — that is the old Elavon rep code; MSPWare ID is `76764`
- Do not use `appkey`/`appid` as MSPWare header names — use `X-API-KEY` and `X-App-ID`
- Do not clear `mspApplicationNo` on non-404 errors (network failure, rate limit, auth error) — only clear on explicit HTTP 404
- Do not add `is_firearm_verified: false` (boolean) or `"N"` — must be the string `"no"`

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