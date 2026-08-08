### Task 1: CTA / vocabulary helper tests

**Files:**
- Modify: `src/lib/accountOverview.js`
- Modify: `src/lib/accountOverview.test.js`
- Modify: `src/lib/portalLock.js` (agent-facing lock strings)
- Modify: `src/lib/applicationRowMode.js` (signed â†’ submit reason string)

**Interfaces:**
- Consumes: existing `buildPrimaryCta({ status, bestDeal })`
- Produces: labels using â€œUnderwriting Roomâ€ / â€œFix in Underwriting Roomâ€; `kind` stays `'deal_room'` (URL semantics unchanged)

- [ ] **Step 1: Update failing expectations in `accountOverview.test.js`**

Find tests that assert `'Open Deal Room'` / `'Fix in Deal Room'` and change expected strings to `'Open Underwriting Room'` / `'Fix in Underwriting Room'`.

- [ ] **Step 2: Run tests â€” expect fail**

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

Replace â€œDeal Roomâ€ with â€œUnderwriting Roomâ€ in:

- `FORMS_LOCKED_MESSAGE` (agent path mention)
- `FORMS_LOCKED_MESSAGE_ALL_SIGNED` / `_AGENT` if they mention Deal Room
- `FORMS_LOCKED_MESSAGE` Deal Room unlock path string (~line 75)
- `resolveApplicationRowMode` reason: `submit to processor from Applications or Underwriting Room`

- [ ] **Step 5: Run tests â€” expect pass**

```bash
node --test src/lib/accountOverview.test.js src/lib/applicationRowMode.test.js
```

---

