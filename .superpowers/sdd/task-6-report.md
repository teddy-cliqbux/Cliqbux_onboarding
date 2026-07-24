# Task 6 Report: Confirm Locations / Account / Detail use the shell

**STATUS:** DONE  
**Branch:** `feature/merchant-center-pos-shell`  
**COMMIT:** (see below after commit)  
**Date:** 2026-07-24

---

## Summary

Audited `MerchantLocationsHome`, `MerchantAccountPage`, and `MerchantLocationDetail` under `MerchantCenterShell`. All three pages already used the shell with full-width content (no `max-w-3xl` hero/table clipping). Main render paths already passed `showDealLink` + `corporateId`. Small fixes: resolve `corporateId` from session/URL before profile loads so Setup stays in the sidebar during loading, and preserve `dealId` on Location detail cross-links.

---

## Files Modified

| File | Change |
|---|---|
| `src/pages/MerchantLocationsHome.jsx` | Loading shell gets `corporateId` / `showDealLink`; derive `corporateId` from session + `?dealId=` |
| `src/pages/MerchantAccountPage.jsx` | Derive `corporateId` from session + URL for shell props during loading |
| `src/pages/MerchantLocationDetail.jsx` | Same `corporateId` derivation; loading shell props; back link + account link preserve `dealId` |

---

## Audit results

### Shell props (`showDealLink` + `corporateId`)

| Page | Main render | Loading state | Notes |
|---|---|---|---|
| Locations home | Already had props | **Fixed** — was missing both | Also passes `openChecklistCount` |
| Account | Already had props | **Fixed** via early `corporateId` | No checklist badge on Account (expected) |
| Location detail | Already had props | **Fixed** — `showDealLink` was unconditional; `corporateId` was undefined until profile loaded | |

Setup dashboard (`PostSubmissionDashboard`) unchanged — already passes `showDealLink` + `corporateId` + `openChecklistCount`.

### Layout / width

- Grep found **no `max-w-3xl`** on any of the three pages.
- Content uses natural full width inside shell `max-w-[1400px]` main.
- Only narrow constraint: empty-state helper copy on Locations home (`max-w-sm mx-auto`) — intentional, not a table clip.
- Location list, Account sections, and Location detail grids already span the wide main column correctly.

---

## Residual risks

- **Manual smoke not run** — verify Setup / Locations / Account mobile bottom nav and desktop sidebar with a real merchant JWT or impersonation token.
- **Location list links for non-live locations** still route to onboarding portal (`/?dealId=…`) without shell — existing behavior, not changed in this task.
- **Account page** does not show checklist badge count on Setup nav item (only Locations home and Setup dashboard pass `openChecklistCount`).

---

## Tests

No automated tests added (layout/chrome props only).
