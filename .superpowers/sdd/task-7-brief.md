### Task 7: Deal Room `UnderwritingRequestsPanel`

**Files:**
- Create: `src/components/deal-room/UnderwritingRequestsPanel.jsx`
- Modify: `src/pages/ApplicationDealRoom.jsx` â€” render panel under Underwriting-by-MID when `selectedMid` set; pass `corporateId`, `mid`, `legalEntities`, `signers`, `profile`

**UI flow:**
1. List requests for MID (status dots + recipient + dates)
2. New W-9: entity select â†’ recipient select (from signers) â†’ editable email/phone â†’ channels checkboxes â†’ note â†’ Create & Send (or Create draft then Send)
3. Signed row: Download + Send to Elavon modal (To prefilled from `UNDERWRITING_ELAVON_DOCS_TO` if API returns it; Subject with AWB; body textarea)
4. Resend / Cancel on unsigned

Load people from Deal Room `data.signers` already fetched by `manageApplicationDesk.get`. Prefill preview from client `buildW9Prefill` for agent confidence before send (server still authoritative on create).

- [ ] **Step 1: Build panel component** with list + new request form.

- [ ] **Step 2: Mount in Deal Room**; wire invoke `manageUnderwritingRequest`.

- [ ] **Step 3: Add Send to Elavon modal.**

- [ ] **Step 4: Commit**

```bash
git add src/components/deal-room/UnderwritingRequestsPanel.jsx src/pages/ApplicationDealRoom.jsx
git commit -m "feat(uw): Deal Room underwriting requests panel for W-9"
```

