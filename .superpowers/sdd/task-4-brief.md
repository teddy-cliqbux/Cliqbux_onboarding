## Task 4: Compose Setup dashboard grid

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

1. Compact banner (not tall hero) â€” one line title + agent preview note  
2. Agent `FormsLockedBanner` when applicable  
3. Grid of four `SetupStatusCard`s: `grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3`  
4. Two-column: `grid grid-cols-1 lg:grid-cols-12 gap-4`
   - Left `lg:col-span-7`: `MerchantChecklist` + `MerchantBeforeInstall`
   - Right `lg:col-span-5`: `EquipmentOrderPanel` + Shipping `SetupGate` card  
5. Full width: `UnderwritingTracker` (when MIDs exist)  
6. Full width: Menu + Legacy POS SetupGates  
7. Remove or demote duplicate `ApplicationTracker` if it repeats underwriting (prefer keep UnderwritingTracker only; delete ApplicationTracker from this page if redundant)

- [ ] **Step 4: Keep celebration** â€” `fireSubmissionCelebration` may still run; do not restore tall centered hero

- [ ] **Step 5: Manual verify**

- Load `/onboarding/dashboard?dealId=â€¦` (or `/center`) with merchant JWT / impersonation  
- Status cards show numbers/labels  
- Quote poll still advances when modal open  
- Shipping/menu gates still lock correctly  

- [ ] **Step 6: Stage**

```bash
git add src/pages/PostSubmissionDashboard.jsx
```

---

#
