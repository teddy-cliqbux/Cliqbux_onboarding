# Merchant Center POS-Shell Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild Merchant Center chrome and the Setup (post-submission) page to match dashboard.cliqbux.com’s shell and grid language, while keeping all onboarding data, gates, and fetch paths unchanged.

**Architecture:** Replace the thin top-nav `MerchantCenterShell` with a POS-style left sidebar + top bar + wide main canvas. Add a small pure helper module that derives four status-card values from existing profile/MID/quote/checklist state. `PostSubmissionDashboard` keeps its data hooks and composes a metric row + two-column grid + full-width underwriting table. Locations and Account only swap into the new shell.

**Tech Stack:** React, React Router `NavLink`, Tailwind `cb-*` tokens, framer-motion (existing springs only), lucide-react icons, existing `invokePortalFunction` / TanStack quote query.

**Spec:** [docs/superpowers/specs/2026-07-23-merchant-center-pos-shell-design.md](../specs/2026-07-23-merchant-center-pos-shell-design.md)

## Global Constraints

- Style/layout only — no schema, validation, Save semantics, auth, or fetch-path changes
- `cb-*` tokens only — no new hex; accent `#FEAC27` via tokens
- Quote iframe stays white
- No ⌘K search, no sales charts, no fake % deltas
- Explicit Save buttons unchanged wherever they already exist
- Commits: only when Teddy asks (GitHub Desktop is fine); plan steps list what to stage

---

## File map

| File | Responsibility |
|------|----------------|
| `src/lib/setupStatusCards.js` | Pure helpers → four status card models |
| `src/lib/setupStatusCards.test.js` | Node unit tests for helpers |
| `src/components/merchant-center/SetupStatusCard.jsx` | One metric card presentational |
| `src/components/merchant-center/MerchantCenterShell.jsx` | Sidebar + top bar + wide main (rewrite) |
| `src/pages/PostSubmissionDashboard.jsx` | Compose new layout; keep data/effects |
| `src/components/onboarding/UnderwritingTracker.jsx` | Table-style MID rows; drop `max-w-3xl` |
| `src/pages/MerchantLocationsHome.jsx` | Consume shell (no body redesign required) |
| `src/pages/MerchantAccountPage.jsx` | Consume shell |
| `src/pages/MerchantLocationDetail.jsx` | Consume shell |

---

### Task 1: Status card helpers (TDD)

**Files:**
- Create: `src/lib/setupStatusCards.js`
- Create: `src/lib/setupStatusCards.test.js`

**Interfaces:**
- Produces:
  - `deriveSetupStatusCards({ openChecklistCount, merchantIDs, locations, quoteLifecycle, quotePaid, shippingStatus, trackingNumber })` → `{ attention, underwriting, quote, shipping }`
  - Each card: `{ id, title, value, caption }` (strings)

- [ ] **Step 1: Write failing tests**

```js
// src/lib/setupStatusCards.test.js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { deriveSetupStatusCards } from './setupStatusCards.js';

describe('deriveSetupStatusCards', () => {
  it('maps open checklist count to Needs attention', () => {
    const cards = deriveSetupStatusCards({
      openChecklistCount: 3,
      merchantIDs: [],
      locations: [],
      quoteLifecycle: 'awaiting_signature',
      quotePaid: false,
      shippingStatus: 'hold',
      trackingNumber: null,
    });
    assert.equal(cards.attention.value, '3');
    assert.match(cards.attention.title, /attention/i);
  });

  it('summarizes underwriting from MID elavonMID / applicationStepStatus', () => {
    const cards = deriveSetupStatusCards({
      openChecklistCount: 0,
      merchantIDs: [
        { applicationStepStatus: 'In Review', elavonMID: null },
        { applicationStepStatus: 'Active', elavonMID: '123' },
      ],
      locations: [],
      quoteLifecycle: 'paid',
      quotePaid: true,
      shippingStatus: 'ready_to_ship',
      trackingNumber: null,
    });
    assert.match(cards.underwriting.value, /1 of 2|In Review|Active/i);
  });

  it('maps quote lifecycle labels', () => {
    const a = deriveSetupStatusCards({
      openChecklistCount: 0, merchantIDs: [], locations: [],
      quoteLifecycle: 'awaiting_payment', quotePaid: false,
      shippingStatus: 'hold', trackingNumber: null,
    });
    assert.match(a.quote.value, /payment|Pay/i);

    const b = deriveSetupStatusCards({
      openChecklistCount: 0, merchantIDs: [], locations: [],
      quoteLifecycle: 'paid', quotePaid: true,
      shippingStatus: 'ready_to_ship', trackingNumber: '1Z999',
    });
    assert.match(b.quote.value, /Paid/i);
    assert.match(b.shipping.value, /Ready|Ship/i);
    assert.match(b.shipping.caption, /1Z999/);
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
node --test src/lib/setupStatusCards.test.js
```

