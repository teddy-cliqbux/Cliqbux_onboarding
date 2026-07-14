# MSPWare Field Reference — Cliqbux Program Configuration & Equipment

**Purpose of this file:** MSPWare has a large number of fields that are not merchant data — they're fixed Cliqbux business/reseller settings, or static equipment Cliqbux always ships. These values were extracted through live testing on 2026-07-03 and must be treated as **confirmed constants**, not re-derived by guessing or by an AI navigating the live MSPWare UI.

**Process rule going forward:** Do not have an AI agent click through and fill fields in the live MSPWare dashboard to "figure out" correct values. That process is slow, error-prone, and collides badly when a human is also working in the same browser session (this happened during the 2026-07-03 session — an AI click+type accidentally altered a Pricing Method dropdown mid-edit). The correct process is:
1. A human (Teddy, or MSPWare/Fidano support) confirms the correct value once, live.
2. That value gets captured here **and** hardcoded into `buildFormPayload` in `submitToMSP/entry.ts` and `signApplication/entry.ts`.
3. All future application creations use the constant. No more live lookups.

If a new value is ever needed, use `debugMSPFormRaw` (`POST /functions/debugMSPFormRaw { "appNo": "<id>" }`) to pull the **raw wire-format JSON** of an existing application or template — this shows real field names and values, unlike the MSPWare UI which only shows friendly labels. This is the safe way to extract values without live UI interaction.

---

## Cliqbux Program Configuration (business/reseller settings — same for every merchant)

