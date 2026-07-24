# Task 4 Report: Compose Setup dashboard grid

**Status:** DONE  
**Branch:** `feature/merchant-center-pos-shell`  
**Commit:** `370d0cf` — feat: compose Setup dashboard grid in PostSubmissionDashboard  
**Date:** 2026-07-24

---

## Summary

Recomposed `PostSubmissionDashboard` into a POS-style Setup layout: compact submitted banner, four status metric cards, two-column checklist/quote grid, full-width underwriting + menu/legacy gates. All data hooks, quote polling, SetupGate unlock rules, and celebration confetti preserved unchanged.

---

## Files Modified

| File | Change |
|---|---|
| `src/pages/PostSubmissionDashboard.jsx` | Layout-only recomposition |

---

## Layout (top → bottom)

1. **Compact banner** — “Application submitted” / “Setup preview” + legal name (replaces tall centered hero; confetti still fires once per session)
2. **FormsLockedBanner** — agent-only unlock when forms locked
3. **Status row** — `grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3` of `SetupStatusCard`
4. **Two-column grid** (`lg:grid-cols-12 gap-4`)
   - Left `lg:col-span-7`: `MerchantChecklist` + `MerchantBeforeInstall`
   - Right `lg:col-span-5`: `EquipmentOrderPanel` + Shipping `SetupGate`
5. **UnderwritingTracker** — full width when MIDs exist
6. **Menu + Legacy POS** — full-width `SetupGate` stack (same unlock: `quoteSigned`)
7. Footer caption

**Removed:** `ApplicationTracker` (redundant with status cards + `UnderwritingTracker`)

**Shell:** `showDealLink={false}` on Setup page (already on Setup; sidebar/mobile nav shows Locations + Account only)

---

## How status cards get their props

`deriveSetupStatusCards()` is called once before render with existing page state:

| Input | Source |
|---|---|
| `openChecklistCount` | `MerchantChecklist` → `onOpenCountChange` callback |
| `merchantIDs` | `getMerchantData` load |
| `locations` | `getMerchantData` load |
| `quoteLifecycle` | `deriveQuoteFlags(quoteData, profile).lifecycle` |
| `quotePaid` | `deriveQuoteFlags(quoteData, profile).quotePaid` |
| `shippingStatus` | `profile.equipmentShippingStatus` or `'ready_to_ship'` when paid else `'hold'` |
| `trackingNumber` | First location with `shippingTrackingNumber` |

Cards rendered with Lucide icons: ClipboardList (attention), Shield (underwriting), FileSignature (quote), Truck (shipping).

---

## Preserved (no changes)

- All `useEffect` loaders, HubSpot sync gateway, TanStack `hubspotQuote` query
- 10s quote poll while `QuoteSignModal` open
- `SetupGate` states: shipping (`quotePaid` / `quoteSigned`), menu/legacy (`quoteSigned`)
- `EquipmentShippingModal`, `InventoryUpload`, `ConnectLegacyPOS`, `EquipmentOrderPanel`
- `fireSubmissionCelebration` on merchant submit
- Agent preview redirect / demote unlock flow

---

## Tests

**Manual verify deferred** — load `/onboarding/dashboard?dealId=…` with merchant JWT or impersonation; confirm status cards, quote poll, and gate locks.

No automated tests added (layout-only).

---

## Lint

No linter errors on `PostSubmissionDashboard.jsx`.

---

## Residual risks

- With `showDealLink={false}`, Setup is omitted from sidebar/mobile nav while on this page — intentional; Locations/Account remain reachable.
- Status card underwriting aggregate is heuristic (worst MID status); may not match every edge case in `UnderwritingTracker` detail rows.
- Manual smoke not run in this session against live deal data.

---

## Next steps

- Task 5: adopt shell on Locations / Account pages; browser smoke all three nav destinations.
