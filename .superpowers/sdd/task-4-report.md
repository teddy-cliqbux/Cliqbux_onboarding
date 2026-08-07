# Task 4 Report: `manageUnderwritingRequest` (admin)

**Status:** DONE_WITH_CONCERNS  
**Branch:** `feature/underwriting-w9-request`  
**Commit:** (see git log — `feat(uw): admin manageUnderwritingRequest send and Elavon forward`)  
**Date:** 2026-08-07

---

## Summary

Implemented admin-only `base44/functions/manageUnderwritingRequest/entry.ts` with all brief actions: `list`, `create`, `send`, `resend`, `cancel`, `getSignedUrl`, `sendToElavon`. Prefill/validation helpers inlined from `src/lib/w9Prefill.js` + `w9Model.js` behind sync markers. Resend/Quo patterns copied from `nudgeMerchant`; Gmail token refresh + merchant-JWT rejection from `syncUnderwritingMail`.

---

## File Created

| File | Purpose |
|---|---|
| `base44/functions/manageUnderwritingRequest/entry.ts` | Admin Deal Room underwriting request API |

---

## Actions

| Action | Behavior |
|---|---|
| `list` | Filter by `corporateId` (+ optional `midId`); strip `tokenHash`; derive `tinMasked` (last-4) from `prefillSnapshot`; return `elavonDocsToHint` from env if set |
| `create` | Resolve legal entity (account → profile), build W-9 prefill, cancel other non-terminal same `midId`+`type`, status `draft`, return request + full `prefill` |
| `send` / `resend` | Channel validation; cancel other non-terminal; `sha256(token + MERCHANT_JWT_SECRET)` → `tokenHash`; link `${PUBLIC_APP_URL}/uw/{token}`; Resend and/or Quo (SMS never includes TIN); status `sent` or `send_failed` |
| `cancel` | → `cancelled` (refuses if already signed) |
| `getSignedUrl` | `{ signedPdfUrl }` when status `signed` \| `sent_to_elavon` |
| `sendToElavon` | Require agent-supplied `to`/`subject`/`bodyText` (no invented To); fetch PDF; Gmail multipart MIME send; log `UnderwritingMessage` outbound; status `sent_to_elavon`. Missing `gmail.send` → HTTP 503 + reconnect hint |

---

## Auth

- `requireAdmin`: valid merchant JWT → reject; workspace `auth.me()` required (same as `syncUnderwritingMail`).

---

## Smoke / verification

**Not live-smoked** in this session:

- Resend / Quo delivery against published function
- Gmail `messages/send` with real OAuth (needs `gmail.send` re-consent)
- Entity create/list against Base44 (entity may be unpublished)

Code path complete; blocked on publish + env until Teddy redeploys.

---

## Concerns / follow-ups

1. **Publish `UnderwritingRequest`** in Base44 before live writes (503 `ENTITY_SCHEMA_MISSING` until then).
2. **Gmail OAuth** must include `gmail.send`; reconnect + refresh token update documented for `docs/underwriting-inbox.md` (later plan task).
3. **`UNDERWRITING_ELAVON_DOCS_TO`** returned as UI hint only — agent must still pass `to` on `sendToElavon`.
4. **Signed PDF fetch** for Elavon attach uses bare `fetch(signedPdfUrl)` — if Base44 private URLs need auth headers, Task 5/upload path may need a signed/proxy fetch.
5. Raw magic token is **not** returned in JSON (delivered via email/SMS only).

---

## Next

Task 5+ (`completeUnderwritingRequest`, merchant `/uw/:token`, Deal Room panel) — not started here.
