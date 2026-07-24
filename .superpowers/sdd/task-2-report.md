# Task 2 Report: SetupStatusCard presentational component

**Status:** DONE  
**Branch:** `feature/merchant-center-pos-shell`  
**Commit:** `bb78eb6` — feat: add SetupStatusCard metric card component  
**Date:** 2026-07-24

---

## Summary

Created the presentational `SetupStatusCard` React component for the Merchant Center POS-shell redesign. Implementation matches the task brief verbatim — no wiring into the dashboard yet (Task 4). Pure markup component; no unit tests required per brief.

---

## Files Created

| File | Purpose |
|---|---|
| `src/components/merchant-center/SetupStatusCard.jsx` | Metric card UI — title, value, optional caption, optional icon |

---

## Interface

```jsx
<SetupStatusCard
  title="Needs attention"
  value="3 open items"
  caption="Checklist incomplete"
  icon={<SomeIcon className="w-4 h-4" />}  // optional
/>
```

**Props:**

| Prop | Type | Required | Default |
|---|---|---|---|
| `title` | string | yes | — |
| `value` | string | yes | — |
| `caption` | string | no | — (hidden when falsy) |
| `icon` | React node | no | `null` (icon slot hidden when falsy) |

---

## Markup / Design

- Uses `cb-*` tokens only: `bg-cb-surface`, `rounded-cb`, `border-cb-border`, `text-cb-caption`, `text-cb-title`, `bg-cb-accent-muted`, `text-cb-accent`
- Layout: flex row with text block (left) and optional icon badge (right)
- Title: uppercase caption; value: `font-display` title with truncate; caption: normal-case caption with truncate
- Min height `5.5rem` for consistent card row alignment
- Icon slot: 36×36px muted gold background, accent-colored icon

---

## Tests

**N/A** — pure presentational markup per brief. Smoke-check deferred to Task 4 dashboard wiring.

---

## Lint

No linter errors on `SetupStatusCard.jsx`.

---

## Deviations

None. JSX copied exactly from task brief.

---

## Next Steps (Task 4)

- Wire `deriveSetupStatusCards()` output into a grid of `<SetupStatusCard />` on the Merchant Center dashboard
- Pass Lucide (or equivalent) icons per card id
- Browser smoke-check layout at mobile and desktop breakpoints
