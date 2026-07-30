# Feedback → Fix Loop runbook

Operating model for Detection → Intake → Pipeline (Approach B, 2026-07-29).  
Spec: [`docs/superpowers/specs/2026-07-29-feedback-fix-loop-design.md`](../superpowers/specs/2026-07-29-feedback-fix-loop-design.md)

## One backlog

All bugs and ideas land as **GitHub Issues** on `teddy-cliqbux/Cliqbux_onboarding` with triage labels:

| Label | Meaning |
|---|---|
| `needs-triage` | New / not yet evaluated |
| `needs-info` | Waiting on reporter |
| `ready-for-agent` | Briefed; AFK agent may plan + PR |
| `ready-for-human` | Needs Teddy / human implementation |
| `wontfix` | Will not action |
| `bug` / `enhancement` | Category |

Use `/triage` (see `.agents/skills/triage/SKILL.md`) and the QA skill for conversational filing.

## Detection (automatic)

1. **Sentry** (`VITE_SENTRY_DSN`) — frontend crashes; PII scrubbed in `src/lib/sentry.js`.
2. **Domain events** — `invokePortalFunction` failures and React ErrorBoundary call `reportOperationalEvent`.
3. **Tiering**
   - High / boarding-critical → GitHub Issue (`bug` + `needs-triage`), fingerprint-deduped 24h.
   - Else → stored as `OperationalEvent`; daily digest via `sendOperationalDigest`.

Boarding-critical codes: `CLIENT_CRASH`, `RATE_LIMIT`, `MSP_FORM_INCOMPLETE`, `MSP_VALIDATION`, `MSP_DRAFT_CREATE_FAILED`, `SIGNING_FAILED`, `FORMS_LOCKED`, `HTTP_5XX_BOARDING`.

### Ops: digest

From an admin session (or Base44 function runner):

```http
POST /functions/sendOperationalDigest
{ "dryRun": true }   // preview
{ }                  // send email to FEEDBACK_DIGEST_TO
```

Schedule daily (Base44 cron or manual) once env is set.

## Intake (in-product)

- **Help & Feedback** widget (bottom-left) on portal, Merchant Center, Applications.
- Merchants and agents submit bug or idea → `submitProductFeedback` → GitHub Issue.
- Requires auth (merchant JWT or workspace session).

## Pipeline (agents + Teddy)

```
needs-triage  →  /triage  →  ready-for-agent | ready-for-human | needs-info | wontfix
ready-for-agent  →  diagnose  →  plan (docs/superpowers/plans/)  →  branch + PR  →  STOP
Teddy reviews PR  →  merge via GitHub Desktop  →  Base44 publish if functions/entities changed
```

### Hard rules (never automate away)

- Do **not** push to `main` without Teddy.
- Do **not** force-push.
- Do **not** set `MSP_SUBMIT_ENABLED=true` in automation.
- Do **not** publish Base44 / change live MSPWare templates without Teddy.
- Do **not** auto-merge PRs.

### Optional later

Cursor Automation that lists open `ready-for-agent` issues and opens a planning session — only after Detection + Intake are stable in production.

## Env checklist (Base44 + Vite)

| Var | Where | Purpose |
|---|---|---|
| `VITE_SENTRY_DSN` | Frontend build | Sentry; omit to disable |
| `GITHUB_FEEDBACK_TOKEN` | Base44 | PAT with `issues:write` on this repo |
| `GITHUB_FEEDBACK_REPO` | Base44 | Default `teddy-cliqbux/Cliqbux_onboarding` |
| `FEEDBACK_DIGEST_TO` | Base44 | Teddy email for digest |
| `RESEND_API_KEY` | Base44 | Already used for invites |
| `MERCHANT_JWT_SECRET` | Base44 | Portal auth (existing) |

## Deploy checklist

1. Publish entity **OperationalEvent** in Base44 (or create fails with `ENTITY_SCHEMA_MISSING`).
2. Redeploy functions: `reportOperationalEvent`, `sendOperationalDigest`, `submitProductFeedback`.
3. Set `GITHUB_FEEDBACK_TOKEN`, `FEEDBACK_DIGEST_TO` (and optional `GITHUB_FEEDBACK_REPO`).
4. Optionally set `VITE_SENTRY_DSN` and rebuild frontend.
5. Confirm GitHub labels `needs-triage`, `bug`, `enhancement` exist (create if missing).
6. Smoke-test Help & Feedback as admin; smoke-test digest with `{ "dryRun": true }`.
