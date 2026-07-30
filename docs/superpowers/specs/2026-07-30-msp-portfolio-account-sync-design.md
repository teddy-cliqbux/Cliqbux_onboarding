# MSP Portfolio → Merchant Center Sync (Approach A)

**Date:** 2026-07-30  
**Status:** Approved — Merchants API + **Owner → Legal Entity → MID** hierarchy

## Goal

Pull the live MSPWare merchants portfolio into Merchant Center. **No HubSpot writes** in v1.

## Hierarchy (matches ADRs)

| Layer | Key | Source |
|---|---|---|
| **MerchantAccount** (Parent) | contact `email` → contact name → corporate_name | `GET /merchants/{mid}` |
| **legalEntities + profile** | `federal_tax_id` → `corporate_name` | same |
| **Location + MID** | each `mid` / DBA `name` | same |
| Enrichment | form `owners[]`, signatures `signers[]` | only when `merchantapplicationno` known |

## API (OpenAPI: https://api.mspware.com/api-docs/#/)

Primary: `GET /merchants`, `GET /merchants/{mid}`  
Bridge: `GET /applications` (by mid)  
Optional: `GET .../form`, `GET .../signatures` (404-safe)

Live base: `MSP_BASE_URL` (typically `https://api.msppulsepoint.com/v2`).

## Functions

- `POST /functions/probeMSPMerchantData` — coverage + owner email clustering + signatures sample  
- `POST /functions/importMSPPortfolio` — `{ dryRun: true }` or `{ confirmLive: true, ownerOffset?, ownerLimit? }` (live default 8 owners/call; UI loops until `done`)
- Live writes: Base44 throttle + rate-limit retry; per-owner try/catch → `summary.writeErrors` (HTTP 200 partial success)

## UI

`/admin/center/sync-msp` — Probe → Dry run → Confirm live.

## Schema

`MerchantAccount.primaryContactEmail` / `primaryContactName` — **republish entity** in Base44.

## Non-goals

HubSpot company/deal, PCI/volume UI, inventing TINs, signatures as primary grouping key.
