### Task 4: Rename inbound CTAs / launch copy

**Files (agent-facing UI only):**
- Modify: `src/pages/ApplicationManager.jsx` â€” Deal room button title/label â†’ Underwriting room
- Modify: `src/pages/AdminMerchantAccountHome.jsx` â€” â€œDeal Roomâ€ link text
- Modify: `src/pages/AdminMerchantPortfolio.jsx` â€” â€œDeal Roomâ€ link text
- Modify: `src/pages/AdminQaHub.jsx` â€” Deal Room button copy/title (drop â€œhandoffâ€¦runbookâ€ from title)
- Modify: `src/pages/AdminInstallationsPanel.jsx` â€” stop pointing agents at Deal Room runbook; point to Applications / account for UW if needed, or say runbooks moved / not on this page
- Modify: `src/pages/AdminMerchantDashboard.jsx` â€” tile body mentioning Deal Room runbooks
- Modify: `src/pages/PostSubmissionDashboard.jsx` â€” comment â€œApplications or Underwriting Roomâ€
- Modify: `src/components/onboarding/AgreementSignedCelebration.jsx` â€” comment only OK
- Modify: `src/pages/OnboardingPortal.jsx` â€” comment unlock from Underwriting Room

**Do not** change merchant-facing delete confirm strings that list â€œDeal Roomâ€ as a data surface unless easy â€” prefer â€œUnderwriting Roomâ€ for consistency when editing those lines.

- [ ] **Step 1: Replace visible â€œDeal Roomâ€ / â€œDeal roomâ€ strings** in the files above via search.

```bash
rg -n "Deal [Rr]oom" src/pages src/components src/lib --glob '!**/HandoffPanel.jsx' --glob '!**/InstallerRunbook.jsx'
```

Expected after: remaining hits only in file comments inside unused panels or historical docs â€” not in agent CTAs.

- [ ] **Step 2: Quick sanity** â€” Applications row still links to `/admin/applications/:corporateId`.

---

