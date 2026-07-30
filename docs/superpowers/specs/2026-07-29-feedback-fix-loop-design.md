# Feedback → Fix Loop (GitHub-native)

**Date:** 2026-07-29  
**Status:** Approved (Teddy) — Approach B  
**Sequence:** Detection → Intake → Pipeline

## Goal

Automate finding and capturing bugs/ideas into one backlog (GitHub Issues), then let agents plan and open PRs — **Teddy always approves before merge / Base44 publish**.

## Non-goals (v1)

- Full product analytics / session replay
- Auto-merge or auto-deploy
- Second issue tracker (Linear, etc.)
- Public status page
- MSPWare browser automation for discovery

## Locked decisions

| Decision | Choice |
|---|---|
| Architecture | B — GitHub-native |
| Detection | Hybrid: Sentry + domain operational events |
| Filing | Tiered: high/boarding-critical → Issue `needs-triage`; rest → daily digest |
| Intake | Merchants + agents |
| Ship gate | Human approve before merge/publish |

## Architecture

```
Sentry (FE crashes) ──┐
Domain events ────────┼─► reportOperationalEvent ─┬─ high → GitHub Issue (bug, needs-triage)
                      │                           └─ low/med → OperationalEvent + daily digest email
Feedback UI ──────────┴─► submitProductFeedback ──► GitHub Issue (bug|enhancement, needs-triage)
                                                      │
                                                      ▼
                                              /triage → ready-for-agent
                                                      │
                                                      ▼
                                              Agent plan + PR → Teddy approve → ship
```

## Phase A — Detection

### Sentry

- `@sentry/react` init in `src/main.jsx` when `VITE_SENTRY_DSN` is set
- `beforeSend` scrubbers: SSN, routing/account, Plaid tokens, JWT/Bearer, password fields
- Tags: route, corporateId (when known), impersonating, environment
- ErrorBoundary wraps the app; high-severity client crashes also fire `reportOperationalEvent` (code `CLIENT_CRASH`)

### Domain events

- Backend: `reportOperationalEvent` (portal-auth via `getPortalActor`)
- Entity: `OperationalEvent` (fingerprint, severity, code, message, corporateId, midId, route, source, githubIssueUrl, digestedAt)
- Frontend: `invokePortalFunction` failure path fire-and-forget reports (no loop if reporting fails)
- Boarding-critical codes auto-file GitHub issues (dedupe by fingerprint within 24h)

### Env (Base44)

- `GITHUB_FEEDBACK_TOKEN` — fine-scoped PAT (issues:write)
- `GITHUB_FEEDBACK_REPO` — default `teddy-cliqbux/Cliqbux_onboarding`
- `FEEDBACK_DIGEST_TO` — Teddy email for daily digest
- `RESEND_API_KEY` — existing
- Frontend: `VITE_SENTRY_DSN` (optional; no-op if unset)

### Digest

- `sendOperationalDigest` — admin/cron-callable; emails undigested non-filed events; stamps `digestedAt`

## Phase B — Intake

- `submitProductFeedback` — type `bug` | `enhancement`, title, description + auto context
- Creates GitHub Issue with QA-style durable body + `needs-triage` (+ `bug` or `enhancement`)
- Shared `FeedbackWidget` on portal, Merchant Center, Applications / Deal Room (global mount in `App.jsx`)

## Phase C — Pipeline

- Process documented in `docs/agents/feedback-fix-loop-runbook.md`
- Agents never push main, never set `MSP_SUBMIT_ENABLED`, never publish Base44 without Teddy
- Optional Cursor Automation for `ready-for-agent` queue — deferred until A+B stable

## Success criteria

1. Silent boarding failures create or digest without a merchant phone call  
2. Merchant or agent can file bug/idea in under 60 seconds with useful context  
3. Nothing production-facing ships without Teddy’s explicit approve  
