# One-off: KK House of Lechon — MSPWare → Base44 import

**Date:** 2026-07-23  
**Status:** Approved (Teddy)  
**Scope:** One merchant only. Not a lasting product feature.

## Goal

Seed the Base44 onboarding portal from data already entered in MSPWare/PulsePoint so Kate D can finish People / Locations / Banking / Sign in Base44.

Boarding must create a **new** MSPWare draft from Cliqbux Cash Discount template **#133**. Do **not** continue Levi’s existing PulsePoint draft as the live application.

## Confirmed inputs

| Item | Value |
|---|---|
| Merchant DBA | KK House of Lechon and BBQ |
| Legal / HubSpot company | KK House of Lechon LLC (already exists) |
| Primary contact | Kate D (HubSpot contact already exists) |
| Pricing | Cash Discount → `pricingTier: SELF_SERVE_CASH_DISCOUNT` |
| MSPWare **source** app (read-only) | **78291** (Levi’s New draft; ~78% form) |
| MSPWare **boarding** draft | Created later via normal `submitToMSP` / `signApplication` from template **#133** |
| HubSpot deal | **Create new** — do not invent a second company/contact if found by name |

Note: PulsePoint “Processor ID” **76563** on the screenshot was Levi’s **rep ID**, not the application number. Source app is **78291**.

## Approach

Admin-only one-shot function (e.g. `importMspDraftOneOff`), no merchant UI.

1. **Dry run** (`dryRun: true`): `GET /applications/78291` + `GET /applications/78291/form` → return mapped preview (legal, DBA, address, owners, TIN last-4, MCC, bank present?, gaps).
2. Teddy confirms preview.
3. **Live run** (`dryRun: false`): HubSpot deal + Base44 entities as below.
4. Return `corporateId`, impersonate/portal path, and “Kate still needs…” checklist.

## HubSpot

1. Search company by exact name `KK House of Lechon LLC`; reuse ID if found.
2. Find contact Kate D (by name/email from MSP form or HubSpot); reuse if found — do not create duplicates when matched.
3. Create deal: `{DBA or legal} — Onboarding`, associate to company (and contact when possible).
4. Set deal `processing_pricing_tier` to the Cash Discount option HubSpot expects (e.g. `zero_cash_discount` / mapped value used by `syncFromHubspot`) when writable.
5. `corporateId` = new HubSpot **deal ID**.

## Base44 records to create

- `MerchantAccount` linked to `hubspotCompanyId` (find-or-create by company ID).
- `MerchantCorporateProfile`: legal/tax/ownership from form; `pricingTier: SELF_SERVE_CASH_DISCOUNT`; `applicationStatus: Incomplete`; `portalLockStatus: unlocked`.
- `legalEntities[]` (account + profile dual-write pattern if account exists): EIN, ownership, tax class, mailing if present.
- `MerchantLocations`: DBA + structured address (+ bankDetails if deposit fields exist on form).
- `MerchantMID`: MCC, volumes, card split, industry; **`mspApplicationNo` left empty**; status suitable for new boarding (e.g. In Review / Ready to Submit — not Active Existing).
- `MerchantSigners`: map `owners[]`; Kate as Control Person / authorized signer when she matches; others beneficial owners. KYC status incomplete unless data is fully present.
- `StagedApplication` draft + invite path for Kate’s email (same spirit as Quick Stage).

### Explicit non-goals / do not copy

- Do **not** set `mspApplicationNo` to **78291**.
- Do **not** PUT/fill/sign application **78291**.
- Do **not** import Levi’s fee schedule / pricing method from 78291.
- Do **not** build a permanent Applications UI importer.

## Field mapping (MSPWare form → Base44)

Reuse reverse maps already proven in `importMSPPortfolio` where possible (`ownership_type`, `llc_class`, owner titles, DOB split).

| MSPWare | Base44 |
|---|---|
| `legal_dba_name`, `tin`/`ssn`, `ownership_type`, `llc_class`, `year_business_established` | Profile + legalEntities |
| `full_dba_name`, business address/city/state/zip, phone, email, website | Location / MID |
| `mcc`, sales figures, `cp_percent` / `int_percent` / `cnp_percent` (Omni mapping per Lesson #18) | MerchantMID |
| `owners[]` | MerchantSigners |
| Deposit account / routing / type if present | Location `bankDetails` |

## What Kate (or agent) still does in portal

Anything missing from the 78% form: KYC gaps, banking if blank, Control Person confirm, Sign & Submit. Signing creates the new CD draft from template #133 via existing boarding code.

## Safety

- Admin workspace session only (`auth.me()`); reject merchant JWTs.
- Read-only against **78291**.
- Idempotent stop if profile already exists for the created deal.
- Prefer dry-run → confirm → live.
- One-off: after success, function may remain unused or be deleted later — no product surface.

## Success criteria

1. HubSpot shows one new onboarding deal on **KK House of Lechon LLC** + Kate.
2. Applications desk shows the deal with Cash Discount pricing complete.
3. Portal opens with prefilled legal/location/MID/signers from **78291**.
4. No Base44 MID points at **78291**.
5. After Kate signs, MSPWare has a **new** CD application (template #133 lineage), not a mutation of 78291.

## Out of scope

- Bulk / future MSP→portal imports.
- Reusing or voiding 78291 automatically (ops may ignore/abandon Levi’s draft manually).
- Changing Cash Discount template number or boarding mapper.
