# Open Feedback Issues — Fix Plans (2026-08-05)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Checkboxes track work.

**Scope:** GitHub open issues on `teddy-cliqbux/Cliqbux_onboarding` as of 2026-08-05. Corp `338922234596` (Imas / Estorya) owns #16–#19. #14 is an older related selection bug.

**Shared context:** Applications prep saves `includedSignerIds` / `includedMidIds` / `includedLocationIds`. Backend prepare/sign/submit now honor MID + signer selection in **repo** (may need Base44 redeploy). Applications **desk UI** still filters MIDs by location only — that is why #18 still shows junk.

---

## Issue map

| # | Title | Corp | Status in repo | Priority |
|---|---|---|---|---|
| [14](https://github.com/teddy-cliqbux/Cliqbux_onboarding/issues/14) | Deselected people still on portal | 339877104317 | **Code done** — verify + close | P2 verify |
| [16](https://github.com/teddy-cliqbux/Cliqbux_onboarding/issues/16) | prepare broken / error signing url | 338922234596 | Partial (MID filter in backend) + ops cleanup | P0 |
| [18](https://github.com/teddy-cliqbux/Cliqbux_onboarding/issues/18) | Extra MIDs on Applications desk | 338922234596 | **UI still broken** — `visibleMids` ignores `includedMidIds` | P0 |
| [19](https://github.com/teddy-cliqbux/Cliqbux_onboarding/issues/19) | CTA wrong (Open to prep vs Submit) | Applications list | CTA / `midsNeedProcessor` logic wrong | P0 |
| [17](https://github.com/teddy-cliqbux/Cliqbux_onboarding/issues/17) | Locations show Draft after signed | `/locations` | `deriveLocationStatus` too coarse | P1 |

---

## #14 — Deselected people (verify)

**Root cause (fixed in repo):** prep saved `includedSignerIds`; portal `manageSigner` list ignored it.  
**Shipped:** `src/lib/dealSignerSelection.js`, `manageSigner` merchant filter, boarding signer filter. Plan: `docs/superpowers/plans/2026-08-01-honor-included-signer-ids.md`.

### Tasks
- [ ] Redeploy `manageSigner`, `signApplication`, `submitToMSP`, `refillMSPForms` + frontend if not live
- [ ] Smoke: Applications Owners deselect → Save → portal People omits them; re-check restores
- [ ] Close #14 when confirmed

---

## #18 — Extra MIDs on Applications desk (fix UI filter)

**Symptom:** Deal Room/Applications MIDs section shows excluded junk (Test DBA, duplicate Estorya/Imas) when only Union City + Estorya should appear.

**Root cause:** `ApplicationManager.jsx` builds `visibleMids` from **location** selection only:

```js
const visibleMids = includedLocIds?.length
  ? mids.filter((m) => includedLocIds.includes(String(m.locationId)))
  : mids;
```

It never calls `resolveDealMidScopeFromStages` / `includedMidIds`. Backend prepare already filters; the **desk list does not**.

### Tasks
- [ ] Import `resolveDealMidScopeFromStages` + `filterMidsByDealScope` from `src/lib/dealMidSelection.js`
- [ ] Replace `visibleMids` computation: prefer midIds scope; else locationIds; else all
- [ ] Apply same scope to MSP health prefetch / error counts for the row (junk MIDs must not drive stuck/Remind)
- [ ] Unit test: mid selection hides sibling MIDs on same location
- [ ] Manual: corp `338922234596` — with only 2 MIDs checked in prep, expand row → MIDs (2)

---

## #16 — Prepare broken / signing URL error

**Symptom:** Prepare / signing URL failed (corp `338922234596`). Same deal as #18 junk MID flood + earlier HTTP 429 storm.

**Likely causes (layered):**
1. Preparing **all** MIDs → rate limit / incomplete forms (backend MID filter in repo — redeploy)
2. Junk MIDs still on desk (#18) → agent keeps preparing them
3. Signing link fetch after package create (1s retry) failing under 429 or wrong email

### Tasks
- [ ] Confirm Base44 has redeployed `prepareMSPForms`, `submitToMSP`, `signApplication` with MID scope
- [ ] Ops: Applications prep → check **only** Imas Kusina Union City + Estorya Coffee → Save
- [ ] Ops: `retractMSPApplication` / delete draft on junk MIDs; void orphan **New** packages in MSPWare
- [ ] After #18 UI fix + cooldown: Prepare form → expect **2** rows at 100%
- [ ] If signing URL still fails with only 2 clean MIDs: capture `signApplication` response (`signers[].signingUrl`) and file a focused follow-up (do not guess BoldSign)

**Do not** set `MSP_SUBMIT_ENABLED` while debugging prepare.

---

## #19 — CTA wrong on Applications list

**Symptom:** Signed Estorya / Imas Union City show **Open to prep**; already-boarded deals still show **Submit to processor**.

**Root cause (code):**

1. When `agreementSigned`, mode is `nudge` with `needsSubmitAfterSign`. UI **always** shows **Open to prep** for nudge/prep (not stuck/underwriting) — so signed deals keep a prep CTA.
2. `showProcessorSubmit` uses:
   ```js
   midsNeedProcessor = !healthReady || visibleMids.length === 0 || visibleMids.some(not BOARDING_DONE)
   ```
   `!healthReady` makes Submit appear for **underwriting** rows before MSP health loads — including deals already Pending MID / Active.

### Desired behavior
| State | Primary CTA | Hide |
|---|---|---|
| Agreement signed, MIDs not yet Pending/Active | **Submit to processor** | Open to prep (secondary only / omit) |
| All visible MIDs Pending MID / Active / Active (Existing) | Dashboard / none | Submit to processor |
| Prep / incomplete form | Open to prep / Open to fix | Submit |

### Tasks
- [ ] Fix `midsNeedProcessor`: **do not** treat `!healthReady` as needs-submit; if health unknown, either hide Submit or compute from MID `applicationStepStatus` alone
- [ ] When `needsSubmitAfterSign`: primary = Submit; demote or hide Open to prep
- [ ] Underwriting + all visible MIDs in `BOARDING_DONE` → no Submit button
- [ ] Extend `applicationRowMode.test.js` (or row CTA helper tests) for signed + boarding-done cases
- [ ] Depends on #18 so “visible MIDs” are the real two — otherwise CTA math stays poisoned by junk

---

## #17 — Locations list shows Draft after signed

**Symptom:** `/locations?dealId=338922234596` — two signed locations labeled **Draft**.

**Root cause:** `deriveLocationStatus` in `src/lib/locationStatus.js` only knows:
`draft | submitted | in_review | live | action_needed`  
It never reads `portalLockStatus` / signer `application signed`. Until profile `applicationStatus === 'Submitted'` or MID is Pending/Active, everything is **draft**.

### Desired labels (Teddy)
Draft → **Signed** (agreement signed, not submitted) → Submitted to underwriting → Approved → **Live** (first deposit / Active + elavonMID)

Map onto existing enum carefully (avoid inventing MSP statuses):

| Merchant-facing label | Derivation |
|---|---|
| Draft | Default / incomplete |
| Signed | `portalLockStatus === all_signed` OR Control Person `application signed`, and not Submitted |
| Submitted / In review | `applicationStatus === Submitted` OR MID `Pending MID` |
| Live | MID `Active` + `elavonMID` |
| Action needed | Error / MCC help / open checklist |

### Tasks
- [ ] Extend `deriveLocationStatus(location, mids, opts)` with `portalLockStatus` and/or `agreementSigned`
- [ ] Add status `signed` (or map to a clearer label without breaking tone helpers)
- [ ] Update `locationStatusLabel` / `locationStatusTone` / sort order in `MerchantLocationsHome`
- [ ] Tests in `locationStatus.test.js`
- [ ] Confirm Merchant Center list + any admin location chips use the same helper

---

## Suggested implementation order

1. **#18** Applications `visibleMids` → `dealMidSelection` (unblocks #16/#19 desk noise)
2. **#19** CTA / `midsNeedProcessor` logic
3. **#16** Redeploy + ops retract junk on `338922234596` + Prepare verify
4. **#17** Location status enrichment
5. **#14** Verify deploy + close

## Out of scope

- Auto Cursor webhook for new feedback (manual planning)
- Sales alert / live chat for `needs-triage` (vault `specs/feedback-sales-alert-and-live-chat`)
- Deleting historical MSPWare packages without Teddy confirming keepers

## Stop

Plan only until Teddy says **go** on implementation (or picks a subset).
