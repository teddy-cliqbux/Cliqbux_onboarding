# Honor Stage `includedSignerIds` in Portal People — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When an agent deselects people in Applications prep, those people no longer appear in the merchant portal People step (or signing roster), matching how location/MID deselection already works.

**Architecture:** Keep `MerchantSigners` rows intact (re-include later). Persist selection only on `StagedApplication.includedSignerIds` (already saved). Add a shared resolver/filter mirroring `dealLocationSelection.js`, apply it in `manageSigner` `list` for merchant actors and in portal client loads that bypass that path. Do **not** hard-delete signers from StageEditor save.

**Tech Stack:** Base44 functions (`manageSigner`, `manageStagedApplication`), React portal (`OnboardingPeople`, `OnboardingPortal`, `SignerRoster`), existing stage selection pattern in `src/lib/dealLocationSelection.js`.

**GitHub:** [#14](https://github.com/teddy-cliqbux/Cliqbux_onboarding/issues/14) — corp `339877104317`. Screenshot shows Applications Owners tab with some owners unchecked while portal still lists them.

---

## Evidence / root cause

1. StageEditor saves `includedSignerIds` only (`ApplicationManager.jsx` `handleSave`).
2. Portal People loads full roster via `manageSigner` `list` → `MerchantSigners.filter({ corporateId })` with **no** stage filter.
3. Locations already honor `includedLocationIds` via `dealLocationSelection.js` + server/client filters. Signers have no parallel.
4. UI copy (“Only selected owners get the application invite”) overpromises portal visibility.

**Product intent (this plan):** deselection = hide from this deal’s portal/invite/signing surface, not permanent KYC delete. Prefer filter-over-delete (same as locations).

---

## File map

| File | Responsibility |
|---|---|
| `src/lib/dealSignerSelection.js` (new) | Resolve/filter `includedSignerIds` from stages (mirror locations helper) |
| `src/lib/dealSignerSelection.test.js` (new) | Unit tests for resolver/filter |
| `base44/functions/manageSigner/entry.ts` | Merchant `list`: filter by preferred stage’s `includedSignerIds`; admin/impersonation: full list (or document exception) |
| `src/pages/OnboardingPortal.jsx` | If it sets signers from a raw list, apply same filter as locations |
| `src/pages/OnboardingPeople.jsx` | Rely on filtered API; defensive client filter if stages available |
| `src/pages/ApplicationManager.jsx` | Keep prep UI loading **unfiltered** list (agents must see deselected rows to re-check) |
| Invite/send paths in `manageStagedApplication` / `manageSigner` | Only invite IDs in `includedSignerIds` when a non-empty selection exists |
| `docs/agents/feedback-fix-loop-runbook.md` or AGENTS (short note) | Optional: note parity of location vs signer stage filters |

---

### Task 1: Shared signer selection helper + tests

**Files:**
- Create: `src/lib/dealSignerSelection.js`
- Create: `src/lib/dealSignerSelection.test.js`

- [ ] **Step 1: Write failing tests**

Mirror `dealLocationSelection.js`:

- `resolveIncludedSignerIdsFromStages(stages)` → `null` when no stage has a non-empty `includedSignerIds`; else prefer non-`__auto_track__` stage’s IDs as strings.
- `filterByIncludedSignerIds(signers, includedIds)` → all when `includedIds` null/empty; else only matching `id`.

Empty array on a preferred stage: decide explicitly — **treat empty as “show none”** (agent deselected everyone) vs null = show all. Recommend: only stages with `includedSignerIds` **defined as array with length ≥ 0** after an intentional save; if field missing/undefined, show all (legacy). If array is `[]`, show none.

- [ ] **Step 2: Implement helper to pass tests**
- [ ] **Step 3: Run tests** — `npx vitest run src/lib/dealSignerSelection.test.js` (or project’s test command)

---

### Task 2: Filter `manageSigner` list for merchants

**Files:**
- Modify: `base44/functions/manageSigner/entry.ts`
- Inline or duplicate helper logic in the function (Base44 cannot import `src/lib` — same pattern as other helpers: copy small resolver into the function or a comment-synced block)

- [ ] **Step 1: On `action === 'list'`, after loading signers by `corporateId`:**
  - Resolve portal actor via existing `getPortalActor`.
  - If `actor === 'merchant'`: load stages for that `corporateId`, resolve `includedSignerIds`, filter signers.
  - If `actor === 'admin'` (workspace) or impersonation JWT with agent intent: **do not filter** (Applications Owners tab needs full roster).
- [ ] **Step 2: Confirm invite/send actions** that list or email signers also respect selection when called as merchant; admin send-from-Applications should use `stage.includedSignerIds` if present.
- [ ] **Step 3: Manual check** — with a test corp, deselect one signer in StageEditor → Save → portal People should omit them; Applications Owners still shows unchecked row.

---

### Task 3: Portal client parity

**Files:**
- Modify: `src/pages/OnboardingPortal.jsx` (signer load beside location filter)
- Modify: `src/pages/OnboardingPeople.jsx` if it keeps a parallel path
- Modify: any `SignerRoster` parent that lists without going through filtered API

- [ ] **Step 1: Apply `filterByIncludedSignerIds` anywhere the client still receives a full list + has stages in hand** (defense in depth if an old function deploy is live).
- [ ] **Step 2: Ensure signing / KYC readiness counts use the filtered roster** (deselected people must not block `isRosterReadyForSigning`).

---

### Task 4: MSPWare owners[] consistency

**Files:**
- `signApplication` / `submitToMSP` owner build paths

- [ ] **Step 1: Confirm whether boarding loads signers via `manageSigner` or direct entity filter.**
- [ ] **Step 2: If direct entity filter, apply the same `includedSignerIds` rule** so deselected people are not pushed into MSPWare `owners[]` on refill/sign.
- [ ] **Step 3: Do not invent MSPWare fields — only change which Base44 signer rows are included.

---

### Task 5: Verify + docs

- [ ] **Step 1: Repro #14** — corp `339877104317` (or a disposable stage): deselect 2 owners → Save → open portal People → only checked owners remain.
- [ ] **Step 2: Re-select one owner → Save → portal shows them again** (proves filter-not-delete).
- [ ] **Step 3: Append short note to `AI_CHANNEL.md` (append-only) that signer stage selection now mirrors locations.
- [ ] **Step 4: Close or comment on #14** after Teddy confirms in UI.

---

## Out of scope

- Hard-deleting `MerchantSigners` from StageEditor
- Sales alert / live chat for `needs-triage` ([[Cliqbux Second Brain]] `specs/feedback-sales-alert-and-live-chat`)
- Cursor Automation webhook wiring (manual planning for now)
- Changing Control Person rules beyond excluding deselected rows from the roster

## Risks

- Empty `includedSignerIds: []` hides everyone — confirm StageEditor never saves empty accidentally when agent meant “no change.”
- Admin vs merchant actor confusion — Applications must stay unfiltered.
- Locked portal (`portalLockStatus`) — filtering must still apply when viewing; unlock/demote unchanged.

## Stop

Plan only — no PR until Teddy approves implementation.
