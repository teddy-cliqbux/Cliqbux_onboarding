# Task 3 Report: UnderwritingRequest entity schema

**Status:** DONE  
**Branch:** `feature/underwriting-w9-request`  
**Commit:** `0e3c023` — feat(uw): add UnderwritingRequest entity schema  
**Date:** 2026-08-07

---

## Summary

Added Base44 entity schema `UnderwritingRequest` for MID-scoped underwriting document requests (W-9 v1). Matches structure and description style of `Underwriting Message.jsonc`. All brief properties declared; required fields: `corporateId`, `midId`, `type`, `status`.

---

## File Created

| File | Purpose |
|---|---|
| `base44/entities/Underwriting Request.jsonc` | Entity schema for persistence in Base44 |

---

## Schema highlights

| Field | Notes |
|---|---|
| `type` | enum `w9` (extensible) |
| `status` | `draft` \| `sent` \| `opened` \| `signed` \| `sent_to_elavon` \| `cancelled` \| `expired` \| `send_failed` — default `draft` |
| `channels` | string enum `email` \| `sms` \| `both` (matches `nudgeMerchant`, not array) |
| `prefillSnapshot` | string (JSON blob) per brief |
| `tokenHash` | never raw token |
| Timestamps | `sentAt`, `openedAt`, `signedAt`, `sentToElavonAt`, `tokenExpiresAt` — ISO strings |

---

## Deviations from design spec

Design doc (`docs/superpowers/specs/2026-08-07-underwriting-w9-request-design.md`) lists `channels` as `['email']` \| `['sms']` \| `['email','sms']`. Task brief and user instruction require a **string** enum matching `nudgeMerchant`; implemented as `email` \| `sms` \| `both`.

---

## Rollout (Teddy)

**Publish entity** in Base44 Dashboard before live create/update works — undeclared keys are stripped on save (AGENTS.md Lesson #4).

1. Push branch → GitHub Desktop as usual  
2. Base44 Dashboard → Entities → publish `UnderwritingRequest`  
3. Proceed to Task 4+ (`manageUnderwritingRequest`, `completeUnderwritingRequest`)

---

## Commit

```
feat(uw): add UnderwritingRequest entity schema

Teddy must Publish entity in Base44 Dashboard before live create works.
```

---

## Concerns / follow-ups

- None blocking. Functions in later tasks should treat `prefillSnapshot` as JSON.parse/stringify at boundaries.
- Uniqueness rule (one non-terminal request per `midId` + `type`) is enforced in application code, not entity schema.
