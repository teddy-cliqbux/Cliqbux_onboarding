# Final branch review package
Merge-base (main): c29c87778a9f0a402428e5e11f996d8c6703d6e5
Head: 84bafc8d5f9342044d6b780f67f47cd6bed5c66e

## Commits
84bafc8 fix(uw): restore AI_CHANNEL append-only hygiene
282bd28 docs(uw): W-9 underwriting request and Gmail send scopes
b51885e feat(uw): Deal Room underwriting requests panel for W-9
e92167b feat(uw): merchant W-9 review and sign page
e1eb6da feat(uw): token-gated W-9 complete and PDF stamp
b57b499 fix(uw): redact unparseable W-9 prefill snapshots on list
2c55181 feat(uw): admin manageUnderwritingRequest send and Elavon forward
0e3c023 feat(uw): add UnderwritingRequest entity schema
8ff982b fix(uw): document W-9 overlay coords and PDF sync
70d31bc feat(uw): pin IRS W-9 PDF and pdf-lib fill helper
1d75a6e fix(uw): map DISREGARDED_ENTITY to W-9 LLC class D
5c586f8 feat(uw): add W-9 field model and prefill helpers
ed8383c docs(uw): add W-9 underwriting request plan and approve design


## Stat
 .superpowers/sdd/progress.md                       |   62 +-
 .superpowers/sdd/task-2-report.md                  |  108 +-
 .superpowers/sdd/task-3-report.md                  |   69 +-
 .superpowers/sdd/task-4-report.md                  |   94 +-
 .superpowers/sdd/task-5-report.md                  |   75 +-
 .superpowers/sdd/task-8-report.md                  |   48 +
 AGENTS.md                                          |    2 +
 AI_CHANNEL.md                                      |   20 +
 assets/irs/fw9-field-map.md                        |   93 ++
 assets/irs/fw9.pdf                                 |  Bin 0 -> 140815 bytes
 base44/entities/Underwriting Request.jsonc         |  115 +++
 .../functions/completeUnderwritingRequest/entry.ts |  665 ++++++++++++
 .../functions/manageUnderwritingRequest/entry.ts   | 1075 ++++++++++++++++++++
 .../plans/2026-08-07-underwriting-w9-request.md    |  310 ++++++
 .../2026-08-07-underwriting-w9-request-design.md   |    2 +-
 docs/underwriting-inbox.md                         |   33 +-
 package-lock.json                                  |   55 +
 package.json                                       |    2 +
 public/irs/fw9.pdf                                 |  Bin 0 -> 140815 bytes
 scripts/inspect-w9-fields.mjs                      |   39 +
 scripts/inspect-w9-widgets.mjs                     |   53 +
 scripts/sync-w9-pdf.mjs                            |   14 +
 src/App.jsx                                        |    2 +
 .../deal-room/UnderwritingRequestsPanel.jsx        |  710 +++++++++++++
 src/lib/w9Model.js                                 |  108 ++
 src/lib/w9Model.test.js                            |  107 ++
 src/lib/w9PdfFill.js                               |  201 ++++
 src/lib/w9PdfFill.test.js                          |   86 ++
 src/lib/w9Prefill.js                               |   75 ++
 src/lib/w9Prefill.test.js                          |   95 ++
 src/pages/ApplicationDealRoom.jsx                  |   10 +
 src/pages/UnderwritingW9Sign.jsx                   |  598 +++++++++++
 32 files changed, 4710 insertions(+), 216 deletions(-)


## Diff (PDFs and AI_CHANNEL excluded; AI_CHANNEL verified append-only vs Task 7)
```diff
diff --git a/.superpowers/sdd/progress.md b/.superpowers/sdd/progress.md
index 4a25283..25a6917 100644
--- a/.superpowers/sdd/progress.md
+++ b/.superpowers/sdd/progress.md
@@ -1,50 +1,40 @@
-∩╗┐# SDD Progress ΓÇö merchant-center-pos-shell
-Branch: feature/merchant-center-pos-shell
-Started: 2026-07-24
-Plan: docs/superpowers/plans/2026-07-23-merchant-center-pos-shell.md
+∩╗┐# SDD Progress - underwriting-w9-request
+Branch: feature/underwriting-w9-request
+Started: 2026-08-07
+Plan: docs/superpowers/plans/2026-08-07-underwriting-w9-request.md
+Spec: docs/superpowers/specs/2026-08-07-underwriting-w9-request-design.md
 
 
-Task 1: complete (commits 99a5a1e..13f0f86, review clean)
+Task 1: complete (commits ed8383c..1d75a6e, review clean after DISREGARDED_ENTITY fix)
 
-Task 2: complete (commits 13f0f86..bb78eb6, review clean)
 
-## Task 3: Rebuild MerchantCenterShell ΓÇö COMPLETE
-- Status: Complete
-- Implementer: (subagent)
-- Reviewer: Approved (coordinator ΓÇö layout matches plan; props preserved)
-- Commit: e7a7e041671faf350b43973aa9493038d93920d0
-- Notes: POS sidebar + top bar + max-w 1400; title/subtitle as merchant chip right; mobile bottom nav
+Task 2: complete (commits 1d75a6e..8ff982b, review approved; visual QA of signature coords deferred to Elavon smoke)
+Minor carry: visual QA signature/date overlays before live Elavon send.
 
 
-## Task 4: Compose Setup dashboard grid ΓÇö COMPLETE
-- Status: Complete
-- Implementer: (subagent)
-- Reviewer: Approved with fix (showDealLink restored to true)
-- Commit: 8ea97d5 (+ 1698284)
-- Notes: Status cards + 2-col checklist/quote; celebration kept; ApplicationTracker removed
+Task 3: complete (commits 8ff982b..0e3c023, review approved)
 
+Task 4: complete with concerns (manageUnderwritingRequest ΓÇö no live Resend/Gmail smoke; entity publish pending)
 
-## Task 5: Underwriting table polish ΓÇö COMPLETE
-- Status: Complete
-- Implementer: (subagent)
-- Reviewer: Approved (coordinator)
-- Commit: b40f729
-- Notes: Full-width + Account/Status/MID table; props unchanged
 
+Task 4: complete (commits 0e3c023..b57b499, review approved after TIN redact fix)
+Carry: Elavon PDF fetch auth if Base44 URLs private; entity publish; visual QA overlays; sole-prop SSN prefill later.
 
-## Task 6: Locations/Account shell props ΓÇö COMPLETE
-- Status: Complete
-- Implementer: (subagent)
-- Reviewer: Approved (coordinator)
-- Commit: e197b8e
-- Notes: Loading-state corporateId/showDealLink; dealId preserved on detail links
+Task 5: complete (`completeUnderwritingRequest` ΓÇö token get + submitSignature PDF stamp; UploadFile https guard for Elavon attach)
+Carry: publish/redeploy; visual QA overlays; Task 6 merchant page.
 
 
-## Task 7: Visual QA + AI_CHANNEL ΓÇö COMPLETE
-- Status: Complete
-- Reviewer: Approved (code QA; live smoke deferred to Teddy)
-- Notes: AI_CHANNEL appended
+Task 5: complete (commits b57b499..e1eb6da, review approved; public/irs/fw9.pdf from Task 2)
 
-## Branch SDD COMPLETE
-All Tasks 1ΓÇô7 done on feature/merchant-center-pos-shell. Ready for Teddy push + optional finishing-a-development-branch / PR when asked.
+
+Task 5: complete (commits b57b499..e1eb6da, review approved; public/irs/fw9.pdf from Task 2)
+
+
+Task 6: complete (commits e1eb6da..e92167b, review approved)
+Task 7: complete (pending review, commit b51885e)
+
+
+Task 7: complete (commits e92167b..b51885e, review approved with minor nits)
+
+Task 8: complete (docs + AGENTS + AI_CHANNEL + vault link; Teddy ops pending)
 
diff --git a/.superpowers/sdd/task-2-report.md b/.superpowers/sdd/task-2-report.md
index a294b91..7570713 100644
--- a/.superpowers/sdd/task-2-report.md
+++ b/.superpowers/sdd/task-2-report.md
@@ -1,78 +1,74 @@
-# Task 2 Report: SetupStatusCard presentational component
+# Task 2 Report: Pin IRS PDF + AcroForm field map + fill helper
 
 **Status:** DONE  
-**Branch:** `feature/merchant-center-pos-shell`  
-**Commit:** `bb78eb6` ΓÇö feat: add SetupStatusCard metric card component  
-**Date:** 2026-07-24
+**Branch:** `feature/underwriting-w9-request`  
+**Date:** 2026-08-07
 
----
+## Deliverables
 
-## Summary
-
-Created the presentational `SetupStatusCard` React component for the Merchant Center POS-shell redesign. Implementation matches the task brief verbatim ΓÇö no wiring into the dashboard yet (Task 4). Pure markup component; no unit tests required per brief.
-
----
-
-## Files Created
-
-| File | Purpose |
+| Artifact | Path |
 |---|---|
-| `src/components/merchant-center/SetupStatusCard.jsx` | Metric card UI ΓÇö title, value, optional caption, optional icon |
-
----
-
-## Interface
-
-```jsx
-<SetupStatusCard
-  title="Needs attention"
-  value="3 open items"
-  caption="Checklist incomplete"
-  icon={<SomeIcon className="w-4 h-4" />}  // optional
-/>
-```
+| Pinned PDF (source of truth) | `assets/irs/fw9.pdf` |
+| Public static copy | `public/irs/fw9.pdf` |
+| Field map (inspector output) | `assets/irs/fw9-field-map.md` |
+| Inspector script | `scripts/inspect-w9-fields.mjs` |
+| Fill helper | `src/lib/w9PdfFill.js` |
+| Tests | `src/lib/w9PdfFill.test.js` |
+| Dependency | `pdf-lib` in `package.json` |
+| Test script | `npm run test:w9` |
 
-**Props:**
+## Inspector findings
 
-| Prop | Type | Required | Default |
-|---|---|---|---|
-| `title` | string | yes | ΓÇö |
-| `value` | string | yes | ΓÇö |
-| `caption` | string | no | ΓÇö (hidden when falsy) |
-| `icon` | React node | no | `null` (icon slot hidden when falsy) |
+- **23 AcroForm fields** on page 0 (6-page PDF; only page 1 is fillable).
+- pdf-lib emits `Removing XFA form data` ΓÇö expected; AcroForm names are authoritative.
+- **No AcroForm fields** for Part II signature or date ΓÇö handled via manual page overlays documented in `fw9-field-map.md`.
 
----
+## `fillW9Pdf` behavior
 
-## Markup / Design
+1. Loads PDF bytes, sets text/checkbox fields per map.
+2. Maps `taxClassification` / `llcTaxClass` to Line 3a checkboxes; disregarded LLC (`D`) ΓåÆ Individual checkbox per IRS instructions.
+3. Splits TIN into SSN (3+2+4) or EIN (2+7) boxes by `tinType`.
+4. Draws signature PNG (or `signatureName` text fallback) and `signedAt` date on page 0.
+5. Calls `form.flatten()` before save.
 
-- Uses `cb-*` tokens only: `bg-cb-surface`, `rounded-cb`, `border-cb-border`, `text-cb-caption`, `text-cb-title`, `bg-cb-accent-muted`, `text-cb-accent`
-- Layout: flex row with text block (left) and optional icon badge (right)
-- Title: uppercase caption; value: `font-display` title with truncate; caption: normal-case caption with truncate
-- Min height `5.5rem` for consistent card row alignment
-- Icon slot: 36├ù36px muted gold background, accent-colored icon
+## Tests
 
----
+```
+npm run test:w9
+```
 
-## Tests
+Result: **20/20 pass** (includes Task 1 `w9Model` / `w9Prefill` suites matched by `w9*.test.js` glob).
 
-**N/A** ΓÇö pure presentational markup per brief. Smoke-check deferred to Task 4 dashboard wiring.
+Key assertions:
+- Filled output byte length > template.
+- Reloaded PDF has **0 editable fields** after flatten.
+- Minimal PNG signature embed succeeds.
 
----
+## Commit
 
-## Lint
+```
+feat(uw): pin IRS W-9 PDF and pdf-lib fill helper
+```
 
-No linter errors on `SetupStatusCard.jsx`.
+Files staged per brief + `public/irs/fw9.pdf`.
 
----
+## Concerns / follow-ups
 
-## Deviations
+1. **Signature/date coordinates** are manual overlays (no AcroForm widgets). Visual QA on a filled sample PDF recommended before Elavon submission.
+2. **XFA strip** ΓÇö pdf-lib drops XFA layer on load; AcroForm fill path verified by tests but not visually proofed.
+3. **Disregarded LLC (`D`)** maps to Individual checkbox at fill time; portal model still stores `llc` + `D` ΓÇö intentional per IRS W-9 instructions.
+4. Deno boarding function (Task 3+) must **inline** equivalent logic ΓÇö Base44 cannot import `w9PdfFill.js`.
 
-None. JSX copied exactly from task brief.
+## Not in scope (Task 3+)
 
----
+- HTTP endpoint / storage upload
+- Merchant UI for W-9 capture
+- Elavon underwriting request wiring
 
-## Next Steps (Task 4)
+## Review fix (2026-08-07)
 
-- Wire `deriveSetupStatusCards()` output into a grid of `<SetupStatusCard />` on the Merchant Center dashboard
-- Pass Lucide (or equivalent) icons per card id
-- Browser smoke-check layout at mobile and desktop breakpoints
+- Added `scripts/inspect-w9-widgets.mjs` (widget rects for overlay placement) ΓÇö referenced by field map.
+- Added `scripts/sync-w9-pdf.mjs` (`assets/irs/fw9.pdf` ΓåÆ `public/irs/fw9.pdf`).
+- Field map documents canonical PDF + sync; overlay coords tied to `w9PdfFill.js` constants.
+- `npm run test:w9`: **20/20 pass**.
+- Commit: `fix(uw): document W-9 overlay coords and PDF sync`
diff --git a/.superpowers/sdd/task-3-report.md b/.superpowers/sdd/task-3-report.md
index b41b3b2..6fe7b6e 100644
--- a/.superpowers/sdd/task-3-report.md
+++ b/.superpowers/sdd/task-3-report.md
@@ -1,8 +1,7 @@
-# Task 3 Report: Rebuild MerchantCenterShell (POS chrome)
+# Task 3 Report: UnderwritingRequest entity schema
 
 **Status:** DONE  
-**Branch:** `feature/merchant-center-pos-shell`  
-**Commit:** `e7a7e04` ΓÇö feat: rebuild MerchantCenterShell with POS-style sidebar  
-**Date:** 2026-07-24
+**Branch:** `feature/underwriting-w9-request`  
+**Date:** 2026-08-07
 
 ---
@@ -10,65 +9,57 @@
 ## Summary
 
-Rewrote `MerchantCenterShell.jsx` from fixed top header + `max-w-3xl` layout to POS-style chrome: fixed left sidebar (desktop), top bar, wide main canvas, and mobile bottom nav strip. All prop names unchanged; `dealHref` logic preserved.
+Added Base44 entity schema `UnderwritingRequest` for MID-scoped underwriting document requests (W-9 v1). Matches structure and description style of `Underwriting Message.jsonc`. All brief properties declared; required fields: `corporateId`, `midId`, `type`, `status`.
 
 ---
 
-## Files Modified
+## File Created
 
-| File | Change |
+| File | Purpose |
 |---|---|
-| `src/components/merchant-center/MerchantCenterShell.jsx` | Full layout rewrite |
+| `base44/entities/Underwriting Request.jsonc` | Entity schema for persistence in Base44 |
 
 ---
 
-## Layout
+## Schema highlights
 
-| Region | Classes / behavior |
+| Field | Notes |
 |---|---|
-| Outer | `portal-bg min-h-screen flex` |
-| Sidebar (md+) | `w-56 fixed`, `CliqbuxLogo`, nav links, Sign out footer |
-| Main column | `flex-1 md:pl-56 min-h-screen flex flex-col` |
-| Top bar | `h-14`, subtitle caption + title chip, Sign out on mobile |
-| Main content | `max-w-[1400px] mx-auto`, `pb-20` on mobile for bottom nav |
-| Mobile nav | Fixed bottom strip ΓÇö Setup / Locations / Account + checklist badge |
+| `type` | enum `w9` (extensible) |
+| `status` | `draft` \| `sent` \| `opened` \| `signed` \| `sent_to_elavon` \| `cancelled` \| `expired` \| `send_failed` ΓÇö default `draft` |
+| `channels` | string enum `email` \| `sms` \| `both` (matches `nudgeMerchant`, not array) |
+| `prefillSnapshot` | string (JSON blob) per brief |
+| `tokenHash` | never raw token |
+| Timestamps | `sentAt`, `openedAt`, `signedAt`, `sentToElavonAt`, `tokenExpiresAt` ΓÇö ISO strings |
 
 ---
 
-## Nav order
+## Deviations from design spec
 
-1. **Setup** ΓÇö only when `showDealLink && corporateId` (same `dealHref` as before)
-2. **Locations** ΓÇö `/locations?dealId=ΓÇª`
-3. **Account** ΓÇö `/account?dealId=ΓÇª`
-
-Active link: `bg-cb-accent-muted text-cb-accent`. Checklist badge: danger pill on Setup (sidebar + mobile).
+Design doc (`docs/superpowers/specs/2026-08-07-underwriting-w9-request-design.md`) lists `channels` as `['email']` \| `['sms']` \| `['email','sms']`. Task brief and user instruction require a **string** enum matching `nudgeMerchant`; implemented as `email` \| `sms` \| `both`.
 
 ---
 
-## Props (unchanged)
-
-`title`, `subtitle`, `corporateId`, `openChecklistCount`, `children`, `showDealLink`
-
----
+## Rollout (Teddy)
 
-## Tests
+**Publish entity** in Base44 Dashboard before live create/update works ΓÇö undeclared keys are stripped on save (AGENTS.md Lesson #4).
 
-**Manual check deferred** ΓÇö brief Step 2: verify `/locations` and `/account` after Task 5. No automated tests added.
+1. Push branch ΓåÆ GitHub Desktop as usual  
+2. Base44 Dashboard ΓåÆ Entities ΓåÆ publish `UnderwritingRequest`  
+3. Proceed to Task 4+ (`manageUnderwritingRequest`, `completeUnderwritingRequest`)
 
 ---
 
-## Lint
-
-No linter errors on `MerchantCenterShell.jsx`.
-
----
+## Commit
 
-## Concerns
+```
+feat(uw): add UnderwritingRequest entity schema
 
-- Top bar has no page-title prop yet (brief non-goal for v1); left side empty on desktop ΓÇö acceptable per spec.
-- Mobile bottom nav may overlap very tall sticky footers; `pb-20` on main should cover most cases.
+Teddy must Publish entity in Base44 Dashboard before live create works.
+```
 
 ---
 
-## Next Steps
+## Concerns / follow-ups
 
-- Task 4/5: wire dashboard content into wide canvas; browser smoke at `/locations` and `/account`.
+- None blocking. Functions in later tasks should treat `prefillSnapshot` as JSON.parse/stringify at boundaries.
+- Uniqueness rule (one non-terminal request per `midId` + `type`) is enforced in application code, not entity schema.
diff --git a/.superpowers/sdd/task-4-report.md b/.superpowers/sdd/task-4-report.md
index 1466f4c..5acd0d8 100644
--- a/.superpowers/sdd/task-4-report.md
+++ b/.superpowers/sdd/task-4-report.md
@@ -1,8 +1,8 @@
-# Task 4 Report: Compose Setup dashboard grid
+# Task 4 Report: `manageUnderwritingRequest` (admin)
 
-**Status:** DONE  
-**Branch:** `feature/merchant-center-pos-shell`  
-**Commit:** `8ea97d5` (+ follow-up: showDealLink true) ΓÇö feat: compose Setup dashboard grid in PostSubmissionDashboard  
-**Date:** 2026-07-24
+**Status:** DONE_WITH_CONCERNS  
+**Branch:** `feature/underwriting-w9-request`  
+**Commit:** (see git log ΓÇö `feat(uw): admin manageUnderwritingRequest send and Elavon forward`)  
+**Date:** 2026-08-07
 
 ---
@@ -10,85 +10,59 @@
 ## Summary
 
-Recomposed `PostSubmissionDashboard` into a POS-style Setup layout: compact submitted banner, four status metric cards, two-column checklist/quote grid, full-width underwriting + menu/legacy gates. All data hooks, quote polling, SetupGate unlock rules, and celebration confetti preserved unchanged.
+Implemented admin-only `base44/functions/manageUnderwritingRequest/entry.ts` with all brief actions: `list`, `create`, `send`, `resend`, `cancel`, `getSignedUrl`, `sendToElavon`. Prefill/validation helpers inlined from `src/lib/w9Prefill.js` + `w9Model.js` behind sync markers. Resend/Quo patterns copied from `nudgeMerchant`; Gmail token refresh + merchant-JWT rejection from `syncUnderwritingMail`.
 
 ---
 
-## Files Modified
+## File Created
 
-| File | Change |
+| File | Purpose |
 |---|---|
-| `src/pages/PostSubmissionDashboard.jsx` | Layout-only recomposition |
+| `base44/functions/manageUnderwritingRequest/entry.ts` | Admin Deal Room underwriting request API |
 
 ---
 
-## Layout (top ΓåÆ bottom)
+## Actions
 
-1. **Compact banner** ΓÇö ΓÇ£Application submittedΓÇ¥ / ΓÇ£Setup previewΓÇ¥ + legal name (replaces tall centered hero; confetti still fires once per session)
-2. **FormsLockedBanner** ΓÇö agent-only unlock when forms locked
-3. **Status row** ΓÇö `grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3` of `SetupStatusCard`
-4. **Two-column grid** (`lg:grid-cols-12 gap-4`)
-   - Left `lg:col-span-7`: `MerchantChecklist` + `MerchantBeforeInstall`
-   - Right `lg:col-span-5`: `EquipmentOrderPanel` + Shipping `SetupGate`
-5. **UnderwritingTracker** ΓÇö full width when MIDs exist
-6. **Menu + Legacy POS** ΓÇö full-width `SetupGate` stack (same unlock: `quoteSigned`)
-7. Footer caption
-
-**Removed:** `ApplicationTracker` (redundant with status cards + `UnderwritingTracker`)
-
-**Shell:** `showDealLink` so Setup stays in sidebar/mobile nav (active state while on this page)
-
----
-
-## How status cards get their props
-
-`deriveSetupStatusCards()` is called once before render with existing page state:
-
-| Input | Source |
+| Action | Behavior |
 |---|---|
-| `openChecklistCount` | `MerchantChecklist` ΓåÆ `onOpenCountChange` callback |
-| `merchantIDs` | `getMerchantData` load |
-| `locations` | `getMerchantData` load |
-| `quoteLifecycle` | `deriveQuoteFlags(quoteData, profile).lifecycle` |
-| `quotePaid` | `deriveQuoteFlags(quoteData, profile).quotePaid` |
-| `shippingStatus` | `profile.equipmentShippingStatus` or `'ready_to_ship'` when paid else `'hold'` |
-| `trackingNumber` | First location with `shippingTrackingNumber` |
-
-Cards rendered with Lucide icons: ClipboardList (attention), Shield (underwriting), FileSignature (quote), Truck (shipping).
+| `list` | Filter by `corporateId` (+ optional `midId`); strip `tokenHash`; derive `tinMasked` (last-4) from `prefillSnapshot`; return `elavonDocsToHint` from env if set |
+| `create` | Resolve legal entity (account ΓåÆ profile), build W-9 prefill, cancel other non-terminal same `midId`+`type`, status `draft`, return request + full `prefill` |
+| `send` / `resend` | Channel validation; cancel other non-terminal; `sha256(token + MERCHANT_JWT_SECRET)` ΓåÆ `tokenHash`; link `${PUBLIC_APP_URL}/uw/{token}`; Resend and/or Quo (SMS never includes TIN); status `sent` or `send_failed` |
+| `cancel` | ΓåÆ `cancelled` (refuses if already signed) |
+| `getSignedUrl` | `{ signedPdfUrl }` when status `signed` \| `sent_to_elavon` |
+| `sendToElavon` | Require agent-supplied `to`/`subject`/`bodyText` (no invented To); fetch PDF; Gmail multipart MIME send; log `UnderwritingMessage` outbound; status `sent_to_elavon`. Missing `gmail.send` ΓåÆ HTTP 503 + reconnect hint |
 
 ---
 
-## Preserved (no changes)
+## Auth
 
-- All `useEffect` loaders, HubSpot sync gateway, TanStack `hubspotQuote` query
-- 10s quote poll while `QuoteSignModal` open
-- `SetupGate` states: shipping (`quotePaid` / `quoteSigned`), menu/legacy (`quoteSigned`)
-- `EquipmentShippingModal`, `InventoryUpload`, `ConnectLegacyPOS`, `EquipmentOrderPanel`
-- `fireSubmissionCelebration` on merchant submit
-- Agent preview redirect / demote unlock flow
+- `requireAdmin`: valid merchant JWT ΓåÆ reject; workspace `auth.me()` required (same as `syncUnderwritingMail`).
 
 ---
 
-## Tests
-
-**Manual verify deferred** ΓÇö load `/onboarding/dashboard?dealId=ΓÇª` with merchant JWT or impersonation; confirm status cards, quote poll, and gate locks.
+## Smoke / verification
 
-No automated tests added (layout-only).
-
----
+**Not live-smoked** in this session:
 
-## Lint
+- Resend / Quo delivery against published function
+- Gmail `messages/send` with real OAuth (needs `gmail.send` re-consent)
+- Entity create/list against Base44 (entity may be unpublished)
 
-No linter errors on `PostSubmissionDashboard.jsx`.
+Code path complete; blocked on publish + env until Teddy redeploys.
 
 ---
 
-## Residual risks
+## Concerns / follow-ups
 
-- Status card underwriting aggregate is heuristic (worst MID status); may not match every edge case in `UnderwritingTracker` detail rows.
-- Manual smoke not run in this session against live deal data.
+1. **Publish `UnderwritingRequest`** in Base44 before live writes (503 `ENTITY_SCHEMA_MISSING` until then).
+2. **Gmail OAuth** must include `gmail.send`; reconnect + refresh token update documented for `docs/underwriting-inbox.md` (later plan task).
+3. **`UNDERWRITING_ELAVON_DOCS_TO`** returned as UI hint only ΓÇö agent must still pass `to` on `sendToElavon`.
+4. **Signed PDF fetch** for Elavon attach uses bare `fetch(signedPdfUrl)` ΓÇö if Base44 private URLs need auth headers, Task 5/upload path may need a signed/proxy fetch.
+5. Raw magic token is **not** returned in JSON (delivered via email/SMS only).
+6. **Fixed:** `stripTinFromListRow` no longer passes through unparsed `prefillSnapshot` when `parsePrefillSnapshot` fails ΓÇö field omitted instead of leaking raw TIN JSON (`fix(uw): redact unparseable W-9 prefill snapshots on list`).
 
 ---
 
-## Next steps
+## Next
 
-- Task 5: adopt shell on Locations / Account pages; browser smoke all three nav destinations.
+Task 5+ (`completeUnderwritingRequest`, merchant `/uw/:token`, Deal Room panel) ΓÇö not started here.
diff --git a/.superpowers/sdd/task-5-report.md b/.superpowers/sdd/task-5-report.md
index 0c22f9d..628952a 100644
--- a/.superpowers/sdd/task-5-report.md
+++ b/.superpowers/sdd/task-5-report.md
@@ -1,8 +1,8 @@
-# Task 5 Report: Underwriting table polish
+# Task 5 Report: `completeUnderwritingRequest` (token + PDF)
 
-**STATUS:** DONE  
-**Branch:** `feature/merchant-center-pos-shell`  
-**COMMIT:** `b40f729` ΓÇö feat: widen UnderwritingTracker with MID rows table  
-**Date:** 2026-07-24
+**Status:** DONE  
+**Branch:** `feature/underwriting-w9-request`  
+**Commit:** `feat(uw): token-gated W-9 complete and PDF stamp`  
+**Date:** 2026-08-07
 
 ---
@@ -10,32 +10,63 @@
 ## Summary
 
-Polished `UnderwritingTracker` for the wide Merchant Center canvas: removed the centered width cap and added a POS-style Account / Status / MID table below the existing stage progress strip, using the same `items` array already in the component.
+Implemented token-gated `base44/functions/completeUnderwritingRequest/entry.ts` with `get` + `submitSignature`. Token hashing matches Task 4 (`sha256(rawToken + MERCHANT_JWT_SECRET)` hex). PDF fill inlined from `src/lib/w9PdfFill.js`; template fetched from `${PUBLIC_APP_URL}/irs/fw9.pdf` (fallbacks included). Signed PDF uploaded via `asServiceRole.integrations.Core.UploadFile` and stored only when the URL is public `https://` (Task 4 Elavon-attach carry).
 
 ---
 
