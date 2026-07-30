# MSP Portfolio → Merchant Center Sync (Approach A)

**Date:** 2026-07-30  
**Status:** Approved (Teddy)

## Goal

Pull approved MSPWare applications (with Elavon MIDs) via API and land them in Merchant Center as `MerchantAccount` + locations + existing MIDs. **No HubSpot writes** in v1.

## Locked decisions

| Decision | Choice |
|---|---|
| Parent | Create/link `MerchantAccount` per TIN group |
| HubSpot | Skip |
| `corporateId` (new profiles) | Stable `msp-{tin}` or `msp-app-{appNo}` |
| Live writes | Require `confirmLive: true` (dry run default-safe) |
| MID status | `Active (Existing)` + `mspware_import` |

## API

`POST /functions/importMSPPortfolio`

- `{ "dryRun": true }` — preview only  
- `{ "confirmLive": true }` — write (or `dryRun: false` + `confirmLive: true`)

Admin role required. MSP: paginated `GET /applications` + `GET /applications/{no}/form`.

## UI

`/admin/center/sync-msp` — dry run → review → confirm live.

## Non-goals

HubSpot company/deal, Excel upload, scheduled sync, signer KYC from owners, multi-EIN corp merge beyond TIN.
