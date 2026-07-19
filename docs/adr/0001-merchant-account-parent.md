# ADR: Merchant Account parent (HubSpot Tier-1)

**Date:** 2026-07-18  
**Status:** Accepted (grilling with Teddy)

## Context

`/admin/applications` serves sales and underwriting/CS. Continuity across multiple deals/signings requires a parent above HubSpot deals. TINs are not unique to one “merchant group” — multiple EINs can sit under one corporation.

## Decision

- **MerchantAccount** = HubSpot Tier-1 Corporation company.
- **Deal** = `MerchantCorporateProfile.corporateId` = HubSpot deal id; FK `merchantAccountId`.
- **Legal entities (TINs)** live on the account (dual-written to profile for boarding).
- **People** are assigned per deal (`MerchantSigners.corporateId`) but carry `merchantAccountId`; KYC is reused from prior signers on the same account.
- **Quick Stage** prompts for parent company name → creates HubSpot company + deal (no more slug-only / hubspotBypass local merchants for this path).
- **Deal room** = `/admin/applications/:corporateId` — internal notes + tasks + read-only snapshot (v1). Email feed / AWB per-MID history = phase 2.

## Consequences

- Republish `MerchantAccount`, `MerchantCorporateProfile`, `MerchantSigners`, `ApplicationDeskItem` schemas in Base44.
- Redeploy `manageStagedApplication`, `manageLegalEntity`, `manageSigner`, `createHubspotDeal`, `manageApplicationDesk`.
- Existing deal-scoped profiles without `merchantAccountId` keep working; migrate/link as agents touch them.
