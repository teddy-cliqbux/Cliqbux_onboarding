# Task 7 Report: Deal Room `UnderwritingRequestsPanel`



**STATUS:** DONE  

**Branch:** `feature/underwriting-w9-request`  

**Commit:** `b51885e` — feat(uw): Deal Room underwriting requests panel for W-9  

**Date:** 2026-08-07



---



## Summary



Added Deal Room MID panel for W-9 underwriting requests: list, Create & Send, Resend/Cancel, Download signed PDF, and Send to Elavon modal. Mounted under **Underwriting by MID** when a MID is selected. Client `buildW9Prefill` shows a masked preview; create still uses server-side prefill.



---



## Files



| File | Change |

|---|---|

| `src/components/deal-room/UnderwritingRequestsPanel.jsx` | New — list + new W-9 form + Elavon modal |

| `src/pages/ApplicationDealRoom.jsx` | Import + mount when `selectedMid` set |



---



## API wiring



`base44.functions.invoke('manageUnderwritingRequest', …)`:



| Action | UI |

|---|---|

| `list` | On mount / refresh / after mutations |

| `create` → `send` | Create & Send |

| `send` / `resend` | Draft Send / unsigned Resend |

| `cancel` | Unsigned rows |

| `getSignedUrl` | Download (opens URL) |

| `sendToElavon` | Modal: To (hint from `elavonDocsToHint`), Subject with AWB, body |



Props from parent: `corporateId`, `mid`, `legalEntities`, `signers`, `profile`, plus `locations` for client prefill address fallback.



---



## Out of scope



Task 8 (docs / Gmail scope / AGENTS), push, live smoke (needs published entity + redeployed function).


