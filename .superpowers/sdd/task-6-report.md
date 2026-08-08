# Task 6 Report: Merchant W-9 page `/uw/:token`

**STATUS:** DONE  
**Branch:** `feature/underwriting-w9-request`  
**Commit:** `e92167b` — feat(uw): merchant W-9 review and sign page  
**Date:** 2026-08-07

---

## Summary

Public merchant page at `/uw/:token` loads a token-gated W-9 via `completeUnderwritingRequest` (`get` → review/edit fields → draw or type signature → `submitSignature`). Uses `cb-*` tokens on `portal-bg` with a white form card for readability. Handles loading, expired (410), error, form, sign, and signed + download states.

---

## Files

| File | Change |
|---|---|
| `src/pages/UnderwritingW9Sign.jsx` | New — W-9 review, canvas/typed signature, submit |
| `src/App.jsx` | Public route `/uw/:token` (no admin/merchant JWT gate) |

---

## API wiring

- **Pattern:** `base44.functions.invoke('completeUnderwritingRequest', …)` first (same as `/verify` + `verifySignerToken`); fallback raw `fetch` to `/api/apps/{appId}/functions/completeUnderwritingRequest` if invoke fails.
- **get:** Prefills form from `fields`; `viewOnly` + `signedPdfUrl` → signed confirmation; 410 / `TOKEN_EXPIRED` → expired UI.
- **submitSignature:** Sends `fields` + PNG `signatureDataUrl` (canvas draw or typed name rendered to canvas).

---

## Manual check (not run against live staging)

| URL | Expected |
|---|---|
| `/uw/test` | Expired or invalid token error UI |
| Valid sent token | Form → sign → download link |

Deploy `completeUnderwritingRequest` + publish `UnderwritingRequest` entity before live happy path.

---

## Out of scope

Task 7+ (Deal Room panel), push, automated tests.
