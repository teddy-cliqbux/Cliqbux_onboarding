# MSP Portfolio → Merchant Center Sync (Approach A)

**Date:** 2026-07-30  
**Status:** Approved (Teddy) — **Merchants API primary** (updated same day)

## Goal

Pull the live MSPWare **merchants** portfolio into Merchant Center as `MerchantAccount` + locations + existing MIDs. **No HubSpot writes** in v1.

## Locked decisions

| Decision | Choice |
|---|---|
| Discovery | `GET /merchants` (not applications list) |
| Enrichment | `GET /merchants/{mid}` |
| Parent | Create/link `MerchantAccount` per TIN, else **Corporate Name** |
| HubSpot | Skip |
| `corporateId` (new profiles) | `msp-{tin}` / `msp-corp-{slug}` / `msp-mid-{mid}` |
| Live writes | Require `confirmLive: true` (dry run default-safe) |
| MID status | `Active (Existing)` + `mspware_import` |

## Why Merchants API

Merchants CSV export (2026-07-30): **106** Approved+MID under **62** corporate names.  
Applications-only sync: **~30** apps / **~19** approved with MID.  

MSP docs ([api.mspware.com/api-docs](https://api.mspware.com/api-docs/#/)): `GET /merchants`, `GET /merchants/{mid}`. Same auth as boarding (`MSP_BASE_URL` / `MSP_APP_KEY`).

Applications + form remain a **supplement** for `mspApplicationNo` and TIN when present.

## API

`POST /functions/importMSPPortfolio`

- `{ "dryRun": true }` — preview only  
- `{ "confirmLive": true }` — write

`POST /functions/probeMSPMerchantData` — admin read-only coverage / field-shape probe.

## UI

`/admin/center/sync-msp` — Probe → Dry run → Confirm live.

## Non-goals

HubSpot company/deal, Excel as primary path, scheduled sync, signer KYC, PCI/volume/notes UI.
