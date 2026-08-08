### Task 6: Merchant page `/uw/:token`

**Files:**
- Create: `src/pages/UnderwritingW9Sign.jsx`
- Modify: `src/App.jsx` â€” public route (no AdminProtectedRoute, no merchant JWT required)

**UI:**
- Load via `base44.functions.invoke('completeUnderwritingRequest', { action: 'get', token })` (public function invoke â€” same as `verifySignerToken` pattern; if CORS/auth blocks anonymous invoke, use raw `fetch` to `/functions/completeUnderwritingRequest` like other public entry points).
- Form: editable fields from model; Continue â†’ canvas draw **or** typed name â†’ Submit.
- States: loading, expired, error, signed confirmation + download link.
- Use `cb-*` tokens; light form surface for readability.

- [ ] **Step 1: Add route + skeleton page.**

- [ ] **Step 2: Wire get + submit + signature pad** (simple canvas; typed mode renders text to canvas before submit).

- [ ] **Step 3: Manual check** on `/uw/test` expired state + happy path against staging function.

- [ ] **Step 4: Commit**

```bash
git add src/pages/UnderwritingW9Sign.jsx src/App.jsx
git commit -m "feat(uw): merchant W-9 review and sign page"
```

