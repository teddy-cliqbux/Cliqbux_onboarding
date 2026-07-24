## Task 6: Confirm Locations / Account / Detail use the shell

**Files:**
- Modify only if props break: `MerchantLocationsHome.jsx`, `MerchantAccountPage.jsx`, `MerchantLocationDetail.jsx`

- [ ] **Step 1: Open each page under the new shell** â€” fix any layout that assumed `max-w-3xl` or centered hero (widen tables if clipped)

- [ ] **Step 2: Ensure `showDealLink` is passed where Setup should appear** (Setup dashboard already passes it; Locations/Account should pass `showDealLink` + `corporateId` so Setup stays in the sidebar)

Example for Locations home:

```jsx
<MerchantCenterShell
  title={...}
  subtitle="Merchant account"
  corporateId={corporateId}
  showDealLink
>
```

- [ ] **Step 3: Stage any prop fixes**

---

#
