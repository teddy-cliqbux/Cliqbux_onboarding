# Onboarding Portal Stress Test Report

**Generated:** 2026-07-14T06:38:11.610Z
**Suite started:** 2026-07-14T06:37:41.160Z
**Playwright status:** passed
**Mode:** Safe in-memory simulation mirroring production function behavior (no live MSPWare / HubSpot calls).

## Summary

| Metric | Count |
|--------|------:|
| Scenarios recorded | 8 |
| PASS | 8 |
| FAIL | 0 |
| WARN | 0 |

> **PASS** = desired safety/validation behavior is present.  
> **FAIL** = production behavior allows a silent default, missing gate, or stale draft.  
> **WARN** = exploratory matrix / partial gap (documented, not a hard blocker).

## 1. MCC Delay Test

**Status:** `PASS`

### Observed behavior

System deferred draft creation and refused payload compile when MCC was empty.

### Database / draft state

{
  "mid": {
    "id": "mid_2",
    "mccCode": "",
    "mspApplicationNo": null
  },
  "draft": null,
  "resolveThrew": true
}

### Details

2026-07-13 fix: manageMerchantID defers submitToMSP until MCC is set; buildFormPayload throws if missing.

### File / line references

- `base44/functions/submitToMSP/entry.ts:421` — ``MCC code is required before creating or filling an MSPWare application for "${merchantMID.dbaName || merchantMID.merchantName || 'this MID'}". ` +`
- `base44/functions/manageMerchantID/entry.ts:130` — `console.log('[manageMerchantID] Skipping submitToMSP on add — MCC not set yet (will create draft on MCC save)');`
- `base44/functions/manageMerchantID/entry.ts:105` — `mccCode: data?.mccCode || '',`
- `src/pages/OnboardingLocations.jsx:431` — `data: { merchantName: addMidName || location.dbaName, mccCode: '' },`

## 2. State/MCC Matrix Test

**Status:** `PASS`

### Observed behavior

Cycled 3 states × 12 MCCs = 36 combos (36 drafts). Production enforced 2 liquor-compliance flags (CA/NY + 5813). Desired heuristic flagged 2.

### Database / draft state

Allowed MCCs produce drafts. CA/NY+5813 requires alcoholSalesPercentage on MID; liquor license is post-sign only.

### Details

Liquor compliance is advisory+alcohol% on Locations; license upload after signing does not block the matrix draft create.

### State × MCC matrix

| State | MCC | Portal outcome | Desired outcome |
|------:|----:|----------------|-----------------|
| CA | 5812 | ALLOWED (draft mcc=5812, pct=100) | ALLOW |
| CA | 5814 | ALLOWED (draft mcc=5814, pct=100) | ALLOW |
| CA | 5813 | BLOCKED: MCC 5813 requires liquor compliance for state CA (alcohol % on MID; liquor license post-sign) | SHOULD BLOCK: MCC 5813 requires liquor compliance for state CA |
| CA | 5411 | ALLOWED (draft mcc=5411, pct=100) | ALLOW |
| CA | 7230 | ALLOWED (draft mcc=7230, pct=100) | ALLOW |
| CA | 5651 | ALLOWED (draft mcc=5651, pct=100) | ALLOW |
| CA | 5734 | ALLOWED (draft mcc=5734, pct=100) | ALLOW |
| CA | 5311 | ALLOWED (draft mcc=5311, pct=100) | ALLOW |
| CA | 7221 | ALLOWED (draft mcc=7221, pct=100) | ALLOW |
| CA | 5932 | ALLOWED (draft mcc=5932, pct=100) | ALLOW |
| CA | 4900 | ALLOWED (draft mcc=4900, pct=100) | ALLOW |
| CA | 5211 | ALLOWED (draft mcc=5211, pct=100) | ALLOW |
| CO | 5812 | ALLOWED (draft mcc=5812, pct=100) | ALLOW |
| CO | 5814 | ALLOWED (draft mcc=5814, pct=100) | ALLOW |
| CO | 5813 | ALLOWED (draft mcc=5813, pct=100) | ALLOW |
| CO | 5411 | ALLOWED (draft mcc=5411, pct=100) | ALLOW |
| CO | 7230 | ALLOWED (draft mcc=7230, pct=100) | ALLOW |
| CO | 5651 | ALLOWED (draft mcc=5651, pct=100) | ALLOW |
| CO | 5734 | ALLOWED (draft mcc=5734, pct=100) | ALLOW |
| CO | 5311 | ALLOWED (draft mcc=5311, pct=100) | ALLOW |
| CO | 7221 | ALLOWED (draft mcc=7221, pct=100) | ALLOW |
| CO | 5932 | ALLOWED (draft mcc=5932, pct=100) | ALLOW |
| CO | 4900 | ALLOWED (draft mcc=4900, pct=100) | ALLOW |
| CO | 5211 | ALLOWED (draft mcc=5211, pct=100) | ALLOW |
| NY | 5812 | ALLOWED (draft mcc=5812, pct=100) | ALLOW |
| NY | 5814 | ALLOWED (draft mcc=5814, pct=100) | ALLOW |
| NY | 5813 | BLOCKED: MCC 5813 requires liquor compliance for state NY (alcohol % on MID; liquor license post-sign) | SHOULD BLOCK: MCC 5813 requires liquor compliance for state NY |
| NY | 5411 | ALLOWED (draft mcc=5411, pct=100) | ALLOW |
| NY | 7230 | ALLOWED (draft mcc=7230, pct=100) | ALLOW |
| NY | 5651 | ALLOWED (draft mcc=5651, pct=100) | ALLOW |
| NY | 5734 | ALLOWED (draft mcc=5734, pct=100) | ALLOW |
| NY | 5311 | ALLOWED (draft mcc=5311, pct=100) | ALLOW |
| NY | 7221 | ALLOWED (draft mcc=7221, pct=100) | ALLOW |
| NY | 5932 | ALLOWED (draft mcc=5932, pct=100) | ALLOW |
| NY | 4900 | ALLOWED (draft mcc=4900, pct=100) | ALLOW |
| NY | 5211 | ALLOWED (draft mcc=5211, pct=100) | ALLOW |

