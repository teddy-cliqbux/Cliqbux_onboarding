---
target: OnboardingLocations
total_score: 28
p0_count: 0
p1_count: 2
timestamp: 2026-07-16T06-52-00Z
slug: src-pages-onboardinglocations-jsx
---
Method: dual-agent (A: 9f28443d · B: 15e26f9f)

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | Drag-move failures silently loadAll() and snap back with no message |
| 2 | Match System / Real World | 3 | Chrome vocab clean; raw MCC digits ("5812") and "(RE)" wire codes still leak |
| 3 | User Control and Freedom | 3 | Confirms everywhere; deletes permanent, mobile has no move alternative |
| 4 | Consistency and Standards | 2 | Three save models: explicit Save, mailing autosave, save-on-submit |
| 5 | Error Prevention | 2 | No frontend typical<monthly<largest check; 12-option MCC with no escape |
| 6 | Recognition Rather Than Recall | 3 | Validation names exact entity/location/field; bare "5812" still recall |
| 7 | Flexibility and Efficiency | 3 | Prefill, Places, auto-industry, Enter/Escape; restructure drag+desktop only |
| 8 | Aesthetic and Minimalist Design | 4 | Genuinely restrained; one off-token bg-gray-300 dot |
| 9 | Error Recovery | 3 | actionError banner landed; mailing-address save/clear still console-only |
| 10 | Help and Documentation | 2 | Liquor/website microcopy strong; zero help for the MCC decision |
| **Total** | | **28/40** | **Good** |

## Anti-Patterns Verdict

**LLM**: Not slop — label-map vocabulary enforcement, dated rationale comments, deliberate trade-offs. Residue: dead in-file AddEntityModal (~60 lines, duplicate of the component file), unreachable no-op onDelete, liquor predicate copy-pasted 5×.

**Deterministic scan**: [] exit 0 — clean.

**Visual overlays**: Skipped — no dev server.

**Jargon audit**: zero merchant-facing MID/MCC/MOTO/MSPWare leaks; all 25 grep hits are comments/identifiers/enum keys, StatusBadge label map translates before render.

## Overall Impression

The clarify/distill/harden pass landed (+6 vs previous). Remaining problems are structural: Save gate ≠ completeness gate on the account editor, the Business Category dead-end, and mobile restructuring gap.

## What's Working

1. Validation storytelling — post-attempt-only, per-record named issues, auto-expanding offenders
2. Vocabulary discipline — MID→"processing account" complete in chrome, enforced by label map
3. Restraint executed — dot+caption, one-line stats, indent + 1px rails (Gold Wire)

## Priority Issues

### [P1] Save gate ≠ completeness gate (canSave omits monthlyCardSales; isComplete requires it)
Suggested: $impeccable harden

### [P1] Business Category dead-end (12 MCCs, no "not listed" path, no descriptions)
Suggested: $impeccable onboard

### [P2] Residual silent failures (drag persistence, mailing-address autosave/clear)
Suggested: $impeccable harden

### [P2] Mobile cannot restructure; ~28px targets; split grid stays 3-col at 360px
Suggested: $impeccable adapt

### [P3] Sales cross-field rules invisible (backend silently caps typed figures)
Suggested: $impeccable harden

## Trend

22/40 (2026-07-16T06-18) → 28/40 now. P0 jargon wall resolved; MidCard distill + silent-alert fixes landed. Next bottleneck: save-gate mismatch + MCC escape hatch.