-## Files Modified
+## File Created
 
-| File | Change |
+| File | Purpose |
 |---|---|
-| `src/components/onboarding/UnderwritingTracker.jsx` | Removed `max-w-3xl mx-auto`; added MID rows table with empty state |
+| `base44/functions/completeUnderwritingRequest/entry.ts` | Merchant magic-link W-9 get + sign |
+
+`public/irs/fw9.pdf` already present (synced from `assets/irs/fw9.pdf`) ΓÇö included in commit if dirty.
+
+---
+
+## Actions
+
+| Action | Behavior |
+|---|---|
+| `get` | Hash token ΓåÆ lookup; cancelled/invalid ΓåÆ 410/404; expired (unsigned) ΓåÆ 410 + mark `expired`; signed ΓåÆ `{ status, fields, signedPdfUrl, viewOnly: true }`; else mark `opened` once, return full TIN fields + `agentNote` + optional `midLabel` + `expiresAt` |
+| `submitSignature` | Validate fields; require PNG data URL or typed `signatureName`; if already signed ΓåÆ existing URL (`idempotent: true`); fill+flatten PDF; UploadFile; persist `signed` / `signedPdfUrl` / `prefillSnapshot` / `signedAt` |
+
+`saveDraft` omitted (optional per plan/spec).
+
+---
+
+## Auth
+
+- **Token only** ΓÇö no `auth.me()`, no merchant JWT gate.
+- Same `hashToken` formula as `manageUnderwritingRequest`.
+
+---
+
+## Task 4 carry (signedPdfUrl)
+
+`uploadSignedPdf` rejects non-`https://` UploadFile results so `sendToElavon` can bare-`fetch` the PDF for Gmail attach.
+
+---
+
+## Smoke / verification (not live)
+
+**Idempotent re-submit plan** (after publish + entity live):
+
+1. Admin `send` a W-9 ΓåÆ open `/uw/{token}` (or invoke `get`).
+2. `submitSignature` with valid fields + PNG ΓåÆ note `signedPdfUrl`.
+3. Call `submitSignature` again with same token ΓåÆ expect same URL + `idempotent: true`.
+4. `get` ΓåÆ `viewOnly: true` + same URL.
+5. Confirm `curl -I signedPdfUrl` returns 200 (public https).
 
 ---
 
-## What changed
+## Concerns / follow-ups
 
-1. **Full width** ΓÇö outer wrapper is now `w-full` only (no `max-w-3xl mx-auto`).
-2. **MID rows table** ΓÇö below the stage strip, inside the same card:
-   - Columns: Account, Status, MID
-   - Empty state: ΓÇ£No processing accounts yetΓÇ¥
-   - Dot + caption status per row (status-specific dot colors aligned with `LocationStatusTable`)
-   - Account label: `merchantName || dbaName || 'Processing account'`
-   - MID column: `elavonMID` or em dash
-3. **Unchanged** ΓÇö props (`locations`, `merchantIDs`), stage progress header, and stage calculation logic.
+1. Publish/redeploy function + `UnderwritingRequest` entity before live use.
+2. Visual QA of signature/date overlays still deferred (Task 2 carry).
+3. Task 6 merchant page not started here.
 
 ---
 
-## Residual risks
+## Next
 
-- **Legacy locations fallback:** when `merchantIDs` is empty, table rows use location records ΓÇö Account shows `dbaName`, Status uses `applicationStepStatus`, MID column stays em dash until Elavon assigns MIDs.
-- **Status dot colors:** brief showed a single `bg-cb-accent` dot; implementation uses per-status dot colors (same palette as `LocationStatusTable`) for clearer scanning on wide layouts.
-- **No automated test** for table rendering; visual QA on Setup dashboard with 0 / 1 / many MIDs recommended.
+Task 6 ΓÇö `/uw/:token` merchant UI.
diff --git a/.superpowers/sdd/task-8-report.md b/.superpowers/sdd/task-8-report.md
new file mode 100644
index 0000000..902679a
--- /dev/null
+++ b/.superpowers/sdd/task-8-report.md
@@ -0,0 +1,48 @@
+# Task 8 Report: Docs + Gmail scope + agent briefing
+
+**STATUS:** DONE  
+**Branch:** `feature/underwriting-w9-request`  
+**Date:** 2026-08-07
+
+---
+
+## Summary
+
+Documented W-9 underwriting request flow, Gmail **`gmail.send`** scope upgrade, and `UNDERWRITING_ELAVON_DOCS_TO` env in repo docs and agent briefing. Vault `merchant-center.md` linked to the design spec.
+
+---
+
+## Files changed
+
+| File | Change |
+|---|---|
+| `docs/underwriting-inbox.md` | Scopes (`readonly` + `send`); env `UNDERWRITING_ELAVON_DOCS_TO`; W-9 flow + spec pointers; entity/function list |
+| `AGENTS.md` | UnderwritingRequest W-9 subsection under Deal Room |
+| `AI_CHANNEL.md` | Appended ops note (append-only) |
+| `Cliqbux Second Brain/specs/merchant-center.md` | Behavior link to repo W-9 design spec |
+
+---
+
+## Teddy checklist (live)
+
+1. **Republish** `UnderwritingRequest` entity in Base44 Dashboard  
+2. **Re-consent** underwriting@ Google OAuth with `gmail.readonly` + `gmail.send`; paste new `UNDERWRITING_GMAIL_REFRESH_TOKEN`  
+3. Set **`UNDERWRITING_ELAVON_DOCS_TO`** when Elavon docs inbox is confirmed (optional until then)  
+4. Push via GitHub Desktop + **redeploy** `manageUnderwritingRequest`, `completeUnderwritingRequest`, frontend  
+5. **Smoke one test MID:** Deal Room ΓåÆ New W-9 ΓåÆ merchant signs `/uw/:token` ΓåÆ Download ΓåÆ Send to Elavon ΓåÆ verify PDF attachment + `UnderwritingMessage` outbound row  
+
+---
+
+## Commit
+
+`docs(uw): W-9 underwriting request and Gmail send scopes`
+
+No push (per task brief).
+
+---
+
+## Review fix (Critical/Important #8)
+
+Commit `282bd28` rewrote earlier `AI_CHANNEL.md` entries (encoding/punctuation). Restored file from `b51885e` and re-appended only the `[CURSOR] ΓÇö 2026-08-07` W-9 entry at EOF. Verified: `git diff b51885e HEAD -- AI_CHANNEL.md` shows append-only hunks.
+
+Fix commit: `fix(uw): restore AI_CHANNEL append-only hygiene`
diff --git a/AGENTS.md b/AGENTS.md
index 94b246e..26813c5 100644
--- a/AGENTS.md
+++ b/AGENTS.md
@@ -443,4 +443,6 @@ Quick Stage prompts for **parent company name** ΓåÆ creates HubSpot company + de
 **Deal Room v1 + phase 2:** `/admin/applications/:corporateId` ΓÇö notes, tasks, snapshot, **per-MID Elavon AWB + underwriting message threads**. Gmail sync of underwriting@ via `syncUnderwritingMail` (see `docs/underwriting-inbox.md`). Manual log works without Gmail env.
 
+**UnderwritingRequest W-9 (2026-08-07):** Deal Room **Underwriting requests** panel (selected MID) ΓÇö agent sends W-9 invite (email/SMS/both) via `manageUnderwritingRequest`; merchant signs at `/uw/:token` via `completeUnderwritingRequest` (in-house e-sign + stamped IRS PDF, not BoldSign). Signed PDF: Download or **Send to Elavon** from underwriting@ (Gmail **`gmail.send`** scope + optional env `UNDERWRITING_ELAVON_DOCS_TO` for default To). One active unsigned request per MID+`w9`; does **not** replace checklist **Request document**. Entity `UnderwritingRequest` must be republished in Base44. Spec: `docs/superpowers/specs/2026-08-07-underwriting-w9-request-design.md`; ops: `docs/underwriting-inbox.md` ┬º W-9.
+
 ### Architecture: MerchantMID
 Clean three-layer model: Profile Γ₧ö Locations Γ₧ö MerchantMIDs.