### File / line references

- `base44/functions/submitToMSP/entry.ts:421` — ``MCC code is required before creating or filling an MSPWare application for "${merchantMID.dbaName || merchantMID.merchantName || 'this MID'}". ` +`
- `base44/functions/submitToMSP/entry.ts:425` — `if (mcc === '5999') {`

## 3. Live MCC Swap Test

**Status:** `PASS`

### Observed behavior

MSPWare draft MCC updated automatically after 5813→5812→5411 swaps.

### Database / draft state

{
  "midMcc": "5411",
  "draftAfter5812": {
    "mcc": "5812",
    "lastFillSource": "refill"
  },
  "draftAfter5411": {
    "mcc": "5411",
    "lastFillSource": "refill",
    "appNo": "msp_113"
  }
}

### Details

2026-07-13 fix: manageMerchantID update re-invokes submitToMSP on boarding field changes.

### File / line references

- `base44/functions/manageMerchantID/entry.ts:213` — `console.warn('[manageMerchantID] submitToMSP after update failed (non-fatal):', e.message);`
- `base44/functions/submitToMSP/entry.ts:421` — ``MCC code is required before creating or filling an MSPWare application for "${merchantMID.dbaName || merchantMID.merchantName || 'this MID'}". ` +`
- `base44/functions/signApplication/entry.ts:930` — `const mccMismatch = Boolean(expectedMcc && formMcc && formMcc !== expectedMcc);`

## 4. State Swap with Restricted MCC

**Status:** `PASS`

### Observed behavior

Inline compliance warning fired on TX→CA: MCC 5813 requires liquor compliance for state CA (alcohol % on MID; liquor license post-sign)

### Database / draft state

{
  "location": {
    "id": "loc_114",
    "corporateId": "state-swap-tavern",
    "dbaName": "TX Tavern",
    "businessStreet": "100 Main St",
    "businessCity": "Austin",
    "businessState": "CA",
    "businessZip": "78701",
    "bankDetails": null
  },
  "mid": {
    "id": "mid_115",
    "mccCode": "5813"
  },
  "draft": {
    "appNo": "msp_116",
    "midId": "mid_115",
    "corporateId": "state-swap-tavern",
    "mcc": "5813",
    "state": "TX",
    "percentComplete": 100,
    "formErrors": [],
    "createdAt": 1784011091544,
    "lastFilledAt": 1784011091544,
    "lastFillSource": "create"
  },
  "warnings": [
    "MCC 5813 requires liquor compliance for state CA (alcohol % on MID; liquor license post-sign)"
  ]
}

### Details

CA/NY+5813: alcohol % required on MID; liquor license prompted for post-sign upload (does not block signing).

### File / line references

- `src/pages/OnboardingLocations.jsx:149` — `const canSave = form.mccCode && pctSum === 100 && alcoholOk;`
- `base44/functions/submitToMSP/entry.ts:425` — `if (mcc === '5999') {`

## 5. End-to-End HubSpot Bypass Test

**Status:** `PASS`

### Observed behavior

Local stage "Danono's Donuts" → corporateId=danonos-donuts. Locations/banking/signing path completed. 3 HubSpot function calls — all returned hubspotBypass, zero HubSpot API attempts.

