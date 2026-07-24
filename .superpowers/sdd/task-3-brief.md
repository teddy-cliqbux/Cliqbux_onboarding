### Task 3: Rebuild `MerchantCenterShell` (POS chrome)

**Files:**
- Modify: `src/components/merchant-center/MerchantCenterShell.jsx` (full rewrite of layout; keep prop names)

**Interfaces:**
- Consumes (unchanged props): `title`, `subtitle`, `corporateId`, `openChecklistCount`, `children`, `showDealLink`
- Produces: sidebar nav to Locations / Account / Setup (when `showDealLink`), top bar with title + business name + Sign out, wide `<main>`

- [ ] **Step 1: Rewrite shell**

Replace the fixed header + `max-w-3xl` main with:

```jsx
// Structure â€” keep imports: NavLink, useNavigate, CliqbuxLogo, signOut
// Key classes:
// - Outer: portal-bg min-h-screen flex
// - Aside: hidden md:flex w-56 flex-col border-r border-cb-border bg-cb-surface fixed inset-y-0 left-0 z-40
// - NavLink active: bg-cb-accent-muted text-cb-accent
// - Main column: flex-1 md:pl-56 min-h-screen flex flex-col
// - Top bar: h-14 border-b border-cb-border bg-cb-surface/95 backdrop-blur px-4 flex items-center justify-between
// - Main: flex-1 px-4 sm:px-6 py-6 w-full max-w-[1400px] mx-auto
// Mobile: top bar hamburger toggles drawer; or reuse bottom nav strip with Setup / Locations / Account
```

Nav items (order):

1. Setup â€” only if `showDealLink` (href = deal dashboard URL as today)
2. Locations â€” `/locations${dealQ}`
3. Account â€” `/account${dealQ}`

Badge: reuse open checklist count on Setup link (same danger pill as current).

Top bar right: `subtitle` as caption, `title` as business name (store-switcher style bordered chip is fine), Sign out button.

- [ ] **Step 2: Manual check** â€” open `/locations` and `/account` after Task 5; sidebar should appear without breaking auth

- [ ] **Step 3: Stage**

```bash
git add src/components/merchant-center/MerchantCenterShell.jsx
```

---


