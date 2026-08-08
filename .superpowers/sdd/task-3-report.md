# Task 3 Report — Admin sidebar Underwriting item

**Issue:** #23  
**Branch:** `feature/underwriting-room`  
**Date:** 2026-08-07

## Summary

Added an **Underwriting** nav item to the admin Merchant Center sidebar under **Work**, immediately after **Onboarding**. Both items navigate to `/admin/applications` in v1 (approved). Merchant-facing `MerchantCenterShell` was not modified.

## Files changed

| File | Change |
|------|--------|
| `src/components/admin/AdminMerchantCenterShell.jsx` | Import `Shield`; add Underwriting button under Work |

## Implementation

1. **Icon:** `Shield` from `lucide-react` (alphabetically placed in import list).
2. **Nav item:** Button matching the existing Onboarding pattern — `navigate('/admin/applications')`, `navLinkClass({ isActive: false })`, same icon sizing/stroke.
3. **Placement:** Work section, directly after Onboarding, before Installations / Sync MSPWare / Team.

## Out of scope (per brief)

- `MerchantCenterShell.jsx` — untouched; no Underwriting item for merchants.
- `ApplicationDealRoom`, CTA lib files — not modified.

## Verification

| Check | Result |
|-------|--------|
| `Shield` imported from lucide-react | Pass |
| Underwriting button after Onboarding in Work section | Pass |
| Navigates to `/admin/applications` | Pass (code review) |
| Same styling pattern as Onboarding | Pass |
| `MerchantCenterShell` has no Underwriting | Pass (grep: no matches) |
| Linter on changed file | Pass (no diagnostics) |
| Manual UI at `/admin/center` | Not run in this session — verify after deploy/publish |

## Concerns / follow-ups

- **v1 routing:** Onboarding and Underwriting both land on `/admin/applications`. A dedicated underwriting route/filter can be wired in a later task.
- **Active state:** Both Work buttons use `isActive: false`; neither highlights when the user is on the applications desk. Consider shared active detection if UX feedback is needed.
- **Manual QA:** Confirm sidebar item and click-through as admin after push/publish.

## Commit

See git log on `feature/underwriting-room` for the Task 3 commit hash.
