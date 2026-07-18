---
target: admin/applications page
total_score: 27
p0_count: 1
p1_count: 2
timestamp: 2026-07-18T21-21-08Z
slug: src-pages-applicationmanager-jsx
---
# Critique — `/admin/applications` (`src/pages/ApplicationManager.jsx`)

Method: dual-agent (A: 8237b75a-dd0b-473d-a4ac-6f1513535e09 · B: ecaa78a2-0012-4efb-9960-8ab9a1cb60cc)

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | Loaders/modes work; mode can flip after silent MSP prefetch |
| 2 | Match System / Real World | 3 | Locked CTAs speak agent language; MSP App / form % still leak |
| 3 | User Control and Freedom | 3 | Escape + cancel solid; MidRow expand not a proper control |
| 4 | Consistency and Standards | 3 | Row button expand vs MidRow click-div diverge |
| 5 | Error Prevention | 3 | DELETE confirm good; Remind fires immediately; MSP catch→null |
| 6 | Recognition Rather Than Recall | 3 | rowMode.reason helps; Loc/Bank/Sign abbreviations need memory |
| 7 | Flexibility and Efficiency | 2 | Search/Jump/channel pref; no shortcuts or bulk |
| 8 | Aesthetic and Minimalist Design | 3 | Quieter; pipeline + row chrome still compete |
| 9 | Error Recovery | 2 | Retry on list/detail; many paths still alert() |
| 10 | Help and Documentation | 2 | Titles exist; no “when Remind vs Fix” |
| **Total** | | **27/40** | **Acceptable (Good edge)** |

## Anti-Patterns Verdict

**LLM assessment:** Not AI-slop. Deal-desk restraint stuck. Remaining tells: gold-dot monoculture for prep/nudge/stuck, arbitrary z-index, alert() failures, MidRow nested click/button.

**Deterministic scan:** 1 finding (exit 2) — `border-accent-on-rounded` @ L845 (tab `border-b-2`). Suspected false positive (tab underline, not card accent). Prior run had 9 findings; side stripes / micro-type / activity grid cleared.

**Visual overlays:** Not available — auth-gated admin; no injectable local session.

## Overall Impression

Mode CTAs and header mode counts landed. Biggest remaining risk is operational: at-risk auto-prefetch of MSP form status can re-create rate-limit pressure. MidRow a11y and gold-dot sameness are the next craft gaps.

## What's Working

1. Locked gold CTAs + plain-language mode reasons — mid-call “I know what to do.”
2. Mode-count header (no pie / Incomplete-as-not-started).
3. Owner lifecycle as dot+caption; Escape/dialog roles on main overlays.

## Priority Issues

### [P0] At-risk auto-prefetch can stampede getMSPFormStatus
Every verification/lock row loads MIDs + formOnly MSP on mount — busy lists risk Critical Lesson #2 rate limits.
- **Fix:** Cap concurrent fetches globally; or IntersectionObserver + stuck-candidate only; never N× verification rows at once.
- **Suggested command:** `$impeccable harden admin/applications`

### [P1] MidRow nested interactive / keyboard dead-end
Clickable `div` + nested chevron button; no aria-expanded on MidRow chrome.
- **Fix:** Match ApplicationRow disclosure pattern.
- **Suggested command:** `$impeccable audit admin/applications`

### [P1] Status color doesn’t discriminate modes
prep/nudge/stuck all `bg-cb-accent`; opened/verified same in lifecycleDotClass.
- **Fix:** Differentiate with shape/label weight, or reserved danger for stuck only — not three gold dots.
- **Suggested command:** `$impeccable colorize admin/applications` or `$impeccable quieter`

### [P2] Error recovery still alert()
Impersonate/nudge/signer failures use browser alert vs in-row banners.
- **Suggested command:** `$impeccable harden admin/applications`

### [P2] CheckRow hidden checkbox
StageEditor custom checkbox with `className="hidden"` — weak accessible pairing.
- **Suggested command:** `$impeccable audit admin/applications`

## Persona Red Flags

**Alex:** No shortcuts/bulk; prefetch may slow desk when many deals sit on Signing.

**Sam:** MidRow not keyboard-equal; mode meaning often gold-dot only; alert() and hidden checkboxes hurt AT.

**Sales agent mid-call:** Primary CTAs right; stuck may appear late after prefetch; Dashboard utility competes with gold primary under pressure.

## Minor Observations

Duplicate expand affordances (chevron + name) are slightly redundant but a11y-positive. Secondary Dashboard on non-underwriting rows competes. Firearm humanize string still jargon-heavy. Detector tab finding is FP.

## Questions to Consider

- Should only visible/stuck-candidate rows fetch MSP — never every verification row on mount?
- Collapse Loc/Bank/Sign + % into expand so the list is merchant + mode CTA + one-line reason?
- On nudge rows, should Remind be the only gold action (Dashboard/Edit in overflow)?
