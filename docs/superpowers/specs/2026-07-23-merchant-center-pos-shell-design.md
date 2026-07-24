# Merchant Center Setup — POS-shell redesign

**Date:** 2026-07-23  
**Status:** Approved (Teddy)  
**Scope:** Visual / layout redesign of post-submission Merchant Center Setup (`PostSubmissionDashboard` + `MerchantCenterShell`). Locations & Account adopt the same chrome.

## Goal

Make Merchant Center feel like [dashboard.cliqbux.com](https://dashboard.cliqbux.com) — left sidebar, top bar, wide grid, card/table language — while every panel still serves **onboarding → go-live**, not daily POS operations (no sales charts, no fake metrics).

## Non-goals

- No changes to fetch paths, auth, entity fields, validation, or Save semantics
- No HubSpot / MSPWare / checklist backend changes
- No ⌘K search in v1
- No real POS sales data or chart widgets
- Quote iframe stays white (document readability)

## Current state

- [`MerchantCenterShell.jsx`](../../src/components/merchant-center/MerchantCenterShell.jsx): fixed top header, horizontal nav, `max-w-3xl` centered main
- [`PostSubmissionDashboard.jsx`](../../src/pages/PostSubmissionDashboard.jsx): single scrolling column — hero, checklist, before-install, underwriting, application tracker, equipment/shipping/menu/legacy POS

## Approach (approved)

**Status hub** — full POS-style app chrome; content remapped to setup milestones.

---

## 1. App chrome

### Left sidebar

- Cliqbux mark at top (same brand assets as portal)
- Nav groups (onboarding labels, not POS Operations/Management):
  - **Setup** → `/onboarding/dashboard` (or `/center`) — deal board / this redesign
  - **Locations** → `/locations`
  - **Account** → `/account`
- Active item: gold muted fill + accent text/icon (match POS Dashboard active state)
- Footer: Sign out
- Desktop: fixed left rail (~220–240px)
- Mobile: collapse to hamburger or bottom tab strip (same three destinations + Setup badge for open checklist count)

### Top bar

- Left: page title context (“Setup” / current section)
- Right: business/deal name in store-switcher style (read-only in v1 — single deal context), agent-preview badge when impersonating, optional avatar initial
- No global search / ⌘K in v1

### Main canvas

- Fill remaining width (drop `max-w-3xl` constraint for Setup)
- Page background `bg-cb-bg`; panels `bg-cb-surface` / `bg-cb-surface-raised`; hairline `border-cb-border`; radius `rounded-cb`
- Use existing `cb-*` tokens only — no new hex palette

Locations and Account pages wrap in the **same shell** so navigation feels native; their inner page bodies can remain mostly unchanged in this pass.

---

## 2. Setup main layout

### A. Compact status strip (optional one-liner)

Replace the tall centered celebration hero with a short banner:

- Merchant: “Application submitted” + legal name  
- Agent preview: “Setup preview”  
- Link to Locations remains available via sidebar (and optionally inline)

Confetti / spring celebration may still fire once per session; do not dominate layout.

### B. Status metric row (4 cards)

Quiet POS-style metric cards (title + primary value + short caption + optional icon). Map to **existing** state only:

| Card | Primary value | Caption / nuance |
|------|---------------|------------------|
| Needs attention | Open checklist count | “Items waiting on you” |
| Underwriting | Aggregate MID status (e.g. In Review / Pending / Active) | Count of MIDs or worst status |
| Equipment quote | Lifecycle label (Awaiting signature / Awaiting payment / Paid) | From `getHubspotQuote` / profile stamps |
| Shipping | Locked / Hold / Ready to ship | Tracking snippet if present |

No sparklines, no invented % change vs yesterday.

### C. Two-column grid

- **Left (≈ 7/12):** `MerchantChecklist` + `MerchantBeforeInstall` (when location available)
- **Right (≈ 5/12):** `EquipmentOrderPanel` + Shipping `SetupGate` card  
- Stack to single column below `lg`

### D. Full-width tables / panels

1. **Underwriting / MIDs** — restyle `UnderwritingTracker` (and/or MID list) toward POS table language: header row, hairline dividers, muted empty state (“No data available” equivalent)
2. **Menu & inventory** + **Legacy POS** — gated as today via `SetupGate`; presented as cards/tables under the grid, not a third forever-scroll of undifferentiated blocks

### E. ApplicationTracker

Keep if still useful as a thin status strip; otherwise fold into Underwriting / status cards and remove duplicate chrome. Prefer one underwriting story, not two competing trackers.

### F. Agent unlock

`FormsLockedBanner` (agent-only unlock) stays near the top of main content when applicable — not buried.

---

## 3. Component / file plan

| Work | Notes |
|------|--------|
| Rebuild `MerchantCenterShell` | Sidebar + top bar + wide main slot; props for `title`, `corporateId`, checklist badge, children |
| `PostSubmissionDashboard` | Compose status cards + CSS grid; keep all existing data hooks / quote poll |
| Small presentational pieces | e.g. `SetupStatusCard`, optional `MerchantCenterSidebar` split for clarity |
| Table polish | Underwriting / location tables: header + row styles aligned with POS feel using `cb-*` |
| Locations / Account | Switch to new shell wrapper only |

**Do not** change: `invokePortalFunction` call sites, quote poll interval, SetupGate lock rules, demote/unlock flow, checklist APIs.

---

## 4. Visual reference

POS Dashboard cues to mirror:

- Dark charcoal surfaces, gold active nav
- Rounded cards in a responsive grid
- Metric row across the top
- Charts/tables below — **we substitute onboarding panels/tables for charts**
- Empty states centered and quiet

Creative North Star remains **The Gold Wire** / `DESIGN.md` / portal design skill restraint rules.

---

## 5. Success criteria

- Merchant opening Setup after submit recognizes Cliqbux POS family resemblance (sidebar + wide dashboard)
- Open tasks, quote, and underwriting are visible above the fold on desktop without hunting a long scroll
- No regression in quote sign/pay, shipping gate, menu unlock, checklist completion, agent unlock
- Locations / Account reachable from the same sidebar

## 6. Out of scope / follow-ups

- Multi-deal store switcher (real dropdown)
- Global search
- Porting full POS sidebar taxonomy (Reports, Employees, Inventory)
- Redesigning every Locations/Account inner widget beyond shell adoption
