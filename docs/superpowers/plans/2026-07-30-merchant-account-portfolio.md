# Merchant Account Portfolio Implementation Plan

> **For agentic workers:** Implement task-by-task. Design: `docs/superpowers/specs/2026-07-30-merchant-account-portfolio-design.md`.

**Goal:** Admin `/admin/center` = MerchantAccount portfolio + account home; Applications stays deal desk.

## Files

| Path | Responsibility |
|---|---|
| `src/lib/merchantAccountStatus.js` | Pure status + MID counts |
| `src/lib/merchantAccountStatus.test.js` | Node test coverage |
| `base44/functions/manageMerchantAccount/entry.ts` | Admin list/get/unlinked |
| `src/pages/AdminMerchantPortfolio.jsx` | Portfolio UI |
| `src/pages/AdminMerchantAccountHome.jsx` | Account home |
| `src/App.jsx` | Routes |
| `ApplicationManager.jsx` / `AGENTS.md` / `AI_CHANNEL.md` | Wiring + docs |

## Tasks

1. Status helpers + tests  
2. `manageMerchantAccount`  
3. Portfolio UI  
4. Account home  
5. Routes, Applications link, AGENTS, AI_CHANNEL  

## Deploy

Push via GitHub Desktop; publish `manageMerchantAccount` in Base44. No entity republish for v1.
