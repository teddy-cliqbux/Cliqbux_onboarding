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
3. Delete the whole `<section>â€¦Request documentâ€¦</section>` block (~876â€“914)

Leave Tasks + Internal notes sections intact.

- [ ] **Step 4: Rename page chrome**

- File header comment: Underwriting Room
- Visible caption `'Deal room'` â†’ `'Underwriting room'`
- Loading copy `Loading deal roomâ€¦` â†’ `Loading underwriting roomâ€¦`
- Unlock reason string `'Unlocked from Deal Room'` â†’ `'Unlocked from Underwriting Room'`
- `console.error('[DealRoom]'` may stay or become `[UnderwritingRoom]` (either OK)

- [ ] **Step 5: Smoke scan**

```bash
rg -n "HandoffPanel|InstallerRunbook|Request document|docTitle|requestMerchantDocument" src/pages/ApplicationDealRoom.jsx
```

Expected: no matches.

---

