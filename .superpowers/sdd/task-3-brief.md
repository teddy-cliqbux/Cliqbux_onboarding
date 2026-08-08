### Task 3: Admin sidebar Underwriting item

**Files:**
- Modify: `src/components/admin/AdminMerchantCenterShell.jsx`

- [ ] **Step 1: Import an icon**

Add `Shield` (or `FileCheck`) from `lucide-react` next to existing icons.

- [ ] **Step 2: Add Underwriting button under Work**

Immediately after the existing Onboarding button (same pattern â€” navigate to Applications desk):

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

Open `/admin/center` as admin â†’ sidebar Work shows **Underwriting** â†’ clicks to `/admin/applications`. Merchant center has no such item.

---

