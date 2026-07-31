# Admin Account Home Overview (CoPilot-inspired)

**Date:** 2026-07-31  
**Status:** Approved (Teddy) — build now  
**Approach:** Server-composed `overview` on `manageMerchantAccount` `get`

## Goal

Upgrade `/admin/center/accounts/:merchantAccountId` into an action-first merchant overview: identity header, state-driven primary CTA (auto-picks best deal), dense Account Summary, then existing Deals / Legal / MIDs lists.

## Locked decisions

| Decision | Choice |
|---|---|
| Composition | Header + hero CTA + dense summary; notes/tickets deferred |
| Best deal | Handoff-stage priority: sales → underwriting → implementation → installation → support; blank before support; newest within stage |
| CTA map | needs_attention → Deal Room · onboarding → Portal · live → Locations · prospect+deal → Deal Room · prospect+no deal → Applications (Quick Stage) |
| Summary | Dense (contact, legal, bank last-4, reporting MID, flag rows) |
| Compliance flags | Always show; values `compliant`/`non_compliant`/`unknown` (or on/off/unknown) — never invent Compliant |
| API | Enrich existing `get`; do not add a separate endpoint |

## Non-goals

- Tickets / notes widgets
- Volume / residual charts
- Merchant-facing account page redesign
- Full bank / TIN numbers in the overview payload
- POS dashboard deep-link (no API join yet)

## Success

Opening an account shows one clear primary action for the best deal, a readable summary from real data, and the existing deal/MID lists still work.
