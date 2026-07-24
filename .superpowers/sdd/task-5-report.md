# Task 5 Report: Underwriting table polish

**STATUS:** DONE  
**Branch:** `feature/merchant-center-pos-shell`  
**COMMIT:** `b40f729` — feat: widen UnderwritingTracker with MID rows table  
**Date:** 2026-07-24

---

## Summary

Polished `UnderwritingTracker` for the wide Merchant Center canvas: removed the centered width cap and added a POS-style Account / Status / MID table below the existing stage progress strip, using the same `items` array already in the component.

---

## Files Modified

| File | Change |
|---|---|
| `src/components/onboarding/UnderwritingTracker.jsx` | Removed `max-w-3xl mx-auto`; added MID rows table with empty state |

---

## What changed

1. **Full width** — outer wrapper is now `w-full` only (no `max-w-3xl mx-auto`).
2. **MID rows table** — below the stage strip, inside the same card:
   - Columns: Account, Status, MID
   - Empty state: “No processing accounts yet”
   - Dot + caption status per row (status-specific dot colors aligned with `LocationStatusTable`)
   - Account label: `merchantName || dbaName || 'Processing account'`
   - MID column: `elavonMID` or em dash
3. **Unchanged** — props (`locations`, `merchantIDs`), stage progress header, and stage calculation logic.

---

## Residual risks

- **Legacy locations fallback:** when `merchantIDs` is empty, table rows use location records — Account shows `dbaName`, Status uses `applicationStepStatus`, MID column stays em dash until Elavon assigns MIDs.
- **Status dot colors:** brief showed a single `bg-cb-accent` dot; implementation uses per-status dot colors (same palette as `LocationStatusTable`) for clearer scanning on wide layouts.
- **No automated test** for table rendering; visual QA on Setup dashboard with 0 / 1 / many MIDs recommended.
