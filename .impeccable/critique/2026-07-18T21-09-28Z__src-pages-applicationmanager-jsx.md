---
target: admin/applications page
total_score: 23
p0_count: 3
p1_count: 3
timestamp: 2026-07-18T21-09-28Z
slug: src-pages-applicationmanager-jsx
---
# Critique — `/admin/applications` (`src/pages/ApplicationManager.jsx`)

Method: dual-agent (A: 2fbb4f87-8d02-4a43-bfcc-e4466fc69e46 · B: 56b5b361-e14c-4c96-97f8-a6a825c21266)

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 2 | MSP errors / stuck mode only after expand; page load failures swallowed |
| 2 | Match System / Real World | 3 | Clarify pass helped; funnel “not started” still mislabels Incomplete mid-flow |
| 3 | User Control and Freedom | 3 | Keep merchant / Go back OK; modals lack Escape + focus trap |
| 4 | Consistency and Standards | 2 | Dual metrics (pie vs Incomplete); dots vs lifecycle pills; alert vs banners |
| 5 | Error Prevention | 3 | Typed DELETE confirm strong; wrong primary CTA until expand is an ops trap |
| 6 | Recognition Rather Than Recall | 2 | Mode reason buried in `title`; Dashboard/Edit labels hidden below lg |
| 7 | Flexibility and Efficiency | 2 | Jump + mode CTAs help; no keyboard expand, no bulk, truth gated on open |
| 8 | Aesthetic and Minimalist Design | 2 | Hero pie + tri-metrics; activity 3-card grid; uppercase label spam |
| 9 | Error Recovery | 2 | Some plain errors post-clarify; silent `catch` + `alert()` elsewhere |
| 10 | Help and Documentation | 2 | CTA tooltips only; no inline “what this mode means” |
| **Total** | | **23/40** | **Acceptable** |

## Anti-Patterns Verdict

**LLM assessment:** Not purple-SaaS slop. Surfaces and gold CTAs match Cliqbux tokens. Still reads as a dense admin desk with familiar AI tells: uppercase eyebrows everywhere, hero metrics strip, identical activity cards, 2px left stripes on banners, glass blur on the edit overlay, and leftover sky/amber lifecycle pills fighting the portal’s dot+caption rule.

**Deterministic scan:** 9 findings (exit 2) — `side-tab`×3 (`border-l-2` @ 1021/1083/1106), `border-accent-on-rounded`×1 (tab `border-b-2` @ 824 — likely FP), `design-system-font-size`×5 (8px StepTracker, 10px pills). Detector and LLM agree on side stripes and micro-type; LLM additionally flags glass blur, hero metrics, and pill chrome the detector doesn’t name.

**Visual overlays:** Not available — no local server; auth-gated admin route; injection not attempted.

## Overall Impression

Mode-driven primary CTAs (Open to prep / Open to fix / Remind / Open dashboard) are the right deal-desk idea. The biggest failure: the list lies until you expand — MSP “stuck” can’t fire without a fetch that only runs on expand — so agents mid-call trust the wrong gold button.

## What's Working

1. **One gold primary per row mode** + quiet Dashboard/Edit — correct sales-desk affordance.
2. **MID status as dot+caption** and restraint on row chrome (no purple glow CTAs).
3. **Destructive delete** gated by typing DELETE; empty states after clarify teach the next action.

## Priority Issues

### [P0] Stuck/MSP health is expand-gated — wrong primary CTA on the collapsed row
- **Why:** `getMSPFormStatus` only runs after expand; `resolveApplicationRowMode` often never sees `mspErrorCount` → Remind/Prep when Fix is needed.
- **Fix:** Prefetch lightweight health for visible rows (or batch MSP status on list load); feed `mspErrorCount` into mode before first expand.
- **Suggested command:** `$impeccable harden admin/applications`

### [P0] Expand rows are mouse-only
- **Why:** Header is a `div` with `onClick`; no `role`/`tabIndex`/`aria-expanded`/keyboard. Chevron button has no own handler.
- **Fix:** Disclosure pattern: button or `aria-expanded` row with Enter/Space; MidRow same.
- **Suggested command:** `$impeccable audit admin/applications`

### [P0] Silent load / expand failures look like empty data
- **Why:** `catch (_) {}` on page load and expand — empty pipeline vs API failure indistinguishable; risks wrong “create merchant” path.
- **Fix:** Surface inline error with Retry; never empty-state a failed fetch.
- **Suggested command:** `$impeccable harden admin/applications`

### [P1] Dual status systems at the top + Incomplete = “not started”
- **Why:** Pie (draft/ready/sent) fights submitted/in-progress/not-started; Incomplete mid-funnel counts as not started.
- **Fix:** One header model (mode counts or funnel steps). Drop or demote the pie.
- **Suggested command:** `$impeccable distill admin/applications`

### [P1] Visual ban leftovers — stripes, blur, pills, 8px type, activity card grid
- **Why:** Detector + design system: `border-l-2`, `backdrop-blur-sm`, lifecycle `rounded-full` pills, `text-[8px]`/`[10px]`, identical 3-up activity cards, uppercase `labelCls` everywhere.
- **Fix:** Full borders or tinted banners; no blur; owners → dot+caption; StepTracker to `cb-caption`; demote activity to one timeline.
- **Suggested command:** `$impeccable quieter admin/applications` then `$impeccable polish`

### [P1] Sort ≠ stuck mode; nudge under-labeled when waiting on sign
- **Why:** Sort only idle-3-day; verification nudge has no chip (bank does).
- **Fix:** Sort by mode priority; add “Waiting on sign” chip.
- **Suggested command:** `$impeccable layout admin/applications`

## Persona Red Flags

**Alex (Power User):** No keyboard expand; no bulk; must open every row to trust Fix vs Remind; Jump exists but list truth is incomplete.

**Sam (Accessibility):** Expand not keyboard operable; modals missing `role="dialog"` / Escape / focus trap; owner Copy/Send icon-only without `aria-label`; status often color+pill without text twin beyond tiny badges.

**Sales agent mid-call (project — secondary audience):** On a live call, wrong gold CTA from expand-gated MSP errors is the costly failure; dual header metrics don’t answer “who do I call next?”

## Minor Observations

- StageEditor tabs lack `role="tab"` / `aria-selected`.
- Dashboard/Edit text hidden below `lg` — icon-only density on laptop.
- List hard-cap 200 with no pagination UX.
- Confirm dialogs via `window.confirm` / `alert` for signer actions — inconsistent with modal language.
- `border-accent-on-rounded` on tab underline likely false positive.

## Questions to Consider

- What if collapsed rows always showed trustable mode (even if health is a 30s stale cache)?
- Does the pie chart earn its pixels on a sales call, or is it vanity ops chrome?
- Should expand open to “Next action + blocker” first, with MIDs/owners secondary?