### Database / draft state

{
  "corporateId": "danonos-donuts",
  "profile": {
    "corporateId": "danonos-donuts",
    "legalName": "Danono's Donuts",
    "pricingTier": "SELF_SERVE_CASH_DISCOUNT",
    "applicationStatus": "Submitted"
  },
  "location": {
    "id": "loc_117",
    "corporateId": "danonos-donuts",
    "dbaName": "Danono's Donuts",
    "businessStreet": "400 Donut Ave",
    "businessCity": "San Diego",
    "businessState": "CA",
    "businessZip": "92101",
    "bankDetails": {
      "routingNumber": "121000248",
      "accountNumber": "123456789"
    }
  },
  "mid": {
    "id": "mid_118",
    "locationId": "loc_117",
    "corporateId": "danonos-donuts",
    "merchantName": "Danono's Donuts",
    "dbaName": "Danono's Donuts",
    "mccCode": "5812",
    "industryType": "",
    "monthlyCardSales": 20000,
    "avgSaleAmount": 12,
    "highestTicketAmount": 80,
    "cardPresentPct": 100,
    "applicationStepStatus": "In Review",
    "mspApplicationNo": "msp_119"
  },
  "draft": {
    "appNo": "msp_119",
    "midId": "mid_118",
    "corporateId": "danonos-donuts",
    "mcc": "5812",
    "state": "CA",
    "percentComplete": 100,
    "formErrors": [],
    "createdAt": 1784011091558,
    "lastFilledAt": 1784011091558,
    "lastFillSource": "create"
  },
  "hubspotCalls": [
    {
      "fn": "syncFromHubspot",
      "corporateId": "danonos-donuts",
      "attemptedApi": false,
      "hubspotBypass": true
    },
    {
      "fn": "pushStatusToHubspot",
      "corporateId": "danonos-donuts",
      "attemptedApi": false,
      "hubspotBypass": true
    },
    {
      "fn": "getHubspotQuote",
      "corporateId": "danonos-donuts",
      "attemptedApi": false,
      "hubspotBypass": true
    }
  ],
  "signResult": {
    "blocked": false,
    "refilled": false
  }
}

### File / line references

- `base44/functions/syncFromHubspot/entry.ts:225` — `hubspotBypass: true,`
- `base44/functions/pushStatusToHubspot/entry.ts:112` — `hubspotBypass: true,`
- `src/pages/OnboardingLocations.jsx:431` — `data: { merchantName: addMidName || location.dbaName, mccCode: '' },`

## 6. Empty MID Refusal

**Status:** `PASS`

### Observed behavior

UI and backend both refuse empty MCC; no draft created on empty add.

### Database / draft state

{
  "mid": {
    "id": "mid_121",
    "locationId": "loc_120",
    "corporateId": "empty-mid-co",
    "merchantName": "No MCC Store",
    "dbaName": "No MCC Store",
    "mccCode": "",
    "industryType": "",
    "monthlyCardSales": 0,
    "avgSaleAmount": 0,
    "highestTicketAmount": 0,
    "cardPresentPct": 100,
    "applicationStepStatus": "In Review",
    "mspApplicationNo": null
  },
  "draft": null,
  "uiSave": {
    "blocked": true,
    "reason": "UI: Fill MCC & card split to save"
  },
  "backend": {
    "refused": true,
    "reason": "MCC code is required before creating or filling an MSPWare application"
  }
}

### Details

2026-07-13: UI + buildFormPayload + deferred draft all refuse empty MCC.

### File / line references

- `src/pages/OnboardingLocations.jsx:149` — `const canSave = form.mccCode && pctSum === 100 && alcoholOk;`
- `base44/functions/manageMerchantID/entry.ts:105` — `mccCode: data?.mccCode || '',`
- `base44/functions/submitToMSP/entry.ts:421` — ``MCC code is required before creating or filling an MSPWare application for "${merchantMID.dbaName || merchantMID.merchantName || 'this MID'}". ` +`
- `base44/functions/getMerchantData/entry.ts:186` — `if (!c.mccCode) missing.push('MCC code');`

## 7. Multi-MID Split-MCC Test

**Status:** `PASS`

### Observed behavior

Two drafts at same CA address inherited distinct MCCs: 5812 vs 5411 (appNos msp_124 / msp_126).

### Database / draft state

