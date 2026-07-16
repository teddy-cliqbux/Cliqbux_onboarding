---
target: OnboardingLocations
total_score: 22
p0_count: 1
p1_count: 2
timestamp: 2026-07-16T06-18-14Z
slug: src-pages-onboardinglocations-jsx
---
Method: dual-agent (A: 8e3611ca · B: 04dae5de)

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | Save/Saved/Required work; MidCard save failures console-only |
| 2 | Match System / Real World | 1 | MID / MCC / MOTO / EIN / wire industry codes in merchant chrome |
| 3 | User Control and Freedom | 3 | Cancel/Back/delete confirms; some delete failures still alert() |
| 4 | Consistency and Standards | 2 | Save Details vs mailing auto-save; dual EIN surfaces |
| 5 | Error Prevention | 3 | Gates + card-split 100%; Industry override still easy to break |
| 6 | Recognition Rather Than Recall | 2 | Dot+caption helps; MID/MCC must already be known |
| 7 | Flexibility and Efficiency | 2 | DnD helps agents; grip-heavy tree hurts mobile one-sitting |
| 8 | Aesthetic and Minimalist Design | 3 | Gold Wire restraint; expanded MidCard still dense admin form |
| 9 | Error Recovery | 2 | Continue banner excellent; MidCard/load failures silent |
| 10 | Help and Documentation | 1 | Prefill tip good; no gloss for MID/MCC/MOTO |
| **Total** | | **22/40** | **Acceptable** |

## Anti-Patterns Verdict

**LLM**: Not purple-SaaS slop — real Gold Wire craft. Residual tells: caption walls, nested boxes, ops vocabulary (MID/MCC/MSPWare).

**Deterministic scan**: [] exit 0 — clean (post border-l-2 polish).

**Visual overlays**: Skipped — no dev server.

## Overall Impression

Visual system is strong; merchant language and MidCard density are the bottleneck. Biggest opportunity: demystify the org tree for one-entity / one-store merchants.

## What's Working

1. Hierarchy via indent + 1px rails + type weight (Gold Wire)
2. Continue validation lists exact gaps including Save Details
3. Conditional compliance (website / alcohol) appears when relevant

## Priority Issues

### [P0] Jargon wall (MID / MCC / MOTO)
Suggested: $impeccable clarify

### [P1] MidCard decision dump
Suggested: $impeccable distill

### [P1] Save / EIN mental model inconsistency
Suggested: $impeccable harden

### [P2] Silent MidCard / load failures
Suggested: $impeccable harden

### [P3] Mobile / one-sitting friction (grips, padding, dense headers)
Suggested: $impeccable adapt

## Persona Red Flags

**Jordan**: MID before definition; MCC Code *; Industry RE/RS.
**Casey**: Grip + icon-only actions; MidCard grids on narrow screens.
**Morgan**: Processing Setup + Merchant Applications feels ISO paperwork; dual EIN + Save Details burns the sitting.

## Minor Observations

- Liquor callout w-0.5 vs 1px border-l elsewhere
- MSPWare in website helper line
- Valid EIN overclaims digit length
- Org Structure toolbar caption has no actions

## Questions to Consider

1. Default to single-store form with Add another buried?
2. Should MID ever appear in merchant chrome?
3. Defer everything beyond legal + address + category + volume?