diff --git a/assets/irs/fw9-field-map.md b/assets/irs/fw9-field-map.md
new file mode 100644
index 0000000..9dd2be9
--- /dev/null
+++ b/assets/irs/fw9-field-map.md
@@ -0,0 +1,93 @@
+# IRS Form W-9 (fw9.pdf) AcroForm field map
+
+Source PDF: `assets/irs/fw9.pdf` (copy of IRS `fw9`, Rev. March 2024). **Canonical copy** ΓÇö after updating, run `node scripts/sync-w9-pdf.mjs` to refresh `public/irs/fw9.pdf`.  
+Inspectors: `node scripts/inspect-w9-fields.mjs` (field names), `node scripts/inspect-w9-widgets.mjs` (widget rects).  
+Page 0 size: **611.976 ├ù 791.968 pt**. pdf-lib strips XFA on load (warning is expected).
+
+## Domain ΓåÆ AcroForm mapping
+
+Keys match `emptyW9Fields()` in `src/lib/w9Model.js`.
+
+| Domain key | AcroForm field | Type | Notes |
+|---|---|---|---|
+| `name` | `topmostSubform[0].Page1[0].f1_01[0]` | text | Line 1 ΓÇö Name |
+| `businessName` | `topmostSubform[0].Page1[0].f1_02[0]` | text | Line 2 ΓÇö Business / disregarded entity name |
+| `taxClassification` | see checkboxes below | checkbox | Line 3a federal tax classification |
+| `llcTaxClass` | `topmostSubform[0].Page1[0].Boxes3a-b_ReadOrder[0].f1_03[0]` | text (max 1) | LLC box only: `C`, `S`, or `P` |
+| `otherClassification` | `topmostSubform[0].Page1[0].Boxes3a-b_ReadOrder[0].f1_04[0]` | text | Other box only |
+| `exemptPayeeCode` | `topmostSubform[0].Page1[0].f1_05[0]` | text | Line 4 ΓÇö Exempt payee code |
+| `fatcaCode` | `topmostSubform[0].Page1[0].f1_06[0]` | text | Line 4 ΓÇö FATCA reporting code |
+| `address` | `topmostSubform[0].Page1[0].Address_ReadOrder[0].f1_07[0]` | text | Line 5 ΓÇö Address |
+| `city` + `state` + `zip` | `topmostSubform[0].Page1[0].Address_ReadOrder[0].f1_08[0]` | text | Line 6 ΓÇö combined `"City, ST ZIP"` |
+| `tin` (SSN) | `f1_11[0]` + `f1_12[0]` + `f1_13[0]` | text | 3 + 2 + 4 digits |
+| `tin` (EIN) | `f1_14[0]` + `f1_15[0]` | text | 2 + 7 digits |
+| `signatureName` / PNG | manual overlay | draw | Part II ΓÇö no AcroForm field (see overlay) |
+| `signedAt` | manual overlay | draw | Part II date ΓÇö no AcroForm field |
+
+Optional fields not mapped to portal model: `f1_09[0]` (account numbers), `f1_10[0]` (requester), `c1_2[0]` (3b foreign partners).
+
+### Line 3a checkboxes (`c1_1[n]`)
+
+Full prefix: `topmostSubform[0].Page1[0].Boxes3a-b_ReadOrder[0].c1_1`
+
+| Index | W-9 label | `taxClassification` |
+|---|---|---|
+| `[0]` | Individual / sole proprietor | `individual` ΓÇö also used when `llc` + `llcTaxClass` `D` (disregarded LLC per IRS instructions) |
+| `[1]` | C Corporation | `c_corp` |
+| `[2]` | S Corporation | `s_corp` |
+| `[3]` | Partnership | `partnership` |
+| `[4]` | Trust / estate | `trust` |
+| `[5]` | Limited liability company | `llc` (when class is C, S, or P) |
+| `[6]` | Other | `other` |
+
+## TIN split
+
+Digits only from `tin` (9 digits). `tinType`:
+
+- **`ein`**: `f1_14[0]` = first 2, `f1_15[0]` = last 7
+- **`ssn`**: `f1_11[0]` = first 3, `f1_12[0]` = next 2, `f1_13[0]` = last 4
+
+## Signature & date overlays (page 0)
+
+No AcroForm fields exist for Part II signature/date. `fillW9Pdf` draws after field fill, before `form.flatten()`.
+
+Widget probe (`node scripts/inspect-w9-widgets.mjs`): lowest AcroForm widget is EIN row `f1_14[0]` at **y Γëê 348**. Part II ΓÇ£Sign HereΓÇ¥ sits below certification text ΓÇö overlay coords are placed manually below that row and kept in sync with `W9_SIGNATURE_OVERLAY` / `W9_DATE_OVERLAY` in `src/lib/w9PdfFill.js`.
+
+| Overlay | x | y | width | height | Content |
+|---|---|---|---|---|---|
+| Signature image | 130 | 248 | 280 | 36 | PNG bytes (`signaturePngBytes`); if omitted, `signatureName` as 10pt text |
+| Date | 468 | 258 | 100 | 14 | `signedAt` formatted `MM/DD/YYYY` (10pt text) |
+
+Coordinates are PDF bottom-left origin (pdf-lib default).
+
+## Flatten
+
+Always call `form.flatten()` before save so Elavon receives a non-editable PDF.
+
+## Raw inspector output (2026-08-07)
+
+```
+topmostSubform[0].Page1[0].f1_01[0]	PDFTextField
+topmostSubform[0].Page1[0].f1_02[0]	PDFTextField
+topmostSubform[0].Page1[0].Boxes3a-b_ReadOrder[0].c1_1[0]	PDFCheckBox
+topmostSubform[0].Page1[0].Boxes3a-b_ReadOrder[0].c1_1[1]	PDFCheckBox
+topmostSubform[0].Page1[0].Boxes3a-b_ReadOrder[0].c1_1[2]	PDFCheckBox
+topmostSubform[0].Page1[0].Boxes3a-b_ReadOrder[0].c1_1[3]	PDFCheckBox
+topmostSubform[0].Page1[0].Boxes3a-b_ReadOrder[0].c1_1[4]	PDFCheckBox
+topmostSubform[0].Page1[0].Boxes3a-b_ReadOrder[0].c1_1[5]	PDFCheckBox
+topmostSubform[0].Page1[0].Boxes3a-b_ReadOrder[0].f1_03[0]	PDFTextField (maxLen=1)
+topmostSubform[0].Page1[0].Boxes3a-b_ReadOrder[0].c1_1[6]	PDFCheckBox
+topmostSubform[0].Page1[0].Boxes3a-b_ReadOrder[0].f1_04[0]	PDFTextField
+topmostSubform[0].Page1[0].Boxes3a-b_ReadOrder[0].c1_2[0]	PDFCheckBox
+topmostSubform[0].Page1[0].f1_05[0]	PDFTextField
+topmostSubform[0].Page1[0].f1_06[0]	PDFTextField
+topmostSubform[0].Page1[0].Address_ReadOrder[0].f1_07[0]	PDFTextField
+topmostSubform[0].Page1[0].Address_ReadOrder[0].f1_08[0]	PDFTextField
+topmostSubform[0].Page1[0].f1_09[0]	PDFTextField
+topmostSubform[0].Page1[0].f1_10[0]	PDFTextField
+topmostSubform[0].Page1[0].f1_11[0]	PDFTextField (maxLen=3)
+topmostSubform[0].Page1[0].f1_12[0]	PDFTextField (maxLen=2)
+topmostSubform[0].Page1[0].f1_13[0]	PDFTextField (maxLen=4)
+topmostSubform[0].Page1[0].f1_14[0]	PDFTextField (maxLen=2)
+topmostSubform[0].Page1[0].f1_15[0]	PDFTextField (maxLen=7)
+```
diff --git a/base44/entities/Underwriting Request.jsonc b/base44/entities/Underwriting Request.jsonc
new file mode 100644
index 0000000..861d7e8
--- /dev/null
+++ b/base44/entities/Underwriting Request.jsonc	
@@ -0,0 +1,115 @@
+{
+  "name": "UnderwritingRequest",
+  "type": "object",
+  "description": "MID-scoped underwriting document requests (W-9 first). Agent creates in Deal Room; merchant completes via magic link at /uw/:token.",
+  "properties": {
+    "corporateId": {
+      "type": "string",
+      "description": "FK ΓåÆ MerchantCorporateProfile.corporateId (HubSpot deal id)"
+    },
+    "merchantAccountId": {
+      "type": "string",
+      "description": "FK ΓåÆ MerchantAccount.id ΓÇö optional; set when profile is linked to an account"
+    },
+    "midId": {
+      "type": "string",
+      "description": "FK ΓåÆ MerchantMID.id ΓÇö request is scoped to one MID"
+    },
+    "legalEntityId": {
+      "type": "string",
+      "description": "entityId from profile/account legalEntities[] used for W-9 prefill"
+    },
+    "type": {
+      "type": "string",
+      "enum": ["w9"],
+      "description": "Request kind ΓÇö extensible; v1 ships w9 only"
+    },
+    "status": {
+      "type": "string",
+      "enum": [
+        "draft",
+        "sent",
+        "opened",
+        "signed",
+        "sent_to_elavon",
+        "cancelled",
+        "expired",
+        "send_failed"
+      ],
+      "default": "draft",
+      "description": "Lifecycle: draft ΓåÆ sent ΓåÆ opened ΓåÆ signed ΓåÆ sent_to_elavon; send_failed / cancelled / expired are terminal or retry paths"
+    },
+    "recipientName": {
+      "type": "string",
+      "description": "Display name for the merchant contact receiving the request"
+    },
+    "recipientEmail": {
+      "type": "string",
+      "description": "Email for Resend delivery ΓÇö required when channels includes email"
+    },
+    "recipientPhone": {
+      "type": "string",
+      "description": "E.164 phone for Quo SMS ΓÇö required when channels includes sms"
+    },
+    "channels": {
+      "type": "string",
+      "enum": ["email", "sms", "both"],
+      "default": "both",
+      "description": "Delivery channels ΓÇö same vocabulary as nudgeMerchant"
+    },
+    "agentNote": {
+      "type": "string",
+      "description": "Optional note shown in email/SMS and on the merchant /uw page"
+    },
+    "prefillSnapshot": {
+      "type": "string",
+      "description": "JSON string of W-9 field values at send; updated to final values on sign"
+    },
+    "tokenHash": {
+      "type": "string",
+      "description": "HMAC/SHA hash of opaque magic-link token ΓÇö never store raw token"
+    },
+    "tokenExpiresAt": {
+      "type": "string",
+      "description": "ISO 8601 expiry ΓÇö default 7 days from send"
+    },
+    "signedPdfUrl": {
+      "type": "string",
+      "description": "Base44 private file URL or id for the stamped signed W-9 PDF"
+    },
+    "sentAt": {
+      "type": "string",
+      "description": "ISO timestamp when email/SMS was dispatched"
+    },
+    "openedAt": {
+      "type": "string",
+      "description": "ISO timestamp when merchant first opened /uw/:token"
+    },
+    "signedAt": {
+      "type": "string",
+      "description": "ISO timestamp when merchant submitted signature"
+    },
+    "sentToElavonAt": {
+      "type": "string",
+      "description": "ISO timestamp when signed PDF was emailed to Elavon via Gmail"
+    },
+    "elavonGmailMessageId": {
+      "type": "string",
+      "description": "Gmail message id after successful sendToElavon (dedup / audit)"
+    },
+    "createdByEmail": {
+      "type": "string",
+      "description": "CliqBux agent workspace email that created the request"
+    },
+    "lastError": {
+      "type": "string",
+      "description": "Last channel or Gmail failure message ΓÇö ops-visible for send_failed / retry"
+    }
+  },
+  "required": [
+    "corporateId",
+    "midId",
+    "type",
+    "status"
+  ]
+}
diff --git a/base44/functions/completeUnderwritingRequest/entry.ts b/base44/functions/completeUnderwritingRequest/entry.ts
new file mode 100644
index 0000000..be2c4a0
--- /dev/null
+++ b/base44/functions/completeUnderwritingRequest/entry.ts
@@ -0,0 +1,665 @@
+/**
+ * completeUnderwritingRequest ΓÇö token-gated merchant W-9 complete + PDF stamp.
+ *
+ * Actions:
+ *   get             { token }
+ *   submitSignature { token, fields, signatureDataUrl }
+ *
+ * Auth: opaque magic-link token only ΓÇö NO auth.me() / merchant JWT gate.
+ * Token store: sha256(token + MERCHANT_JWT_SECRET) ΓåÆ tokenHash (same as manageUnderwritingRequest).
+ *
+ * PDF: fetch pinned fw9 from PUBLIC_APP_URL (/irs/fw9.pdf), fill via inlined pdf-lib
+ * (sync with src/lib/w9PdfFill.js + assets/irs/fw9-field-map.md), UploadFile ΓåÆ https signedPdfUrl.
+ */
+import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
+import { PDFDocument, StandardFonts, rgb } from 'npm:pdf-lib@1.17.1';
+
+const SIGNED_STATUSES = new Set(['signed', 'sent_to_elavon']);
+const OPENABLE_STATUSES = new Set(['sent', 'opened', 'send_failed']);
+const MAX_SIGNATURE_BYTES = Math.floor(2 * 1024 * 1024);
+
+// --- BEGIN w9Model validate (sync with src/lib/w9Model.js) ---
+
+function emptyW9Fields() {
+  return {
+    name: '',
+    businessName: '',
+    taxClassification: '',
+    llcTaxClass: '',
+    otherClassification: '',
+    exemptPayeeCode: '',
+    fatcaCode: '',
+    address: '',
+    city: '',
+    state: '',
+    zip: '',
+    tinType: 'ein',
+    tin: '',
+    signatureName: '',
+    signedAt: '',
+  };
+}
+
+function validateW9Fields(fields: any): { ok: boolean; errors: string[] } {
+  const errors: string[] = [];
+  const f = fields || {};
+
+  if (!String(f.name || '').trim()) errors.push('Name is required');
+  if (!String(f.address || '').trim()) errors.push('Address is required');
+  if (!String(f.city || '').trim()) errors.push('City is required');
+  if (!String(f.state || '').trim()) errors.push('State is required');
+  if (!String(f.zip || '').trim()) errors.push('ZIP is required');
+  if (!String(f.taxClassification || '').trim()) errors.push('Tax classification is required');
+
+  const tinDigits = String(f.tin || '').replace(/\D/g, '');
+  if (!tinDigits) {
+    errors.push('TIN is required');
+  } else if (tinDigits.length !== 9) {
+    errors.push('TIN must be 9 digits');
+  }
+
+  return { ok: errors.length === 0, errors };
+}
+
+// --- END w9Model validate ---
+
+// --- BEGIN w9PdfFill (sync with src/lib/w9PdfFill.js + assets/irs/fw9-field-map.md) ---
+
+const P = 'topmostSubform[0].Page1[0]';
+const BOXES = `${P}.Boxes3a-b_ReadOrder[0]`;
+
+const W9_ACROFORM = {
+  name: `${P}.f1_01[0]`,
+  businessName: `${P}.f1_02[0]`,
+  taxCheckboxes: [
+    `${BOXES}.c1_1[0]`,
+    `${BOXES}.c1_1[1]`,
+    `${BOXES}.c1_1[2]`,
+    `${BOXES}.c1_1[3]`,
+    `${BOXES}.c1_1[4]`,
+    `${BOXES}.c1_1[5]`,
+    `${BOXES}.c1_1[6]`,
+  ],
+  llcTaxClass: `${BOXES}.f1_03[0]`,
+  otherClassification: `${BOXES}.f1_04[0]`,
+  exemptPayeeCode: `${P}.f1_05[0]`,
+  fatcaCode: `${P}.f1_06[0]`,
+  address: `${P}.Address_ReadOrder[0].f1_07[0]`,
+  cityStateZip: `${P}.Address_ReadOrder[0].f1_08[0]`,
+  ssn1: `${P}.f1_11[0]`,
+  ssn2: `${P}.f1_12[0]`,
+  ssn3: `${P}.f1_13[0]`,
+  ein1: `${P}.f1_14[0]`,
+  ein2: `${P}.f1_15[0]`,
+};
+
+const W9_SIGNATURE_OVERLAY = { pageIndex: 0, x: 130, y: 248, width: 280, height: 36 };
+const W9_DATE_OVERLAY = { pageIndex: 0, x: 468, y: 258, fontSize: 10 };
+
+const TAX_CLASS_TO_CHECKBOX: Record<string, number> = {
+  individual: 0,
+  c_corp: 1,
+  s_corp: 2,
+  partnership: 3,
+  trust: 4,
+  llc: 5,
+  other: 6,
+};
+
+function setText(form: any, fieldName: string, value: unknown) {
+  const text = String(value ?? '').trim();
+  if (!text) return;
+  form.getTextField(fieldName).setText(text);
+}
+
+function splitTin(tin: unknown): string {
+  const digits = String(tin ?? '').replace(/\D/g, '').slice(0, 9);
+  return digits.length === 9 ? digits : '';
+}
+
+function formatCityStateZip(city: unknown, state: unknown, zip: unknown): string {
+  const c = String(city ?? '').trim();
+  const s = String(state ?? '').trim().toUpperCase();
+  const z = String(zip ?? '').trim();
+  if (!c && !s && !z) return '';
+  const parts = [c, [s, z].filter(Boolean).join(' ')].filter(Boolean);
+  return parts.join(', ');
+}
+
+function formatSignedDate(signedAt: unknown): string {
+  const raw = String(signedAt ?? '').trim();
+  if (!raw) return '';
+
+  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
+  if (iso) return `${iso[2]}/${iso[3]}/${iso[1]}`;
+
+  const slash = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
+  if (slash) {
+    const mm = slash[1].padStart(2, '0');
+    const dd = slash[2].padStart(2, '0');
+    return `${mm}/${dd}/${slash[3]}`;
+  }
+
+  return raw;
+}
+
+function resolveTaxCheckbox(fields: any) {
+  const tax = String(fields.taxClassification ?? '').trim().toLowerCase();
+  if (tax === 'llc' && String(fields.llcTaxClass ?? '').toUpperCase() === 'D') {
+    return { checkboxIndex: 0, llcLetter: '', useOther: false };
+  }
+  if (tax === 'llc') {
+    const letter = String(fields.llcTaxClass ?? '').toUpperCase().slice(0, 1);
+    return {
+      checkboxIndex: 5,
+      llcLetter: letter === 'C' || letter === 'S' || letter === 'P' ? letter : '',
+      useOther: false,
+    };
+  }
+  if (tax === 'other') {
+    return { checkboxIndex: 6, llcLetter: '', useOther: true };
+  }
+  const idx = TAX_CLASS_TO_CHECKBOX[tax];
+  if (idx == null) return { checkboxIndex: -1, llcLetter: '', useOther: false };
+  return { checkboxIndex: idx, llcLetter: '', useOther: false };
+}
+
+function applyTaxClassification(form: any, fields: any) {
+  const { checkboxIndex, llcLetter, useOther } = resolveTaxCheckbox(fields);
+  if (checkboxIndex < 0) return;
+
+  form.getCheckBox(W9_ACROFORM.taxCheckboxes[checkboxIndex]).check();
+
+  if (llcLetter) {
+    setText(form, W9_ACROFORM.llcTaxClass, llcLetter);
+  }
+  if (useOther) {
+    setText(form, W9_ACROFORM.otherClassification, fields.otherClassification);
+  }
+}
+
+function applyTin(form: any, fields: any) {
+  const digits = splitTin(fields.tin);
+  if (!digits) return;
+
+  const tinType = String(fields.tinType ?? 'ein').toLowerCase();
+  if (tinType === 'ssn') {
+    setText(form, W9_ACROFORM.ssn1, digits.slice(0, 3));
+    setText(form, W9_ACROFORM.ssn2, digits.slice(3, 5));
+    setText(form, W9_ACROFORM.ssn3, digits.slice(5, 9));
+  } else {
+    setText(form, W9_ACROFORM.ein1, digits.slice(0, 2));
+    setText(form, W9_ACROFORM.ein2, digits.slice(2, 9));
+  }
+}
+
+async function drawSignatureAndDate(doc: any, fields: any, signaturePngBytes: Uint8Array | null) {
+  const page = doc.getPage(W9_SIGNATURE_OVERLAY.pageIndex);
+  const { x, y, width, height } = W9_SIGNATURE_OVERLAY;
+
+  if (signaturePngBytes?.length) {
+    const png = await doc.embedPng(signaturePngBytes);
+    const scale = Math.min(width / png.width, height / png.height);
+    const drawWidth = png.width * scale;
+    const drawHeight = png.height * scale;
+    page.drawImage(png, {
+      x,
+      y: y + (height - drawHeight) / 2,
+      width: drawWidth,
+      height: drawHeight,
+    });
+  } else if (String(fields.signatureName ?? '').trim()) {
+    const font = await doc.embedFont(StandardFonts.Helvetica);
+    page.drawText(String(fields.signatureName).trim(), {
+      x,
+      y: y + 10,
+      size: 10,
+      font,
+      color: rgb(0, 0, 0),
+    });
+  }
+
+  const dateText = formatSignedDate(fields.signedAt);
+  if (dateText) {
+    const font = await doc.embedFont(StandardFonts.Helvetica);
+    page.drawText(dateText, {
+      x: W9_DATE_OVERLAY.x,
+      y: W9_DATE_OVERLAY.y,
+      size: W9_DATE_OVERLAY.fontSize,
+      font,
+      color: rgb(0, 0, 0),
+    });
+  }
+}
+
+async function fillW9Pdf(
+  pdfBytes: Uint8Array,
+  fields: any,
+  signaturePngBytes: Uint8Array | null,
+): Promise<Uint8Array> {
+  const doc = await PDFDocument.load(pdfBytes);
+  const form = doc.getForm();
+
+  setText(form, W9_ACROFORM.name, fields.name);
+  setText(form, W9_ACROFORM.businessName, fields.businessName);
+  applyTaxClassification(form, fields);
+  setText(form, W9_ACROFORM.exemptPayeeCode, fields.exemptPayeeCode);
+  setText(form, W9_ACROFORM.fatcaCode, fields.fatcaCode);
+  setText(form, W9_ACROFORM.address, fields.address);
+  setText(form, W9_ACROFORM.cityStateZip, formatCityStateZip(fields.city, fields.state, fields.zip));
+  applyTin(form, fields);
+
+  await drawSignatureAndDate(doc, fields, signaturePngBytes);
+
+  form.flatten();
+  return doc.save();
+}
+
+// --- END w9PdfFill ---
+
+function getPortalBaseUrl(): string {
+  const configured = Deno.env.get('PUBLIC_APP_URL');
+  if (configured && configured.startsWith('http')) return configured.replace(/\/$/, '');
+  return 'https://cliqbux-onboard-prime.base44.app';
+}
+
+/** Same hash as manageUnderwritingRequest ΓÇö sha256(rawToken + MERCHANT_JWT_SECRET) hex. */
+async function hashToken(rawToken: string): Promise<string> {
+  const secret = Deno.env.get('MERCHANT_JWT_SECRET');
+  if (!secret) throw new Error('MERCHANT_JWT_SECRET not set');
+  const data = new TextEncoder().encode(`${rawToken}${secret}`);
+  const digest = await crypto.subtle.digest('SHA-256', data);
+  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
+}
+
+function parsePrefillSnapshot(raw: unknown): Record<string, any> {
+  if (!raw) return emptyW9Fields();
+  if (typeof raw === 'object' && !Array.isArray(raw)) {
+    return { ...emptyW9Fields(), ...(raw as Record<string, any>) };
+  }
+  if (typeof raw === 'string') {
+    try {
+      const parsed = JSON.parse(raw);
+      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
+        return { ...emptyW9Fields(), ...parsed };
+      }
+    } catch { /* fall through */ }
+  }
+  return emptyW9Fields();
+}
+
+function normalizeIncomingFields(raw: unknown): Record<string, any> {
+  const base = emptyW9Fields();
+  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return base;
+  const src = raw as Record<string, any>;
+  for (const key of Object.keys(base)) {
+    if (src[key] != null) base[key] = src[key];
+  }
+  // Preserve tinType casing for PDF path
+  if (src.tinType != null) base.tinType = String(src.tinType).toLowerCase() === 'ssn' ? 'ssn' : 'ein';
+  return base;
+}
+
+function isExpired(tokenExpiresAt: unknown): boolean {
+  const raw = String(tokenExpiresAt || '').trim();
+  if (!raw) return false;
+  const t = Date.parse(raw);
+  if (Number.isNaN(t)) return false;
+  return Date.now() > t;
+}
+
+function genericTokenError(kind: 'invalid' | 'expired' | 'cancelled') {
+  if (kind === 'expired') {
+    return Response.json({
+      error: 'This W-9 link has expired. Please ask CliqBux to send a new request.',
+      code: 'TOKEN_EXPIRED',
+    }, { status: 410 });
+  }
+  if (kind === 'cancelled') {
+    return Response.json({
+      error: 'This W-9 link is no longer valid. Please ask CliqBux to send a new request.',
+      code: 'TOKEN_CANCELLED',
+    }, { status: 410 });
+  }
+  return Response.json({
+    error: 'This W-9 link is invalid. Please ask CliqBux for a new link.',
+    code: 'TOKEN_INVALID',
+  }, { status: 404 });
+}
+
+function entityMissingError(e: any): boolean {
+  const msg = String(e?.message || e || '').toLowerCase();
+  return msg.includes('not found') || msg.includes('unknown entity') || msg.includes('does not exist')
+    || (msg.includes('entity') && msg.includes('missing'));
+}
+
+async function lookupByToken(base44: any, rawToken: string): Promise<{ request?: any; error?: Response }> {
+  let tokenHash: string;
+  try {
+    tokenHash = await hashToken(rawToken);
+  } catch (e: any) {
+    return {
+      error: Response.json({ error: e?.message || 'Token hashing failed' }, { status: 500 }),
+    };
+  }
+
+  let rows: any[];
+  try {
+    rows = await base44.asServiceRole.entities.UnderwritingRequest.filter({ tokenHash }, '-created_date', 5);
+  } catch (e: any) {
+    if (entityMissingError(e)) {
+      return {
+        error: Response.json({
+          error: 'UnderwritingRequest entity missing ΓÇö publish schema in Base44 Dashboard, then retry.',
+          detail: e?.message,
+          code: 'ENTITY_SCHEMA_MISSING',
+        }, { status: 503 }),
+      };
+    }
+    throw e;
+  }
+
+  const request = rows?.[0];
+  if (!request) return { error: genericTokenError('invalid') };
+  return { request };
+}
+
+async function resolveMidLabel(base44: any, midId: string): Promise<string | undefined> {
+  if (!midId) return undefined;
+  try {
+    const mid = await base44.asServiceRole.entities.MerchantMID.get(midId);
+    const label = String(mid?.dbaName || mid?.merchantName || mid?.elavonMID || '').trim();
+    return label || undefined;
+  } catch {
+    try {
+      const rows = await base44.asServiceRole.entities.MerchantMID.filter({ id: midId }, undefined, 1);
+      const mid = rows?.[0];
+      const label = String(mid?.dbaName || mid?.merchantName || mid?.elavonMID || '').trim();
+      return label || undefined;
+    } catch {
+      return undefined;
+    }
+  }
+}
+
+function decodePngDataUrl(raw: unknown): Uint8Array | null {
+  if (raw == null || raw === '') return null;
+  let b64 = String(raw).trim();
+  const dataUrl = /^data:image\/png;base64,/i.exec(b64);
+  if (dataUrl) {
+    b64 = b64.slice(dataUrl[0].length);
+  } else if (/^data:image\//i.test(b64)) {
+    // Only PNG is supported for pdf-lib embedPng
+    return null;
+  }
+  if (!/^[A-Za-z0-9+/=\s]+$/.test(b64) || b64.length < 32) return null;
+  try {
+    const bin = atob(b64.replace(/\s/g, ''));
+    if (bin.length > MAX_SIGNATURE_BYTES) return null;
+    const bytes = new Uint8Array(bin.length);
+    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
+    return bytes;
+  } catch {
+    return null;
+  }
+}
+
+async function loadPinnedFw9Bytes(): Promise<Uint8Array> {
+  const base = getPortalBaseUrl();
+  const candidates = [
+    `${base}/irs/fw9.pdf`,
+    `${base}/assets/irs/fw9.pdf`,
+    'https://cliqbux-onboard-prime.base44.app/irs/fw9.pdf',
+  ];
+  const tried: string[] = [];
+  for (const url of candidates) {
+    if (tried.includes(url)) continue;
+    tried.push(url);
+    try {
+      const res = await fetch(url);
+      if (!res.ok) continue;
+      const buf = new Uint8Array(await res.arrayBuffer());
+      if (buf.length > 1000 && buf[0] === 0x25 && buf[1] === 0x50) { // %PΓÇª PDF magic
+        return buf;
+      }
+    } catch {
+      /* try next */
+    }
+  }
+  throw new Error(`Could not load pinned W-9 PDF (tried ${tried.join(', ')})`);
+}
+
+/**
+ * Upload stamped PDF via service-role UploadFile.
+ * Returns a publicly fetchable https URL (required for later Gmail attach in sendToElavon).
+ */
+async function uploadSignedPdf(base44: any, pdfBytes: Uint8Array): Promise<string> {
+  const file = new File([pdfBytes], `w9-signed-${Date.now()}.pdf`, { type: 'application/pdf' });
+  const srv = base44.asServiceRole;
+  if (!srv?.integrations?.Core?.UploadFile) {
+    throw new Error('UploadFile integration unavailable on service role');
+  }
+  const up = await srv.integrations.Core.UploadFile({ file });
+  // Prefer file_url; some SDK shapes also expose url
+  const url = String(up?.file_url || up?.url || up?.fileUrl || '').trim();
+  if (!url.startsWith('https://')) {
+    throw new Error(
+      `UploadFile did not return a public https URL (got: ${url ? url.slice(0, 48) : 'empty'}). `
+      + 'Gmail Elavon attach requires a bare-fetchable https signedPdfUrl.',
+    );
+  }
+  return url;
+}
+
+Deno.serve(async (req) => {
+  try {
+    // Token-only ΓÇö intentionally no auth.me() / getPortalActor gate
+    const base44 = createClientFromRequest(req);
+    if (req.method !== 'POST') {
+      return Response.json({ error: 'Method not allowed' }, { status: 405 });
+    }
+
+    const body = await req.json().catch(() => ({}));
+    const action = String(body.action || '').trim();
+    const rawToken = String(body.token || '').trim();
+
+    if (!rawToken) {
+      return Response.json({ error: 'token is required' }, { status: 400 });
+    }
+    if (!action) {
+      return Response.json({ error: 'action is required' }, { status: 400 });
+    }
+
+    // ΓöÇΓöÇ get ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
+    if (action === 'get') {
+      const looked = await lookupByToken(base44, rawToken);
+      if (looked.error) return looked.error;
+      let request = looked.request;
+
+      const status = String(request.status || '');
+      if (status === 'cancelled') return genericTokenError('cancelled');
+      if (status === 'expired' || isExpired(request.tokenExpiresAt)) {
+        if (status !== 'expired' && !SIGNED_STATUSES.has(status)) {
+          try {
+            await base44.asServiceRole.entities.UnderwritingRequest.update(request.id, {
+              status: 'expired',
+            });
+          } catch (e: any) {
+            console.warn('[completeUnderwritingRequest] expire mark failed:', e?.message);
+          }
+        }
+        // Signed requests remain viewable even past token expiry
+        if (!SIGNED_STATUSES.has(status)) return genericTokenError('expired');
+      }
+
+      const fields = parsePrefillSnapshot(request.prefillSnapshot);
+
+      if (SIGNED_STATUSES.has(status)) {
+        return Response.json({
+          status,
+          fields,
+          signedPdfUrl: String(request.signedPdfUrl || '').trim() || null,
+          viewOnly: true,
+          signedAt: request.signedAt || null,
+          expiresAt: request.tokenExpiresAt || null,
+        });
+      }
+
+      if (!OPENABLE_STATUSES.has(status)) {
+        // draft / unknown ΓÇö no merchant access without a live send
+        return genericTokenError('invalid');
+      }
+
+      // First open: sent | send_failed ΓåÆ opened (once)
+      if (status === 'sent' || status === 'send_failed') {
+        const openedAt = new Date().toISOString();
+        try {
+          request = await base44.asServiceRole.entities.UnderwritingRequest.update(request.id, {
+            status: 'opened',
+            openedAt: request.openedAt || openedAt,
+          });
+        } catch (e: any) {
+          console.warn('[completeUnderwritingRequest] opened transition failed:', e?.message);
+        }
+      }
+
+      const midLabel = await resolveMidLabel(base44, String(request.midId || ''));
+
+      return Response.json({
+        status: String(request.status || 'opened'),
+        fields,
+        agentNote: String(request.agentNote || '').trim() || null,
+        midLabel: midLabel || null,
+        expiresAt: request.tokenExpiresAt || null,
+        recipientName: request.recipientName || null,
+      });
+    }
+
+    // ΓöÇΓöÇ submitSignature ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
+    if (action === 'submitSignature') {
+      const looked = await lookupByToken(base44, rawToken);
+      if (looked.error) return looked.error;
+      const request = looked.request;
+
+      const status = String(request.status || '');
+
+      // Idempotent: already signed ΓåÆ return existing URL (no re-stamp)
+      if (SIGNED_STATUSES.has(status)) {
+        const existing = String(request.signedPdfUrl || '').trim();
+        if (!existing) {
+          return Response.json({
+            error: 'Request is signed but signedPdfUrl is missing',
+            code: 'PDF_MISSING',
+          }, { status: 404 });
+        }
+        return Response.json({
+          success: true,
+          signedPdfUrl: existing,
+          status,
+          idempotent: true,
+        });
+      }
+
+      if (status === 'cancelled') return genericTokenError('cancelled');
+      if (status === 'expired' || isExpired(request.tokenExpiresAt)) {
+        return genericTokenError('expired');
+      }
+      if (!OPENABLE_STATUSES.has(status)) {
+        return genericTokenError('invalid');
+      }
+
+      const fields = normalizeIncomingFields(body.fields);
+      const validation = validateW9Fields(fields);
+      if (!validation.ok) {
+        return Response.json({
+          error: 'W-9 fields incomplete',
+          code: 'VALIDATION',
+          errors: validation.errors,
+        }, { status: 422 });
+      }
+
+      const signaturePng = decodePngDataUrl(body.signatureDataUrl);
+      const typedName = String(fields.signatureName || body.signatureName || '').trim();
+      if (!signaturePng && !typedName) {
+        return Response.json({
+          error: 'signatureDataUrl (PNG) or signatureName is required',
+          code: 'SIGNATURE_REQUIRED',
+        }, { status: 422 });
+      }
+
+      const signedAt = new Date().toISOString();
+      fields.signedAt = signedAt;
+      if (typedName) fields.signatureName = typedName;
+
+      let pdfBytes: Uint8Array;
+      try {
+        const template = await loadPinnedFw9Bytes();
+        pdfBytes = await fillW9Pdf(template, fields, signaturePng);
+      } catch (e: any) {
+        console.error('[completeUnderwritingRequest] PDF fill failed:', e?.message || e);
+        return Response.json({
+          error: e?.message || 'Failed to fill W-9 PDF',
+          code: 'PDF_FILL_FAILED',
+        }, { status: 502 });
+      }
+
+      let signedPdfUrl: string;
+      try {
+        signedPdfUrl = await uploadSignedPdf(base44, pdfBytes);
+      } catch (e: any) {
+        console.error('[completeUnderwritingRequest] UploadFile failed:', e?.message || e);
+        return Response.json({
+          error: e?.message || 'Failed to upload signed PDF',
+          code: 'UPLOAD_FAILED',
+        }, { status: 502 });
+      }
+
+      // Re-check idempotency race: another submit may have won
+      try {
+        const fresh = await base44.asServiceRole.entities.UnderwritingRequest.get(request.id);
+        if (fresh && SIGNED_STATUSES.has(String(fresh.status || ''))) {
+          const existing = String(fresh.signedPdfUrl || '').trim();
+          if (existing) {
+            return Response.json({
+              success: true,
+              signedPdfUrl: existing,
+              status: fresh.status,
+              idempotent: true,
+            });
+          }
+        }
+      } catch { /* proceed with our write */ }
+
+      let updated: any;
+      try {
+        updated = await base44.asServiceRole.entities.UnderwritingRequest.update(request.id, {
+          status: 'signed',
+          signedPdfUrl,
+          prefillSnapshot: JSON.stringify(fields),
+          signedAt,
+          openedAt: request.openedAt || signedAt,
+        });
+      } catch (e: any) {
+        console.error('[completeUnderwritingRequest] signed update failed:', e?.message || e);
+        return Response.json({
+          error: e?.message || 'Failed to persist signed request',
+          code: 'PERSIST_FAILED',
+        }, { status: 500 });
+      }
+
+      return Response.json({
+        success: true,
+        signedPdfUrl,
+        status: String(updated?.status || 'signed'),
+        signedAt,
+      });
+    }
+
+    return Response.json({
+      error: `Unknown action: ${action}. Supported: get, submitSignature`,
+    }, { status: 400 });
+  } catch (error: any) {
+    console.error('[completeUnderwritingRequest]', error?.message || error);
+    return Response.json({ error: error?.message || String(error) }, { status: 500 });
+  }
+});
diff --git a/base44/functions/manageUnderwritingRequest/entry.ts b/base44/functions/manageUnderwritingRequest/entry.ts
new file mode 100644
index 0000000..0795ba4
--- /dev/null
+++ b/base44/functions/manageUnderwritingRequest/entry.ts
@@ -0,0 +1,1075 @@
+/**
+ * manageUnderwritingRequest ΓÇö admin-only Deal Room underwriting document requests (W-9 v1).
+ *
+ * Actions:
+ *   list          { corporateId, midId? }
+ *   create        { corporateId, midId, legalEntityId, recipientName, recipientEmail?, recipientPhone?, channels, agentNote? }
+ *   send          { requestId }
+ *   resend        { requestId }
+ *   cancel        { requestId }
+ *   getSignedUrl  { requestId }
+ *   sendToElavon  { requestId, to, subject, bodyText }
+ *
+ * Auth: workspace session only ΓÇö merchant JWTs rejected (same pattern as syncUnderwritingMail).
+ * Magic link: ${PUBLIC_APP_URL}/uw/${rawToken}
+ * Token store: sha256(token + MERCHANT_JWT_SECRET) ΓåÆ tokenHash (never store raw token).
+ */
+import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
+
+const TOKEN_TTL_DAYS = 7;
+const QUO_API_VERSION = '2026-03-30';
+const DEFAULT_MAILBOX = 'underwriting@cliqbux.com';
+const REQUEST_TYPE = 'w9';
+const NON_TERMINAL = new Set(['draft', 'sent', 'opened', 'send_failed']);
+const SIGNED_STATUSES = new Set(['signed', 'sent_to_elavon']);
+
+// --- BEGIN w9Prefill (sync with src/lib/w9Prefill.js + w9Model.js) ---
+
+function emptyW9Fields() {
+  return {
+    name: '',
+    businessName: '',
+    taxClassification: '',
+    llcTaxClass: '',
+    otherClassification: '',
+    exemptPayeeCode: '',
+    fatcaCode: '',
+    address: '',
+    city: '',
+    state: '',
+    zip: '',
+    tinType: 'ein',
+    tin: '',
+    signatureName: '',
+    signedAt: '',
+  };
+}
+
+function mapLlcTaxClass(taxClassType: string): string {
+  switch (taxClassType) {
+    case 'LLC_CORPORATION':
+      return 'C';
+    case 'LLC':
+    case 'DISREGARDED_ENTITY':
+      return 'D';
+    case 'LLC_PARTNERSHIP':
+      return 'P';
+    default:
+      return '';
+  }
+}
+
+function mapOwnershipToW9TaxClass(ownershipType: unknown, taxClassType: unknown) {
+  const ownership = String(ownershipType || '').toUpperCase();
+  const taxClass = String(taxClassType || '').toUpperCase();
+
+  if (ownership === 'SOLE_PROPRIETOR' || ownership === 'SOLE_PROPRIETORSHIP') {
+    return { taxClassification: 'individual' };
+  }
+  if (ownership === 'SUB_S_CORP') {
+    return { taxClassification: 's_corp' };
+  }
+  if (ownership === 'CORPORATION') {
+    return { taxClassification: 'c_corp' };
+  }
+  if (ownership === 'LIMITED_COMPANY') {
+    const llcTaxClass = mapLlcTaxClass(taxClass);
+    return { taxClassification: 'llc', ...(llcTaxClass ? { llcTaxClass } : {}) };
+  }
+  if (ownership === 'GENERAL_PARTNERSHIP' || ownership === 'LIMITED_PARTNERSHIP') {
+    return { taxClassification: 'partnership' };
+  }
+  if (ownership === 'NON_PROFIT') {
+    return { taxClassification: 'other', otherClassification: 'Non-profit' };
+  }
+  if (ownership === 'TRUST') {
+    return { taxClassification: 'trust' };
+  }
+  return { taxClassification: '' };
+}
+
+function extractEinDigits(federalEIN: unknown): string {
+  if (federalEIN == null || federalEIN === '') return '';
+  return String(federalEIN).replace(/\D/g, '').slice(0, 9);
+}
+
+function hasAddress(addr: { street?: string; city?: string; state?: string; zip?: string }): boolean {
+  return Boolean(addr.street && addr.city && addr.state && addr.zip);
+}
+
+function pickMailingAddress(entity: any) {
+  const street = [entity?.mailingStreet, entity?.mailingStreet2].filter(Boolean).join(', ').trim();
+  return {
+    street,
+    city: String(entity?.mailingCity || '').trim(),
+    state: String(entity?.mailingState || '').trim(),
+    zip: String(entity?.mailingZip || '').trim(),
+  };
+}
+
+function pickStoreAddress(location: any) {
+  const loc = location || {};
+  const street = [loc.businessStreet, loc.businessStreet2].filter(Boolean).join(', ').trim();
+  return {
+    street,
+    city: String(loc.businessCity || '').trim(),
+    state: String(loc.businessState || '').trim(),
+    zip: String(loc.businessZip || '').trim(),
+  };
+}
+
+/** Build best-effort W-9 prefill from legal entity (+ optional control person / location). TIN never invented. */
+function buildW9Prefill({
+  legalEntity,
+  controlPerson,
+  locationFallback,
+}: {
+  legalEntity?: any;
+  controlPerson?: any;
+  locationFallback?: any;
+} = {}) {
+  const entity = legalEntity || {};
+  const fields = emptyW9Fields();
+
+  const businessName = String(entity.legalBusinessName || '').trim();
+  fields.businessName = businessName;
+
+  const ownershipType = entity.ownershipType || '';
+  const taxClassType = entity.taxClassType || '';
+  const taxMapping = mapOwnershipToW9TaxClass(ownershipType, taxClassType) as any;
+  fields.taxClassification = taxMapping.taxClassification || '';
+  if (taxMapping.llcTaxClass) fields.llcTaxClass = taxMapping.llcTaxClass;
+  if (taxMapping.otherClassification) fields.otherClassification = taxMapping.otherClassification;
+
+  const isSoleProp =
+    ownershipType === 'SOLE_PROPRIETOR' || ownershipType === 'SOLE_PROPRIETORSHIP';
+  if (isSoleProp && controlPerson) {
+    const first = String(controlPerson.firstName || controlPerson.firstname || '').trim();
+    const last = String(controlPerson.lastName || controlPerson.lastname || '').trim();
+    fields.name = [first, last].filter(Boolean).join(' ');
+  } else {
+    fields.name = businessName;
+  }
+
+  const mailingAddress = pickMailingAddress(entity);
+  const storeAddress = pickStoreAddress(locationFallback);
+  const addressSource = hasAddress(mailingAddress) ? mailingAddress : storeAddress;
+
+  fields.address = addressSource.street;
+  fields.city = addressSource.city;
+  fields.state = addressSource.state;
+  fields.zip = addressSource.zip;
+
+  fields.tin = extractEinDigits(entity.federalEIN);
+  fields.tinType = 'ein';
+
+  return fields;
+}
+
+// --- END w9Prefill ---
+
+function __b64uDecode(str: string): Uint8Array {
+  const pad = (4 - (str.length % 4)) % 4;
+  const bin = atob(str.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat(pad));
+  const bytes = new Uint8Array(bin.length);
+  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
+  return bytes;
+}
+
+function bytesToBase64(bytes: Uint8Array): string {
+  let binary = '';
+  const chunk = 0x8000;
+  for (let i = 0; i < bytes.length; i += chunk) {
+    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
+  }
+  return btoa(binary);
+}
+
+function base64UrlEncode(bytes: Uint8Array): string {
+  return bytesToBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
+}
+
+async function requireAdmin(req: Request, base44: any): Promise<boolean> {
+  try {
+    const m = (req.headers.get('Authorization') || '').match(/^Bearer\s+(.+)$/i);
+    const parts = m ? m[1].split('.') : [];
+    const secret = Deno.env.get('MERCHANT_JWT_SECRET');
+    if (parts.length === 3 && secret) {
+      const key = await crypto.subtle.importKey(
+        'raw',
+        new TextEncoder().encode(secret),
+        { name: 'HMAC', hash: 'SHA-256' },
+        false,
+        ['verify'],
+      );
+      const ok = await crypto.subtle.verify(
+        'HMAC',
+        key,
+        __b64uDecode(parts[2]),
+        new TextEncoder().encode(`${parts[0]}.${parts[1]}`),
+      );
+      if (ok) return false;
+    }
+  } catch { /* ignore */ }
+  try {
+    const user = await base44.auth.me();
+    return !!user;
+  } catch {
+    return false;
+  }
+}
+
+function getPortalBaseUrl(): string {
+  const configured = Deno.env.get('PUBLIC_APP_URL');
+  if (configured && configured.startsWith('http')) return configured.replace(/\/$/, '');
+  return 'https://cliqbux-onboard-prime.base44.app';
+}
+
+function generateToken(): string {
+  const bytes = new Uint8Array(32);
+  crypto.getRandomValues(bytes);
+  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
+}
+
+async function hashToken(rawToken: string): Promise<string> {
+  const secret = Deno.env.get('MERCHANT_JWT_SECRET');
+  if (!secret) throw new Error('MERCHANT_JWT_SECRET not set');
+  const data = new TextEncoder().encode(`${rawToken}${secret}`);
+  const digest = await crypto.subtle.digest('SHA-256', data);
+  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
+}
+
+function normalizePhone(raw: string | null | undefined): string | null {
+  const digits = String(raw || '').replace(/\D/g, '');
+  if (digits.length === 10) return `+1${digits}`;
+  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
+  if (String(raw || '').trim().startsWith('+') && digits.length >= 10) return `+${digits}`;
+  return null;
+}
+
+function normalizeChannels(raw: unknown): 'email' | 'sms' | 'both' {
+  const v = String(raw || 'both').toLowerCase().trim();
+  if (v === 'sms' || v === 'email') return v;
+  return 'both';
+}
+
+function parseLegalEntities(raw: unknown): any[] {
+  let entities: any = raw ?? [];
+  if (typeof entities === 'string') {
+    try { entities = JSON.parse(entities); } catch { entities = []; }
+  }
+  return Array.isArray(entities) ? entities : [];
+}
+
+function parsePrefillSnapshot(raw: unknown): Record<string, any> | null {
+  if (!raw) return null;
+  if (typeof raw === 'object' && !Array.isArray(raw)) return raw as Record<string, any>;
+  if (typeof raw === 'string') {
+    try {
+      const parsed = JSON.parse(raw);
+      return parsed && typeof parsed === 'object' ? parsed : null;
+    } catch {
+      return null;
+    }
+  }
+  return null;
+}
+
+function tinMaskedFromSnapshot(snapshot: Record<string, any> | null): string | null {
+  if (!snapshot) return null;
+  const digits = String(snapshot.tin || '').replace(/\D/g, '');
+  if (!digits) return null;
+  if (digits.length <= 4) return `ΓÇóΓÇóΓÇóΓÇó${digits}`;
+  return `ΓÇóΓÇóΓÇóΓÇó${digits.slice(-4)}`;
+}
+
+function stripTinFromListRow(row: any): any {
+  const snapshot = parsePrefillSnapshot(row?.prefillSnapshot);
+  const tinMasked = tinMaskedFromSnapshot(snapshot);
+  const { tokenHash: _th, prefillSnapshot: _rawPs, ...rest } = row || {};
+  let safeSnapshot: string | undefined;
+  if (snapshot) {
+    const { tin: _tin, ...restFields } = snapshot;
+    safeSnapshot = JSON.stringify({ ...restFields, tinMasked: tinMasked || undefined });
+  }
+  return {
+    ...rest,
+    ...(safeSnapshot !== undefined ? { prefillSnapshot: safeSnapshot } : {}),
+    tinMasked: tinMasked || null,
+  };
+}
+
+function isControlPerson(s: any): boolean {
+  if (!s || s.isPortalAdmin === true) return false;
+  if (s.isAuthorizedSigner === true) return true;
+  if (s.isAuthorizedSigner == null && s.isPrimarySigner === true) return true;
+  return false;
+}
+
+function entityMissingError(e: any): boolean {
+  const msg = String(e?.message || e || '').toLowerCase();
+  return msg.includes('not found') || msg.includes('unknown entity') || msg.includes('does not exist')
+    || msg.includes('entity') && msg.includes('missing');
+}
+
+async function getGmailAccessToken(): Promise<string> {
+  const direct = Deno.env.get('UNDERWRITING_GMAIL_ACCESS_TOKEN');
+  if (direct) return direct;
+
+  const clientId = Deno.env.get('UNDERWRITING_GMAIL_CLIENT_ID');
+  const clientSecret = Deno.env.get('UNDERWRITING_GMAIL_CLIENT_SECRET');
+  const refreshToken = Deno.env.get('UNDERWRITING_GMAIL_REFRESH_TOKEN');
+  if (!clientId || !clientSecret || !refreshToken) {
+    throw new Error(
+      'Gmail not configured. Set UNDERWRITING_GMAIL_CLIENT_ID, UNDERWRITING_GMAIL_CLIENT_SECRET, and UNDERWRITING_GMAIL_REFRESH_TOKEN (or UNDERWRITING_GMAIL_ACCESS_TOKEN).',
+    );
+  }
+
+  const res = await fetch('https://oauth2.googleapis.com/token', {
+    method: 'POST',
+    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
+    body: new URLSearchParams({
+      client_id: clientId,
+      client_secret: clientSecret,
+      refresh_token: refreshToken,
+      grant_type: 'refresh_token',
+    }),
+  });
+  const data = await res.json().catch(() => ({}));
+  if (!res.ok || !data.access_token) {
+    throw new Error(`Gmail token refresh failed: ${res.status} ${JSON.stringify(data)}`);
+  }
+  return String(data.access_token);
+}
+
+const CLIQBUX_EMAIL_LOGO_CID = 'cliqbux-logo';
+const CLIQBUX_EMAIL_LOGO_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
+
+function emailLogoHeaderHtml(): string {
+  return `<table cellpadding="0" cellspacing="0" role="presentation" align="center" style="margin:0 auto;">
+  <tr>
+    <td style="vertical-align:middle;color:#ffffff;font-size:20px;font-weight:700;letter-spacing:-0.03em;font-family:Poppins,Inter,Arial,sans-serif;line-height:1;">cliqbux</td>
+  </tr>
+</table>`;
+}
+
+function escapeHtml(s: string): string {
+  return String(s || '')
+    .replace(/&/g, '&amp;')
+    .replace(/</g, '&lt;')
+    .replace(/>/g, '&gt;')
+    .replace(/"/g, '&quot;');
+}
+
+function buildW9EmailHtml(recipientName: string, link: string, businessLabel: string, agentNote?: string): string {
+  const who = escapeHtml(String(recipientName || '').trim() || 'there');
+  const biz = escapeHtml(String(businessLabel || '').trim() || 'your business');
+  const noteBlock = agentNote
+    ? `<p style="margin:0 0 24px;font-size:14px;color:#6b7280;line-height:1.5;border-left:3px solid #FEAC27;padding-left:12px;">${escapeHtml(agentNote)}</p>`
+    : '';
+  return `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f4f4f5;font-family:Inter,Arial,sans-serif;">
+  <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 16px;"><tr><td align="center">
+  <table width="100%" style="max-width:520px;background:#fff;border-radius:16px;overflow:hidden;">
+    <tr><td style="background:#111827;padding:28px 40px;text-align:center;">${emailLogoHeaderHtml()}</td></tr>
+    <tr><td style="padding:36px 40px;">
+      <h1 style="margin:0 0 16px;font-size:22px;font-weight:800;color:#111827;">Action needed: sign your W-9</h1>
+      <p style="margin:0 0 24px;font-size:15px;color:#374151;line-height:1.6;">
+        Hi ${who},<br><br>
+        Cliqbux needs a signed IRS Form W-9 for <strong>${biz}</strong> to complete underwriting with Elavon. Please review the prefilled details, make any corrections, and sign ΓÇö it only takes a few minutes.
+      </p>
+      ${noteBlock}
+      <a href="${escapeHtml(link)}" style="display:inline-block;background:#FEAC27;color:#111;font-weight:700;padding:14px 28px;border-radius:12px;text-decoration:none;">Review &amp; sign W-9 ΓåÆ</a>
+      <p style="margin:28px 0 0;font-size:12px;color:#9ca3af;line-height:1.5;">This link expires in ${TOKEN_TTL_DAYS} days. If you did not expect this message, you can ignore it.</p>
+    </td></tr>
+  </table></td></tr></table></body></html>`;
+}
+
+/** SMS must never include TIN. */
+function buildW9Sms(recipientName: string, link: string, businessLabel: string): string {
+  const who = String(recipientName || '').trim().split(/\s+/)[0] || 'there';
+  const biz = String(businessLabel || '').trim() || 'your business';
+  return `Hi ${who}, Cliqbux needs your signed W-9 for ${biz}: ${link}\nReply here if you need help.`;
+}
+
+async function sendViaResend(to: string, subject: string, html: string): Promise<void> {
+  const apiKey = Deno.env.get('RESEND_API_KEY');
+  if (!apiKey) throw new Error('RESEND_API_KEY not set');
+  const res = await fetch('https://api.resend.com/emails', {
+    method: 'POST',
+    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
+    body: JSON.stringify({
+      from: 'Cliqbux Onboarding <onboarding@onboarding.cliqbuxpos.com>',
+      to: [to],
+      subject,
+      html,
+      attachments: [{
+        filename: 'cliqbux-mark.png',
+        content: CLIQBUX_EMAIL_LOGO_B64,
+        content_id: CLIQBUX_EMAIL_LOGO_CID,
+      }],
+    }),
+  });
+  if (!res.ok) {
+    const err = await res.text();
+    throw new Error(`Resend error ${res.status}: ${err}`);
+  }
+}
+
+async function sendViaQuo(toE164: string, content: string): Promise<void> {
+  const apiKey = Deno.env.get('QUO_API_KEY');
+  const from = Deno.env.get('QUO_FROM_NUMBER');
+  if (!apiKey) throw new Error('QUO_API_KEY not set ΓÇö add Cliqbux Quo API key in Base44 env');
+  if (!from) throw new Error('QUO_FROM_NUMBER not set ΓÇö Cliqbux Quo number in E.164 (e.g. +15551234567)');
+
+  const res = await fetch('https://api.quo.com/v1/messages', {
+    method: 'POST',
+    headers: {
+      Authorization: apiKey,
+      'Content-Type': 'application/json',
+      'Quo-Api-Version': QUO_API_VERSION,
+    },
+    body: JSON.stringify({
+      content,
+      from,
+      to: [toE164],
+    }),
+  });
+  if (!res.ok) {
+    const err = await res.text();
+    throw new Error(`Quo SMS failed (${res.status}): ${err}`);
+  }
+}
+
+function encodeQuotedPrintableSafe(text: string): string {
+  // Prefer base64 body parts for simplicity / UTF-8 safety
+  return bytesToBase64(new TextEncoder().encode(text));
+}
+
+function buildMimeMessage(opts: {
+  from: string;
+  to: string;
+  subject: string;
+  bodyText: string;
+  pdfBytes: Uint8Array;
+  pdfFilename: string;
+}): string {
+  const boundary = `cliqbux_uw_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
+  const subjectEncoded = /[^\x20-\x7E]/.test(opts.subject)
+    ? `=?UTF-8?B?${bytesToBase64(new TextEncoder().encode(opts.subject))}?=`
+    : opts.subject;
+
+  const textB64 = encodeQuotedPrintableSafe(opts.bodyText);
+  const pdfB64 = bytesToBase64(opts.pdfBytes);
+  // Wrap base64 at 76 chars per RFC
+  const wrap76 = (s: string) => s.replace(/.{1,76}/g, (m) => `${m}\r\n`).trimEnd();
+
+  return [
+    `From: ${opts.from}`,
+    `To: ${opts.to}`,
+    `Subject: ${subjectEncoded}`,
+    'MIME-Version: 1.0',
+    `Content-Type: multipart/mixed; boundary="${boundary}"`,
+    '',
+    `--${boundary}`,
+    'Content-Type: text/plain; charset="UTF-8"',
+    'Content-Transfer-Encoding: base64',
+    '',
+    wrap76(textB64),
+    '',
+    `--${boundary}`,
+    `Content-Type: application/pdf; name="${opts.pdfFilename}"`,
+    'Content-Transfer-Encoding: base64',
+    `Content-Disposition: attachment; filename="${opts.pdfFilename}"`,
+    '',
+    wrap76(pdfB64),
+    '',
+    `--${boundary}--`,
+    '',
+  ].join('\r\n');
+}
+
+function isGmailScopeError(status: number, detail: any): boolean {
+  const blob = JSON.stringify(detail || {}).toLowerCase();
+  if (status === 403) return true;
+  return blob.includes('insufficient') || blob.includes('gmail.send')
+    || blob.includes('access_denied') || blob.includes('insufficientauthenticationscopes')
+    || blob.includes('scope');
+}
+
+Deno.serve(async (req) => {
+  try {
+    const base44 = createClientFromRequest(req);
+    if (req.method !== 'POST') {
+      return Response.json({ error: 'Method not allowed' }, { status: 405 });
+    }
+
+    if (!(await requireAdmin(req, base44))) {
+      return Response.json({ error: 'Unauthorized ΓÇö admin only' }, { status: 401 });
+    }
+
+    const user = await base44.auth.me().catch(() => null);
+    const authorEmail = String(user?.email || '').trim();
+
+    const body = await req.json().catch(() => ({}));
+    const action = String(body.action || '').trim();
+    const elavonDocsToHint = String(Deno.env.get('UNDERWRITING_ELAVON_DOCS_TO') || '').trim() || null;
+
+    // ΓöÇΓöÇ list ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
+    if (action === 'list') {
+      const corporateId = String(body.corporateId || '').trim();
+      if (!corporateId) return Response.json({ error: 'corporateId required' }, { status: 400 });
+      const midId = String(body.midId || '').trim();
+
+      let rows: any[] = [];
+      try {
+        const filter: Record<string, string> = { corporateId };
+        if (midId) filter.midId = midId;
+        rows = await base44.asServiceRole.entities.UnderwritingRequest.filter(
+          filter,
+          '-created_date',
+          200,
+        );
+      } catch (e: any) {
+        return Response.json({
+          error: 'UnderwritingRequest entity missing ΓÇö publish schema in Base44 Dashboard, then retry.',
+          detail: e?.message,
+          code: 'ENTITY_SCHEMA_MISSING',
+        }, { status: 503 });
+      }
+
+      const requests = (rows || []).map(stripTinFromListRow);
+      return Response.json({
+        success: true,
+        requests,
+        elavonDocsToHint,
+      });
+    }
+
+    // ΓöÇΓöÇ create ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
+    if (action === 'create') {
+      const corporateId = String(body.corporateId || '').trim();
+      const midId = String(body.midId || '').trim();
+      const legalEntityId = String(body.legalEntityId || '').trim();
+      const recipientName = String(body.recipientName || '').trim();
+      const recipientEmail = String(body.recipientEmail || '').trim().toLowerCase();
+      const recipientPhoneRaw = String(body.recipientPhone || '').trim();
+      const channels = normalizeChannels(body.channels);
+      const agentNote = String(body.agentNote || '').trim();
+
+      if (!corporateId) return Response.json({ error: 'corporateId required' }, { status: 400 });
+      if (!midId) return Response.json({ error: 'midId required' }, { status: 400 });
+      if (!legalEntityId) return Response.json({ error: 'legalEntityId required' }, { status: 400 });
+      if (!recipientName) return Response.json({ error: 'recipientName required' }, { status: 400 });
+
+      const profiles = await base44.asServiceRole.entities.MerchantCorporateProfile.filter({ corporateId });
+      const profile = profiles?.[0];
+      if (!profile) return Response.json({ error: 'Merchant profile not found' }, { status: 404 });
+
+      let mid: any;
+      try {
+        mid = await base44.asServiceRole.entities.MerchantMID.get(midId);
+      } catch {
+        return Response.json({ error: 'MID not found' }, { status: 404 });
+      }
+      if (!mid || String(mid.corporateId) !== corporateId) {
+        return Response.json({ error: 'MID not found for this deal' }, { status: 404 });
+      }
+
+      let account: any = null;
+      const accountId = profile.merchantAccountId ? String(profile.merchantAccountId) : '';
+      if (accountId) {
+        try {
+          account = await base44.asServiceRole.entities.MerchantAccount.get(accountId);
+        } catch { /* optional */ }
+      }
+      const entities = parseLegalEntities(
+        account?.legalEntities != null ? account.legalEntities : profile.legalEntities,
+      );
+      const legalEntity = entities.find((e: any) => String(e.entityId) === legalEntityId);
+      if (!legalEntity) {
+        return Response.json({ error: 'Legal entity not found on this deal/account' }, { status: 404 });
+      }
+
+      const [signers, locations] = await Promise.all([
+        base44.asServiceRole.entities.MerchantSigners.filter({ corporateId }),
+        base44.asServiceRole.entities.MerchantLocations.filter({ corporateId }),
+      ]);
+      const control = (signers || []).find(isControlPerson)
+        || (signers || []).find((s: any) => s.isPrimarySigner)
+        || (signers || [])[0];
+      const locationFallback = (locations || []).find((l: any) => String(l.id) === String(mid.locationId))
+        || (locations || [])[0];
+
+      const prefill = buildW9Prefill({
+        legalEntity,
+        controlPerson: control,
+        locationFallback,
+      });
+
+      // Enforce one non-terminal per midId+type ΓÇö cancel prior unsigned
+      try {
+        const existing = await base44.asServiceRole.entities.UnderwritingRequest.filter(
+          { midId, type: REQUEST_TYPE },
+          '-created_date',
+          50,
+        );
+        for (const row of existing || []) {
+          if (row?.id && NON_TERMINAL.has(String(row.status || ''))) {
+            await base44.asServiceRole.entities.UnderwritingRequest.update(row.id, {
+              status: 'cancelled',
+              lastError: 'Superseded by new draft',
+            });
+          }
+        }
+      } catch (e: any) {
+        if (entityMissingError(e)) {
+          return Response.json({
+            error: 'UnderwritingRequest entity missing ΓÇö publish schema in Base44 Dashboard, then retry.',
+            detail: e?.message,
+            code: 'ENTITY_SCHEMA_MISSING',
+          }, { status: 503 });
+        }
+        throw e;
+      }
+
+      const recipientPhone = normalizePhone(recipientPhoneRaw) || (recipientPhoneRaw || '');
+
+      let request: any;
+      try {
+        request = await base44.asServiceRole.entities.UnderwritingRequest.create({
+          corporateId,
+          merchantAccountId: accountId || undefined,
+          midId,
+          legalEntityId,
+          type: REQUEST_TYPE,
+          status: 'draft',
+          recipientName,
+          recipientEmail: recipientEmail || undefined,
+          recipientPhone: recipientPhone || undefined,
+          channels,
+          agentNote: agentNote || undefined,
+          prefillSnapshot: JSON.stringify(prefill),
+          createdByEmail: authorEmail || undefined,
+        });
+      } catch (e: any) {
+        return Response.json({
+          error: 'UnderwritingRequest entity missing ΓÇö publish schema in Base44 Dashboard, then retry.',
+          detail: e?.message,
+          code: 'ENTITY_SCHEMA_MISSING',
+        }, { status: 503 });
+      }
+
+      return Response.json({
+        success: true,
+        request: stripTinFromListRow(request),
+        prefill,
+        elavonDocsToHint,
+      });
+    }
+
+    // Shared: load request by id
+    async function loadRequest(requestId: string): Promise<{ request?: any; error?: Response }> {
+      if (!requestId) {
+        return { error: Response.json({ error: 'requestId required' }, { status: 400 }) };
+      }
+      try {
+        const request = await base44.asServiceRole.entities.UnderwritingRequest.get(requestId);
+        if (!request) {
+          return { error: Response.json({ error: 'Request not found' }, { status: 404 }) };
+        }
+        return { request };
+      } catch (e: any) {
+        if (entityMissingError(e)) {
+          return {
+            error: Response.json({
+              error: 'UnderwritingRequest entity missing ΓÇö publish schema in Base44 Dashboard, then retry.',
+              detail: e?.message,
+              code: 'ENTITY_SCHEMA_MISSING',
+            }, { status: 503 }),
+          };
+        }
+        return { error: Response.json({ error: 'Request not found' }, { status: 404 }) };
+      }
+    }
+
+    async function cancelOtherNonTerminal(midId: string, type: string, exceptId: string): Promise<void> {
+      const existing = await base44.asServiceRole.entities.UnderwritingRequest.filter(
+        { midId, type },
+        '-created_date',
+        50,
+      );
+      for (const row of existing || []) {
+        if (!row?.id || row.id === exceptId) continue;
+        if (NON_TERMINAL.has(String(row.status || ''))) {
+          await base44.asServiceRole.entities.UnderwritingRequest.update(row.id, {
+            status: 'cancelled',
+            lastError: 'Superseded by send/resend',
+          });
+        }
+      }
+    }
+
+    async function dispatchSend(request: any): Promise<Response> {
+      const status = String(request.status || '');
+      if (SIGNED_STATUSES.has(status)) {
+        return Response.json({
+          error: 'Request already signed ΓÇö create a new W-9 request instead of resending.',
+          code: 'ALREADY_SIGNED',
+        }, { status: 422 });
+      }
+      if (status === 'cancelled' || status === 'expired') {
+        return Response.json({
+          error: `Cannot send a ${status} request ΓÇö create a new draft.`,
+          code: 'TERMINAL_STATUS',
+        }, { status: 422 });
+      }
+
+      const channels = normalizeChannels(request.channels);
+      const wantEmail = channels === 'email' || channels === 'both';
+      const wantSms = channels === 'sms' || channels === 'both';
+      const email = String(request.recipientEmail || '').trim().toLowerCase();
+      const phone = normalizePhone(request.recipientPhone);
+
+      if (wantEmail && !email) {
+        return Response.json({
+          error: 'recipientEmail required when channels includes email',
+          code: 'CHANNEL_VALIDATION',
+        }, { status: 422 });
+      }
+      if (wantSms && !phone) {
+        return Response.json({
+          error: 'recipientPhone required (E.164) when channels includes sms',
+          code: 'CHANNEL_VALIDATION',
+        }, { status: 422 });
+      }
+
+      await cancelOtherNonTerminal(String(request.midId), String(request.type || REQUEST_TYPE), request.id);
+
+      let rawToken: string;
+      let tokenHash: string;
+      try {
+        rawToken = generateToken();
+        tokenHash = await hashToken(rawToken);
+      } catch (e: any) {
+        return Response.json({ error: e?.message || 'Token hashing failed' }, { status: 500 });
+      }
+
+      const now = new Date();
+      const tokenExpiresAt = new Date(now.getTime() + TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();
+      const link = `${getPortalBaseUrl()}/uw/${rawToken}`;
+
+      // Business label for copy ΓÇö prefer snapshot businessName, never log TIN
+      const snapshot = parsePrefillSnapshot(request.prefillSnapshot);
+      const businessLabel = String(snapshot?.businessName || snapshot?.name || request.recipientName || '').trim();
+
+      const channelResults: { email?: string; sms?: string; errors: string[] } = { errors: [] };
+
+      if (wantEmail) {
+        try {
+          await sendViaResend(
+            email,
+            `Action needed: sign your W-9 for CliqBux / Elavon ΓÇö ${businessLabel || 'merchant'}`,
+            buildW9EmailHtml(request.recipientName, link, businessLabel, request.agentNote),
+          );
+          channelResults.email = 'sent';
+        } catch (e: any) {
+          channelResults.errors.push(`Email: ${e?.message || e}`);
+        }
+      }
+
+      if (wantSms && phone) {
+        try {
+          await sendViaQuo(phone, buildW9Sms(request.recipientName, link, businessLabel));
+          channelResults.sms = 'sent';
+        } catch (e: any) {
+          channelResults.errors.push(`SMS: ${e?.message || e}`);
+        }
+      }
+
+      const anyOk = channelResults.email === 'sent' || channelResults.sms === 'sent';
+      const sentAt = now.toISOString();
+
+      if (!anyOk) {
+        const lastError = channelResults.errors.join(' ┬╖ ') || 'Send failed';
+        const updated = await base44.asServiceRole.entities.UnderwritingRequest.update(request.id, {
+          status: 'send_failed',
+          lastError,
+          tokenHash,
+          tokenExpiresAt,
+        });
+        return Response.json({
+          error: lastError,
+          code: 'SEND_FAILED',
+          request: stripTinFromListRow(updated),
+          results: channelResults,
+        }, { status: 422 });
+      }
+
+      const updated = await base44.asServiceRole.entities.UnderwritingRequest.update(request.id, {
+        status: 'sent',
+        sentAt,
+        tokenHash,
+        tokenExpiresAt,
+        lastError: channelResults.errors.length ? channelResults.errors.join(' ┬╖ ') : '',
+        recipientPhone: phone || request.recipientPhone,
+      });
+
+      return Response.json({
+        success: true,
+        request: stripTinFromListRow(updated),
+        results: channelResults,
+        warnings: channelResults.errors.length ? channelResults.errors : undefined,
+        elavonDocsToHint,
+        // Raw token intentionally omitted ΓÇö magic link is delivered via email/SMS only
+      });
+    }
+
+    // ΓöÇΓöÇ send ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
+    if (action === 'send') {
+      const loaded = await loadRequest(String(body.requestId || '').trim());
+      if (loaded.error) return loaded.error;
+      return await dispatchSend(loaded.request);
+    }
+
+    // ΓöÇΓöÇ resend ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
+    if (action === 'resend') {
+      const loaded = await loadRequest(String(body.requestId || '').trim());
+      if (loaded.error) return loaded.error;
+      const request = loaded.request;
+      const status = String(request.status || '');
+
+      // Prefer same row when still unsigned (including send_failed / draft / sent / opened)
+      if (SIGNED_STATUSES.has(status)) {
+        return Response.json({
+          error: 'Already signed ΓÇö create a new W-9 request to collect another signature.',
+          code: 'ALREADY_SIGNED',
+        }, { status: 422 });
+      }
+      if (status === 'cancelled' || status === 'expired') {
+        // Revive cancelled/expired onto same row for agent convenience (brief: new or same)
+        await base44.asServiceRole.entities.UnderwritingRequest.update(request.id, {
+          status: 'draft',
+          lastError: '',
+          tokenHash: '',
+          tokenExpiresAt: '',
+        });
+        const refreshed = await base44.asServiceRole.entities.UnderwritingRequest.get(request.id);
+        return await dispatchSend(refreshed);
+      }
+      return await dispatchSend(request);
+    }
+
+    // ΓöÇΓöÇ cancel ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
+    if (action === 'cancel') {
+      const loaded = await loadRequest(String(body.requestId || '').trim());
+      if (loaded.error) return loaded.error;
+      const request = loaded.request;
+      const status = String(request.status || '');
+      if (SIGNED_STATUSES.has(status)) {
+        return Response.json({
+          error: 'Cannot cancel a signed request',
+          code: 'ALREADY_SIGNED',
+        }, { status: 422 });
+      }
+      if (status === 'cancelled') {
+        return Response.json({ success: true, request: stripTinFromListRow(request) });
+      }
+      const updated = await base44.asServiceRole.entities.UnderwritingRequest.update(request.id, {
+        status: 'cancelled',
+        lastError: '',
+      });
+      return Response.json({ success: true, request: stripTinFromListRow(updated) });
+    }
+
+    // ΓöÇΓöÇ getSignedUrl ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
+    if (action === 'getSignedUrl') {
+      const loaded = await loadRequest(String(body.requestId || '').trim());
+      if (loaded.error) return loaded.error;
+      const request = loaded.request;
+      const status = String(request.status || '');
+      if (!SIGNED_STATUSES.has(status)) {
+        return Response.json({
+          error: 'Signed PDF not available until the merchant has signed',
+          code: 'NOT_SIGNED',
+        }, { status: 422 });
+      }
+      const signedPdfUrl = String(request.signedPdfUrl || '').trim();
+      if (!signedPdfUrl) {
+        return Response.json({
+          error: 'signedPdfUrl missing on signed request',
+          code: 'PDF_MISSING',
+        }, { status: 404 });
+      }
+      return Response.json({
+        success: true,
+        signedPdfUrl,
+        status,
+        elavonDocsToHint,
+      });
+    }
+
+    // ΓöÇΓöÇ sendToElavon ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
+    if (action === 'sendToElavon') {
+      const loaded = await loadRequest(String(body.requestId || '').trim());
+      if (loaded.error) return loaded.error;
+      const request = loaded.request;
+      const status = String(request.status || '');
+      // Allow from signed or re-forward from sent_to_elavon (PDF still required)
+      if (!SIGNED_STATUSES.has(status)) {
+        return Response.json({
+          error: 'Request must be signed before sending to Elavon',
+          code: 'NOT_SIGNED',
+        }, { status: 422 });
+      }
+
+      const to = String(body.to || '').trim();
+      const subject = String(body.subject || '').trim();
+      const bodyText = String(body.bodyText || body.body || '').trim();
+      if (!to) {
+        return Response.json({
+          error: 'to is required ΓÇö set the Elavon docs address in the confirm dialog (UNDERWRITING_ELAVON_DOCS_TO is a UI hint only)',
+          code: 'TO_REQUIRED',
+          elavonDocsToHint,
+        }, { status: 422 });
+      }
+      if (!subject) return Response.json({ error: 'subject required' }, { status: 400 });
+      if (!bodyText) return Response.json({ error: 'bodyText required' }, { status: 400 });
+
+      const signedPdfUrl = String(request.signedPdfUrl || '').trim();
+      if (!signedPdfUrl) {
+        return Response.json({ error: 'signedPdfUrl missing', code: 'PDF_MISSING' }, { status: 404 });
+      }
+
+      let pdfBytes: Uint8Array;
+      try {
+        const pdfRes = await fetch(signedPdfUrl);
+        if (!pdfRes.ok) {
+          return Response.json({
+            error: `Failed to fetch signed PDF (${pdfRes.status})`,
+            code: 'PDF_FETCH_FAILED',
+          }, { status: 502 });
+        }
+        pdfBytes = new Uint8Array(await pdfRes.arrayBuffer());
+        if (!pdfBytes.length) {
+          return Response.json({ error: 'Signed PDF is empty', code: 'PDF_EMPTY' }, { status: 502 });
+        }
+      } catch (e: any) {
+        return Response.json({
+          error: `Failed to fetch signed PDF: ${e?.message || e}`,
+          code: 'PDF_FETCH_FAILED',
+        }, { status: 502 });
+      }
+
+      let accessToken: string;
+      try {
+        accessToken = await getGmailAccessToken();
+      } catch (e: any) {
+        return Response.json({
+          error: e?.message || 'Gmail not configured',
+          configured: false,
+          hint: 'Add UNDERWRITING_GMAIL_* env vars, then reconnect OAuth with gmail.send scope.',
+          code: 'GMAIL_NOT_CONFIGURED',
+        }, { status: 503 });
+      }
+
+      const mailbox = Deno.env.get('UNDERWRITING_GMAIL_USER') || DEFAULT_MAILBOX;
+      const mime = buildMimeMessage({
+        from: mailbox,
+        to,
+        subject,
+        bodyText,
+        pdfBytes,
+        pdfFilename: 'W9-signed.pdf',
+      });
+      const raw = base64UrlEncode(new TextEncoder().encode(mime));
+
+      const sendRes = await fetch(
+        'https://gmail.googleapis.com/gmail/v1/users/me/messages/send',
+        {
+          method: 'POST',
+          headers: {
+            Authorization: `Bearer ${accessToken}`,
+            'Content-Type': 'application/json',
+          },
+          body: JSON.stringify({ raw }),
+        },
+      );
+      const sendData = await sendRes.json().catch(() => ({}));
+
+      if (!sendRes.ok) {
+        if (isGmailScopeError(sendRes.status, sendData)) {
+          return Response.json({
+            error: 'Gmail send failed ΓÇö OAuth token likely missing gmail.send scope',
+            status: sendRes.status,
+            detail: sendData,
+            hint: 'Reconnect underwriting@ OAuth with https://www.googleapis.com/auth/gmail.send (keep gmail.readonly for sync), update UNDERWRITING_GMAIL_REFRESH_TOKEN in Base44.',
+            code: 'GMAIL_SEND_SCOPE_MISSING',
+            elavonDocsToHint,
+          }, { status: 503 });
+        }
+        await base44.asServiceRole.entities.UnderwritingRequest.update(request.id, {
+          lastError: `Gmail send failed: ${sendRes.status} ${JSON.stringify(sendData)}`.slice(0, 500),
+        }).catch(() => {});
+        return Response.json({
+          error: 'Gmail send failed',
+          status: sendRes.status,
+          detail: sendData,
+          code: 'GMAIL_SEND_FAILED',
+        }, { status: 502 });
+      }
+
+      const gmailMessageId = String(sendData.id || '').trim();
+      const sentToElavonAt = new Date().toISOString();
+
+      // Load MID for AWB on thread log
+      let elavonAwb = '';
+      try {
+        const mid = await base44.asServiceRole.entities.MerchantMID.get(String(request.midId));
+        elavonAwb = String(mid?.elavonAwb || '').trim();
+      } catch { /* non-fatal */ }
+
+      let uwMessage: any = null;
+      try {
+        uwMessage = await base44.asServiceRole.entities.UnderwritingMessage.create({
+          corporateId: String(request.corporateId),
+          midId: String(request.midId),
+          elavonAwb,
+          direction: 'outbound',
+          subject,
+          bodyText,
+          fromAddress: mailbox,
+          toAddress: to,
+          messageDate: sentToElavonAt,
+          externalId: gmailMessageId || undefined,
+          source: 'gmail',
+          snippet: `W-9 PDF ΓåÆ ${to}`.slice(0, 160),
+        });
+      } catch (e: any) {
+        console.warn('[manageUnderwritingRequest] UnderwritingMessage create failed:', e?.message);
+      }
+
+      const updated = await base44.asServiceRole.entities.UnderwritingRequest.update(request.id, {
+        status: 'sent_to_elavon',
+        sentToElavonAt,
+        elavonGmailMessageId: gmailMessageId || undefined,
+        lastError: '',
+      });
+
+      return Response.json({
+        success: true,
+        request: stripTinFromListRow(updated),
+        gmailMessageId: gmailMessageId || null,
+        underwritingMessage: uwMessage,
+        elavonDocsToHint,
+      });
+    }
+
+    return Response.json({
+      error: 'Unknown action',
+      hint: 'Expected list | create | send | resend | cancel | getSignedUrl | sendToElavon',
+    }, { status: 400 });
+  } catch (error: any) {
+    console.error('[manageUnderwritingRequest]', error?.message);
+    return Response.json({ error: error?.message || String(error) }, { status: 500 });
+  }
+});
diff --git a/docs/superpowers/plans/2026-08-07-underwriting-w9-request.md b/docs/superpowers/plans/2026-08-07-underwriting-w9-request.md
new file mode 100644
index 0000000..2ec43a6
--- /dev/null
+++ b/docs/superpowers/plans/2026-08-07-underwriting-w9-request.md
@@ -0,0 +1,310 @@
+# Underwriting Requests + W-9 Implementation Plan
+
+> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
+
+**Goal:** Deal Room agents can send a MID-scoped W-9 magic link (email/SMS), merchants edit + sign in-house, signed PDF lands in Deal Room, and agents email it to Elavon via Gmail with attachment.
+
+**Architecture:** New `UnderwritingRequest` entity + admin `manageUnderwritingRequest` + token-gated `completeUnderwritingRequest`. Prefill/mapper + IRS PDF fill (`pdf-lib`) run server-side on submit; Deal Room panel lists/sends/Elavon-forwards; Gmail OAuth gains `gmail.send`.
+
+**Tech Stack:** Base44 entities/functions (Deno), React (`/uw/:token`, Deal Room), Resend, Quo, Gmail API, `pdf-lib`, pinned `assets/irs/fw9.pdf`.
+
+**Spec:** `docs/superpowers/specs/2026-08-07-underwriting-w9-request-design.md`
+
+## Global Constraints
+
+- Do not invent MSPWare/BoldSign paths for W-9 ΓÇö in-house token + PDF only.
+- Never invent TIN; never default MCC; never log full SSN/EIN in SMS or server logs.
+- Portal/merchant functions must not gate on `base44.auth.me()`; admin function is workspace-only.
+- Base44 cannot import shared helpers across functions ΓÇö inline or duplicate small helpers; keep `src/lib` copies in sync with comments.
+- Republish `UnderwritingRequest` in Base44 before live writes depend on new fields.
+- Edit code in the local repo only (not Base44 sandbox source).
+- `ApplicationStatus@elavon.com` is status-only ΓÇö never default W-9 To: there.
+- One non-terminal request per (`midId`, `type`); resend cancels prior unsigned.
+
+---
+
+## File map
+
+| File | Responsibility |
+|---|---|
+| `base44/entities/Underwriting Request.jsonc` | New entity schema |
+| `assets/irs/fw9.pdf` | Pinned IRS W-9 (March 2024) |
+| `assets/irs/fw9-field-map.md` | Discovered AcroForm names ΓåÆ app keys |
+| `src/lib/w9Model.js` | Canonical W-9 field object + validation + tax-class mapping |
+| `src/lib/w9Model.test.js` | Unit tests |
+| `src/lib/w9Prefill.js` | Prefill from legal entity + signers |
+| `src/lib/w9Prefill.test.js` | Unit tests |
+| `base44/functions/manageUnderwritingRequest/entry.ts` | Admin: list/create/send/resend/cancel/getSignedUrl/sendToElavon |
+| `base44/functions/completeUnderwritingRequest/entry.ts` | Token: get / submitSignature (PDF fill + upload) |
+| `base44/functions/helpers/w9PdfFill.ts` | Reference copy of PDF fill (inline into complete fn) |
+| `src/pages/UnderwritingW9Sign.jsx` | Merchant `/uw/:token` UI |
+| `src/components/deal-room/UnderwritingRequestsPanel.jsx` | Deal Room MID panel |
+| `src/pages/ApplicationDealRoom.jsx` | Mount panel on selected MID |
+| `src/App.jsx` | Route `/uw/:token` |
+| `docs/underwriting-inbox.md` | `gmail.send` + `UNDERWRITING_ELAVON_DOCS_TO` |
+| `AGENTS.md` / `AI_CHANNEL.md` | Short append on UW W-9 |
+
+---
+
+### Task 1: W-9 domain model + prefill (TDD)
+
+**Files:**
+- Create: `src/lib/w9Model.js`
+- Create: `src/lib/w9Model.test.js`
+- Create: `src/lib/w9Prefill.js`
+- Create: `src/lib/w9Prefill.test.js`
+
+**Interfaces:**
+- Produces:
+  - `emptyW9Fields()` ΓåÆ `{ name, businessName, taxClassification, llcTaxClass, otherClassification, exemptPayeeCode, fatcaCode, address, city, state, zip, tinType: 'ein'|'ssn', tin, signatureName, signedAt }`
+  - `validateW9Fields(fields)` ΓåÆ `{ ok: boolean, errors: string[] }` (require name, address, city, state, zip, tin 9 digits, taxClassification)
+  - `mapOwnershipToW9TaxClass(ownershipType, taxClassType)` ΓåÆ `{ taxClassification, llcTaxClass? }`
+  - `buildW9Prefill({ legalEntity, controlPerson?, locationFallback? })` ΓåÆ W-9 fields (TIN from `federalEIN` digits only; never invent)
+
+- [ ] **Step 1: Write failing tests** for tax-class mapping (`LIMITED_COMPANY`+`Corporation` ΓåÆ LLC + C; `SOLE_PROPRIETORSHIP` ΓåÆ individual; `CORPORATION`/`SUB_S_CORP` ΓåÆ c_corp / s_corp), validation (missing TIN fails; 9-digit EIN passes), prefill (entity mailing address wins over store).
+
+- [ ] **Step 2: Run tests ΓÇö expect FAIL**
+
+```bash
+node --test src/lib/w9Model.test.js src/lib/w9Prefill.test.js
+```
+
+- [ ] **Step 3: Implement `w9Model.js` + `w9Prefill.js` until tests pass**
+
+- [ ] **Step 4: Commit**
+
+```bash
+git add src/lib/w9Model.js src/lib/w9Model.test.js src/lib/w9Prefill.js src/lib/w9Prefill.test.js
+git commit -m "feat(uw): add W-9 field model and prefill helpers"
+```
+
+---
+
+### Task 2: Pin IRS PDF + AcroForm field map + fill helper
+
+**Files:**
+- Create: `assets/irs/fw9.pdf` (copy from IRS or TeddyΓÇÖs `fw9 (1).pdf`)
+- Create: `assets/irs/fw9-field-map.md`
+- Create: `scripts/inspect-w9-fields.mjs` (one-off: list AcroForm names via `pdf-lib`)
+- Create: `src/lib/w9PdfFill.js` (Node-testable fill; Deno function will inline equivalent)
+- Create: `src/lib/w9PdfFill.test.js`
+- Modify: `package.json` ΓÇö add `pdf-lib` dependency + `"test:w9": "node --test src/lib/w9*.test.js"`
+
+**Interfaces:**
+- Produces: `async fillW9Pdf(pdfBytes: Uint8Array, fields, signaturePngBytes?: Uint8Array): Promise<Uint8Array>`
+  - Sets text/checkbox fields per `fw9-field-map.md`
+  - Draws signature image on signature line page (coordinates documented in map after inspect)
+  - Sets date field
+  - `form.flatten()` before save so Elavon gets a non-editable signed PDF
+
+- [ ] **Step 1: Add `pdf-lib`**, copy PDF into `assets/irs/fw9.pdf`, run inspect script, write `fw9-field-map.md` with real field names (do not guess ΓÇö inspect output is source of truth).
+
+- [ ] **Step 2: Write a test** that loads the pinned PDF, fills sample fields, asserts output bytes longer than input and that re-load has flattened form (0 editable fields or getForm throws / empty).
+
+- [ ] **Step 3: Implement `fillW9Pdf` to pass**
+
+- [ ] **Step 4: Commit**
+
+```bash
+git add assets/irs package.json package-lock.json scripts/inspect-w9-fields.mjs src/lib/w9PdfFill.js src/lib/w9PdfFill.test.js
+git commit -m "feat(uw): pin IRS W-9 PDF and pdf-lib fill helper"
+```
+
+---
+
+### Task 3: Entity schema `UnderwritingRequest`
+
+**Files:**
+- Create: `base44/entities/Underwriting Request.jsonc`
+
+**Schema properties (all declared):**  
+`corporateId`, `merchantAccountId`, `midId`, `legalEntityId`, `type` (enum `w9`), `status` (enum per spec), `recipientName`, `recipientEmail`, `recipientPhone`, `channels` (string JSON array or comma list ΓÇö prefer string `email|sms|both` for simplicity matching `nudgeMerchant`), `agentNote`, `prefillSnapshot` (string JSON), `tokenHash`, `tokenExpiresAt`, `signedPdfUrl`, `sentAt`, `openedAt`, `signedAt`, `sentToElavonAt`, `elavonGmailMessageId`, `createdByEmail`, `lastError`
+
+- [ ] **Step 1: Write JSONC** matching Base44 entity style in `Underwriting Message.jsonc` (name `UnderwritingRequest`, required: `corporateId`, `midId`, `type`, `status`).
+
+- [ ] **Step 2: Note in commit body:** Teddy must **Publish entity** in Base44 Dashboard before live create works.
+
+- [ ] **Step 3: Commit**
+
+```bash
+git add "base44/entities/Underwriting Request.jsonc"
+git commit -m "feat(uw): add UnderwritingRequest entity schema"
+```
+
+---
+
+### Task 4: `manageUnderwritingRequest` (admin)
+
+**Files:**
+- Create: `base44/functions/manageUnderwritingRequest/entry.ts`
+
+**Interfaces:**
+- Auth: workspace `base44.auth.me()` only ΓÇö reject merchant JWT (admin desk).
+- Actions:
+  - `list` `{ corporateId, midId? }` ΓåÆ requests (mask TIN in list: show last 4 only via derived `tinMasked` from snapshot)
+  - `create` `{ corporateId, midId, legalEntityId, recipientName, recipientEmail?, recipientPhone?, channels, agentNote? }` ΓåÆ builds prefill (inline copy of `w9Prefill` logic), status `draft`, returns request + full prefill for UI preview
+  - `send` `{ requestId }` ΓåÆ validate channels, cancel other non-terminal same mid+type, generate 32-byte hex token, store `sha256(token + MERCHANT_JWT_SECRET)`, `tokenExpiresAt` = now+7d, send Resend and/or Quo with `${PUBLIC_APP_URL}/uw/${token}`, status `sent`, `sentAt`
+  - `resend` `{ requestId }` ΓåÆ cancel if needed + same as send on new or same row (prefer update same row with new token if still unsigned)
+  - `cancel` `{ requestId }` ΓåÆ `cancelled`
+  - `getSignedUrl` `{ requestId }` ΓåÆ `{ signedPdfUrl }` if status signed|sent_to_elavon
+  - `sendToElavon` `{ requestId, to, subject, bodyText }` ΓåÆ require signed PDF; Gmail send multipart; log `UnderwritingMessage` outbound; set `sent_to_elavon`
+
+**Email/SMS:** Copy Resend + Quo patterns from `nudgeMerchant/entry.ts` (normalizePhone, Quo-Api-Version `2026-03-30`, Resend from `onboarding@onboarding.cliqbuxpos.com`). SMS body must not include TIN.
+
+**Gmail send:** Reuse token refresh from `syncUnderwritingMail`; POST `https://gmail.googleapis.com/gmail/v1/users/me/messages/send` with raw RFC 2822 base64url MIME (PDF attachment). On missing scope, return 503 with hint to reconnect OAuth with `gmail.send`.
+
+- [ ] **Step 1: Scaffold function** with action switch + admin gate + `list`/`create`/`cancel` (no email yet).
+
+- [ ] **Step 2: Add `send`/`resend`** with Resend + Quo.
+
+- [ ] **Step 3: Add `sendToElavon` + `getSignedUrl`.**
+
+- [ ] **Step 4: Manual smoke** against published app after entity publish (or document blocked until publish).
+
+- [ ] **Step 5: Commit**
+
+```bash
+git add base44/functions/manageUnderwritingRequest/entry.ts
+git commit -m "feat(uw): admin manageUnderwritingRequest send and Elavon forward"
+```
+
+---
+
+### Task 5: `completeUnderwritingRequest` (token + PDF)
+
+**Files:**
+- Create: `base44/functions/completeUnderwritingRequest/entry.ts`
+
+**Interfaces:**
+- No `auth.me()` gate. Body always includes `token`.
+- `get` `{ token }` ΓåÆ lookup by hashing token; if expired ΓåÆ 410; if signed ΓåÆ `{ status, fields, signedPdfUrl, viewOnly: true }`; else mark `opened` once, return `{ status, fields, agentNote, midLabel?, expiresAt }` (full TIN ok ΓÇö token holder).
+- `submitSignature` `{ token, fields, signatureDataUrl }` ΓåÆ validate fields; if already signed return existing URL; decode PNG from data URL; load pinned PDF bytes (bundle: fetch from `PUBLIC_APP_URL/assets/irs/fw9.pdf` **or** embed base64 constant generated at build ΓÇö prefer fetch from app public URL after copying PDF to `public/irs/fw9.pdf`); fill+flatten; `asServiceRole.integrations.Core.UploadFile`; update request `signed`, `signedPdfUrl`, `prefillSnapshot`, `signedAt`; return `{ signedPdfUrl }`.
+
+Also copy PDF to `public/irs/fw9.pdf` so Deno can `fetch` it without shipping megabytes in source.
+
+- [ ] **Step 1: Implement token hash lookup + `get`.**
+
+- [ ] **Step 2: Implement `submitSignature` with inlined pdf-lib fill (sync field names from `fw9-field-map.md`).**
+
+- [ ] **Step 3: Idempotent re-submit test plan** (call twice ΓåÆ same URL).
+
+- [ ] **Step 4: Commit**
+
+```bash
+git add base44/functions/completeUnderwritingRequest/entry.ts public/irs/fw9.pdf
+git commit -m "feat(uw): token-gated W-9 complete and PDF stamp"
+```
+
+---
+
+### Task 6: Merchant page `/uw/:token`
+
+**Files:**
+- Create: `src/pages/UnderwritingW9Sign.jsx`
+- Modify: `src/App.jsx` ΓÇö public route (no AdminProtectedRoute, no merchant JWT required)
+
+**UI:**
+- Load via `base44.functions.invoke('completeUnderwritingRequest', { action: 'get', token })` (public function invoke ΓÇö same as `verifySignerToken` pattern; if CORS/auth blocks anonymous invoke, use raw `fetch` to `/functions/completeUnderwritingRequest` like other public entry points).
+- Form: editable fields from model; Continue ΓåÆ canvas draw **or** typed name ΓåÆ Submit.
+- States: loading, expired, error, signed confirmation + download link.
+- Use `cb-*` tokens; light form surface for readability.
+
+- [ ] **Step 1: Add route + skeleton page.**
+
+- [ ] **Step 2: Wire get + submit + signature pad** (simple canvas; typed mode renders text to canvas before submit).
+
+- [ ] **Step 3: Manual check** on `/uw/test` expired state + happy path against staging function.
+
+- [ ] **Step 4: Commit**
+
+```bash
+git add src/pages/UnderwritingW9Sign.jsx src/App.jsx
+git commit -m "feat(uw): merchant W-9 review and sign page"
+```
+
+---
+
+### Task 7: Deal Room `UnderwritingRequestsPanel`
+
+**Files:**
+- Create: `src/components/deal-room/UnderwritingRequestsPanel.jsx`
+- Modify: `src/pages/ApplicationDealRoom.jsx` ΓÇö render panel under Underwriting-by-MID when `selectedMid` set; pass `corporateId`, `mid`, `legalEntities`, `signers`, `profile`
+
+**UI flow:**
+1. List requests for MID (status dots + recipient + dates)
+2. New W-9: entity select ΓåÆ recipient select (from signers) ΓåÆ editable email/phone ΓåÆ channels checkboxes ΓåÆ note ΓåÆ Create & Send (or Create draft then Send)
+3. Signed row: Download + Send to Elavon modal (To prefilled from `UNDERWRITING_ELAVON_DOCS_TO` if API returns it; Subject with AWB; body textarea)
+4. Resend / Cancel on unsigned
+
+Load people from Deal Room `data.signers` already fetched by `manageApplicationDesk.get`. Prefill preview from client `buildW9Prefill` for agent confidence before send (server still authoritative on create).
+
+- [ ] **Step 1: Build panel component** with list + new request form.
+
+- [ ] **Step 2: Mount in Deal Room**; wire invoke `manageUnderwritingRequest`.
+
+- [ ] **Step 3: Add Send to Elavon modal.**
+
+- [ ] **Step 4: Commit**
+
+```bash
+git add src/components/deal-room/UnderwritingRequestsPanel.jsx src/pages/ApplicationDealRoom.jsx
+git commit -m "feat(uw): Deal Room underwriting requests panel for W-9"
+```
+
+---
+
+### Task 8: Docs + Gmail scope + agent briefing
+
+**Files:**
+- Modify: `docs/underwriting-inbox.md` ΓÇö scopes include `gmail.send`; env `UNDERWRITING_ELAVON_DOCS_TO`; W-9 send flow pointer to spec
+- Modify: `AGENTS.md` ΓÇö short subsection under Merchant Center / Deal Room
+- Append: `AI_CHANNEL.md` ΓÇö entry that W-9 UW request shipped in plan
+- Optional vault: amend `Cliqbux Second Brain/specs/merchant-center.md` Constraints/Behavior with link to repo spec (no live data)
+
+- [ ] **Step 1: Update docs.**
+
+- [ ] **Step 2: Checklist for Teddy:** republish entity; re-consent Gmail; set env vars; redeploy both functions; smoke one test MID.
+
+- [ ] **Step 3: Commit**
+
+```bash
+git add docs/underwriting-inbox.md AGENTS.md AI_CHANNEL.md
+git commit -m "docs(uw): W-9 underwriting request and Gmail send scopes"
+```
+
+---
+
+## Spec coverage check
+
+| Spec requirement | Task |
+|---|---|
+| In-house magic link e-sign | 5, 6 |
+| Agent picks recipient from deal people | 7 |
+| Merchant can edit any field | 6 |
+| Email / SMS / both | 4 |
+| Per-MID requests | 3, 4 |
+| Prefill from legal entity | 1, 4 |
+| Signed PDF in Deal Room | 5, 7 |
+| Gmail send with attachment | 4, 8 |
+| Panel extensible for future types | 3 (`type` enum), 7 |
+| Token expiry / resend / idempotent sign | 4, 5 |
+| No BoldSign / no checklist replacement | Global constraints |
+
+## Rollout (human)
+
+1. Publish `UnderwritingRequest` entity in Base44  
+2. Push + redeploy `manageUnderwritingRequest`, `completeUnderwritingRequest`  
+3. Re-consent underwriting@ OAuth with `https://www.googleapis.com/auth/gmail.send` (+ keep readonly for sync)  
+4. Set `UNDERWRITING_ELAVON_DOCS_TO` when known  
+5. Smoke: send ΓåÆ sign ΓåÆ download ΓåÆ send to self ΓåÆ confirm attachment  
+
+---
+
+## Execution
+
+After this plan is saved, choose:
+
+1. **Subagent-Driven (recommended)** ΓÇö fresh subagent per task + review between tasks  
+2. **Inline Execution** ΓÇö execute tasks in this session with checkpoints  
+
+Which approach?
diff --git a/docs/superpowers/specs/2026-08-07-underwriting-w9-request-design.md b/docs/superpowers/specs/2026-08-07-underwriting-w9-request-design.md
index 813b93e..e4b040a 100644
--- a/docs/superpowers/specs/2026-08-07-underwriting-w9-request-design.md
+++ b/docs/superpowers/specs/2026-08-07-underwriting-w9-request-design.md
@@ -2,5 +2,5 @@
 
 **Date:** 2026-08-07  
-**Status:** Draft ΓÇö awaiting Teddy review  
+**Status:** Approved ΓÇö ready to implement  
 **Repo:** Cliqbux_onboarding  
 **Surfaces:** Deal Room (`/admin/applications/:corporateId`), merchant `/uw/:token`
diff --git a/docs/underwriting-inbox.md b/docs/underwriting-inbox.md
index f878e16..4044f6e 100644
--- a/docs/underwriting-inbox.md
+++ b/docs/underwriting-inbox.md
@@ -52,6 +52,12 @@ Set in Base44 env:
 | `UNDERWRITING_GMAIL_QUERY` | Optional Gmail search override |
 | `UNDERWRITING_GMAIL_ACCESS_TOKEN` | Optional short-lived token (skips refresh; testing only) |
+| `UNDERWRITING_ELAVON_DOCS_TO` | Optional default **To** for Deal Room **Send to Elavon** (signed W-9 PDF). Leave unset until CliqBux confirms the inbox ΓÇö agents fill To manually in the modal. Never invent an Elavon address. |
 
-Scopes needed: `https://www.googleapis.com/auth/gmail.readonly`
+**OAuth scopes (re-consent required when adding send):**
+
+- `https://www.googleapis.com/auth/gmail.readonly` ΓÇö inbound sync (`syncUnderwritingMail`)
+- `https://www.googleapis.com/auth/gmail.send` ΓÇö outbound W-9 forward to Elavon (`manageUnderwritingRequest` action `sendToElavon`)
+
+After upgrading scopes, generate a **new refresh token** for underwriting@ and update `UNDERWRITING_GMAIL_REFRESH_TOKEN` in Base44. A token minted with readonly-only consent will fail `sendToElavon` with an insufficient-scope error; the Deal Room panel surfaces that banner.
 
 Default search (when query unset) includes mail to underwriting@ **and** from Elavon status/escalation addresses:
@@ -61,4 +67,24 @@ Default search (when query unset) includes mail to underwriting@ **and** from El
 Then redeploy `syncUnderwritingMail`. From Deal Room, **Sync inbox** matches by AWB on the current dealΓÇÖs MIDs.
 
+## W-9 underwriting requests (outbound send)
+
+Deal Room **Underwriting requests** (per selected MID) lets agents request a signed IRS Form W-9 from a merchant contact (email and/or SMS), collect an in-house e-sign at `/uw/:token`, then **Send to Elavon** from underwriting@ with the signed PDF attached.
+
+| Step | Who | What |
+|---|---|---|
+| 1 | Agent | Deal Room ΓåÆ select MID ΓåÆ **Underwriting requests** ΓåÆ New W-9 ΓåÆ pick legal entity + recipient ΓåÆ Send |
+| 2 | Merchant | Opens magic link ΓåÆ reviews/edits prefilled fields ΓåÆ signs ΓåÆ download confirmation |
+| 3 | Agent | **Download** signed PDF; **Send to Elavon** (editable To / Subject / body; Subject prefilled with AWB when `MerchantMID.elavonAwb` is set) |
+| 4 | System | Gmail send logs an outbound row on the MID `UnderwritingMessage` thread |
+
+**Functions:** `manageUnderwritingRequest` (admin: list / create / send / resend / cancel / getSignedUrl / sendToElavon), `completeUnderwritingRequest` (token: get / saveDraft / submitSignature).
+
+**Entity:** `UnderwritingRequest` ΓÇö **republish in Base44** before live use (undeclared fields strip on save).
+
+**Design spec (canonical):** `docs/superpowers/specs/2026-08-07-underwriting-w9-request-design.md`  
+**Implementation plan:** `docs/superpowers/plans/2026-08-07-underwriting-w9-request.md`
+
+Inbound AWB status sync and W-9 outbound send share the same underwriting@ OAuth client but use different Gmail API methods (list/get vs send).
+
 ## Matching rules
 
@@ -72,5 +98,8 @@ Then redeploy `syncUnderwritingMail`. From Deal Room, **Sync inbox** matches by
 - `MerchantMID.elavonAwb`
 - `UnderwritingMessage`
+- `UnderwritingRequest` ΓÇö MID-scoped W-9 (and future doc types)
 - `manageApplicationDesk` ΓÇö `setMidAwb`, `logUwMessage`, `deleteUwMessage`, `requestStatusInquiry`, `refreshAwbFromMsp`
+- `manageUnderwritingRequest` ΓÇö W-9 create/send/resend/cancel; Gmail `sendToElavon` with PDF attachment
+- `completeUnderwritingRequest` ΓÇö merchant token page `/uw/:token`
 - `submitToMSP` / `pollMSPStatus` ΓÇö capture `elavonAwb` from MSP after submit
-- `syncUnderwritingMail` ΓÇö Gmail pull
+- `syncUnderwritingMail` ΓÇö Gmail pull (readonly scope)
diff --git a/package-lock.json b/package-lock.json
index ba890c9..4e58e5c 100644
--- a/package-lock.json
+++ b/package-lock.json
@@ -59,4 +59,5 @@
         "moment": "^2.30.1",
         "next-themes": "^0.4.4",
+        "pdf-lib": "^1.17.1",
         "react": "^18.2.0",
         "react-day-picker": "^8.10.1",
@@ -1217,4 +1218,34 @@
       }
     },
