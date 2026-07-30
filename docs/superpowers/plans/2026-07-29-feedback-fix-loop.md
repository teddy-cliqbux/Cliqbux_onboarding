# Feedback → Fix Loop — Implementation Plan

> **For agentic workers:** COMPLETE ALL TASKS. Spec: `docs/superpowers/specs/2026-07-29-feedback-fix-loop-design.md`. Runbook: `docs/agents/feedback-fix-loop-runbook.md`.

**Goal:** Ship Detection → Intake → Pipeline (GitHub-native) with human approve-before-ship.

**Status:** Implemented in-repo 2026-07-29. Live activation needs Teddy env + Base44 publish (see runbook deploy checklist).

## Files

| Path | Role |
|---|---|
| `src/lib/sentry.js` | Sentry init + PII scrub |
| `src/lib/operationalEventClassify.js` | Pure failure classifiers |
| `src/lib/operationalEvents.js` | Client report helpers |
| `src/lib/merchantAuthFetch.js` | Failure → operational event |
| `src/main.jsx` | ErrorBoundary + Sentry |
| `src/App.jsx` | FeedbackWidget + route tags |
| `src/components/feedback/FeedbackWidget.jsx` | Help & Feedback UI |
| `base44/entities/Operational Event.jsonc` | Event store |
| `base44/functions/reportOperationalEvent/entry.ts` | Tiered filing |
| `base44/functions/sendOperationalDigest/entry.ts` | Daily digest |
| `base44/functions/submitProductFeedback/entry.ts` | Intake → GitHub |

## Verification

```bash
npm run test:ops-events
```

## Done when

- [x] Spec + runbook in repo
- [x] Sentry + domain events + Feedback widget
- [ ] Teddy: publish OperationalEvent, redeploy functions, set env vars
