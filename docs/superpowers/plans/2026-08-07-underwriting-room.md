# Underwriting Room (Issue #23) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename Deal Room → Underwriting Room, strip handoff/runbook/request-document from the per-deal page, and add an admin sidebar **Underwriting** link to the Applications desk.

**Architecture:** Keep route `/admin/applications/:corporateId`. Remove non-UW UI from `ApplicationDealRoom.jsx`. Update agent-facing copy + `accountOverview` CTAs. Add a Work-nav button in `AdminMerchantCenterShell` (same pattern as existing Onboarding → Applications). Do not delete `HandoffPanel` / `InstallerRunbook` source files (unused is fine for v1).

**Tech Stack:** React, React Router, existing admin shell, node:test for `accountOverview` label assertions.

**Spec:** `docs/superpowers/specs/2026-08-07-underwriting-room-design.md`

## Global Constraints

- Frontend-only for v1 (no Base44 function changes required).
- Merchants must not get an Underwriting nav item (`MerchantCenterShell` untouched).
- Keep UW threads, W-9 panel, Unlock/Submit, notes/tasks, snapshot, Open portal/Dashboard.
- Edit in git repo only; `AI_CHANNEL.md` append-only when shipping.
- Commit only if Teddy asks.

---

### Task 1: CTA / vocabulary helper tests

**Files:**
- Modify: `src/lib/accountOverview.js`
- Modify: `src/lib/accountOverview.test.js`
- Modify: `src/lib/portalLock.js` (agent-facing lock strings)
- Modify: `src/lib/applicationRowMode.js` (signed → submit reason string)

**Interfaces:**
- Consumes: existing `buildPrimaryCta({ status, bestDeal })`
- Produces: labels using “Underwriting Room” / “Fix in Underwriting Room”; `kind` stays `'deal_room'` (URL semantics unchanged)

- [ ] **Step 1: Update failing expectations in `accountOverview.test.js`**

Find tests that assert `'Open Deal Room'` / `'Fix in Deal Room'` and change expected strings to `'Open Underwriting Room'` / `'Fix in Underwriting Room'`.

- [ ] **Step 2: Run tests — expect fail**

```bash
node --test src/lib/accountOverview.test.js
```

Expected: FAIL on Deal Room label mismatches.

- [ ] **Step 3: Update `buildPrimaryCta` labels**

In `src/lib/accountOverview.js`:

```js
// needs_attention
return { label: 'Fix in Underwriting Room', kind: 'deal_room', corporateId };
// prospect + fallback with corporateId
return { label: 'Open Underwriting Room', kind: 'deal_room', corporateId };
```

- [ ] **Step 4: Update portalLock / applicationRowMode agent copy**

Replace “Deal Room” with “Underwriting Room” in:

- `FORMS_LOCKED_MESSAGE` (agent path mention)
- `FORMS_LOCKED_MESSAGE_ALL_SIGNED` / `_AGENT` if they mention Deal Room
- `FORMS_LOCKED_MESSAGE` Deal Room unlock path string (~line 75)
- `resolveApplicationRowMode` reason: `submit to processor from Applications or Underwriting Room`

- [ ] **Step 5: Run tests — expect pass**

```bash
node --test src/lib/accountOverview.test.js src/lib/applicationRowMode.test.js
```

---

### Task 2: Strip non-UW panels from ApplicationDealRoom

**Files:**
- Modify: `src/pages/ApplicationDealRoom.jsx`

**Interfaces:**
- Removes render of `HandoffPanel`, `InstallerRunbook`, Request document section
- Removes dead state/handlers only used by Request document (`docTitle`, `docDetail`, `docDue`, `docMsg`, `savingDoc`, `requestMerchantDocument`)
- Keeps `UnderwritingRequestsPanel` and UW MID section

- [ ] **Step 1: Remove imports**

Delete:

```js
import InstallerRunbook from '@/components/merchant-center/InstallerRunbook';
import HandoffPanel from '@/components/deal-room/HandoffPanel';
```

Keep `UnderwritingRequestsPanel`.

- [ ] **Step 2: Remove Request-document state + handler**

Delete `docTitle` / `docDetail` / `docDue` / `docMsg` / `savingDoc` state and the entire `requestMerchantDocument` function (and any `manageMerchantChecklist` invoke used only for that).

- [ ] **Step 3: Remove JSX blocks**

1. Delete `<HandoffPanel corporateId={corporateId} />`
2. Delete `<InstallerRunbook ... />`
3. Delete the whole `<section>…Request document…</section>` block (~876–914)