{
  "locationId": "loc_122",
  "midA": {
    "id": "mid_123",
    "locationId": "loc_122",
    "corporateId": "split-mcc-market",
    "merchantName": "Hall Cafe",
    "dbaName": "Hall Cafe",
    "mccCode": "5812",
    "industryType": "",
    "monthlyCardSales": 10000,
    "avgSaleAmount": 28,
    "highestTicketAmount": 150,
    "cardPresentPct": 100,
    "applicationStepStatus": "In Review",
    "mspApplicationNo": "msp_124"
  },
  "midB": {
    "id": "mid_125",
    "locationId": "loc_122",
    "corporateId": "split-mcc-market",
    "merchantName": "Hall Grocery",
    "dbaName": "Hall Grocery",
    "mccCode": "5411",
    "industryType": "",
    "monthlyCardSales": 40000,
    "avgSaleAmount": 55,
    "highestTicketAmount": 400,
    "cardPresentPct": 100,
    "applicationStepStatus": "In Review",
    "mspApplicationNo": "msp_126"
  },
  "draftA": {
    "appNo": "msp_124",
    "midId": "mid_123",
    "corporateId": "split-mcc-market",
    "mcc": "5812",
    "state": "CA",
    "percentComplete": 100,
    "formErrors": [],
    "createdAt": 1784011091576,
    "lastFilledAt": 1784011091576,
    "lastFillSource": "create"
  },
  "draftB": {
    "appNo": "msp_126",
    "midId": "mid_125",
    "corporateId": "split-mcc-market",
    "mcc": "5411",
    "state": "CA",
    "percentComplete": 100,
    "formErrors": [],
    "createdAt": 1784011091576,
    "lastFilledAt": 1784011091576,
    "lastFillSource": "create"
  }
}

### File / line references

- `base44/functions/submitToMSP/entry.ts:421` — ``MCC code is required before creating or filling an MSPWare application for "${merchantMID.dbaName || merchantMID.merchantName || 'this MID'}". ` +`
- `base44/functions/manageMerchantID/entry.ts:213` — `console.warn('[manageMerchantID] submitToMSP after update failed (non-fatal):', e.message);`

## 8. Partial Fill Recovery

**Status:** `PASS`

### Observed behavior

signApplication on 79% draft: refilled=true, blocked=true. Stale-100% MCC mismatch path: refilled=true, afterMcc=5411.

### Database / draft state

{
  "incompletePath": {
    "before": {
      "appNo": "msp_129",
      "midId": "mid_128",
      "corporateId": "partial-fill-recovery",
      "mcc": "5813",
      "state": "CA",
      "percentComplete": 79,
      "formErrors": [
        "MCC 5813 restricted for CA (simulated underwriting)"
      ],
      "createdAt": 1784011091585,
      "lastFilledAt": 1784011091585,
      "lastFillSource": "create"
    },
    "after": {
      "appNo": "msp_129",
      "midId": "mid_128",
      "corporateId": "partial-fill-recovery",
      "mcc": "5813",
      "state": "CA",
      "percentComplete": 79,
      "formErrors": [
        "MCC 5813 requires liquor compliance for state CA"
      ],
      "createdAt": 1784011091585,
      "lastFilledAt": 1784011091585,
      "lastFillSource": "refill"
    },
    "refilled": true,
    "blocked": true
  },
  "falseCompletePath": {
    "midMccAfterSwap": "5411",
    "skippedRefill": false,
    "after": {
      "appNo": "msp_131",
      "midId": "mid_130",
      "corporateId": "partial-fill-recovery",
      "mcc": "5411",
      "state": "CA",
      "percentComplete": 100,
      "formErrors": [],
      "createdAt": 1784011091585,
      "lastFilledAt": 1784011091585,
      "lastFillSource": "refill"
    }
  }
}

### Details

2026-07-13: refill when percent !== 100 OR form MCC ≠ portal MCC.

### File / line references

- `base44/functions/signApplication/entry.ts:930` — `const mccMismatch = Boolean(expectedMcc && formMcc && formMcc !== expectedMcc);`
- `base44/functions/signApplication/entry.ts:335` — ``MCC code is required before signing for "${merchantMID.dbaName || merchantMID.merchantName || 'this MID'}". ` +`

## Recommended fixes (from FAIL/WARN)

1. ~~Refuse empty MCC before draft creation~~ — **done 2026-07-13** (`manageMerchantID` defers `submitToMSP` until MCC is set).
2. ~~Remove silent `5999` fallback~~ — **done 2026-07-13** (`submitToMSP` / `signApplication` / `refillMSPForms` throw; portal dropdown removed).
3. ~~Re-fill MSPWare draft on MCC change~~ — **done 2026-07-13** (`manageMerchantID` update re-invokes `submitToMSP`).
4. **Add state × MCC underwriting rules** (at least CA/NY + 5813 liquor) with inline UI warnings on location state change — still open.
5. Keep HubSpot bypass for slug `corporateId` (already working).

---
*Report written by `tests/reporters/stressMarkdownReporter.ts`.*
