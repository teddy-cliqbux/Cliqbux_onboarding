# Task 1 Report: Pure MSP → portal mapper + unit tests

**Branch:** `feat/kk-lechon-msp-oneoff`  
**Date:** 2026-07-23  
**Status:** DONE

## Deliverables

| File | Action |
|---|---|
| `src/lib/mspDraftImportMapper.js` | Created — `mapMspFormToPortal` per plan Task 1 Step 3 |
| `src/lib/mspDraftImportMapper.test.js` | Created — 6 tests per plan Task 1 Step 1 |
| `package.json` | Added `"test:msp-import"` script |

## TDD evidence

### RED (Step 2)

Command:

```text
node --test src/lib/mspDraftImportMapper.test.js
```

Result (before `mspDraftImportMapper.js` existed):

```text
Error [ERR_MODULE_NOT_FOUND]: Cannot find module '...\src\lib\mspDraftImportMapper.js'
ℹ tests 1
ℹ pass 0
ℹ fail 1
```

### GREEN (Step 4)

Command:

```text
npm run test:msp-import
```

Result:

```text
▶ mapMspFormToPortal
  ✔ forces Cash Discount pricing and omits mspApplicationNo
  ✔ maps Omni split: int→internetPct, cnp→motoPct
  ✔ maps ownership LL + llc_class C → LIMITED_COMPANY + LLC_CORPORATION
  ✔ marks Kate as Control Person when first name matches
  ✔ masks TIN in preview and lists bank when present
  ✔ never treats 5999 as a valid default MCC when form mcc empty
ℹ tests 6
ℹ pass 6
ℹ fail 0
```

## Commit

Subject: `feat: add MSP draft→portal mapper for KK Lechon one-off import`  
Files: mapper, test file, `package.json` script only.

## Self-review

### Plan / brief alignment

- **Cash Discount:** `profile.pricingTier` always `SELF_SERVE_CASH_DISCOUNT`; `mid.pricingMethod` always `TIERD`.
- **No source app on MID:** `mspApplicationNo` is not set on `mid` (undefined); tests assert this.
- **Omni reverse (Lesson #18):** `int_percent` → `internetPct`, `cnp_percent` → `motoPct`.
- **MCC:** Empty MCC stays empty with gap message; `5999` cleared to `''` with gap — never invented as default.
- **Control Person:** Email match, first-name match (default `Kate`), or sole owner fallback.
- **Bank:** Routing/account from MSP form → `location.bankDetails` with `authMethod: 'manual'` and masked preview fields via `preview.hasBank` / `preview.tinLast4`.

### Minor doc inconsistency (no code change)

Task brief `MappedImport.preview` lists `percentHints`; plan Step 3 implementation uses `cardSplit: { cardPresentPct, internetPct, motoPct }`. Implementation follows **Step 3 verbatim**. Task 2 inliner should copy the same shape; update design doc later if Teddy wants `percentHints` naming.

### Out of scope (as requested)

- No Deno `importMspDraftOneOff` function.
- No live MSPWare or HubSpot calls.
- No `AI_CHANNEL.md` entry (Task 5 ops).

## Global constraints honored in mapper

- Pricing forced to Cash Discount tier (ignores MSP pricing method on source form).
- Never sets `mspApplicationNo` to `78291` or any value.
- Never defaults missing MCC to `5999`.

## Next task handoff

Task 2 should inline a verbatim copy of `src/lib/mspDraftImportMapper.js` between sync markers in `importMspDraftOneOff/entry.ts` (Base44 cannot import from `src/`).

---

## Task 1 review fix (2026-07-23)

**Findings addressed:**

1. **Test gap:** Added 7th test `clears 5999 from MID and preview and records invalid-MCC gap` — asserts `mid.mccCode === ''`, `preview.mcc === null` (not `'5999'`), and gap matches `/5999|invalid/i`.
2. **preview.mcc inconsistency:** Introduced `midMccCode` (clears `5999`); both `mid.mccCode` and `preview.mcc` use it so preview matches cleared MID.

**Test run:**

```text
npm run test:msp-import
▶ mapMspFormToPortal
  ✔ forces Cash Discount pricing and omits mspApplicationNo
  ✔ maps Omni split: int→internetPct, cnp→motoPct
  ✔ maps ownership LL + llc_class C → LIMITED_COMPANY + LLC_CORPORATION
  ✔ marks Kate as Control Person when first name matches
  ✔ masks TIN in preview and lists bank when present
  ✔ never treats 5999 as a valid default MCC when form mcc empty
  ✔ clears 5999 from MID and preview and records invalid-MCC gap
ℹ tests 7
ℹ pass 7
ℹ fail 0
```

**Commit:** (see SHA below after commit)
