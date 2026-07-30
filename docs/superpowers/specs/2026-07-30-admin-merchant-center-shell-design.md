# Admin Merchant Center Shell (layout)

**Date:** 2026-07-30  
**Status:** Approved (Teddy) — recommendation A  

## Goal

Replace the centered onboarding-style list at `/admin/center` with an admin **shell**: left sidebar + top search + dashboard launch home. Portfolio lists and account home render inside the shell. Applications / Deal Room stay separate destinations.

## Locked decisions

- Scope: Merchant Center routes only (not wrapping Applications yet)
- Visual: dark `cb-*` tokens; full-bleed work area; no charts / volume KPIs / fake notification badges
- Home = launch + counts; lists live under Portfolio nav

## Routes

| Path | View |
|---|---|
| `/admin/center` | Dashboard (KPI strip, launch tiles, attention preview) |
| `/admin/center/merchants` | Account portfolio list |
| `/admin/center/prospects` | status=`prospect` |
| `/admin/center/attention` | status=`needs_attention` |
| `/admin/center/unlinked` | Unlinked deals |
| `/admin/center/installations` | Light installations launch panel |
| `/admin/center/accounts/:id` | Account home (breadcrumb Merchants → name) |

## Shell chrome

- Sidebar sections: **Portfolio** (Dashboard, Merchants, Prospects, Needs attention, Unlinked) · **Work** (Onboarding → `/admin/applications`, Installations)
- Active nav: `bg-cb-accent-muted` + `text-cb-accent`
- Top bar: global search (company / domain / HubSpot company id / Deal ID) + Applications desk chip

## Non-goals

- Shared shell for Applications/Deal Room (phase 2)
- Charts, MID/BIN filters, Excel import, create account from hub