Leave Tasks + Internal notes sections intact.

- [ ] **Step 4: Rename page chrome**

- File header comment: Underwriting Room
- Visible caption `'Deal room'` → `'Underwriting room'`
- Loading copy `Loading deal room…` → `Loading underwriting room…`
- Unlock reason string `'Unlocked from Deal Room'` → `'Unlocked from Underwriting Room'`
- `console.error('[DealRoom]'` may stay or become `[UnderwritingRoom]` (either OK)

- [ ] **Step 5: Smoke scan**

```bash
rg -n "HandoffPanel|InstallerRunbook|Request document|docTitle|requestMerchantDocument" src/pages/ApplicationDealRoom.jsx
```

Expected: no matches.

---

### Task 3: Admin sidebar Underwriting item

**Files:**
- Modify: `src/components/admin/AdminMerchantCenterShell.jsx`

- [ ] **Step 1: Import an icon**

Add `Shield` (or `FileCheck`) from `lucide-react` next to existing icons.

- [ ] **Step 2: Add Underwriting button under Work**

Immediately after the existing Onboarding button (same pattern — navigate to Applications desk):

```jsx
<button
  type="button"
  onClick={() => navigate('/admin/applications')}
  className={navLinkClass({ isActive: false })}
>
  <Shield className="w-4 h-4 flex-shrink-0" strokeWidth={2} />
  Underwriting
</button>
```

Both Onboarding and Underwriting may land on `/admin/applications` in v1 (approved). Do **not** add this to merchant `MerchantCenterShell`.

- [ ] **Step 3: Manual check**

Open `/admin/center` as admin → sidebar Work shows **Underwriting** → clicks to `/admin/applications`. Merchant center has no such item.

---

### Task 4: Rename inbound CTAs / launch copy

**Files (agent-facing UI only):**
- Modify: `src/pages/ApplicationManager.jsx` — Deal room button title/label → Underwriting room
- Modify: `src/pages/AdminMerchantAccountHome.jsx` — “Deal Room” link text
- Modify: `src/pages/AdminMerchantPortfolio.jsx` — “Deal Room” link text
- Modify: `src/pages/AdminQaHub.jsx` — Deal Room button copy/title (drop “handoff…runbook” from title)
- Modify: `src/pages/AdminInstallationsPanel.jsx` — stop pointing agents at Deal Room runbook; point to Applications / account for UW if needed, or say runbooks moved / not on this page
- Modify: `src/pages/AdminMerchantDashboard.jsx` — tile body mentioning Deal Room runbooks
- Modify: `src/pages/PostSubmissionDashboard.jsx` — comment “Applications or Underwriting Room”
- Modify: `src/components/onboarding/AgreementSignedCelebration.jsx` — comment only OK
- Modify: `src/pages/OnboardingPortal.jsx` — comment unlock from Underwriting Room

**Do not** change merchant-facing delete confirm strings that list “Deal Room” as a data surface unless easy — prefer “Underwriting Room” for consistency when editing those lines.

- [ ] **Step 1: Replace visible “Deal Room” / “Deal room” strings** in the files above via search.

```bash
rg -n "Deal [Rr]oom" src/pages src/components src/lib --glob '!**/HandoffPanel.jsx' --glob '!**/InstallerRunbook.jsx'
```

Expected after: remaining hits only in file comments inside unused panels or historical docs — not in agent CTAs.

- [ ] **Step 2: Quick sanity** — Applications row still links to `/admin/applications/:corporateId`.

---

### Task 5: Channel + issue

**Files:**
- Modify: `AI_CHANNEL.md` (append)

- [ ] **Step 1: Append AI_CHANNEL entry** summarizing #23: strip list, nav item, rename, frontend-only redeploy.

- [ ] **Step 2: After live publish**, comment + close GitHub #23 (requires `gh auth login`).

---

## Spec coverage checklist

| Spec requirement | Task |
|---|---|
| Rename Deal Room → Underwriting Room | 1, 2, 4 |
| Strip Handoff / Runbook / Request document | 2 |
| Admin nav Underwriting → `/admin/applications` | 3 |
| Merchants no UW tab | 3 (shell untouched) |
| Keep UW / W-9 / unlock / submit / notes / snapshot | 2 (only removals) |
| Same route deep links | no route change |

## Out of scope (do not implement)

- `/admin/underwriting` list or route alias
- Deleting `HandoffPanel.jsx` / `InstallerRunbook.jsx`
- Moving handoff/runbook to a new home
- Shell-wrapping Applications desk

## Redeploy

**Frontend publish only.**