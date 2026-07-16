---
target: OnboardingPortal
total_score: 27
p0_count: 0
p1_count: 2
timestamp: 2026-07-16T05-49-27Z
slug: src-pages-onboardingportal-jsx
---
Method: dual-agent (A: 4a2feaef · B: parent-fallback after spawn failed: Execution backend unavailable)

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | Tracker always on + hub next-step; mobile "Step N of 4" lacks names |
| 2 | Match System / Real World | 3 | CTA fixed; residual KYC / store accounts; tracker vs card label mismatch |
| 3 | User Control and Freedom | 3 | Review + hub; Equipment nav maps to null |
| 4 | Consistency and Standards | 2 | Tracker labels ≠ MilestoneCard titles |
| 5 | Error Prevention | 3 | Locked CTAs + attention list |
| 6 | Recognition Rather Than Recall | 3 | Worklist visible; dual vocab mapping cost |
| 7 | Flexibility and Efficiency | 2 | No accelerators |
| 8 | Aesthetic and Minimalist Design | 3 | Hub quieter; Equipment #4 still premature |
| 9 | Error Recovery | 3 | Attention list; unlock via alert() |
| 10 | Help and Documentation | 2 | Thin lead; no what-to-bring help |
| **Total** | | **27/40** | **Acceptable (near Good)** |

## Anti-Patterns Verdict

**LLM**: Mostly cleared. Residual checklist smell: four equal MilestoneCards + locked Equipment on hub.

**Deterministic scan**: [] — clean (exit 0) across OnboardingPortal, ProgressTracker, TopNav, ApplicationTracker, PostSubmissionDashboard.

**Visual overlays**: Skipped — no local dev server detected.

## Overall Impression

Orientation fixes landed (+3 from 24). Remaining gap is dual vocabulary and premature Equipment on the hub — not craft, structure.

## What's Working

1. Quieter hub — single header, ApplicationTracker off hub
2. ProgressTracker always on + next-step highlight on welcome
3. Plain CTA "Set up stores & accounts" + mobile stack

## Priority Issues

### [P1] Dual step vocabulary
Tracker (Locations / Banking / Sign & Submit / Equipment) ≠ MilestoneCard titles.
Suggested: $impeccable clarify OnboardingPortal (align labels)

### [P1] Premature Equipment on hub
Milestone #4 + tracker step 4 visible before submit.
Suggested: $impeccable distill OnboardingPortal (hide Equipment until Submitted / dashboard-only)

### [P2] Residual jargon — KYC, store accounts, raw missing field keys
Suggested: $impeccable clarify OnboardingPortal

### [P2] Mobile tracker loses step names ("Step N of 4")
Suggested: $impeccable adapt ProgressTracker

### [P3] TopNav inline rgba; MilestoneCard titles at body weight
Suggested: $impeccable polish TopNav

## Persona Red Flags

**Jordan**: KYC + dual labels; locked Equipment looks like missing work.
**Casey**: Full-width CTAs help; mobile tracker nameless after resume.
**Morgan**: Equipment #4 inflates one-sitting scope; otherwise path clearer.

## Minor Observations

- Impersonation 1px left accent confirmed
- Equipment handleNavigate → null by design
- Milestone stagger still ornamental when motion allowed

## Questions to Consider

1. Remove Equipment from hub entirely until after submit?
2. Hub shows only next unlocked milestone + quiet done strip?
3. One shared label set for tracker and cards?
