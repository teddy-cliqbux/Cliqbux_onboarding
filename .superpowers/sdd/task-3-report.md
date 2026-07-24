# Task 3 Report: Rebuild MerchantCenterShell (POS chrome)

**Status:** DONE  
**Branch:** `feature/merchant-center-pos-shell`  
**Commit:** `e7a7e04` — feat: rebuild MerchantCenterShell with POS-style sidebar  
**Date:** 2026-07-24

---

## Summary

Rewrote `MerchantCenterShell.jsx` from fixed top header + `max-w-3xl` layout to POS-style chrome: fixed left sidebar (desktop), top bar, wide main canvas, and mobile bottom nav strip. All prop names unchanged; `dealHref` logic preserved.

---

## Files Modified

| File | Change |
|---|---|
| `src/components/merchant-center/MerchantCenterShell.jsx` | Full layout rewrite |

---

## Layout

| Region | Classes / behavior |
|---|---|
| Outer | `portal-bg min-h-screen flex` |
| Sidebar (md+) | `w-56 fixed`, `CliqbuxLogo`, nav links, Sign out footer |
| Main column | `flex-1 md:pl-56 min-h-screen flex flex-col` |
| Top bar | `h-14`, subtitle caption + title chip, Sign out on mobile |
| Main content | `max-w-[1400px] mx-auto`, `pb-20` on mobile for bottom nav |
| Mobile nav | Fixed bottom strip — Setup / Locations / Account + checklist badge |

---

## Nav order

1. **Setup** — only when `showDealLink && corporateId` (same `dealHref` as before)
2. **Locations** — `/locations?dealId=…`
3. **Account** — `/account?dealId=…`

Active link: `bg-cb-accent-muted text-cb-accent`. Checklist badge: danger pill on Setup (sidebar + mobile).

---

## Props (unchanged)

`title`, `subtitle`, `corporateId`, `openChecklistCount`, `children`, `showDealLink`

---

## Tests

**Manual check deferred** — brief Step 2: verify `/locations` and `/account` after Task 5. No automated tests added.

---

## Lint

No linter errors on `MerchantCenterShell.jsx`.

---

## Concerns

- Top bar has no page-title prop yet (brief non-goal for v1); left side empty on desktop — acceptable per spec.
- Mobile bottom nav may overlap very tall sticky footers; `pb-20` on main should cover most cases.

---

## Next Steps

- Task 4/5: wire dashboard content into wide canvas; browser smoke at `/locations` and `/account`.