Expected: FAIL — module not found / `deriveSetupStatusCards` undefined

- [ ] **Step 3: Implement helpers**

```js
// src/lib/setupStatusCards.js
const QUOTE_LABELS = {
  awaiting_signature: 'Awaiting signature',
  awaiting_payment: 'Awaiting payment',
  paid: 'Paid',
};

export function deriveSetupStatusCards({
  openChecklistCount = 0,
  merchantIDs = [],
  locations = [],
  quoteLifecycle = 'awaiting_signature',
  quotePaid = false,
  shippingStatus = 'hold',
  trackingNumber = null,
} = {}) {
  const items = merchantIDs.length ? merchantIDs : locations;
  const total = items.length;
  const active = items.filter((i) => i.elavonMID || i.applicationStepStatus === 'Active' || i.applicationStepStatus === 'Active (Existing)').length;
  const pending = items.filter((i) => i.applicationStepStatus === 'Pending MID').length;

  let uwValue = 'No accounts yet';
  let uwCaption = 'Processing accounts appear after submit';
  if (total > 0) {
    if (active === total) {
      uwValue = 'All active';
      uwCaption = `${total} processing account${total === 1 ? '' : 's'}`;
    } else if (pending > 0) {
      uwValue = 'Pending MID';
      uwCaption = `${active} of ${total} active`;
    } else {
      uwValue = 'In review';
      uwCaption = `${active} of ${total} active`;
    }
  }

  const lifecycle = quotePaid ? 'paid' : quoteLifecycle;
  const quoteValue = QUOTE_LABELS[lifecycle] || QUOTE_LABELS.awaiting_signature;

  let shipValue = 'Locked';
  let shipCaption = 'Unlocks after quote is paid';
  if (shippingStatus === 'ready_to_ship' || quotePaid) {
    shipValue = 'Ready to ship';
    shipCaption = trackingNumber ? `Tracking: ${trackingNumber}` : 'Set shipping destination when ready';
  } else if (lifecycle === 'awaiting_payment' || lifecycle === 'paid') {
    shipValue = 'On hold';
    shipCaption = 'Terminals ship after invoice is paid';
  }

  return {
    attention: {
      id: 'attention',
      title: 'Needs attention',
      value: String(openChecklistCount),
      caption: openChecklistCount === 1 ? 'Item waiting on you' : 'Items waiting on you',
    },
    underwriting: {
      id: 'underwriting',
      title: 'Underwriting',
      value: uwValue,
      caption: uwCaption,
    },
    quote: {
      id: 'quote',
      title: 'Equipment quote',
      value: quoteValue,
      caption: 'Sign and pay to unlock shipping',
    },
    shipping: {
      id: 'shipping',
      title: 'Shipping',
      value: shipValue,
      caption: shipCaption,
    },
  };
}
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
node --test src/lib/setupStatusCards.test.js
```

Expected: all tests PASS

- [ ] **Step 5: Stage for commit (when Teddy asks)**

```bash
git add src/lib/setupStatusCards.js src/lib/setupStatusCards.test.js
# commit only if Teddy requests: feat: add Merchant Center setup status card helpers
```

---

### Task 2: `SetupStatusCard` presentational component

**Files:**
- Create: `src/components/merchant-center/SetupStatusCard.jsx`

**Interfaces:**
- Consumes: card `{ title, value, caption }` + optional `icon` React node
- Produces: `<SetupStatusCard title value caption icon? />`

- [ ] **Step 1: Implement component**

