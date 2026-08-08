# Task 2 Report — Strip non-UW panels from ApplicationDealRoom

**Issue:** #23 (Underwriting Room rename, scope trim)  
**Branch:** `feature/underwriting-room`  
**File modified:** `src/pages/ApplicationDealRoom.jsx`  
**Route unchanged:** `/admin/applications/:corporateId`

## Summary

Per-deal admin page is now scoped as **Underwriting Room**: removed handoff, installer runbook, and merchant document-request UI. Underwriting threads, W-9 panel, unlock/submit, notes, tasks, snapshot sidebar, and portal/dashboard actions remain.

Source files `HandoffPanel.jsx` and `InstallerRunbook.jsx` were **not** deleted — only removed from this page.

## Changes implemented

### Step 1 — Removed imports

- Deleted `InstallerRunbook` and `HandoffPanel` imports.
- Kept `UnderwritingRequestsPanel`.

### Step 2 — Removed Request-document state + handler

Removed:

- State: `docTitle`, `docDetail`, `docDue`, `docMsg`, `savingDoc`
- Function: `requestMerchantDocument` (sole consumer of `manageMerchantChecklist` on this page)

### Step 3 — Removed JSX blocks

- `<HandoffPanel corporateId={corporateId} />`
- `<InstallerRunbook corporateId={...} locations={...} />`
- Entire "Request document" `<section>` (title, inputs, button, success message)

Left intact: Tasks, Internal notes, UW-by-MID section, `UnderwritingRequestsPanel`, snapshot sidebar (MIDs, Signers, Legal entities).

### Step 4 — Renamed page chrome

| Location | Before | After |
|---|---|---|
| File header comment | Internal collaboration | Underwriting Room |
| Caption | Deal room | Underwriting room |
| Loading copy | Loading deal room… | Loading underwriting room… |
| Unlock reason (`demoteApplication`) | Unlocked from Deal Room | Unlocked from Underwriting Room |
| Load error fallback | Could not load deal room | Could not load underwriting room |

`console.error('[DealRoom]'…)` left as-is (brief allows either).

### Step 5 — Smoke scan

```bash
rg -n "HandoffPanel|InstallerRunbook|Request document|docTitle|requestMerchantDocument" src/pages/ApplicationDealRoom.jsx
```

**Result:** zero matches.

## Explicitly not changed (per brief)

- `MerchantCenterShell` / admin sidebar (Task 3)
- `HandoffPanel.jsx`, `InstallerRunbook.jsx` source files
- Backend functions (`manageMerchantChecklist`, `manageHandoff`, etc.)

## Verification

- Linter: no diagnostics on `ApplicationDealRoom.jsx`
- Smoke scan: pass (zero matches)
- Manual QA suggested: open `/admin/applications/:corporateId` — confirm UW panel, W-9, tasks/notes, unlock/submit, no handoff/runbook/document request

## Status

**DONE**
