# Task 8 Report: Docs + Gmail scope + agent briefing

**STATUS:** DONE  
**Branch:** `feature/underwriting-w9-request`  
**Date:** 2026-08-07

---

## Summary

Documented W-9 underwriting request flow, Gmail **`gmail.send`** scope upgrade, and `UNDERWRITING_ELAVON_DOCS_TO` env in repo docs and agent briefing. Vault `merchant-center.md` linked to the design spec.

---

## Files changed

| File | Change |
|---|---|
| `docs/underwriting-inbox.md` | Scopes (`readonly` + `send`); env `UNDERWRITING_ELAVON_DOCS_TO`; W-9 flow + spec pointers; entity/function list |
| `AGENTS.md` | UnderwritingRequest W-9 subsection under Deal Room |
| `AI_CHANNEL.md` | Appended ops note (append-only) |
| `Cliqbux Second Brain/specs/merchant-center.md` | Behavior link to repo W-9 design spec |

---

## Teddy checklist (live)

1. **Republish** `UnderwritingRequest` entity in Base44 Dashboard  
2. **Re-consent** underwriting@ Google OAuth with `gmail.readonly` + `gmail.send`; paste new `UNDERWRITING_GMAIL_REFRESH_TOKEN`  
3. Set **`UNDERWRITING_ELAVON_DOCS_TO`** when Elavon docs inbox is confirmed (optional until then)  
4. Push via GitHub Desktop + **redeploy** `manageUnderwritingRequest`, `completeUnderwritingRequest`, frontend  
5. **Smoke one test MID:** Deal Room → New W-9 → merchant signs `/uw/:token` → Download → Send to Elavon → verify PDF attachment + `UnderwritingMessage` outbound row  

---

## Commit

`docs(uw): W-9 underwriting request and Gmail send scopes`

No push (per task brief).

---

## Review fix (Critical/Important #8)

Commit `282bd28` rewrote earlier `AI_CHANNEL.md` entries (encoding/punctuation). Restored file from `b51885e` and re-appended only the `[CURSOR] — 2026-08-07` W-9 entry at EOF. Verified: `git diff b51885e HEAD -- AI_CHANNEL.md` shows append-only hunks.

Fix commit: `fix(uw): restore AI_CHANNEL append-only hygiene`
