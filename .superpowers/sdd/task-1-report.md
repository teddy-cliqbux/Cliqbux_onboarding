# Task 1 Report: Status card helpers (TDD)

**Status:** DONE  
**Branch:** `feature/merchant-center-pos-shell`  
**Commit:** `13f0f86` — feat: add Merchant Center setup status card helpers  
**Date:** 2026-07-24

---

## Summary

Implemented pure JS helpers for Merchant Center setup status cards per the task brief. Followed TDD: failing tests first (RED), implementation from brief (GREEN), commit on feature branch. No deviations from the brief — tests and implementation match verbatim.

---

## Files Created

| File | Purpose |
|---|---|
| `src/lib/setupStatusCards.js` | `deriveSetupStatusCards()` — maps checklist, MIDs/locations, quote lifecycle, and shipping into four card objects |
| `src/lib/setupStatusCards.test.js` | Node test suite (3 cases) |

---

## Interface

```js
deriveSetupStatusCards({
  openChecklistCount,
  merchantIDs,
  locations,
  quoteLifecycle,
  quotePaid,
  shippingStatus,
  trackingNumber,
}) → { attention, underwriting, quote, shipping }
```

Each card: `{ id, title, value, caption }` (all strings).

---

## TDD Evidence

### RED — tests before implementation

**Command:**
```bash
node --test src/lib/setupStatusCards.test.js
```

**Output:**
```
Error [ERR_MODULE_NOT_FOUND]: Cannot find module '...\src\lib\setupStatusCards.js'
...
ℹ tests 1
ℹ pass 0
ℹ fail 1
```

Expected failure: module not found (implementation file did not exist yet).

### GREEN — after implementation

**Command:**
```bash
node --test src/lib/setupStatusCards.test.js
```

**Output:**
```
▶ deriveSetupStatusCards
  ✔ maps open checklist count to Needs attention (0.6664ms)
  ✔ summarizes underwriting from MID elavonMID / applicationStepStatus (0.1671ms)
  ✔ maps quote lifecycle labels (0.6759ms)
✔ deriveSetupStatusCards (2.2624ms)
ℹ tests 3
ℹ pass 3
ℹ fail 0
```

All tests PASS. No brief adjustments required.

---

## Self-Review

### Correctness

- **Attention card:** Open checklist count stringified; title matches `/attention/i`; singular/plural caption logic correct.
- **Underwriting card:** Prefers `merchantIDs` over `locations` when MIDs present; active count uses `elavonMID` or Active statuses; mixed In Review + Active yields `In review` value (matches `/In Review/i` in test regex); caption `1 of 2 active` would match `/1 of 2/i` if asserted on caption — test only checks `value`, which passes.
- **Quote card:** `QUOTE_LABELS` maps lifecycle; `quotePaid` forces `paid` lifecycle.
- **Shipping card:** Locked by default; `ready_to_ship` or `quotePaid` → Ready to ship; tracking in caption when present.

### Conventions

- Matches existing lib test pattern (`node:test`, `node:assert/strict`, ESM imports).
- Pure functions, no React, no side effects — scoped correctly for Task 1.

### Minor notes (not blockers)

1. Underwriting test regex `/1 of 2|In Review|Active/i` is loose — it passes on `In review` (value) not caption `1 of 2 active`. Acceptable for v1; future tasks may tighten assertions when UI wires up.
2. `locations` fallback when `merchantIDs` is empty is implemented but not covered by tests yet — brief did not require it.
3. No `package.json` test script added — brief did not request it; run via `node --test src/lib/setupStatusCards.test.js`.

### Scope compliance

- Only the two specified files created/modified.
- No unrelated changes committed.

---

## Concerns

None. Implementation matches brief verbatim; all tests green.

---

## Next Steps (out of scope for Task 1)

- Wire `deriveSetupStatusCards` into Merchant Center POS shell UI (later tasks).
- Optionally add `test:setup-status` npm script and edge-case tests (empty inputs, locations-only fallback).