+    "node_modules/@pdf-lib/standard-fonts": {
+      "version": "1.0.0",
+      "resolved": "https://registry.npmjs.org/@pdf-lib/standard-fonts/-/standard-fonts-1.0.0.tgz",
+      "integrity": "sha512-hU30BK9IUN/su0Mn9VdlVKsWBS6GyhVfqjwl1FjZN4TxP6cCw0jP2w7V3Hf5uX7M0AZJ16vey9yE0ny7Sa59ZA==",
+      "license": "MIT",
+      "dependencies": {
+        "pako": "^1.0.6"
+      }
+    },
+    "node_modules/@pdf-lib/standard-fonts/node_modules/pako": {
+      "version": "1.0.11",
+      "resolved": "https://registry.npmjs.org/pako/-/pako-1.0.11.tgz",
+      "integrity": "sha512-4hLB8Py4zZce5s4yd9XzopqwVv/yGNhV1Bl8NTmCq1763HeK2+EwVTv+leGeL13Dnh2wfbqowVPXCIO0z4taYw==",
+      "license": "(MIT AND Zlib)"
+    },
+    "node_modules/@pdf-lib/upng": {
+      "version": "1.0.1",
+      "resolved": "https://registry.npmjs.org/@pdf-lib/upng/-/upng-1.0.1.tgz",
+      "integrity": "sha512-dQK2FUMQtowVP00mtIksrlZhdFXQZPC+taih1q4CvPZ5vqdxR/LKBaFg0oAfzd1GlHZXXSPdQfzQnt+ViGvEIQ==",
+      "license": "MIT",
+      "dependencies": {
+        "pako": "^1.0.10"
+      }
+    },
+    "node_modules/@pdf-lib/upng/node_modules/pako": {
+      "version": "1.0.11",
+      "resolved": "https://registry.npmjs.org/pako/-/pako-1.0.11.tgz",
+      "integrity": "sha512-4hLB8Py4zZce5s4yd9XzopqwVv/yGNhV1Bl8NTmCq1763HeK2+EwVTv+leGeL13Dnh2wfbqowVPXCIO0z4taYw==",
+      "license": "(MIT AND Zlib)"
+    },
     "node_modules/@playwright/test": {
       "version": "1.61.1",
@@ -7947,4 +7978,28 @@
       "license": "MIT"
     },
