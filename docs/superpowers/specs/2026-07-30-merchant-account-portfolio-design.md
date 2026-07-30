# Merchant Account Portfolio Hub

**Date:** 2026-07-30  
**Status:** Approved (Teddy)  
**Approach:** Promote `/admin/center` into admin Merchant Account portfolio + account home

## Goal

Make the admin Merchant Center home a searchable portfolio of **MerchantAccounts** (company parents), not a flat list of HubSpot deals. Applications remains a deal-desk tool. Excel import is deferred but the model is import-ready.

## Locked decisions

| Decision | Choice |
|---|---|
| Primary list row | MerchantAccount (Base44 id + `hubspotCompanyId`) |
| Placement | Admin-only hub at `/admin/center` |
| Account open | `/admin/center/accounts/:merchantAccountId` |
| Active model | Pipeline + live with derived status chips |
| Deal identity | `corporateId` = HubSpot **Deal ID** — label as Deal ID in hub UI; never account primary key |
| Orphans | Unlinked deals bucket — do not invent fake accounts |
| Auth | Admin/workspace only; merchant JWTs rejected |

## Hierarchy (do not conflate)

```
MerchantAccount (company)     ← portfolio row / account home URL
  └── MerchantCorporateProfile.corporateId = HubSpot deal id
        └── Locations → MerchantMIDs
```

## Status derivation (priority: first match wins)

1. **needs_attention** — any MID `Error` / `mccHelpRequested`, or deal attention hints (MSP form incomplete / errors when provided)
2. **live** — ≥1 MID `Active` or `Active (Existing)`
3. **onboarding** — ≥1 in-flight deal (Incomplete / Quote Signed / Submitted, or handoff ≠ support) and not live
4. **prospect** — otherwise

## Routes

| Route | Role |
|---|---|
| `/admin/center` | Account portfolio |
| `/admin/center/accounts/:merchantAccountId` | Account home |
| `/admin/applications` | Deal desk tool (linked from hub) |
| `/admin/applications/:corporateId` | Deal Room |

## API

`manageMerchantAccount` (admin-only): `list` | `get` | `listUnlinkedDeals`

## Non-goals (this slice)

- Excel import UI
- Create account/deal from hub
- Renaming `corporateId` in the database
- Shared admin+merchant shell
- Cached rollup fields on MerchantAccount

## Success

Admin can open `/admin/center`, see companies, filter by status, open an account, and jump into Deal Room / impersonate without treating Deal ID as the company.
