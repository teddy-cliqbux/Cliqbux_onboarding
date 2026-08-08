# Task 5 Report: `completeUnderwritingRequest` (token + PDF)

**Status:** DONE  
**Branch:** `feature/underwriting-w9-request`  
**Commit:** `feat(uw): token-gated W-9 complete and PDF stamp`  
**Date:** 2026-08-07

---

## Summary

Implemented token-gated `base44/functions/completeUnderwritingRequest/entry.ts` with `get` + `submitSignature`. Token hashing matches Task 4 (`sha256(rawToken + MERCHANT_JWT_SECRET)` hex). PDF fill inlined from `src/lib/w9PdfFill.js`; template fetched from `${PUBLIC_APP_URL}/irs/fw9.pdf` (fallbacks included). Signed PDF uploaded via `asServiceRole.integrations.Core.UploadFile` and stored only when the URL is public `https://` (Task 4 Elavon-attach carry).

---

## File Created

| File | Purpose |
|---|---|
| `base44/functions/completeUnderwritingRequest/entry.ts` | Merchant magic-link W-9 get + sign |

`public/irs/fw9.pdf` already present (synced from `assets/irs/fw9.pdf`) — included in commit if dirty.

---

## Actions

| Action | Behavior |
|---|---|
| `get` | Hash token → lookup; cancelled/invalid → 410/404; expired (unsigned) → 410 + mark `expired`; signed → `{ status, fields, signedPdfUrl, viewOnly: true }`; else mark `opened` once, return full TIN fields + `agentNote` + optional `midLabel` + `expiresAt` |
| `submitSignature` | Validate fields; require PNG data URL or typed `signatureName`; if already signed → existing URL (`idempotent: true`); fill+flatten PDF; UploadFile; persist `signed` / `signedPdfUrl` / `prefillSnapshot` / `signedAt` |

`saveDraft` omitted (optional per plan/spec).

---

## Auth

- **Token only** — no `auth.me()`, no merchant JWT gate.
- Same `hashToken` formula as `manageUnderwritingRequest`.

---

## Task 4 carry (signedPdfUrl)

`uploadSignedPdf` rejects non-`https://` UploadFile results so `sendToElavon` can bare-`fetch` the PDF for Gmail attach.

---

## Smoke / verification (not live)

**Idempotent re-submit plan** (after publish + entity live):

1. Admin `send` a W-9 → open `/uw/{token}` (or invoke `get`).
2. `submitSignature` with valid fields + PNG → note `signedPdfUrl`.
3. Call `submitSignature` again with same token → expect same URL + `idempotent: true`.
4. `get` → `viewOnly: true` + same URL.
5. Confirm `curl -I signedPdfUrl` returns 200 (public https).

---

## Concerns / follow-ups

1. Publish/redeploy function + `UnderwritingRequest` entity before live use.
2. Visual QA of signature/date overlays still deferred (Task 2 carry).
3. Task 6 merchant page not started here.

---

## Next

Task 6 — `/uw/:token` merchant UI.
