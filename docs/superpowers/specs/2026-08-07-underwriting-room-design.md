# Underwriting Room (Deal Room reshape) — Design

**Date:** 2026-08-07  
**Issue:** [#23](https://github.com/teddy-cliqbux/Cliqbux_onboarding/issues/23)  
**Status:** approved (Teddy) — awaiting implementation plan  
**Supersedes (UI scope):** “Deal Room” as catch-all agent collaboration surface for this page

## Problem

`/admin/applications/:corporateId` (“Deal Room”) mixes underwriting tools with handoff, installer runbook, and checklist “Request document.” CliqBux wants an **admin-only Underwriting Room** focused on **signed → Elavon approved** workflows. Checklists / project management will live elsewhere later; for v1 those panels simply disappear from this page. Merchants must never see an Underwriting nav item.

## Goals (v1)

1. Rename Deal Room → **Underwriting Room** in agent-facing copy and CTAs.
2. Strip non-UW panels from the per-deal page (handoff, runbook, request-document checklist).
3. Add an **Underwriting** item to the **admin** Merchant Center left nav that lands on the Applications desk (`/admin/applications`) — no dedicated UW deal list yet.
4. Keep merchants on their existing shells with **no** Underwriting tab.

## Non-goals (v1)

- Dedicated underwriting deal list / queue page
- New route `/admin/underwriting/...` (keep `/admin/applications/:corporateId`)
- Relocating Handoff / Installer Runbook / Request document to a new home
- Changing merchant post-sign checklist / `UnderwritingTracker` on Merchant Center
- Changing BoldSign / portal signing or W-9 `/uw/:token` flows beyond labels that point at this room
- Wrapping Applications desk in the admin shell (still out of shell)

## Approach

**Rename + strip in place** (approved vs route-alias or full hub list).

| Surface | Change |
|---|---|
| Route | Unchanged: `/admin/applications/:corporateId` |
| Page | `ApplicationDealRoom.jsx` — remove panels; rename chrome |
| Admin nav | `AdminMerchantCenterShell.jsx` — add Work item **Underwriting** → `/admin/applications` |
| Entry links | Applications row, account home, portfolio, installations, QA hub: “Deal Room” → “Underwriting Room” |

## What stays on the per-deal page

- Per-MID underwriting threads (AWB, Sync inbox, log email, escalate)
- W-9 / `UnderwritingRequestsPanel`
- Unlock & Modify + Submit to processor
- Internal notes / tasks (`manageApplicationDesk`)
- Sidebar snapshot (MIDs, signers, legal entities)
- Header actions (Open portal / Dashboard / impersonate)

## What is removed from the per-deal page

- `HandoffPanel` (stage strip, facts, call-notes ingest UI on this page)
- `InstallerRunbook`
- **Request document** → merchant checklist action on this page

Backend functions (`manageHandoff`, `manageMerchantChecklist`, etc.) stay in the repo for other surfaces; this page simply stops calling/rendering them.

## Navigation

- **Admin only** (existing `AdminProtectedRoute` + admin shell).
- New sidebar label: **Underwriting**.
- Target: `/admin/applications` (desk). Agents still open a deal from the desk (or account links) to reach the room.
- Merchants: no change to `MerchantCenterShell`; no Underwriting item.

## Copy / vocabulary

| Old | New |
|---|---|
| Deal Room | Underwriting Room |
| “Open Deal Room” / similar CTAs | “Underwriting Room” (or “Open Underwriting Room” where a verb is needed) |

Do not rename entity fields, HubSpot properties, or `corporateId` semantics. Optional later: vault decision recording this rename as product vocabulary.

## Constraints

- Edit in the git repo only (not Base44 sandbox source).
- `AI_CHANNEL.md` append-only when shipping.
- Don’t invent MSPWare API behavior.
- Forms lock / demote / submit rules unchanged.

## Success criteria

- [ ] No Handoff / Runbook / Request document UI on `/admin/applications/:corporateId`
- [ ] Page and inbound CTAs say Underwriting Room
- [ ] Admin shell shows Underwriting → Applications desk; merchant UI has no such tab
- [ ] UW threads, W-9, unlock, submit, notes/tasks, snapshot still work
- [ ] Existing deep links to `/admin/applications/:corporateId` still work

## Follow-ups (not v1)

- Underwriting queue list (deals in submitted / pending MID)
- Optional route alias `/admin/underwriting/:corporateId`
- New homes for handoff + installer PM
- Shell-wrap Applications desk