```jsx
// src/components/merchant-center/SetupStatusCard.jsx
export default function SetupStatusCard({ title, value, caption, icon = null }) {
  return (
    <div className="bg-cb-surface rounded-cb border border-cb-border p-4 flex items-start justify-between gap-3 min-h-[5.5rem]">
      <div className="min-w-0">
        <p className="text-cb-caption uppercase text-gray-500 mb-1">{title}</p>
        <p className="font-display text-cb-title text-white truncate">{value}</p>
        {caption && (
          <p className="text-cb-caption normal-case tracking-normal font-normal text-gray-500 mt-1 truncate">
            {caption}
          </p>
        )}
      </div>
      {icon && (
        <div className="flex-shrink-0 w-9 h-9 rounded-cb bg-cb-accent-muted flex items-center justify-center text-cb-accent">
          {icon}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Smoke-check in browser later (Task 4)** — no separate unit test required for pure markup

- [ ] **Step 3: Stage**

```bash
git add src/components/merchant-center/SetupStatusCard.jsx
```

---

### Task 3: Rebuild `MerchantCenterShell` (POS chrome)

**Files:**
- Modify: `src/components/merchant-center/MerchantCenterShell.jsx` (full rewrite of layout; keep prop names)

**Interfaces:**
- Consumes (unchanged props): `title`, `subtitle`, `corporateId`, `openChecklistCount`, `children`, `showDealLink`
- Produces: sidebar nav to Locations / Account / Setup (when `showDealLink`), top bar with title + business name + Sign out, wide `<main>`

- [ ] **Step 1: Rewrite shell**

Replace the fixed header + `max-w-3xl` main with:

```jsx
// Structure — keep imports: NavLink, useNavigate, CliqbuxLogo, signOut
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

1. Setup — only if `showDealLink` (href = deal dashboard URL as today)
2. Locations — `/locations${dealQ}`
3. Account — `/account${dealQ}`

Badge: reuse open checklist count on Setup link (same danger pill as current).

Top bar right: `subtitle` as caption, `title` as business name (store-switcher style bordered chip is fine), Sign out button.

- [ ] **Step 2: Manual check** — open `/locations` and `/account` after Task 5; sidebar should appear without breaking auth

- [ ] **Step 3: Stage**

```bash
git add src/components/merchant-center/MerchantCenterShell.jsx
```

---

### Task 4: Compose Setup dashboard grid

**Files:**
- Modify: `src/pages/PostSubmissionDashboard.jsx`

**Interfaces:**
- Consumes: `deriveSetupStatusCards`, `SetupStatusCard`, existing quote/profile/MID state
- Keeps: all `useEffect` loaders, quote poll, unlock banner, SetupGate rules

- [ ] **Step 1: Import helpers + cards**

```jsx
import SetupStatusCard from '@/components/merchant-center/SetupStatusCard';
import { deriveSetupStatusCards } from '@/lib/setupStatusCards';
import { ClipboardList, Shield, FileSignature, Truck } from 'lucide-react';
```

- [ ] **Step 2: Derive cards before return**

```jsx
const shippingTrack = locations.find((l) => l.shippingTrackingNumber);
const statusCards = deriveSetupStatusCards({
  openChecklistCount,
  merchantIDs,
  locations,
  quoteLifecycle: lifecycle,
  quotePaid,
  shippingStatus: profile.equipmentShippingStatus || (quotePaid ? 'ready_to_ship' : 'hold'),
  trackingNumber: shippingTrack?.shippingTrackingNumber || null,
});
```

(Use existing `quotePaid` / `lifecycle` already derived in this file via `deriveQuoteFlags`.)

- [ ] **Step 3: Replace the single `space-y-8` column body** with:

1. Compact banner (not tall hero) — one line title + agent preview note  
2. Agent `FormsLockedBanner` when applicable  
3. Grid of four `SetupStatusCard`s: `grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3`  
4. Two-column: `grid grid-cols-1 lg:grid-cols-12 gap-4`
   - Left `lg:col-span-7`: `MerchantChecklist` + `MerchantBeforeInstall`
   - Right `lg:col-span-5`: `EquipmentOrderPanel` + Shipping `SetupGate` card  
5. Full width: `UnderwritingTracker` (when MIDs exist)  
6. Full width: Menu + Legacy POS SetupGates  
7. Remove or demote duplicate `ApplicationTracker` if it repeats underwriting (prefer keep UnderwritingTracker only; delete ApplicationTracker from this page if redundant)

- [ ] **Step 4: Keep celebration** — `fireSubmissionCelebration` may still run; do not restore tall centered hero

- [ ] **Step 5: Manual verify**

- Load `/onboarding/dashboard?dealId=…` (or `/center`) with merchant JWT / impersonation  
- Status cards show numbers/labels  
- Quote poll still advances when modal open  
- Shipping/menu gates still lock correctly  

