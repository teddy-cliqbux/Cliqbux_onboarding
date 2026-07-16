---
target: OnboardingPortal
total_score: 28
p0_count: 0
p1_count: 1
timestamp: 2026-07-16T05-58-41Z
slug: src-pages-onboardingportal-jsx
---
Method: dual-agent (A: 435b0402 · B: ab56b8b3)

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | Tracker + named mobile; unlock still alert() |
| 2 | Match System / Real World | 3 | Titles plain; CTA "Continue to Verification" |
| 3 | User Control and Freedom | 3 | Review + Back; Equipment nav null edge |
| 4 | Consistency and Standards | 3 | Titles ↔ tracker aligned; CTA vocab drift |
| 5 | Error Prevention | 3 | Locks + attention list |
| 6 | Recognition Rather Than Recall | 3 | Verification ≠ Sign & Submit mapping |
| 7 | Flexibility and Efficiency | 2 | No accelerators; mobile tracker non-nav |
| 8 | Aesthetic and Minimalist Design | 3 | Equipment off hub; 3 equal cards |
| 9 | Error Recovery | 3 | Humanized fields; confirm/alert unlock |
| 10 | Help and Documentation | 2 | Better lead; no what-to-bring |
| **Total** | | **28/40** | **Good** |

## Anti-Patterns Verdict

**LLM**: Mostly clear. Residual three equal MilestoneCards — quiet, not theatrical.

**Deterministic scan**: [] exit 0 — clean.

**Visual overlays**: Skipped — no dev server.

## Overall Impression

Orientation work stuck. **24 → 27 → 28**. Into Good band. Remaining P1 is one wording mismatch on the highest-stakes step.

## What's Working

1. One vocabulary spine (Locations / Banking / Sign & Submit)
2. Honest scope — Equipment + ApplicationTracker deferred
3. Mobile named step fraction

## Priority Issues

### [P1] Sign & Submit vs CTA "Continue to Verification"
Suggested: $impeccable clarify — CTA "Continue to signing" or "Sign & Submit"

### [P2] Thin help — no what-to-bring / time expectation
Suggested: $impeccable onboard or clarify hub lead

### [P2] Unlock via native confirm/alert — off-brand
Suggested: $impeccable polish FormsLockedBanner (in-portal modal)

### [P3] CTA casing; body-weight milestone titles; mobile tracker display-only
Suggested: $impeccable polish

## Persona Red Flags

**Jordan**: Verification CTA under Sign & Submit hesitates.
**Casey**: Full-width CTAs OK; compact tracker not clickable.
**Morgan**: Path clearer; attention dump can still feel heavy.

## Minor Observations

- Equipment hub card nearly dead for merchants (redirect on Submitted)
- Equipment done={quoteSigned} unreachable while card shows at Submitted
- Milestone stagger still ornamental when motion allowed

## Questions to Consider

1. Third CTA → "Sign & Submit" or "Continue to signing"?
2. Hub collapse to next-only + quiet done strip?
3. In-portal unlock modal vs keep browser confirm?
