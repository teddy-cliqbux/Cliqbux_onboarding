# MSP Merchant Metrics Sync (volume + batches)

**Date:** 2026-07-31  
**Status:** Approved (Teddy)  
**Approach:** Separate `syncMSPMerchantStats` + second card on `/admin/center/sync-msp`

## Goal

Pull MSPWare processing metrics into Merchant Center so the exec portfolio dashboard can rank by volume and show recent batch activity — without calling MSP on every page load.

## Locked decisions

| Decision | Choice |
|---|---|
| Sync shape | Separate from identity `importMSPPortfolio` |
| Storage | Hybrid: rollups on `MerchantMID` + last **30** batch rows in `MerchantMidBatch` |
| Statistics | `GET /merchants/{mid}/statistics` → MID volume fields |
| Batches | `GET /merchants/{mid}/batches` · window `daterange=6_m` · timezone `America/Los_Angeles` · keep newest 30 |
| Statements | Probe sample only — **no writes** (retention still open in vault) |
| Eligible MIDs | Any `MerchantMID` with non-empty `elavonMID` |
| Ritual | Probe → Dry run → Confirm live (chunked `midOffset` / `midLimit`) |
| Auth | Admin / workspace only |

## API (OpenAPI pin)

Vault: `partners/mspware/openapi-v2-2026-07-31.json`

- `/merchants/{mid}/statistics` — MTD / last month / YTD / QTD / total + deposit dates  
- `/merchants/{mid}/batches` — commission batch rows (`amtpurchase`, `totalnetamt`, `merchantbatchno`, `datecreated`, …)  
- `/merchants/{mid}/printstatements` — probe only  

**`salesteamno`:** required by batches (and useful for statements). Use env `MSP_SALESTEAM_NO` when set; otherwise send empty string and record probe/live errors if MSP rejects.

## Function

`syncMSPMerchantStats`

| Mode | Body | Writes? |
|---|---|---|
| Probe | `{ probe: true, sampleSize?: 3 }` | No — sample statistics + batches + one statements call |
| Dry run | `{ dryRun: true, midOffset?, midLimit? }` | No |
| Live | `{ confirmLive: true, midOffset?, midLimit? }` | Yes — chunked; UI loops until `done` |

Defaults: `midLimit` ≈ 12 (2 MSP calls per MID). Rate gate ≤8 req/s; count HTTP 429; per-MID try/catch → `summary.writeErrors` (HTTP 200 partial success).

## Schema

### `MerchantMID` (republish)

`volumeCurrentMonth`, `volumeLastMonth`, `volumeYtd`, `volumeQtd`, `volumeTotal`, `dateFirstDeposit`, `dateLastDeposit`, `batchCountWindow`, `batchVolumeWindow`, `lastBatchDate`, `lastBatchNetAmt`, `lastBatchNo`, `mspStatsSyncedAt`, `mspBatchesSyncedAt`, `mspStatsError`, `mspBatchesError`

### `MerchantMidBatch` (new entity — publish in Base44)

`merchantMidId`, `elavonMID`, `corporateId`, `merchantBatchNo`, `batchNum`, `dateCreated`, `totalNetAmt`, `amtPurchase`, `amtReturn`, `numPurchase`, `numReturn`, `averageTicket`, `tidNum`, `applicationNo`, `syncedAt`

Upsert by (`merchantMidId` + `merchantBatchNo`); after sync delete older than newest 30 for that MID.

## UI

`/admin/center/sync-msp` — second card **Sync MSP volume** (Probe / Dry run / Confirm live). Identity card unchanged.

## Non-goals

Exec dashboard ranking UI (next slice), statement file storage, YoY `/volume`, residuals, HubSpot writes, inventing volume.

## Success

After a live run, MIDs with Elavon IDs show volume fields + up to 30 batch rows; 429s visible; partial failures don’t abort the whole job.