+    "node_modules/pdf-lib": {
+      "version": "1.17.1",
+      "resolved": "https://registry.npmjs.org/pdf-lib/-/pdf-lib-1.17.1.tgz",
+      "integrity": "sha512-V/mpyJAoTsN4cnP31vc0wfNA1+p20evqqnap0KLoRUN0Yk/p3wN52DOEsL4oBFcLdb76hlpKPtzJIgo67j/XLw==",
+      "license": "MIT",
+      "dependencies": {
+        "@pdf-lib/standard-fonts": "^1.0.0",
+        "@pdf-lib/upng": "^1.0.1",
+        "pako": "^1.0.11",
+        "tslib": "^1.11.1"
+      }
+    },
+    "node_modules/pdf-lib/node_modules/pako": {
+      "version": "1.0.11",
+      "resolved": "https://registry.npmjs.org/pako/-/pako-1.0.11.tgz",
+      "integrity": "sha512-4hLB8Py4zZce5s4yd9XzopqwVv/yGNhV1Bl8NTmCq1763HeK2+EwVTv+leGeL13Dnh2wfbqowVPXCIO0z4taYw==",
+      "license": "(MIT AND Zlib)"
+    },
+    "node_modules/pdf-lib/node_modules/tslib": {
+      "version": "1.14.1",
+      "resolved": "https://registry.npmjs.org/tslib/-/tslib-1.14.1.tgz",
+      "integrity": "sha512-Xni35NKzjgMrwevysHTCArtLDpPvye8zV/0E4EyYn43P7/7qvQwPh9BGkHewbMulVntbigmcT7rdX3BNo9wRJg==",
+      "license": "0BSD"
+    },
     "node_modules/performance-now": {
       "version": "2.1.0",
diff --git a/package.json b/package.json
index 6ba829c..00c67c9 100644
--- a/package.json
+++ b/package.json
@@ -19,4 +19,5 @@
     "test:feedback-shot": "node --test src/lib/feedbackScreenshot.test.js",
     "test:signing-layout": "node --test src/lib/signingFrameLayout.test.js",
+    "test:w9": "node --test src/lib/w9*.test.js",
     "test:signing-mobile": "playwright test --config=playwright.config.ts --project=signing-mobile",
     "test:stress": "playwright test --config=playwright.config.ts",
@@ -74,4 +75,5 @@
     "moment": "^2.30.1",
     "next-themes": "^0.4.4",
+    "pdf-lib": "^1.17.1",
     "react": "^18.2.0",
     "react-day-picker": "^8.10.1",
diff --git a/scripts/inspect-w9-fields.mjs b/scripts/inspect-w9-fields.mjs
new file mode 100644
index 0000000..58954cd
--- /dev/null
+++ b/scripts/inspect-w9-fields.mjs
@@ -0,0 +1,39 @@
+/**
+ * One-off inspector: list AcroForm field names in the pinned IRS W-9 PDF.
+ * Run: node scripts/inspect-w9-fields.mjs
+ */
+import { readFileSync } from 'node:fs';
+import { fileURLToPath } from 'node:url';
+import { dirname, join } from 'node:path';
+import { PDFDocument } from 'pdf-lib';
+
+const __dirname = dirname(fileURLToPath(import.meta.url));
+const pdfPath = join(__dirname, '..', 'assets', 'irs', 'fw9.pdf');
+
+const bytes = readFileSync(pdfPath);
+const doc = await PDFDocument.load(bytes);
+const form = doc.getForm();
+
+console.log(`PDF: ${pdfPath}`);
+console.log(`Pages: ${doc.getPageCount()}`);
+console.log(`Fields: ${form.getFields().length}\n`);
+
+for (const field of form.getFields()) {
+  const name = field.getName();
+  const ctor = field.constructor.name;
+  let detail = '';
+
+  if (ctor === 'PDFTextField') {
+    detail = `text maxLen=${field.getMaxLength?.() ?? 'n/a'}`;
+  } else if (ctor === 'PDFCheckBox') {
+    detail = 'checkbox';
+  } else if (ctor === 'PDFRadioGroup') {
+    const opts = field.getOptions?.() ?? [];
+    detail = `radio options=[${opts.join(', ')}]`;
+  } else if (ctor === 'PDFDropdown') {
+    const opts = field.getOptions?.() ?? [];
+    detail = `dropdown options=[${opts.join(', ')}]`;
+  }
+
+  console.log(`${name}\t${ctor}\t${detail}`);
+}
diff --git a/scripts/inspect-w9-widgets.mjs b/scripts/inspect-w9-widgets.mjs
new file mode 100644
index 0000000..94146fb
--- /dev/null
+++ b/scripts/inspect-w9-widgets.mjs
@@ -0,0 +1,53 @@
+/**
+ * Dump AcroForm widget rectangles (page index + PDF coords) for overlay placement.
+ * Run: node scripts/inspect-w9-widgets.mjs
+ */
+import { readFileSync } from 'node:fs';
+import { fileURLToPath } from 'node:url';
+import { dirname, join } from 'node:path';
+import { PDFDocument } from 'pdf-lib';
+
+const __dirname = dirname(fileURLToPath(import.meta.url));
+const pdfPath = join(__dirname, '..', 'assets', 'irs', 'fw9.pdf');
+
+const bytes = readFileSync(pdfPath);
+const doc = await PDFDocument.load(bytes);
+const form = doc.getForm();
+const pages = doc.getPages();
+
+console.log(`PDF: ${pdfPath}`);
+console.log(`Page 0 size: ${pages[0].getWidth()} ├ù ${pages[0].getHeight()} pt\n`);
+console.log('field\tpage\tx\ty\twidth\theight');
+
+const rows = [];
+
+for (const field of form.getFields()) {
+  const widgets = field.acroField.getWidgets?.() ?? [];
+  for (const widget of widgets) {
+    const rect = widget.getRectangle?.();
+    if (!rect) continue;
+    const pageRef = widget.P?.();
+    const pageIndex = pageRef ? pages.findIndex((p) => p.ref === pageRef) : -1;
+    rows.push({
+      name: field.getName(),
+      pageIndex,
+      x: rect.x,
+      y: rect.y,
+      width: rect.width,
+      height: rect.height,
+    });
+  }
+}
+
+rows.sort((a, b) => a.y - b.y || a.x - b.x);
+
+for (const r of rows) {
+  console.log(
+    `${r.name}\t${r.pageIndex}\t${r.x.toFixed(1)}\t${r.y.toFixed(1)}\t${r.width.toFixed(1)}\t${r.height.toFixed(1)}`,
+  );
+}
+
+if (rows.length) {
+  const lowest = rows.reduce((min, r) => (r.y < min.y ? r : min), rows[0]);
+  console.log(`\nLowest widget (min y): ${lowest.name} at y=${lowest.y.toFixed(1)}`);
+}
diff --git a/scripts/sync-w9-pdf.mjs b/scripts/sync-w9-pdf.mjs
new file mode 100644
index 0000000..fe178cc
--- /dev/null
+++ b/scripts/sync-w9-pdf.mjs
@@ -0,0 +1,14 @@
+/**
+ * Copy canonical W-9 PDF from assets/ to public/ for static serving.
+ * Run: node scripts/sync-w9-pdf.mjs
+ */
+import { copyFileSync } from 'node:fs';
+import { fileURLToPath } from 'node:url';
+import { dirname, join } from 'node:path';
+
+const root = join(dirname(fileURLToPath(import.meta.url)), '..');
+const src = join(root, 'assets', 'irs', 'fw9.pdf');
+const dest = join(root, 'public', 'irs', 'fw9.pdf');
+
+copyFileSync(src, dest);
+console.log(`Copied ${src} ΓåÆ ${dest}`);
diff --git a/src/App.jsx b/src/App.jsx
index 99fbbc3..028f6e5 100644
--- a/src/App.jsx
+++ b/src/App.jsx
@@ -9,4 +9,5 @@ import ScrollToTop from './components/ScrollToTop';
 import OnboardingPortal from './pages/OnboardingPortal';
 import VerifyIdentity from './pages/VerifyIdentity';
+import UnderwritingW9Sign from './pages/UnderwritingW9Sign';
 import PostSubmissionDashboard from './pages/PostSubmissionDashboard';
 import SystemAdminHidden from './pages/SystemAdminHidden';
@@ -64,4 +65,5 @@ function App() {
             <Route path="/" element={<OnboardingPortal />} />
             <Route path="/verify" element={<VerifyIdentity />} />
+            <Route path="/uw/:token" element={<UnderwritingW9Sign />} />
             <Route path="/onboarding/dashboard" element={<PostSubmissionDashboard />} />
             <Route path="/center" element={<PostSubmissionDashboard />} />
diff --git a/src/components/deal-room/UnderwritingRequestsPanel.jsx b/src/components/deal-room/UnderwritingRequestsPanel.jsx
new file mode 100644
index 0000000..17ac61f
--- /dev/null
+++ b/src/components/deal-room/UnderwritingRequestsPanel.jsx
@@ -0,0 +1,710 @@
+import { useCallback, useEffect, useMemo, useState } from 'react';
+import {
+  Loader2, FileText, Plus, Send, RefreshCw, X, Download, Mail,
+} from 'lucide-react';
+import { base44 } from '@/api/base44Client';
+import { buildW9Prefill } from '@/lib/w9Prefill';
+
+const FN = 'manageUnderwritingRequest';
+
+const inputCls =
+  'w-full bg-cb-bg border border-cb-border rounded-cb px-3 py-2 text-cb-body text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-cb-accent';
+
+const TAX_LABELS = {
+  individual: 'Individual / sole prop',
+  c_corp: 'C Corporation',
+  s_corp: 'S Corporation',
+  partnership: 'Partnership',
+  trust: 'Trust / estate',
+  llc: 'LLC',
+  other: 'Other',
+};
+
+const UNSIGNED = new Set(['draft', 'sent', 'opened', 'send_failed']);
+const SIGNED = new Set(['signed', 'sent_to_elavon']);
+
+function formatWhen(iso) {
+  if (!iso) return '';
+  try {
+    return new Date(iso).toLocaleString(undefined, {
+      month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
+    });
+  } catch {
+    return iso;
+  }
+}
+
+function statusDotClass(status) {
+  const s = String(status || '');
+  if (s === 'signed' || s === 'sent_to_elavon') return 'bg-cb-success';
+  if (s === 'send_failed') return 'bg-cb-danger';
+  if (s === 'opened') return 'bg-sky-400';
+  if (s === 'sent') return 'bg-cb-accent';
+  if (s === 'draft') return 'bg-gray-500';
+  if (s === 'cancelled' || s === 'expired') return 'bg-gray-600';
+  return 'bg-gray-500';
+}
+
+function statusLabel(status) {
+  const map = {
+    draft: 'Draft',
+    sent: 'Sent',
+    opened: 'Opened',
+    signed: 'Signed',
+    sent_to_elavon: 'Sent to Elavon',
+    cancelled: 'Cancelled',
+    expired: 'Expired',
+    send_failed: 'Send failed',
+  };
+  return map[status] || status || 'ΓÇö';
+}
+
+function signerDisplayName(s) {
+  return [s?.firstName, s?.lastName].filter(Boolean).join(' ').trim() || s?.signerEmail || 'Signer';
+}
+
+function isControlPerson(s) {
+  if (!s || s.isPortalAdmin === true) return false;
+  if (s.isAuthorizedSigner === true) return true;
+  if (s.isAuthorizedSigner == null && s.isPrimarySigner === true) return true;
+  return false;
+}
+
+function channelsFromChecks(wantEmail, wantSms) {
+  if (wantEmail && wantSms) return 'both';
+  if (wantSms) return 'sms';
+  return 'email';
+}
+
+function invokeUw(payload) {
+  return base44.functions.invoke(FN, payload);
+}
+
+/**
+ * Deal Room MID panel: list / create+send W-9 requests, download signed PDF, forward to Elavon.
+ */
+export default function UnderwritingRequestsPanel({
+  corporateId,
+  mid,
+  legalEntities = [],
+  signers = [],
+  profile,
+  locations = [],
+}) {
+  const midId = mid?.id || '';
+
+  const [loading, setLoading] = useState(true);
+  const [error, setError] = useState('');
+  const [requests, setRequests] = useState([]);
+  const [elavonDocsToHint, setElavonDocsToHint] = useState('');
+  const [busyId, setBusyId] = useState('');
+  const [formOpen, setFormOpen] = useState(false);
+
+  const [legalEntityId, setLegalEntityId] = useState('');
+  const [recipientId, setRecipientId] = useState('');
+  const [recipientName, setRecipientName] = useState('');
+  const [recipientEmail, setRecipientEmail] = useState('');
+  const [recipientPhone, setRecipientPhone] = useState('');
+  const [wantEmail, setWantEmail] = useState(true);
+  const [wantSms, setWantSms] = useState(false);
+  const [agentNote, setAgentNote] = useState('');
+  const [creating, setCreating] = useState(false);
+
+  const [elavonModal, setElavonModal] = useState(null); // { requestId, to, subject, bodyText }
+  const [sendingElavon, setSendingElavon] = useState(false);
+
+  const load = useCallback(async () => {
+    if (!corporateId || !midId) return;
+    setLoading(true);
+    setError('');
+    try {
+      const res = await invokeUw({ action: 'list', corporateId, midId });
+      if (res.data?.code === 'ENTITY_SCHEMA_MISSING') {
+        setError(res.data.error || 'UnderwritingRequest entity not published yet.');
+        setRequests([]);
+        return;
+      }
+      if (res.data?.error) throw new Error(res.data.error);
+      setRequests(res.data?.requests || []);
+      if (res.data?.elavonDocsToHint) setElavonDocsToHint(res.data.elavonDocsToHint);
+    } catch (err) {
+      setError(err?.response?.data?.error || err?.message || 'Could not load requests');
+      setRequests([]);
+    } finally {
+      setLoading(false);
+    }
+  }, [corporateId, midId]);
+
+  useEffect(() => {
+    load();
+  }, [load]);
+
+  // Default entity + recipient when opening form / when lists change
+  useEffect(() => {
+    if (!legalEntityId && legalEntities.length === 1) {
+      setLegalEntityId(legalEntities[0].entityId || '');
+    }
+  }, [legalEntities, legalEntityId]);
+
+  useEffect(() => {
+    if (recipientId || !signers.length) return;
+    const control = signers.find(isControlPerson) || signers[0];
+    if (control) {
+      setRecipientId(control.id);
+      setRecipientName(signerDisplayName(control));
+      setRecipientEmail(String(control.signerEmail || '').trim());
+      setRecipientPhone(String(control.corporatePhone || '').trim());
+    }
+  }, [signers, recipientId]);
+
+  const selectedEntity = useMemo(
+    () => legalEntities.find((e) => String(e.entityId) === String(legalEntityId)) || null,
+    [legalEntities, legalEntityId],
+  );
+
+  const controlPerson = useMemo(
+    () => signers.find(isControlPerson) || signers[0] || null,
+    [signers],
+  );
+
+  const locationFallback = useMemo(() => {
+    if (!mid?.locationId) return locations[0] || null;
+    return locations.find((l) => String(l.id) === String(mid.locationId)) || locations[0] || null;
+  }, [mid?.locationId, locations]);
+
+  const prefillPreview = useMemo(() => {
+    if (!selectedEntity) return null;
+    return buildW9Prefill({
+      legalEntity: selectedEntity,
+      controlPerson,
+      locationFallback,
+    });
+  }, [selectedEntity, controlPerson, locationFallback]);
+
+  const onPickRecipient = (id) => {
+    setRecipientId(id);
+    const s = signers.find((x) => String(x.id) === String(id));
+    if (!s) return;
+    setRecipientName(signerDisplayName(s));
+    setRecipientEmail(String(s.signerEmail || '').trim());
+    setRecipientPhone(String(s.corporatePhone || '').trim());
+  };
+
+  const resetForm = () => {
+    setAgentNote('');
+    setWantEmail(true);
+    setWantSms(false);
+    setFormOpen(false);
+  };
+
+  const createAndSend = async () => {
+    if (!corporateId || !midId || creating) return;
+    if (!legalEntityId) {
+      setError('Select a legal entity');
+      return;
+    }
+    if (!recipientName.trim()) {
+      setError('Recipient name is required');
+      return;
+    }
+    if (!wantEmail && !wantSms) {
+      setError('Pick at least one channel (email or SMS)');
+      return;
+    }
+    const channels = channelsFromChecks(wantEmail, wantSms);
+    if ((channels === 'email' || channels === 'both') && !recipientEmail.trim()) {
+      setError('Email required when Email channel is selected');
+      return;
+    }
+    if ((channels === 'sms' || channels === 'both') && !recipientPhone.trim()) {
+      setError('Phone required when SMS channel is selected');
+      return;
+    }
+
+    setCreating(true);
+    setError('');
+    try {
+      const createRes = await invokeUw({
+        action: 'create',
+        corporateId,
+        midId,
+        legalEntityId,
+        recipientName: recipientName.trim(),
+        recipientEmail: recipientEmail.trim() || undefined,
+        recipientPhone: recipientPhone.trim() || undefined,
+        channels,
+        agentNote: agentNote.trim() || undefined,
+      });
+      if (createRes.data?.error) throw new Error(createRes.data.error);
+      const requestId = createRes.data?.request?.id;
+      if (!requestId) throw new Error('Create succeeded but no request id returned');
+
+      const sendRes = await invokeUw({ action: 'send', requestId });
+      if (sendRes.data?.error) {
+        const warn = sendRes.data?.warnings || sendRes.data?.results?.errors;
+        throw new Error(
+          sendRes.data.error
+            + (warn?.length ? ` ΓÇö ${warn.join('; ')}` : ''),
+        );
+      }
+      if (sendRes.data?.elavonDocsToHint) setElavonDocsToHint(sendRes.data.elavonDocsToHint);
+      resetForm();
+      await load();
+    } catch (err) {
+      setError(err?.response?.data?.error || err?.message || 'Create & Send failed');
+      await load();
+    } finally {
+      setCreating(false);
+    }
+  };
+
+  const runAction = async (requestId, action) => {
+    if (!requestId || busyId) return;
+    setBusyId(`${action}:${requestId}`);
+    setError('');
+    try {
+      const res = await invokeUw({ action, requestId });
+      if (res.data?.error) throw new Error(res.data.error);
+      await load();
+    } catch (err) {
+      setError(err?.response?.data?.error || err?.message || `${action} failed`);
+    } finally {
+      setBusyId('');
+    }
+  };
+
+  const downloadSigned = async (requestId) => {
+    if (!requestId || busyId) return;
+    setBusyId(`dl:${requestId}`);
+    setError('');
+    try {
+      const res = await invokeUw({ action: 'getSignedUrl', requestId });
+      if (res.data?.error) throw new Error(res.data.error);
+      const url = res.data?.signedPdfUrl;
+      if (!url) throw new Error('No signed PDF URL');
+      if (res.data?.elavonDocsToHint) setElavonDocsToHint(res.data.elavonDocsToHint);
+      window.open(url, '_blank', 'noopener,noreferrer');
+    } catch (err) {
+      setError(err?.response?.data?.error || err?.message || 'Download failed');
+    } finally {
+      setBusyId('');
+    }
+  };
+
+  const openElavonModal = async (req) => {
+    setError('');
+    const awb = (mid?.elavonAwb || '').trim();
+    const dba = mid?.dbaName || mid?.merchantName || profile?.legalName || 'Merchant';
+    setElavonModal({
+      requestId: req.id,
+      to: elavonDocsToHint || '',
+      subject: awb
+        ? `W-9 ΓÇö AWB ${awb} ΓÇö ${dba}`
+        : `W-9 ΓÇö ${dba}`,
+      bodyText: [
+        'Hello,',
+        '',
+        `Please find attached the signed W-9 for ${dba}.`,
+        awb ? `AWB: ${awb}` : null,
+        mid?.elavonMID ? `MID: ${mid.elavonMID}` : null,
+        '',
+        'Thank you,',
+        'CliqBux Underwriting',
+      ].filter((line) => line !== null).join('\n'),
+    });
+  };
+
+  const submitElavon = async () => {
+    if (!elavonModal || sendingElavon) return;
+    const { requestId, to, subject, bodyText } = elavonModal;
+    if (!to.trim()) {
+      setError('To address is required');
+      return;
+    }
+    if (!subject.trim() || !bodyText.trim()) {
+      setError('Subject and body are required');
+      return;
+    }
+    setSendingElavon(true);
+    setError('');
+    try {
+      const res = await invokeUw({
+        action: 'sendToElavon',
+        requestId,
+        to: to.trim(),
+        subject: subject.trim(),
+        bodyText: bodyText.trim(),
+      });
+      if (res.data?.error) throw new Error(res.data.error);
+      if (res.data?.elavonDocsToHint) setElavonDocsToHint(res.data.elavonDocsToHint);
+      setElavonModal(null);
+      await load();
+    } catch (err) {
+      setError(err?.response?.data?.error || err?.message || 'Send to Elavon failed');
+    } finally {
+      setSendingElavon(false);
+    }
+  };
+
+  if (!midId) return null;
+
+  return (
+    <div className="rounded-cb border border-cb-border bg-cb-bg p-3 space-y-3">
+      <div className="flex flex-wrap items-center justify-between gap-2">
+        <p className="text-cb-caption text-gray-500 flex items-center gap-1.5">
+          <FileText className="w-3.5 h-3.5" /> Underwriting requests
+        </p>
+        <div className="flex items-center gap-2">
+          <button
+            type="button"
+            onClick={load}
+            disabled={loading}
+            className="text-gray-500 hover:text-white p-1"
+            aria-label="Refresh requests"
+          >
+            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
+          </button>
+          <button
+            type="button"
+            onClick={() => setFormOpen((v) => !v)}
+            className="flex items-center gap-1.5 text-cb-caption font-medium px-2.5 py-1.5 rounded-cb border border-cb-border text-gray-300 hover:text-white hover:border-cb-border-strong"
+          >
+            <Plus className="w-3.5 h-3.5" />
+            New W-9
+          </button>
+        </div>
+      </div>
+
+      {error && (
+        <p className="text-cb-caption text-cb-danger whitespace-pre-wrap">{error}</p>
+      )}
+
+      {formOpen && (
+        <div className="rounded-cb border border-cb-border bg-cb-surface-raised p-3 space-y-3">
+          <p className="text-cb-body text-white font-medium">New W-9 request</p>
+
+          <div>
+            <label className="block text-cb-caption text-gray-500 mb-1.5">Legal entity</label>
+            <select
+              value={legalEntityId}
+              onChange={(e) => setLegalEntityId(e.target.value)}
+              className={inputCls}
+            >
+              <option value="">Select entityΓÇª</option>
+              {legalEntities.map((e) => (
+                <option key={e.entityId} value={e.entityId}>
+                  {e.legalBusinessName || 'Entity'}
+                  {e.federalEIN ? ` ┬╖ EIN ${e.federalEIN}` : ''}
+                </option>
+              ))}
+            </select>
+          </div>
+
+          {prefillPreview && (
+            <div className="rounded-cb border border-cb-border bg-cb-bg px-3 py-2 space-y-1">
+              <p className="text-cb-caption text-gray-500">Prefill preview (server confirms on create)</p>
+              <p className="text-cb-caption text-gray-300">
+                <span className="text-white">{prefillPreview.name || 'ΓÇö'}</span>
+                {prefillPreview.businessName && prefillPreview.businessName !== prefillPreview.name && (
+                  <> ┬╖ DBA/legal {prefillPreview.businessName}</>
+                )}
+              </p>
+              <p className="text-cb-caption text-gray-400">
+                {TAX_LABELS[prefillPreview.taxClassification] || prefillPreview.taxClassification || 'Tax class ?'}
+                {prefillPreview.llcTaxClass ? ` (${prefillPreview.llcTaxClass})` : ''}
+                {' ┬╖ '}
+                TIN {prefillPreview.tin
+                  ? `ΓÇóΓÇóΓÇóΓÇó${String(prefillPreview.tin).replace(/\D/g, '').slice(-4)}`
+                  : 'not on file'}
+              </p>
+              {(prefillPreview.address || prefillPreview.city) && (
+                <p className="text-cb-caption text-gray-500">
+                  {[prefillPreview.address, prefillPreview.city, prefillPreview.state, prefillPreview.zip]
+                    .filter(Boolean)
+                    .join(', ')}
+                </p>
+              )}
+            </div>
+          )}
+
+          <div>
+            <label className="block text-cb-caption text-gray-500 mb-1.5">Recipient</label>
+            <select
+              value={recipientId}
+              onChange={(e) => onPickRecipient(e.target.value)}
+              className={inputCls}
+            >
+              <option value="">Select signerΓÇª</option>
+              {signers.map((s) => (
+                <option key={s.id} value={s.id}>
+                  {signerDisplayName(s)}
+                  {isControlPerson(s) ? ' (Control Person)' : ''}
+                </option>
+              ))}
+            </select>
+          </div>
+
+          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
+            <div>
+              <label className="block text-cb-caption text-gray-500 mb-1.5">Name</label>
+              <input
+                value={recipientName}
+                onChange={(e) => setRecipientName(e.target.value)}
+                className={inputCls}
+                placeholder="Recipient name"
+              />
+            </div>
+            <div>
+              <label className="block text-cb-caption text-gray-500 mb-1.5">Email</label>
+              <input
+                type="email"
+                value={recipientEmail}
+                onChange={(e) => setRecipientEmail(e.target.value)}
+                className={inputCls}
+                placeholder="name@company.com"
+              />
+            </div>
+            <div className="sm:col-span-2">
+              <label className="block text-cb-caption text-gray-500 mb-1.5">Phone (E.164 preferred)</label>
+              <input
+                type="tel"
+                value={recipientPhone}
+                onChange={(e) => setRecipientPhone(e.target.value)}
+                className={inputCls}
+                placeholder="+1ΓÇª"
+              />
+            </div>
+          </div>
+
+          <div>
+            <p className="text-cb-caption text-gray-500 mb-1.5">Channels</p>
+            <div className="flex flex-wrap gap-3">
+              <label className="flex items-center gap-2 text-cb-caption text-gray-300 cursor-pointer">
+                <input
+                  type="checkbox"
+                  checked={wantEmail}
+                  onChange={(e) => setWantEmail(e.target.checked)}
+                  className="rounded border-cb-border"
+                />
+                Email
+              </label>
+              <label className="flex items-center gap-2 text-cb-caption text-gray-300 cursor-pointer">
+                <input
+                  type="checkbox"
+                  checked={wantSms}
+                  onChange={(e) => setWantSms(e.target.checked)}
+                  className="rounded border-cb-border"
+                />
+                SMS
+              </label>
+            </div>
+          </div>
+
+          <div>
+            <label className="block text-cb-caption text-gray-500 mb-1.5">Agent note (optional)</label>
+            <textarea
+              value={agentNote}
+              onChange={(e) => setAgentNote(e.target.value)}
+              rows={2}
+              placeholder="Shown in the email/SMS and on the merchant W-9 page"
+              className={`${inputCls} resize-y`}
+            />
+          </div>
+
+          <div className="flex flex-wrap justify-end gap-2">
+            <button
+              type="button"
+              onClick={() => setFormOpen(false)}
+              className="text-cb-caption font-medium px-3 py-2 rounded-cb border border-cb-border text-gray-400 hover:text-white"
+            >
+              Cancel
+            </button>
+            <button
+              type="button"
+              onClick={createAndSend}
+              disabled={creating || !legalEntities.length}
+              className="flex items-center gap-1.5 bg-cb-accent text-cb-bg font-semibold text-cb-caption px-3 py-2 rounded-cb hover:opacity-90 disabled:opacity-40"
+            >
+              {creating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
+              Create &amp; Send
+            </button>
+          </div>
+          {!legalEntities.length && (
+            <p className="text-cb-caption text-gray-600">Add a legal entity on this deal before requesting a W-9.</p>
+          )}
+        </div>
+      )}
+
+      {loading && requests.length === 0 ? (
+        <p className="text-cb-caption text-gray-600 flex items-center gap-2 py-2">
+          <Loader2 className="w-3.5 h-3.5 animate-spin" /> LoadingΓÇª
+        </p>
+      ) : requests.length === 0 ? (
+        <p className="text-cb-caption text-gray-600 py-1">
+          No W-9 requests on this MID yet.
+        </p>
+      ) : (
+        <ul className="space-y-2">
+          {requests.map((req) => {
+            const st = String(req.status || '');
+            const busy = busyId.endsWith(`:${req.id}`);
+            return (
+              <li
+                key={req.id}
+                className="rounded-cb border border-cb-border bg-cb-surface-raised px-3 py-2.5"
+              >
+                <div className="flex flex-wrap items-start justify-between gap-2">
+                  <div className="min-w-0 flex-1">
+                    <div className="flex flex-wrap items-center gap-2 text-cb-caption mb-0.5">
+                      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${statusDotClass(st)}`} />
+                      <span className="text-cb-accent uppercase tracking-wide">{req.type || 'w9'}</span>
+                      <span className="text-gray-400">{statusLabel(st)}</span>
+                    </div>
+                    <p className="text-cb-body text-white truncate">
+                      {req.recipientName || 'ΓÇö'}
+                      {req.recipientEmail && (
+                        <span className="text-gray-500 text-cb-caption"> ┬╖ {req.recipientEmail}</span>
+                      )}
+                    </p>
+                    <p className="text-cb-caption text-gray-600 mt-0.5">
+                      {req.sentAt && <>Sent {formatWhen(req.sentAt)}</>}
+                      {req.openedAt && <> ┬╖ Opened {formatWhen(req.openedAt)}</>}
+                      {req.signedAt && <> ┬╖ Signed {formatWhen(req.signedAt)}</>}
+                      {req.sentToElavonAt && <> ┬╖ Elavon {formatWhen(req.sentToElavonAt)}</>}
+                      {!req.sentAt && !req.signedAt && req.created_date && (
+                        <>Created {formatWhen(req.created_date)}</>
+                      )}
+                      {req.tinMasked && <> ┬╖ TIN {req.tinMasked}</>}
+                    </p>
+                    {req.lastError && st === 'send_failed' && (
+                      <p className="text-cb-caption text-cb-danger mt-1">{req.lastError}</p>
+                    )}
+                  </div>
+                  <div className="flex flex-wrap gap-1.5 flex-shrink-0">
+                    {SIGNED.has(st) && (
+                      <>
+                        <button
+                          type="button"
+                          onClick={() => downloadSigned(req.id)}
+                          disabled={busy}
+                          className="flex items-center gap-1 text-cb-caption font-medium px-2 py-1.5 rounded-cb border border-cb-border text-gray-300 hover:text-white disabled:opacity-40"
+                        >
+                          {busyId === `dl:${req.id}`
+                            ? <Loader2 className="w-3 h-3 animate-spin" />
+                            : <Download className="w-3 h-3" />}
+                          Download
+                        </button>
+                        <button
+                          type="button"
+                          onClick={() => openElavonModal(req)}
+                          disabled={busy}
+                          className="flex items-center gap-1 text-cb-caption font-medium px-2 py-1.5 rounded-cb bg-cb-accent text-cb-bg hover:opacity-90 disabled:opacity-40"
+                        >
+                          <Mail className="w-3 h-3" />
+                          Send to Elavon
+                        </button>
+                      </>
+                    )}
+                    {UNSIGNED.has(st) && (
+                      <>
+                        <button
+                          type="button"
+                          onClick={() => runAction(req.id, st === 'draft' ? 'send' : 'resend')}
+                          disabled={busy}
+                          className="flex items-center gap-1 text-cb-caption font-medium px-2 py-1.5 rounded-cb border border-cb-border text-gray-300 hover:text-white disabled:opacity-40"
+                        >
+                          {busyId === `send:${req.id}` || busyId === `resend:${req.id}`
+                            ? <Loader2 className="w-3 h-3 animate-spin" />
+                            : <RefreshCw className="w-3 h-3" />}
+                          {st === 'draft' ? 'Send' : 'Resend'}
+                        </button>
+                        <button
+                          type="button"
+                          onClick={() => runAction(req.id, 'cancel')}
+                          disabled={busy}
+                          className="flex items-center gap-1 text-cb-caption font-medium px-2 py-1.5 rounded-cb border border-cb-border text-gray-500 hover:text-cb-danger disabled:opacity-40"
+                        >
+                          {busyId === `cancel:${req.id}`
+                            ? <Loader2 className="w-3 h-3 animate-spin" />
+                            : <X className="w-3 h-3" />}
+                          Cancel
+                        </button>
+                      </>
+                    )}
+                  </div>
+                </div>
+              </li>
+            );
+          })}
+        </ul>
+      )}
+
+      {elavonModal && (
+        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
+          <div className="w-full max-w-lg bg-cb-surface-raised border border-cb-border rounded-cb shadow-cb-overlay p-4 sm:p-5 space-y-3">
+            <div className="flex items-center justify-between gap-2">
+              <h3 className="font-display text-cb-title text-white">Send W-9 to Elavon</h3>
+              <button
+                type="button"
+                onClick={() => setElavonModal(null)}
+                className="text-gray-500 hover:text-white p-1"
+                aria-label="Close"
+              >
+                <X className="w-4 h-4" />
+              </button>
+            </div>
+            <p className="text-cb-caption text-gray-500">
+              Emails from underwriting@ via Gmail with the signed PDF attached.
+              {!elavonDocsToHint && ' Set UNDERWRITING_ELAVON_DOCS_TO to prefill To.'}
+            </p>
+            <div>
+              <label className="block text-cb-caption text-gray-500 mb-1.5">To</label>
+              <input
+                type="email"
+                value={elavonModal.to}
+                onChange={(e) => setElavonModal((m) => ({ ...m, to: e.target.value }))}
+                className={inputCls}
+                placeholder="Elavon docs inbox"
+              />
+            </div>
+            <div>
+              <label className="block text-cb-caption text-gray-500 mb-1.5">Subject</label>
+              <input
+                value={elavonModal.subject}
+                onChange={(e) => setElavonModal((m) => ({ ...m, subject: e.target.value }))}
+                className={inputCls}
+              />
+            </div>
+            <div>
+              <label className="block text-cb-caption text-gray-500 mb-1.5">Body</label>
+              <textarea
+                value={elavonModal.bodyText}
+                onChange={(e) => setElavonModal((m) => ({ ...m, bodyText: e.target.value }))}
+                rows={6}
+                className={`${inputCls} resize-y`}
+              />
+            </div>
+            <div className="flex justify-end gap-2 pt-1">
+              <button
+                type="button"
+                onClick={() => setElavonModal(null)}
+                className="text-cb-caption font-medium px-3 py-2 rounded-cb border border-cb-border text-gray-400 hover:text-white"
+              >
+                Cancel
+              </button>
+              <button
+                type="button"
+                onClick={submitElavon}
+                disabled={sendingElavon}
+                className="flex items-center gap-1.5 bg-cb-accent text-cb-bg font-semibold text-cb-caption px-4 py-2 rounded-cb hover:opacity-90 disabled:opacity-40"
+              >
+                {sendingElavon ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
+                Send
+              </button>
+            </div>
+          </div>
+        </div>
+      )}
+    </div>
+  );
+}
diff --git a/src/lib/w9Model.js b/src/lib/w9Model.js
new file mode 100644
index 0000000..f5551d7
--- /dev/null
+++ b/src/lib/w9Model.js
@@ -0,0 +1,108 @@
+/**
+ * Canonical W-9 field object for underwriting requests.
+ * Keys align with merchant edit form and PDF fill (Task 2+).
+ */
+
+export function emptyW9Fields() {
+  return {
+    name: '',
+    businessName: '',
+    taxClassification: '',
+    llcTaxClass: '',
+    otherClassification: '',
+    exemptPayeeCode: '',
+    fatcaCode: '',
+    address: '',
+    city: '',
+    state: '',
+    zip: '',
+    tinType: 'ein',
+    tin: '',
+    signatureName: '',
+    signedAt: '',
+  };
+}
+
+/**
+ * Map portal ownershipType + taxClassType to W-9 federal tax classification.
+ * @returns {{ taxClassification: string, llcTaxClass?: string }}
+ */
+export function mapOwnershipToW9TaxClass(ownershipType, taxClassType) {
+  const ownership = String(ownershipType || '').toUpperCase();
+  const taxClass = String(taxClassType || '').toUpperCase();
+
+  if (ownership === 'SOLE_PROPRIETOR' || ownership === 'SOLE_PROPRIETORSHIP') {
+    return { taxClassification: 'individual' };
+  }
+
+  if (ownership === 'SUB_S_CORP') {
+    return { taxClassification: 's_corp' };
+  }
+
+  if (ownership === 'CORPORATION') {
+    return { taxClassification: 'c_corp' };
+  }
+
+  if (ownership === 'LIMITED_COMPANY') {
+    const llcTaxClass = mapLlcTaxClass(taxClass);
+    return { taxClassification: 'llc', ...(llcTaxClass ? { llcTaxClass } : {}) };
+  }
+
+  if (ownership === 'GENERAL_PARTNERSHIP' || ownership === 'LIMITED_PARTNERSHIP') {
+    return { taxClassification: 'partnership' };
+  }
+
+  if (ownership === 'NON_PROFIT') {
+    return { taxClassification: 'other', otherClassification: 'Non-profit' };
+  }
+
+  if (ownership === 'TRUST') {
+    return { taxClassification: 'trust' };
+  }
+
+  return { taxClassification: '' };
+}
+
+function mapLlcTaxClass(taxClassType) {
+  switch (taxClassType) {
+    case 'LLC_CORPORATION':
+      return 'C';
+    case 'LLC':
+    case 'DISREGARDED_ENTITY':
+      return 'D';
+    case 'LLC_PARTNERSHIP':
+      return 'P';
+    default:
+      return '';
+  }
+}
+
+/**
+ * @param {ReturnType<typeof emptyW9Fields>} fields
+ * @returns {{ ok: boolean, errors: string[] }}
+ */
+export function validateW9Fields(fields) {
+  const errors = [];
+  const f = fields || {};
+
+  if (!String(f.name || '').trim()) errors.push('Name is required');
+  if (!String(f.address || '').trim()) errors.push('Address is required');
+  if (!String(f.city || '').trim()) errors.push('City is required');
+  if (!String(f.state || '').trim()) errors.push('State is required');
+  if (!String(f.zip || '').trim()) errors.push('ZIP is required');
+  if (!String(f.taxClassification || '').trim()) errors.push('Tax classification is required');
+
+  const tinDigits = String(f.tin || '').replace(/\D/g, '');
+  if (!tinDigits) {
+    errors.push('TIN is required');
+  } else if (tinDigits.length !== 9) {
+    errors.push('TIN must be 9 digits');
+  }
+
+  return { ok: errors.length === 0, errors };
+}
+
+export function extractEinDigits(federalEIN) {
+  if (federalEIN == null || federalEIN === '') return '';
+  return String(federalEIN).replace(/\D/g, '').slice(0, 9);
+}
diff --git a/src/lib/w9Model.test.js b/src/lib/w9Model.test.js
new file mode 100644
index 0000000..1b5bf9d
--- /dev/null
+++ b/src/lib/w9Model.test.js
@@ -0,0 +1,107 @@
+import { describe, it } from 'node:test';
+import assert from 'node:assert/strict';
+import {
+  emptyW9Fields,
+  validateW9Fields,
+  mapOwnershipToW9TaxClass,
+} from './w9Model.js';
+
+describe('emptyW9Fields', () => {
+  it('returns all W-9 keys with empty defaults and ein tinType', () => {
+    const fields = emptyW9Fields();
+    assert.deepEqual(fields, {
+      name: '',
+      businessName: '',
+      taxClassification: '',
+      llcTaxClass: '',
+      otherClassification: '',
+      exemptPayeeCode: '',
+      fatcaCode: '',
+      address: '',
+      city: '',
+      state: '',
+      zip: '',
+      tinType: 'ein',
+      tin: '',
+      signatureName: '',
+      signedAt: '',
+    });
+  });
+});
+
+describe('mapOwnershipToW9TaxClass', () => {
+  it('maps LIMITED_COMPANY + LLC_CORPORATION to llc with C class', () => {
+    const result = mapOwnershipToW9TaxClass('LIMITED_COMPANY', 'LLC_CORPORATION');
+    assert.deepEqual(result, { taxClassification: 'llc', llcTaxClass: 'C' });
+  });
+
+  it('maps LIMITED_COMPANY + DISREGARDED_ENTITY to llc with D class', () => {
+    const result = mapOwnershipToW9TaxClass('LIMITED_COMPANY', 'DISREGARDED_ENTITY');
+    assert.deepEqual(result, { taxClassification: 'llc', llcTaxClass: 'D' });
+  });
+
+  it('maps SOLE_PROPRIETORSHIP to individual', () => {
+    const result = mapOwnershipToW9TaxClass('SOLE_PROPRIETORSHIP', 'SOLE_PROP');
+    assert.deepEqual(result, { taxClassification: 'individual' });
+  });
+
+  it('maps CORPORATION to c_corp', () => {
+    const result = mapOwnershipToW9TaxClass('CORPORATION', 'CORPORATION');
+    assert.deepEqual(result, { taxClassification: 'c_corp' });
+  });
+
+  it('maps SUB_S_CORP to s_corp', () => {
+    const result = mapOwnershipToW9TaxClass('SUB_S_CORP', 'CORPORATION');
+    assert.deepEqual(result, { taxClassification: 's_corp' });
+  });
+});
+
+describe('validateW9Fields', () => {
+  const validBase = {
+    name: 'Acme LLC',
+    businessName: 'Acme LLC',
+    taxClassification: 'llc',
+    llcTaxClass: 'C',
+    otherClassification: '',
+    exemptPayeeCode: '',
+    fatcaCode: '',
+    address: '100 Main St',
+    city: 'San Diego',
+    state: 'CA',
+    zip: '92101',
+    tinType: 'ein',
+    tin: '123456789',
+    signatureName: '',
+    signedAt: '',
+  };
+
+  it('passes when required fields including 9-digit EIN are present', () => {
+    const result = validateW9Fields(validBase);
+    assert.equal(result.ok, true);
+    assert.deepEqual(result.errors, []);
+  });
+
+  it('fails when TIN is missing', () => {
+    const result = validateW9Fields({ ...validBase, tin: '' });
+    assert.equal(result.ok, false);
+    assert.ok(result.errors.some((e) => /tin/i.test(e)));
+  });
+
+  it('fails when TIN is not 9 digits', () => {
+    const result = validateW9Fields({ ...validBase, tin: '12345' });
+    assert.equal(result.ok, false);
+    assert.ok(result.errors.some((e) => /tin/i.test(e)));
+  });
+
+  it('fails when name is missing', () => {
+    const result = validateW9Fields({ ...validBase, name: '' });
+    assert.equal(result.ok, false);
+    assert.ok(result.errors.some((e) => /name/i.test(e)));
+  });
+
+  it('fails when taxClassification is missing', () => {
+    const result = validateW9Fields({ ...validBase, taxClassification: '' });
+    assert.equal(result.ok, false);
+    assert.ok(result.errors.some((e) => /tax classification/i.test(e)));
+  });
+});
diff --git a/src/lib/w9PdfFill.js b/src/lib/w9PdfFill.js
new file mode 100644
index 0000000..4fe73ab
--- /dev/null
+++ b/src/lib/w9PdfFill.js
@@ -0,0 +1,201 @@
+/**
+ * Fill pinned IRS W-9 PDF (assets/irs/fw9.pdf) from canonical W-9 fields.
+ * Field names documented in assets/irs/fw9-field-map.md (from inspect-w9-fields.mjs).
+ */
+import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
+
+const P = 'topmostSubform[0].Page1[0]';
+const BOXES = `${P}.Boxes3a-b_ReadOrder[0]`;
+
+/** AcroForm field names ΓÇö keep in sync with assets/irs/fw9-field-map.md */
+export const W9_ACROFORM = {
+  name: `${P}.f1_01[0]`,
+  businessName: `${P}.f1_02[0]`,
+  taxCheckboxes: [
+    `${BOXES}.c1_1[0]`,
+    `${BOXES}.c1_1[1]`,
+    `${BOXES}.c1_1[2]`,
+    `${BOXES}.c1_1[3]`,
+    `${BOXES}.c1_1[4]`,
+    `${BOXES}.c1_1[5]`,
+    `${BOXES}.c1_1[6]`,
+  ],
+  llcTaxClass: `${BOXES}.f1_03[0]`,
+  otherClassification: `${BOXES}.f1_04[0]`,
+  exemptPayeeCode: `${P}.f1_05[0]`,
+  fatcaCode: `${P}.f1_06[0]`,
+  address: `${P}.Address_ReadOrder[0].f1_07[0]`,
+  cityStateZip: `${P}.Address_ReadOrder[0].f1_08[0]`,
+  ssn1: `${P}.f1_11[0]`,
+  ssn2: `${P}.f1_12[0]`,
+  ssn3: `${P}.f1_13[0]`,
+  ein1: `${P}.f1_14[0]`,
+  ein2: `${P}.f1_15[0]`,
+};
+
+/** Manual overlays ΓÇö page 0, PDF coords (bottom-left origin) */
+export const W9_SIGNATURE_OVERLAY = { pageIndex: 0, x: 130, y: 248, width: 280, height: 36 };
+export const W9_DATE_OVERLAY = { pageIndex: 0, x: 468, y: 258, fontSize: 10 };
+
+const TAX_CLASS_TO_CHECKBOX = {
+  individual: 0,
+  c_corp: 1,
+  s_corp: 2,
+  partnership: 3,
+  trust: 4,
+  llc: 5,
+  other: 6,
+};
+
+function setText(form, fieldName, value) {
+  const text = String(value ?? '').trim();
+  if (!text) return;
+  form.getTextField(fieldName).setText(text);
+}
+
+function splitTin(tin) {
+  const digits = String(tin ?? '').replace(/\D/g, '').slice(0, 9);
+  return digits.length === 9 ? digits : '';
+}
+
+function formatCityStateZip(city, state, zip) {
+  const c = String(city ?? '').trim();
+  const s = String(state ?? '').trim().toUpperCase();
+  const z = String(zip ?? '').trim();
+  if (!c && !s && !z) return '';
+  const parts = [c, [s, z].filter(Boolean).join(' ')].filter(Boolean);
+  return parts.join(', ');
+}
+
+function formatSignedDate(signedAt) {
+  const raw = String(signedAt ?? '').trim();
+  if (!raw) return '';
+
+  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
+  if (iso) return `${iso[2]}/${iso[3]}/${iso[1]}`;
+
+  const slash = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
+  if (slash) {
+    const mm = slash[1].padStart(2, '0');
+    const dd = slash[2].padStart(2, '0');
+    return `${mm}/${dd}/${slash[3]}`;
+  }
+
+  return raw;
+}
+
+/**
+ * Resolve which Line 3a checkbox to check.
+ * Disregarded LLC (class D) ΓåÆ Individual per IRS W-9 instructions.
+ */
+function resolveTaxCheckbox(fields) {
+  const tax = String(fields.taxClassification ?? '').trim().toLowerCase();
+  if (tax === 'llc' && String(fields.llcTaxClass ?? '').toUpperCase() === 'D') {
+    return { checkboxIndex: 0, llcLetter: '', useOther: false };
+  }
+  if (tax === 'llc') {
+    const letter = String(fields.llcTaxClass ?? '').toUpperCase().slice(0, 1);
+    return { checkboxIndex: 5, llcLetter: letter === 'C' || letter === 'S' || letter === 'P' ? letter : '', useOther: false };
+  }
+  if (tax === 'other') {
+    return { checkboxIndex: 6, llcLetter: '', useOther: true };
+  }
+  const idx = TAX_CLASS_TO_CHECKBOX[tax];
+  if (idx == null) return { checkboxIndex: -1, llcLetter: '', useOther: false };
+  return { checkboxIndex: idx, llcLetter: '', useOther: false };
+}
+
+function applyTaxClassification(form, fields) {
+  const { checkboxIndex, llcLetter, useOther } = resolveTaxCheckbox(fields);
+  if (checkboxIndex < 0) return;
+
+  form.getCheckBox(W9_ACROFORM.taxCheckboxes[checkboxIndex]).check();
+
+  if (llcLetter) {
+    setText(form, W9_ACROFORM.llcTaxClass, llcLetter);
+  }
+  if (useOther) {
+    setText(form, W9_ACROFORM.otherClassification, fields.otherClassification);
+  }
+}
+
+function applyTin(form, fields) {
+  const digits = splitTin(fields.tin);
+  if (!digits) return;
+
+  const tinType = String(fields.tinType ?? 'ein').toLowerCase();
+  if (tinType === 'ssn') {
+    setText(form, W9_ACROFORM.ssn1, digits.slice(0, 3));
+    setText(form, W9_ACROFORM.ssn2, digits.slice(3, 5));
+    setText(form, W9_ACROFORM.ssn3, digits.slice(5, 9));
+  } else {
+    setText(form, W9_ACROFORM.ein1, digits.slice(0, 2));
+    setText(form, W9_ACROFORM.ein2, digits.slice(2, 9));
+  }
+}
+
+async function drawSignatureAndDate(doc, fields, signaturePngBytes) {
+  const page = doc.getPage(W9_SIGNATURE_OVERLAY.pageIndex);
+  const { x, y, width, height } = W9_SIGNATURE_OVERLAY;
+
+  if (signaturePngBytes?.length) {
+    const png = await doc.embedPng(signaturePngBytes);
+    const scale = Math.min(width / png.width, height / png.height);
+    const drawWidth = png.width * scale;
+    const drawHeight = png.height * scale;
+    page.drawImage(png, {
+      x,
+      y: y + (height - drawHeight) / 2,
+      width: drawWidth,
+      height: drawHeight,
+    });
+  } else if (String(fields.signatureName ?? '').trim()) {
+    const font = await doc.embedFont(StandardFonts.Helvetica);
+    page.drawText(String(fields.signatureName).trim(), {
+      x,
+      y: y + 10,
+      size: 10,
+      font,
+      color: rgb(0, 0, 0),
+    });
+  }
+
+  const dateText = formatSignedDate(fields.signedAt);
+  if (dateText) {
+    const font = await doc.embedFont(StandardFonts.Helvetica);
+    page.drawText(dateText, {
+      x: W9_DATE_OVERLAY.x,
+      y: W9_DATE_OVERLAY.y,
+      size: W9_DATE_OVERLAY.fontSize,
+      font,
+      color: rgb(0, 0, 0),
+    });
+  }
+}
+
+/**
+ * @param {Uint8Array} pdfBytes - pinned fw9.pdf bytes
+ * @param {import('./w9Model.js').emptyW9Fields extends () => infer R ? R : Record<string, string>} fields
+ * @param {Uint8Array} [signaturePngBytes]
+ * @returns {Promise<Uint8Array>}
+ */
+export async function fillW9Pdf(pdfBytes, fields, signaturePngBytes) {
+  const doc = await PDFDocument.load(pdfBytes);
+  const form = doc.getForm();
+
+  setText(form, W9_ACROFORM.name, fields.name);
+  setText(form, W9_ACROFORM.businessName, fields.businessName);
+  applyTaxClassification(form, fields);
+  setText(form, W9_ACROFORM.exemptPayeeCode, fields.exemptPayeeCode);
+  setText(form, W9_ACROFORM.fatcaCode, fields.fatcaCode);
+  setText(form, W9_ACROFORM.address, fields.address);
+  setText(form, W9_ACROFORM.cityStateZip, formatCityStateZip(fields.city, fields.state, fields.zip));
+  applyTin(form, fields);
+
+  await drawSignatureAndDate(doc, fields, signaturePngBytes);
+
+  form.flatten();
+  return doc.save();
+}
+
+export { formatCityStateZip, formatSignedDate, splitTin, resolveTaxCheckbox };
diff --git a/src/lib/w9PdfFill.test.js b/src/lib/w9PdfFill.test.js
new file mode 100644
index 0000000..d137042
--- /dev/null
+++ b/src/lib/w9PdfFill.test.js
@@ -0,0 +1,86 @@
+/**
+ * W-9 PDF fill helper tests.
+ * Run: npm run test:w9
+ */
+import { describe, it } from 'node:test';
+import assert from 'node:assert/strict';
+import { readFileSync } from 'node:fs';
+import { fileURLToPath } from 'node:url';
+import { dirname, join } from 'node:path';
+import { PDFDocument } from 'pdf-lib';
+import { fillW9Pdf, formatCityStateZip, resolveTaxCheckbox } from './w9PdfFill.js';
+import { emptyW9Fields } from './w9Model.js';
+
+const __dirname = dirname(fileURLToPath(import.meta.url));
+const pdfPath = join(__dirname, '..', '..', 'assets', 'irs', 'fw9.pdf');
+
+function sampleFields(overrides = {}) {
+  return {
+    ...emptyW9Fields(),
+    name: 'Acme Holdings LLC',
+    businessName: 'Acme Coffee',
+    taxClassification: 'llc',
+    llcTaxClass: 'C',
+    address: '123 Market St',
+    city: 'San Francisco',
+    state: 'CA',
+    zip: '94103',
+    tinType: 'ein',
+    tin: '12-3456789',
+    signatureName: 'Jane Doe',
+    signedAt: '2026-08-07',
+    ...overrides,
+  };
+}
+
+describe('formatCityStateZip', () => {
+  it('combines city, state, zip', () => {
+    assert.equal(formatCityStateZip('SF', 'ca', '94103'), 'SF, CA 94103');
+  });
+});
+
+describe('resolveTaxCheckbox', () => {
+  it('maps disregarded LLC to individual checkbox', () => {
+    assert.deepEqual(resolveTaxCheckbox({ taxClassification: 'llc', llcTaxClass: 'D' }), {
+      checkboxIndex: 0,
+      llcLetter: '',
+      useOther: false,
+    });
+  });
+
+  it('maps LLC corporation to LLC box with C letter', () => {
+    assert.deepEqual(resolveTaxCheckbox({ taxClassification: 'llc', llcTaxClass: 'C' }), {
+      checkboxIndex: 5,
+      llcLetter: 'C',
+      useOther: false,
+    });
+  });
+});
+
+describe('fillW9Pdf', () => {
+  it('fills sample fields, grows output, and flattens the form', async () => {
+    const inputBytes = readFileSync(pdfPath);
+    const filled = await fillW9Pdf(inputBytes, sampleFields());
+
+    assert.ok(filled.length > inputBytes.length, 'filled PDF should be larger than template');
+
+    const doc = await PDFDocument.load(filled);
+    const form = doc.getForm();
+    assert.equal(form.getFields().length, 0, 'flattened PDF should have no editable fields');
+  });
+
+  it('accepts optional signature PNG bytes', async () => {
+    // Minimal valid 1├ù1 PNG
+    const png = Uint8Array.from([
+      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
+      0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
+      0x89, 0x00, 0x00, 0x00, 0x0a, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
+      0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae,
+      0x42, 0x60, 0x82,
+    ]);
+
+    const inputBytes = readFileSync(pdfPath);
+    const filled = await fillW9Pdf(inputBytes, sampleFields(), png);
+    assert.ok(filled.length > inputBytes.length);
+  });
+});
diff --git a/src/lib/w9Prefill.js b/src/lib/w9Prefill.js
new file mode 100644
index 0000000..2400e9a
--- /dev/null
+++ b/src/lib/w9Prefill.js
@@ -0,0 +1,75 @@
+import {
+  emptyW9Fields,
+  mapOwnershipToW9TaxClass,
+  extractEinDigits,
+} from './w9Model.js';
+
+/**
+ * Build best-effort W-9 prefill from legal entity (+ optional control person / location).
+ * TIN comes from federalEIN digits only ΓÇö never invented.
+ *
+ * @param {{ legalEntity: object, controlPerson?: object, locationFallback?: object }} params
+ */
+export function buildW9Prefill({ legalEntity, controlPerson, locationFallback } = {}) {
+  const entity = legalEntity || {};
+  const fields = emptyW9Fields();
+
+  const businessName = String(entity.legalBusinessName || '').trim();
+  fields.businessName = businessName;
+
+  const ownershipType = entity.ownershipType || '';
+  const taxClassType = entity.taxClassType || '';
+  const taxMapping = mapOwnershipToW9TaxClass(ownershipType, taxClassType);
+  fields.taxClassification = taxMapping.taxClassification || '';
+  if (taxMapping.llcTaxClass) fields.llcTaxClass = taxMapping.llcTaxClass;
+  if (taxMapping.otherClassification) fields.otherClassification = taxMapping.otherClassification;
+
+  const isSoleProp =
+    ownershipType === 'SOLE_PROPRIETOR' || ownershipType === 'SOLE_PROPRIETORSHIP';
+  if (isSoleProp && controlPerson) {
+    const first = String(controlPerson.firstName || controlPerson.firstname || '').trim();
+    const last = String(controlPerson.lastName || controlPerson.lastname || '').trim();
+    fields.name = [first, last].filter(Boolean).join(' ');
+  } else {
+    fields.name = businessName;
+  }
+
+  const mailingAddress = pickMailingAddress(entity);
+  const storeAddress = pickStoreAddress(locationFallback);
+  const addressSource = hasAddress(mailingAddress) ? mailingAddress : storeAddress;
+
+  fields.address = addressSource.street;
+  fields.city = addressSource.city;
+  fields.state = addressSource.state;
+  fields.zip = addressSource.zip;
+
+  fields.tin = extractEinDigits(entity.federalEIN);
+  fields.tinType = 'ein';
+
+  return fields;
+}
+
+function hasAddress({ street, city, state, zip }) {
+  return Boolean(street && city && state && zip);
+}
+
+function pickMailingAddress(entity) {
+  const street = [entity.mailingStreet, entity.mailingStreet2].filter(Boolean).join(', ').trim();
+  return {
+    street,
+    city: String(entity.mailingCity || '').trim(),
+    state: String(entity.mailingState || '').trim(),
+    zip: String(entity.mailingZip || '').trim(),
+  };
+}
+
+function pickStoreAddress(location) {
+  const loc = location || {};
+  const street = [loc.businessStreet, loc.businessStreet2].filter(Boolean).join(', ').trim();
+  return {
+    street,
+    city: String(loc.businessCity || '').trim(),
+    state: String(loc.businessState || '').trim(),
+    zip: String(loc.businessZip || '').trim(),
+  };
+}
diff --git a/src/lib/w9Prefill.test.js b/src/lib/w9Prefill.test.js
new file mode 100644
index 0000000..e9f7872
--- /dev/null
+++ b/src/lib/w9Prefill.test.js
@@ -0,0 +1,95 @@
+import { describe, it } from 'node:test';
+import assert from 'node:assert/strict';
+import { buildW9Prefill } from './w9Prefill.js';
+
+describe('buildW9Prefill', () => {
+  it('prefers entity mailing address over location fallback', () => {
+    const fields = buildW9Prefill({
+      legalEntity: {
+        legalBusinessName: 'Acme LLC',
+        ownershipType: 'LIMITED_COMPANY',
+        taxClassType: 'LLC_CORPORATION',
+        federalEIN: '12-3456789',
+        mailingStreet: '200 Legal Ave',
+        mailingCity: 'Los Angeles',
+        mailingState: 'CA',
+        mailingZip: '90001',
+      },
+      locationFallback: {
+        businessStreet: '100 Store St',
+        businessCity: 'San Diego',
+        businessState: 'CA',
+        businessZip: '92101',
+      },
+    });
+
+    assert.equal(fields.address, '200 Legal Ave');
+    assert.equal(fields.city, 'Los Angeles');
+    assert.equal(fields.state, 'CA');
+    assert.equal(fields.zip, '90001');
+  });
+
+  it('uses location fallback when entity has no mailing address', () => {
+    const fields = buildW9Prefill({
+      legalEntity: {
+        legalBusinessName: 'Acme LLC',
+        ownershipType: 'CORPORATION',
+        taxClassType: 'CORPORATION',
+        federalEIN: '98-7654321',
+      },
+      locationFallback: {
+        businessStreet: '100 Store St',
+        businessCity: 'San Diego',
+        businessState: 'CA',
+        businessZip: '92101',
+      },
+    });
+
+    assert.equal(fields.address, '100 Store St');
+    assert.equal(fields.city, 'San Diego');
+    assert.equal(fields.state, 'CA');
+    assert.equal(fields.zip, '92101');
+  });
+
+  it('extracts TIN digits from federalEIN only and never invents', () => {
+    const withEin = buildW9Prefill({
+      legalEntity: {
+        legalBusinessName: 'Acme LLC',
+        ownershipType: 'CORPORATION',
+        taxClassType: 'CORPORATION',
+        federalEIN: '12-3456789',
+      },
+    });
+    assert.equal(withEin.tin, '123456789');
+    assert.equal(withEin.tinType, 'ein');
+
+    const withoutEin = buildW9Prefill({
+      legalEntity: {
+        legalBusinessName: 'Acme LLC',
+        ownershipType: 'CORPORATION',
+        taxClassType: 'CORPORATION',
+      },
+    });
+    assert.equal(withoutEin.tin, '');
+    assert.equal(withoutEin.tinType, 'ein');
+  });
+
+  it('uses control person name for sole proprietorship', () => {
+    const fields = buildW9Prefill({
+      legalEntity: {
+        legalBusinessName: 'Jane Doe DBA',
+        ownershipType: 'SOLE_PROPRIETORSHIP',
+        taxClassType: 'SOLE_PROP',
+        federalEIN: '111223333',
+      },
+      controlPerson: {
+        firstName: 'Jane',
+        lastName: 'Doe',
+      },
+    });
+
+    assert.equal(fields.taxClassification, 'individual');
+    assert.equal(fields.name, 'Jane Doe');
+    assert.equal(fields.businessName, 'Jane Doe DBA');
+  });
+});
diff --git a/src/pages/ApplicationDealRoom.jsx b/src/pages/ApplicationDealRoom.jsx
index 6865dff..0f7766e 100644
--- a/src/pages/ApplicationDealRoom.jsx
+++ b/src/pages/ApplicationDealRoom.jsx
@@ -15,4 +15,5 @@ import { TIER_LABELS } from '@/lib/pricingPresets';
 import InstallerRunbook from '@/components/merchant-center/InstallerRunbook';
 import HandoffPanel from '@/components/deal-room/HandoffPanel';
+import UnderwritingRequestsPanel from '@/components/deal-room/UnderwritingRequestsPanel';
 import { HANDOFF_STAGE_LABELS } from '@/lib/onboardingFacts';
 
@@ -766,4 +767,13 @@ export default function ApplicationDealRoom() {
                       </div>
 
+                      <UnderwritingRequestsPanel
+                        corporateId={corporateId}
+                        mid={selectedMid}
+                        legalEntities={data.legalEntities || []}
+                        signers={data.signers || []}
+                        profile={profile}
+                        locations={data.locations || []}
+                      />
+
                       <div className="rounded-cb border border-cb-border bg-cb-bg p-3 space-y-2">
                         <p className="text-cb-caption text-gray-500">Log email / note on this MID</p>
diff --git a/src/pages/UnderwritingW9Sign.jsx b/src/pages/UnderwritingW9Sign.jsx
new file mode 100644
index 0000000..7381d67
--- /dev/null
+++ b/src/pages/UnderwritingW9Sign.jsx
@@ -0,0 +1,598 @@
+import { useCallback, useEffect, useRef, useState } from 'react';
+import { useParams } from 'react-router-dom';
+import { AlertTriangle, CheckCircle, Download, Loader2, PenLine, Eraser } from 'lucide-react';
+import { base44 } from '@/api/base44Client';
+import { appParams } from '@/lib/app-params';
+import CliqbuxLogo from '@/components/onboarding/CliqbuxLogo';
+import { emptyW9Fields, validateW9Fields } from '@/lib/w9Model';
+
+const FN = 'completeUnderwritingRequest';
+
+const TAX_CLASSES = [
+  { value: 'individual', label: 'Individual / sole proprietor' },
+  { value: 'c_corp', label: 'C Corporation' },
+  { value: 's_corp', label: 'S Corporation' },
+  { value: 'partnership', label: 'Partnership' },
+  { value: 'trust', label: 'Trust / estate' },
+  { value: 'llc', label: 'Limited liability company (LLC)' },
+  { value: 'other', label: 'Other (see instructions)' },
+];
+
+const LLC_CLASSES = [
+  { value: 'C', label: 'C ΓÇö taxed as C corporation' },
+  { value: 'S', label: 'S ΓÇö taxed as S corporation' },
+  { value: 'P', label: 'P ΓÇö taxed as partnership' },
+  { value: 'D', label: 'D ΓÇö disregarded entity' },
+];
+
+const inputCls =
+  'w-full text-sm border border-gray-200 rounded-cb px-3 py-2.5 bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-cb-accent/40';
+const labelCls = 'text-cb-caption uppercase text-gray-500 block mb-1.5';
+
+async function invokeUw(payload) {
+  const viaFetch = async () => {
+    const res = await fetch(`/api/apps/${appParams.appId}/functions/${FN}`, {
+      method: 'POST',
+      headers: { 'Content-Type': 'application/json' },
+      body: JSON.stringify(payload),
+    });
+    let data = null;
+    try {
+      data = await res.json();
+    } catch {
+      /* ignore */
+    }
+    if (!res.ok) {
+      const err = new Error(data?.error || `Request failed (${res.status})`);
+      err.status = res.status;
+      err.code = data?.code;
+      throw err;
+    }
+    return { data };
+  };
+
+  try {
+    const res = await base44.functions.invoke(FN, payload);
+    if (res?.data?.error && !res?.data?.success) {
+      const err = new Error(res.data.error);
+      err.code = res.data.code;
+      throw err;
+    }
+    return res;
+  } catch (first) {
+    try {
+      return await viaFetch();
+    } catch (second) {
+      throw second.status ? second : first;
+    }
+  }
+}
+
+function isExpiredError(err) {
+  if (!err) return false;
+  if (err.status === 410) return true;
+  const code = String(err.code || '').toUpperCase();
+  return code === 'TOKEN_EXPIRED' || code === 'TOKEN_CANCELLED';
+}
+
+function formatTinDisplay(tin, tinType) {
+  const d = String(tin || '').replace(/\D/g, '').slice(0, 9);
+  if (d.length !== 9) return d;
+  if (String(tinType).toLowerCase() === 'ssn') {
+    return `${d.slice(0, 3)}-${d.slice(3, 5)}-${d.slice(5)}`;
+  }
+  return `${d.slice(0, 2)}-${d.slice(2)}`;
+}
+
+function typedSignatureToDataUrl(name) {
+  const text = String(name || '').trim();
+  if (!text) return null;
+  const canvas = document.createElement('canvas');
+  canvas.width = 560;
+  canvas.height = 120;
+  const ctx = canvas.getContext('2d');
+  ctx.fillStyle = '#ffffff';
+  ctx.fillRect(0, 0, canvas.width, canvas.height);
+  ctx.fillStyle = '#111827';
+  ctx.font = 'italic 32px Georgia, "Times New Roman", serif';
+  ctx.textBaseline = 'middle';
+  ctx.fillText(text, 16, canvas.height / 2);
+  return canvas.toDataURL('image/png');
+}
+
+export default function UnderwritingW9Sign() {
+  const { token: routeToken } = useParams();
+  const [phase, setPhase] = useState('loading');
+  const [fields, setFields] = useState(emptyW9Fields());
+  const [agentNote, setAgentNote] = useState('');
+  const [midLabel, setMidLabel] = useState('');
+  const [recipientName, setRecipientName] = useState('');
+  const [signedPdfUrl, setSignedPdfUrl] = useState('');
+  const [error, setError] = useState('');
+  const [fieldErrors, setFieldErrors] = useState([]);
+  const [submitting, setSubmitting] = useState(false);
+
+  const [signMode, setSignMode] = useState('draw');
+  const [typedName, setTypedName] = useState('');
+  const canvasRef = useRef(null);
+  const drawingRef = useRef(false);
+  const hasInkRef = useRef(false);
+
+  const rawToken = String(routeToken || '').trim();
+
+  const loadRequest = useCallback(async () => {
+    if (!rawToken) {
+      setError('No link token found. Please use the link from your email or text message.');
+      setPhase('error');
+      return;
+    }
+    setPhase('loading');
+    setError('');
+    try {
+      const res = await invokeUw({ action: 'get', token: rawToken });
+      const data = res.data || {};
+      setFields({ ...emptyW9Fields(), ...(data.fields || {}) });
+      setAgentNote(data.agentNote || '');
+      setMidLabel(data.midLabel || '');
+      setRecipientName(data.recipientName || '');
+
+      if (data.viewOnly || data.signedPdfUrl) {
+        setSignedPdfUrl(data.signedPdfUrl || '');
+        setPhase('signed');
+        return;
+      }
+
+      setPhase('form');
+    } catch (err) {
+      if (isExpiredError(err)) {
+        setError(err.message || 'This W-9 link has expired.');
+        setPhase('expired');
+        return;
+      }
+      setError(err.message || 'Unable to load this W-9 request.');
+      setPhase('error');
+    }
+  }, [rawToken]);
+
+  useEffect(() => {
+    loadRequest();
+  }, [loadRequest]);
+
+  const setField = (key, value) => setFields((prev) => ({ ...prev, [key]: value }));
+
+  const handleContinue = (e) => {
+    e.preventDefault();
+    const validation = validateW9Fields(fields);
+    if (!validation.ok) {
+      setFieldErrors(validation.errors);
+      return;
+    }
+    setFieldErrors([]);
+    setTypedName(fields.signatureName || fields.name || '');
+    setPhase('sign');
+    hasInkRef.current = false;
+    requestAnimationFrame(() => {
+      const canvas = canvasRef.current;
+      if (!canvas) return;
+      const ctx = canvas.getContext('2d');
+      ctx.fillStyle = '#ffffff';
+      ctx.fillRect(0, 0, canvas.width, canvas.height);
+      ctx.strokeStyle = '#111827';
+      ctx.lineWidth = 2;
+      ctx.lineCap = 'round';
+    });
+  };
+
+  const getCanvasPoint = (evt) => {
+    const canvas = canvasRef.current;
+    const rect = canvas.getBoundingClientRect();
+    const clientX = evt.touches ? evt.touches[0].clientX : evt.clientX;
+    const clientY = evt.touches ? evt.touches[0].clientY : evt.clientY;
+    return {
+      x: ((clientX - rect.left) / rect.width) * canvas.width,
+      y: ((clientY - rect.top) / rect.height) * canvas.height,
+    };
+  };
+
+  const startDraw = (evt) => {
+    if (signMode !== 'draw') return;
+    evt.preventDefault();
+    drawingRef.current = true;
+    const canvas = canvasRef.current;
+    const ctx = canvas.getContext('2d');
+    const { x, y } = getCanvasPoint(evt);
+    ctx.beginPath();
+    ctx.moveTo(x, y);
+  };
+
+  const draw = (evt) => {
+    if (!drawingRef.current || signMode !== 'draw') return;
+    evt.preventDefault();
+    const canvas = canvasRef.current;
+    const ctx = canvas.getContext('2d');
+    const { x, y } = getCanvasPoint(evt);
+    ctx.lineTo(x, y);
+    ctx.stroke();
+    hasInkRef.current = true;
+  };
+
+  const endDraw = () => {
+    drawingRef.current = false;
+  };
+
+  const clearCanvas = () => {
+    const canvas = canvasRef.current;
+    if (!canvas) return;
+    const ctx = canvas.getContext('2d');
+    ctx.fillStyle = '#ffffff';
+    ctx.fillRect(0, 0, canvas.width, canvas.height);
+    hasInkRef.current = false;
+  };
+
+  const handleSubmitSignature = async () => {
+    setSubmitting(true);
+    setError('');
+    try {
+      let signatureDataUrl = null;
+      if (signMode === 'draw') {
+        if (!hasInkRef.current) {
+          setError('Please draw your signature or switch to type mode.');
+          setSubmitting(false);
+          return;
+        }
+        signatureDataUrl = canvasRef.current?.toDataURL('image/png') || null;
+      } else {
+        signatureDataUrl = typedSignatureToDataUrl(typedName);
+        if (!signatureDataUrl) {
+          setError('Please type your name to sign.');
+          setSubmitting(false);
+          return;
+        }
+      }
+
+      const payloadFields = {
+        ...fields,
+        signatureName: signMode === 'type' ? typedName.trim() : fields.name,
+      };
+
+      const res = await invokeUw({
+        action: 'submitSignature',
+        token: rawToken,
+        fields: payloadFields,
+        signatureDataUrl,
+      });
+
+      const url = res.data?.signedPdfUrl;
+      if (!url) throw new Error(res.data?.error || 'Signing failed ΓÇö no PDF returned.');
+      setSignedPdfUrl(url);
+      setPhase('signed');
+    } catch (err) {
+      if (isExpiredError(err)) {
+        setPhase('expired');
+        setError(err.message || 'This W-9 link has expired.');
+      } else {
+        setError(err.message || 'Could not submit your signature. Please try again.');
+      }
+    } finally {
+      setSubmitting(false);
+    }
+  };
+
+  const cardCls =
+    'bg-white text-gray-900 border border-gray-200 rounded-cb shadow-cb-overlay w-full max-w-lg p-8';
+
+  return (
+    <div className="portal-bg min-h-screen flex flex-col items-center px-4 py-10">
+      <div className="mb-8">
+        <CliqbuxLogo />
+      </div>
+
+      <div className={cardCls}>
+        {phase === 'loading' && (
+          <div className="flex flex-col items-center gap-4 py-10">
+            <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
+            <p className="text-cb-body text-gray-500">Loading your W-9 requestΓÇª</p>
+          </div>
+        )}
+
+        {phase === 'expired' && (
+          <div className="flex flex-col items-center gap-4 py-6 text-center">
+            <div className="w-14 h-14 rounded-full bg-amber-50 flex items-center justify-center">
+              <AlertTriangle className="w-7 h-7 text-amber-600" />
+            </div>
+            <div>
+              <p className="font-display text-cb-title text-gray-900 mb-1">Link expired</p>
+              <p className="text-cb-body text-gray-500">{error}</p>
+            </div>
+          </div>
+        )}
+
+        {phase === 'error' && (
+          <div className="flex flex-col items-center gap-4 py-6 text-center">
+            <div className="w-14 h-14 rounded-full bg-red-50 flex items-center justify-center">
+              <AlertTriangle className="w-7 h-7 text-cb-danger" />
+            </div>
+            <div>
+              <p className="font-display text-cb-title text-gray-900 mb-1">Unable to open</p>
+              <p className="text-cb-body text-gray-500">{error}</p>
+            </div>
+          </div>
+        )}
+
+        {phase === 'signed' && (
+          <div className="flex flex-col items-center gap-4 py-6 text-center">
+            <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center">
+              <CheckCircle className="w-9 h-9 text-cb-success" />
+            </div>
+            <div>
+              <p className="font-display text-cb-title text-gray-900 mb-1">W-9 signed</p>
+              <p className="text-cb-body text-gray-500">
+                Thank you{recipientName ? `, ${recipientName}` : ''}. Your signed W-9 has been saved.
+                {midLabel ? ` (${midLabel})` : ''}
+              </p>
+            </div>
+            {signedPdfUrl ? (
+              <a
+                href={signedPdfUrl}
+                target="_blank"
+                rel="noopener noreferrer"
+                download
+                className="inline-flex items-center gap-2 text-sm font-semibold text-white bg-cb-accent hover:opacity-90 px-5 py-2.5 rounded-cb transition-opacity"
+              >
+                <Download className="w-4 h-4" />
+                Download signed W-9
+              </a>
+            ) : (
+              <p className="text-cb-caption text-gray-400">Download link unavailable ΓÇö contact CliqBux.</p>
+            )}
+            <p className="text-cb-caption text-gray-400 mt-2">You may safely close this window.</p>
+          </div>
+        )}
+
+        {phase === 'form' && (
+          <>
+            <div className="mb-6">
+              <p className="text-cb-caption uppercase text-cb-accent mb-1">Underwriting ┬╖ Form W-9</p>
+              <h1 className="font-display text-cb-title text-gray-900">Review your tax information</h1>
+              <p className="text-cb-body text-gray-500 mt-1">
+                Confirm the details below, then sign electronically.
+                {midLabel ? <> For <strong>{midLabel}</strong>.</> : null}
+              </p>
+              {agentNote ? (
+                <p className="text-cb-body text-gray-600 mt-3 p-3 rounded-cb bg-gray-50 border border-gray-100">
+                  <span className="text-cb-caption uppercase text-gray-400 block mb-1">Note from CliqBux</span>
+                  {agentNote}
+                </p>
+              ) : null}
+            </div>
+
+            <form onSubmit={handleContinue} className="flex flex-col gap-4">
+              <div>
+                <label className={labelCls}>Name (as shown on income tax return)</label>
+                <input className={inputCls} value={fields.name} onChange={(e) => setField('name', e.target.value)} />
+              </div>
+              <div>
+                <label className={labelCls}>Business name / DBA (optional)</label>
+                <input
+                  className={inputCls}
+                  value={fields.businessName}
+                  onChange={(e) => setField('businessName', e.target.value)}
+                />
+              </div>
+              <div>
+                <label className={labelCls}>Federal tax classification</label>
+                <select
+                  className={inputCls}
+                  value={fields.taxClassification}
+                  onChange={(e) => setField('taxClassification', e.target.value)}
+                >
+                  <option value="">SelectΓÇª</option>
+                  {TAX_CLASSES.map((o) => (
+                    <option key={o.value} value={o.value}>{o.label}</option>
+                  ))}
+                </select>
+              </div>
+              {fields.taxClassification === 'llc' && (
+                <div>
+                  <label className={labelCls}>LLC tax classification (C, S, P, or D)</label>
+                  <select
+                    className={inputCls}
+                    value={fields.llcTaxClass}
+                    onChange={(e) => setField('llcTaxClass', e.target.value)}
+                  >
+                    <option value="">SelectΓÇª</option>
+                    {LLC_CLASSES.map((o) => (
+                      <option key={o.value} value={o.value}>{o.label}</option>
+                    ))}
+                  </select>
+                </div>
+              )}
+              {fields.taxClassification === 'other' && (
+                <div>
+                  <label className={labelCls}>Other classification</label>
+                  <input
+                    className={inputCls}
+                    value={fields.otherClassification}
+                    onChange={(e) => setField('otherClassification', e.target.value)}
+                  />
+                </div>
+              )}
+              <div>
+                <label className={labelCls}>Street address</label>
+                <input className={inputCls} value={fields.address} onChange={(e) => setField('address', e.target.value)} />
+              </div>
+              <div className="grid grid-cols-3 gap-2">
+                <div className="col-span-1">
+                  <label className={labelCls}>City</label>
+                  <input className={inputCls} value={fields.city} onChange={(e) => setField('city', e.target.value)} />
+                </div>
+                <div>
+                  <label className={labelCls}>State</label>
+                  <input
+                    className={inputCls}
+                    value={fields.state}
+                    onChange={(e) => setField('state', e.target.value.toUpperCase().slice(0, 2))}
+                    maxLength={2}
+                  />
+                </div>
+                <div>
+                  <label className={labelCls}>ZIP</label>
+                  <input className={inputCls} value={fields.zip} onChange={(e) => setField('zip', e.target.value)} />
+                </div>
+              </div>
+              <div className="grid grid-cols-2 gap-3">
+                <div>
+                  <label className={labelCls}>TIN type</label>
+                  <select
+                    className={inputCls}
+                    value={fields.tinType}
+                    onChange={(e) => setField('tinType', e.target.value)}
+                  >
+                    <option value="ein">EIN</option>
+                    <option value="ssn">SSN</option>
+                  </select>
+                </div>
+                <div>
+                  <label className={labelCls}>Taxpayer ID (9 digits)</label>
+                  <input
+                    type="password"
+                    data-private="tin"
+                    className={inputCls}
+                    value={fields.tin}
+                    onChange={(e) => setField('tin', e.target.value.replace(/\D/g, '').slice(0, 9))}
+                    placeholder="ΓÇóΓÇóΓÇóΓÇóΓÇóΓÇóΓÇóΓÇóΓÇó"
+                    autoComplete="off"
+                  />
+                  {fields.tin.length === 9 && (
+                    <p className="text-xs text-gray-400 mt-1">{formatTinDisplay(fields.tin, fields.tinType)}</p>
+                  )}
+                </div>
+              </div>
+
+              {fieldErrors.length > 0 && (
+                <ul className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-cb px-3 py-2 list-disc pl-5">
+                  {fieldErrors.map((msg) => (
+                    <li key={msg}>{msg}</li>
+                  ))}
+                </ul>
+              )}
+
+              <button
+                type="submit"
+                className="w-full flex items-center justify-center gap-2 text-sm font-bold text-gray-900 bg-cb-accent hover:opacity-90 py-3 rounded-cb transition-opacity mt-1"
+              >
+                Continue to sign
+              </button>
+            </form>
+          </>
+        )}
+
+        {phase === 'sign' && (
+          <div className="flex flex-col gap-4">
+            <div className="flex items-start gap-3">
+              <PenLine className="w-5 h-5 text-cb-accent flex-shrink-0 mt-0.5" />
+              <div>
+                <h2 className="font-display text-cb-title text-gray-900">Sign Form W-9</h2>
+                <p className="text-cb-body text-gray-500 mt-0.5">
+                  Under penalties of perjury, I certify the information is correct. Draw or type your signature below.
+                </p>
+              </div>
+            </div>
+
+            <div className="flex gap-2">
+              <button
+                type="button"
+                onClick={() => setSignMode('draw')}
+                className={`flex-1 text-sm py-2 rounded-cb border ${
+                  signMode === 'draw'
+                    ? 'border-cb-accent bg-cb-accent-muted text-gray-900 font-semibold'
+                    : 'border-gray-200 text-gray-500'
+                }`}
+              >
+                Draw
+              </button>
+              <button
+                type="button"
+                onClick={() => setSignMode('type')}
+                className={`flex-1 text-sm py-2 rounded-cb border ${
+                  signMode === 'type'
+                    ? 'border-cb-accent bg-cb-accent-muted text-gray-900 font-semibold'
+                    : 'border-gray-200 text-gray-500'
+                }`}
+              >
+                Type name
+              </button>
+            </div>
+
+            {signMode === 'draw' ? (
+              <div>
+                <div className="flex items-center justify-between mb-2">
+                  <span className={labelCls}>Signature</span>
+                  <button
+                    type="button"
+                    onClick={clearCanvas}
+                    className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700"
+                  >
+                    <Eraser className="w-3.5 h-3.5" />
+                    Clear
+                  </button>
+                </div>
+                <canvas
+                  ref={canvasRef}
+                  width={560}
+                  height={120}
+                  className="w-full border border-gray-300 rounded-cb touch-none bg-white cursor-crosshair"
+                  onMouseDown={startDraw}
+                  onMouseMove={draw}
+                  onMouseUp={endDraw}
+                  onMouseLeave={endDraw}
+                  onTouchStart={startDraw}
+                  onTouchMove={draw}
+                  onTouchEnd={endDraw}
+                />
+              </div>
+            ) : (
+              <div>
+                <label className={labelCls}>Type your full name</label>
+                <input
+                  className={`${inputCls} font-serif italic text-lg`}
+                  value={typedName}
+                  onChange={(e) => setTypedName(e.target.value)}
+                  placeholder="Legal signature"
+                />
+              </div>
+            )}
+
+            {error && (
+              <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-cb px-3 py-2">{error}</p>
+            )}
+
+            <div className="flex gap-2 mt-1">
+              <button
+                type="button"
+                onClick={() => setPhase('form')}
+                disabled={submitting}
+                className="flex-1 text-sm font-medium text-gray-600 border border-gray-200 py-3 rounded-cb hover:bg-gray-50"
+              >
+                Back
+              </button>
+              <button
+                type="button"
+                onClick={handleSubmitSignature}
+                disabled={submitting}
+                className="flex-[2] flex items-center justify-center gap-2 text-sm font-bold text-gray-900 bg-cb-accent hover:opacity-90 disabled:opacity-50 py-3 rounded-cb"
+              >
+                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <PenLine className="w-4 h-4" />}
+                {submitting ? 'SubmittingΓÇª' : 'Submit signed W-9'}
+              </button>
+            </div>
+          </div>
+        )}
+      </div>
+
+      <p className="text-gray-600 text-cb-caption mt-6">
+        Secured by <span className="text-cb-accent font-semibold">Cliqbux</span>
+      </p>
+    </div>
+  );
+}

```
