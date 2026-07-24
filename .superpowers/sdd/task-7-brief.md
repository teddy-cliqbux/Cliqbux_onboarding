## Task 7: Visual QA + AI_CHANNEL

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

- [ ] **Step 4: When Teddy asks â€” commit**

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