- [ ] **Step 6: Stage**

```bash
git add src/pages/PostSubmissionDashboard.jsx
```

---

### Task 5: Underwriting table polish

**Files:**
- Modify: `src/components/onboarding/UnderwritingTracker.jsx`

- [ ] **Step 1: Remove `max-w-3xl mx-auto` wrapper** so it fills the wide main canvas

- [ ] **Step 2: Add a MID rows table below the stage strip** (same data already in `items`):

```jsx
<table className="w-full text-left">
  <thead>
    <tr className="border-b border-cb-border text-cb-caption uppercase text-gray-500">
      <th className="px-4 py-2 font-medium">Account</th>
      <th className="px-4 py-2 font-medium">Status</th>
      <th className="px-4 py-2 font-medium">MID</th>
    </tr>
  </thead>
  <tbody>
    {items.length === 0 ? (
      <tr>
        <td colSpan={3} className="px-4 py-10 text-center text-cb-body text-gray-500">
          No processing accounts yet
        </td>
      </tr>
    ) : items.map((row) => (
      <tr key={row.id || row.elavonMID} className="border-b border-cb-border/60">
        <td className="px-4 py-3 text-cb-body text-white">
          {row.merchantName || row.dbaName || 'Processing account'}
        </td>
        <td className="px-4 py-3 text-cb-caption normal-case tracking-normal text-gray-400">
          <span className="inline-flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-cb-accent" />
            {row.applicationStepStatus || 'In Review'}
          </span>
        </td>
        <td className="px-4 py-3 text-cb-caption font-mono text-gray-300">
          {row.elavonMID || '—'}
        </td>
      </tr>
    ))}
  </tbody>
</table>
```

Keep existing stage progress header; do not change props.

- [ ] **Step 3: Stage**

```bash
git add src/components/onboarding/UnderwritingTracker.jsx
```

---

### Task 6: Confirm Locations / Account / Detail use the shell

**Files:**
- Modify only if props break: `MerchantLocationsHome.jsx`, `MerchantAccountPage.jsx`, `MerchantLocationDetail.jsx`

- [ ] **Step 1: Open each page under the new shell** — fix any layout that assumed `max-w-3xl` or centered hero (widen tables if clipped)

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

### Task 7: Visual QA + AI_CHANNEL

- [ ] **Step 1: Desktop QA checklist**
  - Sidebar active gold on Setup / Locations / Account
  - Four status cards in a row at `xl`
  - Two-column checklist | quote on `lg`
  - Underwriting table full width
  - Quote iframe still white inside modal
  - Agent unlock banner still visible when locked

- [ ] **Step 2: Mobile QA**
  - Sidebar collapses; Setup reachable with checklist badge
  - Cards stack; no horizontal page overflow

- [ ] **Step 3: Append `AI_CHANNEL.md`** (append-only) summarizing the POS-shell redesign + files touched

- [ ] **Step 4: When Teddy asks — commit**

```bash
git add src/components/merchant-center src/pages/PostSubmissionDashboard.jsx src/pages/MerchantLocationsHome.jsx src/pages/MerchantAccountPage.jsx src/pages/MerchantLocationDetail.jsx src/components/onboarding/UnderwritingTracker.jsx src/lib/setupStatusCards.js src/lib/setupStatusCards.test.js AI_CHANNEL.md
git commit -m "$(cat <<'EOF'
feat: Merchant Center POS-shell Setup dashboard

Match dashboard.cliqbux.com chrome (sidebar + wide grid) for onboarding
Setup, with status cards and unchanged quote/checklist gates.
EOF
)"
```

---

## Spec coverage self-review

| Spec requirement | Task |
|------------------|------|
| Left sidebar Setup / Locations / Account | Task 3 |
| Top bar deal name, no search | Task 3 |
| Wide main canvas | Task 3 |
| Four status cards from live data | Tasks 1–2, 4 |
| Two-column checklist \| quote+shipping | Task 4 |
| Underwriting table language | Task 5 |
| Compact celebration / no tall hero | Task 4 |
| Locations/Account same shell | Tasks 3, 6 |
| No fetch/gate/schema changes | Global Constraints + Task 4 |
| Quote iframe white | Global Constraints / QA |
| Agent unlock near top | Task 4 |

**Placeholder scan:** none remaining.  
**Type consistency:** `deriveSetupStatusCards` return shape matches `SetupStatusCard` props (`title`, `value`, `caption`).