| Field | Value | Notes |
|---|---|---|
| `entity_number` | `'48603-17'` | Cliqbux's MSPWare reseller/compensation-model record ("48603 - Buy rate"), combined with Client Group ID `17`. **The UI only displays "48603 - Buy rate"** — the actual wire value silently appends the Client Group. Sending bare `'48603'` is rejected: `"48603 is not a valid option."` Confirmed 2026-07-03 via `debugMSPFormRaw` on app #133 (see below). |
| `safet_service` | `'pci'` | "PCI Basic" security program. (`'pciplus'` = PCI Plus is the other option — not used.) |
| `safet_fee` | `'0'` | "Monthly Program Security Fee" — confirmed by Teddy 2026-07-03 to be a junk fee, always $0. |
| *(separate, not sent)* | — | There is a distinct **"(PCI/SAFET) Standard Program Fee" of $74.99** shown in the MSPWare UI next to the Security Program fee. This is a non-compliance fee tied to the PCI program itself, NOT controlled by `safet_fee`. Confirmed by Teddy 2026-07-03: **leave this alone, do not try to zero it out.** |
| `pricing_method` (Cash Discount) | `'TIERD'` ("Tiered") | **RESOLVED 2026-07-03.** Teddy: *"We do not use clear and simple for pricing method ever. Tiered only."* Cliqbux never selects MSPWare's "Clear and Simple" pricing method for any merchant. `TIER_TO_METHOD` maps `CASH_DISCOUNT`/`SELF_CASH_DISCOUNT` → `'TIERD'` (previously `'CLEAR'`) in all 6 files that declare it (`submitToMSP`, `signApplication`, `manageMerchantID`, `addSelfServeLocation`, `syncFromHubspot`, `refillMSPForms`). This also makes `CLEAR_plan` moot — it's a field on the "Clear and Simple" pricing method, which is never selected, so it never appears. |
| `tokenization` | `'none'` | **RESOLVED 2026-07-03.** Teddy: *"No tokenization is available to us now."* Sent explicitly for ALL merchants (not just Cash Discount) — template #154's stale `'token'` default was the actual cause of the `tokenization_platform_fee` required-field error. Now omitted/moot since tokenization is off. |
| `is_firearm_verified` | **Never send any value** | API rejects every value. Confirmed should be "No" per Teddy, but this requires a direct fix on the MSPWare template itself (templates #6 and #154), not a payload field. **Teddy 2026-07-03: this field is conditional — it only appears/is required for certain business address states** (confirmed present for a CA business address on ZZZ DBA). For states where it doesn't apply, there's no issue. For states where it does, the template default needs fixing to "No". **Last remaining validation error as of 2026-07-03 (app #190, 99.2% complete).** Not yet done — open item, requires a one-time manual fix in MSPWare's UI on templates #6/#154. |

---

## Cliqbux Standard Equipment Configuration (identical on every application)

Cliqbux manages equipment deployment separately from the MSPWare application — every merchant application should submit the exact same static hardware/VAR configuration. This is **not merchant-configurable** and must not be derived from location/profile data.

Confirmed 2026-07-03 by reading the raw form of MSPWare's **"Cash Discount Template" (application #133)** — a reference copy Teddy filled out live specifically to demonstrate the correct values — via `debugMSPFormRaw`.

### Network / delivery
| Field | Value | UI label |
|---|---|---|
| `foreign_network` | `'NOVA'` | Network Type = "Elavon" |
| `equipment_rush_request` | `'XX'` | POS Delivery = "Shipping Not Needed" |

### Hardware (`eqp_hardware_section`, array)
```json
[{
  "hardware_type": "CNVNG",             // Converge New Generation
  "hardware_ownership": "P",            // Purchase
  "hardware_qty": "1",
  "hardware_price_per": "0",
  "hardware_connection_type": "IP",
  "hardware_capture_method": "HYBRD",   // Hybrid
  "hardware_close_method": "AUTO",
  "hardware_training_method": "NO"      // No Training
}]
```

### VAR (`eqp_var_section`, array — two entries)
```json
[
  {
    "var_type": "vendor_distributed",
    "var_vendor": "V7080",      // PAX Technology Inc
    "var_product": "13231",     // Broad POS Elavon v1.0
    "var_gateway": "NONE",
    "var_qty": "4",
    "var_price": "0.00",
    "var_capture_method": "HOST",
    "var_close_method": "AUTO"
  },
  {
    "var_type": "service_provider",
    "var_provider": "V6273",    // Network Merchants, Inc
    "var_product": "11198",     // Gateway Processing Services 10.04
    "var_qty": 1,
    "var_price": "0.00",
    "var_capture_method": "HOST",
    "var_close_method": "AUTO"
  }
]
```

Terminal Programming checkboxes (Quick Close, Store and Forward, No Signature, Contactless, Clerk Prompt, Tip Function Waiter/Cashier, Terminal Auto Close, etc.), "Equipment is Tax Exempt", and "Training" were all left unchecked/false on the reference template and are not required — they are omitted from the payload.

**If the equipment lineup ever changes:** update the constants in `buildFormPayload` (both `submitToMSP/entry.ts` and `signApplication/entry.ts`) and this file together.

---

## Omni Card Acceptance Split + Website (confirmed 2026-07-14)

MSPWare **Omni Commerce** Financial Information shows three peer % fields that must total 100:

| MSPWare UI | Wire field | Portal MID field |
|---|---|---|
| Card Present % | `cp_percent` | `cardPresentPct` (In-Person) |
| Card Not Present % | `cnp_percent` | `motoPct` (MOTO) |
| Internet % | `int_percent` | `internetPct` (Online) |

**Do not send `moto_percent`** as a fourth share of that 100 — it zeroed CNP and left Omni incomplete (Porky's: portal 80/10/10 → MSPWare 80/0/0).

When `int_percent` > 0, also send:

| Field | Source | Notes |
|---|---|---|
| `business_website` | `MerchantMID.businessWebsite` (fallback profile website) | **Primary wire name** for Business Homepage URL (required when `int_percent` > 0). Matches `business_email` / `business_phone` naming. Bare `website` alone was ignored by PUT /form (Porky's 2026-07-14 — Omni split landed, homepage stayed blank at 99%). We also send `website` as a secondary alias. |

---

## Important: two "Cash Discount" templates exist in MSPWare

**⚠️ UPDATE 2026-07-07: `CD_TEMPLATE_NO` is now 133, not 154.** See `AGENTS.md`'s "Cash Discount Template" section for the full current field list and an open issue (invalid-looking `funding_type: "0"` on #133 that needs Teddy to confirm/fix). The history below is kept for context on why the switch happened.

- **Application #154 — "Cliqbux Template Cash Discount"**: was `CD_TEMPLATE_NO` in the code through 2026-07-07. As of 2026-07-03 it had **no equipment/VAR data at all**, and its fee-schedule defaults (`touch_tone_auth: 0.65`, `avs_service_auth: 2.20`, `bank_referral_auth: 4`, `op_assisted_auth: 0.95`, `monthly_minimum_fee: 40`, `chargeback_fee: 35`, `account_maintenance_fee: 20`, `rtp_monthly_fee: 10`, `tokenization: "token"`) were stale/unreviewed. Confirmed missing key data on 2026-07-07; **no longer used anywhere in the code.**
- **Application #133 — "Cash Discount Template"**: originally a reference/test template Teddy built on 2026-07-03 to demonstrate correct equipment values and a working flat-rate pricing setup (see "Open Items" below). Teddy has since confirmed its fields, and as of 2026-07-07 **this is the live `CD_TEMPLATE_NO`** used to create every real Cash Discount application.

**Always verify the `merchantapplicationno` in the MSPWare dashboard URL (not just the on-screen title) before editing template fees** — #133 and #154 have easily-confused names, which caused this exact mix-up once already.

---

## Cliqbux Cash Discount Fee Schedule (Tiered pricing only)

Sent explicitly in `buildFormPayload` (both files) whenever `pricingMethod === 'TIERD'`. Confirmed live by Teddy 2026-07-03. Does **not** apply to ICPLS merchants — those fields stay omitted/template-owned as before.

| Field | Value |
|---|---|
| `billing_method` | `'N'` (Net) |
| `monetary_pricing_program` | `'09828'` |
| `auth_pricing_program` | `'49999'` |
| `all_qualified_discount` / `all_qualified_per_item` | `'3.3816'` / `'0.000'` |
| `all_mid_qualified_discount` / `all_mid_qualified_per_item` | `'3.3816'` / `'0.000'` |
| `all_non_qualified_discount` / `all_non_qualified_per_item` | `'3.3816'` / `'0.000'` |
| `all_standard_discount` / `all_standard_per_item` | `'3.3816'` / `'0.000'` |
| `all_rewards_discount` / `all_rewards_per_item` | `'3.3816'` / `'0.000'` |
| `has_pin_debit` | `true` |
| `debit_auth_method` | `'FIXED'` |
| `debit_pricing_method` | `'SURCH'` |
| `apply_all_pin_debit` | `true` |
| `all_networks_percent_fee` / `all_networks_per_auth` / `all_networks_transaction_fee` | `'3.3816'` / `'0'` / `'0'` |
| `pin_debit_monthly_fee` | `'0'` |
| `intl_card_handling_fee` | `'0'` |
| `all_card_auth_per_item` | `'0'` |
| `touch_tone_auth` / `avs_service_auth` / `bank_referral_auth` / `op_assisted_auth` | all `'0'` |

**Verification history:** applying entity_number + equipment fixes alone raised ZZZ DBA (app #190) from 84.6% → 97.2%. Switching to `pricing_method: 'TIERD'` + `tokenization: 'none'` + this fee schedule raised it to 98.4% (cleared `CLEAR_plan` and `tokenization_platform_fee`). Adding `all_card_auth_per_item: '0'` (a field that only became visibly required once Tiered mode was active) raised it to **99.2%** — leaving only `is_firearm_verified`, which cannot be fixed via payload (see table above).

---

## Open Items (as of 2026-07-06)

1. **`is_firearm_verified`** — the only remaining validation error (app #190 at 99.2% complete). Requires a one-time manual fix directly on MSPWare templates #6 and #154 (set to "No"), not a code change. Confirmed conditional on business address state. Not yet done.
2. **RESOLVED 2026-07-06 — ICPLS "gap" was never a template defect.** `auth_pricing_program`, `all_markup_discount`, `all_markup_per_item`, `all_card_auth_per_item` show as required/blank on every fresh ICPLS (Interchange Plus) application because Interchange Plus is **always an individually-negotiated custom deal** — there is no self-serve, off-the-shelf Interchange Plus rate to hardcode on the template (Teddy, 2026-07-06: "ICPLS...is always associated with custom pricing. We will not have a self serve off the shelf interchange plus pricing template"). The fix is NOT a template edit — it's sourcing `all_markup_discount`/`all_markup_per_item` from the merchant's own negotiated `customMarkupPercentage`/`customPerTxFee` fields on `MerchantCorporateProfile`, which `buildFormPayload` now does for any custom-pricing tier (`CUSTOM_FLAT_RATE`, `CUSTOM_INTERCHANGE_PLUS`) in both `submitToMSP` and `signApplication`. A hard guard throws before a draft is ever created/filled if those two fields aren't both set — pricing must never be left blank for a human to fill in inside MSPWare. `all_card_auth_per_item` stays a fixed template-level value (no separate custom "Auth Per Card" field needed, confirmed by Teddy). See AGENTS.md Critical Lesson #12 for the full 4-template/3-tier model this unlocked.
   - **Caution:** test application #194 (used for the original investigation) had its markup fields contaminated with junk debug placeholder values on 2026-07-06 by an accidental `debugMSPFormRaw` call with `corporateId` — do not use #194's current field values as a reference for "what a clean ICPLS draft looks like." See AGENTS.md Critical Lesson #10.
3. **Ownership Type dropdown coverage — partially resolved 2026-07-06.** MSPWare's real "Ownership Type" field has ~13 options (C Corp Closely Held/Private/Public, Estate, General Partnership, Government fed/state/local, LLC, Limited Partnership, Non-Profit, Sole Proprietorship, Sub S Corp, Trust, Unincorporated Association). Teddy confirmed: "add those options to our form if they exist on MSPware."
   - **Added and verified:** `SUB_S_CORP` ("Sub S Corp") and `TRUST` ("Trust") — both now in `OWNERSHIP_TYPES` (`OnboardingLocations.jsx`) and the `MerchantCorporateProfile.ownershipType` schema enum. Verified live via `debugMSPFormRaw`: `SUB_S_CORP → ownership_type: SS`, `TRUST → ownership_type: T`. No validation errors on either.
   - **Still missing, NOT added:** Estate, Government (Federal/State/Local), Unincorporated Association, and the 3-way C-Corp split (Closely Held/Private/Public). No confirmed wire codes exist for any of these. The C-Corp split is compliance-relevant (likely tied to `beneficial_ownership_exemption` for public vs. private companies), so these should NOT be guessed — get confirmed codes from Teddy or MSPWare/Fidano support first, then verify with the same test-merchant + `debugMSPFormRaw` pattern used for Sub S Corp/Trust before adding to the dropdown. See AGENTS.md Critical Lesson #9.
4. **Resolved 2026-07-03:** `CLEAR_plan` (never using Clear and Simple pricing method — Tiered only), `tokenization_platform_fee` (tokenization now explicitly `'none'`), PCI tier (`safet_service: 'pci'`, confirmed).
5. **Resolved 2026-07-03 / verified 2026-07-06:** `llc_class` was being sourced from `ownershipType` instead of `taxClassType`, silently defaulting to "Disregarded Entity" for merchants who chose e.g. "LLC taxed as C-Corp." Fixed by sourcing it from a dedicated `legalTaxClassType` variable (`matchedEntity?.taxClassType || profile.taxClassType`). Verified via `debugMSPFormRaw`: `llc_class: C`.
6. **Resolved 2026-07-03 / verified live 2026-07-06:** `mapOwnershipType` had no keys for `'GENERAL_PARTNERSHIP'`/`'LIMITED_PARTNERSHIP'` (our frontend's real dropdown values), so both silently defaulted to `'CO'` (Corporation) instead of `'PA'` (Partnership). Fixed in `submitToMSP`/`signApplication` (`refillMSPForms` already had it right). Verified via `debugMSPFormRaw` on a temporarily-modified test merchant: `ownership_type: PA`.
7. **Resolved 2026-07-06 (frontend):** `OnboardingLocations.jsx`'s "IRS Tax Classification" dropdown now shows a simplified 3-option `LLC_TAX_CLASS_TYPES` list (Corporation / Disregarded Entity / Partnership) whenever Business Entity Type = LLC, matching MSPWare's real "LLC Class" field instead of the generic 5-option list meant for other entity types.
8. **Resolved 2026-07-06 — Cliqbux's real pricing model codified.** Cliqbux has exactly 4 templates/products, not the messy `TRADITIONAL`/`STANDARD`/`PREMIUM`/`CASH_DISCOUNT` mix that had accumulated: **Custom Flat Rate** (sales-assisted, negotiated, MSPWare `FLAT`), **Custom Interchange Plus** (sales-assisted, negotiated, MSPWare `ICPLS`, template #6), **Self-Serve Flat Rate** (**on hold** — Elavon doesn't support it yet, do not build), and **Self-Serve Cash Discount** (self-serve, fixed rate, MSPWare `TIERD`, template #154). `MerchantCorporateProfile.pricingTier` enum simplified to `CUSTOM_FLAT_RATE` / `CUSTOM_INTERCHANGE_PLUS` / `SELF_SERVE_CASH_DISCOUNT` (legacy values kept mapped, not removed, for in-flight records). A real casing bug was fixed in the same pass: `OnboardingPortal.jsx`'s self-serve detection checked for `'Self_CashDiscount'` but the actual stored value was `'CASH_DISCOUNT'`, so self-serve Cash Discount merchants were never recognized as self-serve. Separately, the live self-serve pricing screens (`SelfServePricing.jsx`, `MobilePricing.jsx`) were offering a "Swiped & Keyed" flat-rate card as if it were a real self-serve product — removed, since Cliqbux cannot currently deliver it (same Elavon limitation as the on-hold Self-Serve Flat Rate template). `TIER_TO_TEMPLATE` added alongside `TIER_TO_METHOD` in `submitToMSP`/`signApplication` to route each tier to its correct MSPWare template number. The Custom Flat Rate template itself has not been created yet in MSPWare (`FLAT_TEMPLATE_NO` is a `0` placeholder) — see Open Item below. See AGENTS.md Critical Lesson #12 for full detail.

---

## Still Open (as of 2026-07-06)

- **Custom Flat Rate MSPWare template does not exist yet.** `FLAT_TEMPLATE_NO = 0` is a placeholder in both `submitToMSP/entry.ts` and `signApplication/entry.ts` — any attempt to create a draft for a `CUSTOM_FLAT_RATE` merchant will fail until a real template is created via the MSPWare API (mirroring how template #154 was built) and this constant is updated to the real template number.
- **HubSpot `pricing_tier` property options are stale.** `setupHubspotProperties/entry.ts` only creates a property if missing (409 = skip) — it does not update an already-existing property's option list. The live HubSpot `pricing_tier` property likely still only has the old `TRADITIONAL`/`STANDARD`/`PREMIUM`/`CASH_DISCOUNT` options and needs the 3 new canonical values added manually in HubSpot, or a PATCH-based "add missing options" script.

---

## Verification command

To re-check current completion / outstanding validation errors for a real application (draft-only, safe — does not submit to Elavon unless `MSP_SUBMIT_ENABLED=true`):

```bash
curl -s -X POST https://cliqbux-onboard-prime.base44.app/functions/submitToMSP \
  -H "Content-Type: application/json" \
  -d '{"corporateId":"<corporateId>","midIds":["<midId>"]}'
```

Read `results[].validationErrors` and `results[].percentComplete` in the response — these are the authoritative source of what's still missing, NOT the MSPWare UI's sidebar section checkmarks (which can be misleading if fields are populated in a template but never actually reach the created application, as happened with equipment on template #154).
