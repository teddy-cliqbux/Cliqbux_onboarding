---
target: OnboardingPortal
total_score: 24
p0_count: 0
p1_count: 3
timestamp: 2026-07-16T05-34-25Z
slug: src-pages-onboardingportal-jsx
---
Method: dual-agent (A: c603520f · B: 36113a79)

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 2 | ProgressTracker hidden for Incomplete merchants (TopNav showTracker) |
| 2 | Match System / Real World | 2 | CTA "Configure Locations & MIDs"; Corp ID chrome |
| 3 | User Control and Freedom | 3 | Review + unlock exist; mid-flow nav often missing |
| 4 | Consistency and Standards | 2 | Three progress models (hub / ApplicationTracker / ProgressTracker) |
| 5 | Error Prevention | 3 | Locks + demote confirm |
| 6 | Recognition Rather Than Recall | 3 | attentionItems strong; locked cards thin on why |
| 7 | Flexibility and Efficiency | 2 | No accelerators |
| 8 | Aesthetic and Minimalist Design | 2 | Tokens quiet; redundant welcome + pipeline + 4 cards |
| 9 | Error Recovery | 3 | Unlock path clear |
| 10 | Help and Documentation | 2 | Thin lead copy; MID jargon |
| **Total** | | **24/40** | **Acceptable** |

## Anti-Patterns Verdict

**LLM assessment**: Not classic AI SaaS slop. Matches The Gold Wire (cb-* tokens, solid gold CTAs, quiet Complete captions). Residual product-template tells: four similar MilestoneCards, nested card stack, dual Welcome headers, triple progress story.

**Deterministic scan**: 2 findings, both `side-tab` (border-l-2) at OnboardingPortal.jsx:782 (impersonation banner) and ApplicationTracker.jsx:65 (hold banner). Likely false positives vs intentional status left-rules. ProgressTracker clean. Exit code 2.

**Visual overlays**: Not available — no local dev server; browser visualization skipped.

## Overall Impression

Craft is on-brand and trustworthy at the token level. The Welcome Hub undermines that with competing maps of progress and first-click jargon. Biggest opportunity: one merchant worklist + always-visible step progress while Incomplete.

## What's Working

1. Milestone 1 attentionItems ("still need your input" + missing fields) — finish-without-a-call.
2. Gold Wire restraint on cards — solid accent CTAs; Complete as check+caption.
3. Real gating + Review on done milestones; FormsLockedBanner / demote trust path.

## Priority Issues

### [P1] Three competing progress languages
- **What**: Hub milestones vs ApplicationTracker pipeline vs ProgressTracker (often absent).
- **Why**: First-timers don't know which map is theirs; one-sitting merchants lose orientation.
- **Fix**: Hub = merchant worklist only; underwriting pipeline post-submit; show ProgressTracker during Incomplete/signing.
- **Suggested command**: $impeccable distill OnboardingPortal

### [P1] ProgressTracker gated off for Incomplete
- **What**: TopNav showTracker only Pricing Selected / Quote Signed / Submitted.
- **Why**: Deep steps often logo-only — no where-am-I during hard work.
- **Fix**: Show tracker for in-progress statuses including Incomplete.
- **Suggested command**: $impeccable harden ProgressTracker

### [P1] First-action jargon — "Configure Locations & MIDs"
- **What**: Industry acronym as primary CTA.
- **Why**: Blocks "finish without a call."
- **Fix**: Plain CTA; define MID only when needed.
- **Suggested command**: $impeccable clarify OnboardingPortal

### [P2] Double welcome + ops chrome
- **What**: Shell Welcome + hub Welcome back + Plan + Corp ID.
- **Why**: Dilutes Gold Wire; feels admin-adjacent.
- **Fix**: One greeting; Corp ID agent-only.
- **Suggested command**: $impeccable quieter OnboardingPortal

### [P2] MilestoneCard horizontal layout on small screens
- **What**: No sm: stack for icon/copy/CTA.
- **Why**: Mobile thumb/tap friction.
- **Fix**: Stack CTA full-width under copy below sm.
- **Suggested command**: $impeccable adapt MilestoneCard

## Persona Red Flags

**Jordan (First-Timer)**: Welcome back + underwriting pipeline before work; MID CTA; Equipment locked feels like failure; no ProgressTracker while Incomplete.

**Casey (Mobile)**: Horizontal milestone rows; ApplicationTracker four columns squeeze; dual headers burn first viewport.

**Morgan (Merchant owner)**: Lock/demote help trust; Corp ID / agent chrome erode ownership; Milestone 3 bundles KYC+sign without time/privacy expectations on hub.

## Minor Observations

- No prefers-reduced-motion on hub stagger / step slides in portal file.
- Milestone 3 done only when Submitted — can feel stuck after signing.
- Footer trust cue easy to miss under card stack.
- Detector side-tab hits on banners — keep pattern; don't "fix" into worse chrome without intent.

## Questions to Consider

1. If the hub had one gold "Continue: [next]" — would the four-card checklist still earn its place?
2. Is ApplicationTracker on the hub merchant reassurance or internal pipeline cosplay?
3. Would Morgan trust more with "what you'll share and when" than Corp ID + Plan badge?
