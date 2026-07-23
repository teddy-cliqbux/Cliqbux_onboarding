# Task 3+4 Report — HubSpot + Base44 live path (KK Lechon)

**Status:** Complete  
**Branch:** `feat/kk-lechon-msp-oneoff`  
**Commit:** (see git log after commit) — `feat: live HubSpot+Base44 path for KK Lechon one-off import`

## Deliverable

- **Modified:** `base44/functions/importMspDraftOneOff/entry.ts`
- Replaced **501 live stub** with full `confirmLive` transaction: HubSpot deal **then** Base44 entities in one request (no orphan-deal `hubspot_only` phase).

## Behavior

| Path | Condition | Response |
|------|-----------|----------|
| Dry-run (default) | `dryRun` omitted or `true` | Unchanged: GET MSP, map, masked preview JSON |
| Live | `dryRun: false` + `confirmLive: true` | HubSpot company/contact/deal + Base44 seed; success JSON with IDs |
| Invalid live | `dryRun: false` without `confirmLive` | **400** |
| Duplicate profile | New dealId already has profile | **409** with `corporateId` / HubSpot IDs |
| Base44 fail after deal | Entity create throws | **500** with `dealId` / `corporateId` for Teddy cleanup |
| Auth | No workspace session | **401** |

### HubSpot (Task 3)

1. Find company by exact name (`parentCompanyName`, default `KK House of Lechon LLC`); create only if missing.
2. Contact: `contactEmail` → mapped signer email → Kate-on-company association search → create last resort.
3. Deal: `dealname` `{dba} — Onboarding`, stage `appointmentscheduled`, `processing_pricing_tier: zero_cash_discount` (retry without property on rejection).
4. Associate deal↔company and deal↔contact.
5. `corporateId = String(dealId)`.

### Base44 (Task 4)

1. Find/create `MerchantAccount` by `hubspotCompanyId`.
2. Profile + `legalEntities` (new `entityId` UUID); dual-write entities to account.
3. Location (with unmasked `bankDetails` when present) + MID — **never sets `mspApplicationNo`**; clears if somehow present.
4. `MerchantSigners` per mapped owner with `verifyToken`.
5. `StagedApplication` draft, `prefilledData.source: msp_oneoff_78291`.

**MSPWare:** GET only (`/applications/{no}`, `/applications/{no}/form`). No PUT/POST.

**Masking:** HTTP responses use masked `mapped` / `preview` / `gaps` only. DB writes use in-memory unmasked `mappedRaw`.

**Pricing:** Profile `pricingTier: SELF_SERVE_CASH_DISCOUNT`; deal tries `zero_cash_discount`.

## Tests

N/A against live HubSpot/Base44 in this pass (admin session + publish required). Dry-run path structure preserved.

## Teddy — after publish

1. Push branch; publish `importMspDraftOneOff` in Base44.
2. Dry-run first: `{ "dryRun": true }` — confirm preview.
3. Live once: `{ "dryRun": false, "confirmLive": true, "contactEmail": "<kate's HubSpot email>" }`.
4. Confirm response: `corporateId`, `midHasMspApplicationNo: false`, then Applications → impersonate.

## Concerns / follow-ups

- **No idempotency by merchant** — each live call creates a **new** HubSpot deal; 409 only if that new dealId already has a profile (rare). Do not re-run live casually.
- **Partial HubSpot orphans** — if Base44 fails after deal create, response includes `dealId` for manual HubSpot cleanup.
- **Kate contact without email** — if MSP email is blank and `contactEmail` omitted, company association search may still find Kate; otherwise 400 asking for `contactEmail`.
- **Task 5** (ops dry-run → live + `AI_CHANNEL` append) still pending.
