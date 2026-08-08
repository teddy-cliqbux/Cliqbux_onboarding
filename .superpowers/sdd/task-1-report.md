# Task 1 Report: W-9 domain model + prefill (TDD)

**Status:** DONE  
**Branch:** `feature/underwriting-w9-request`  
**Commit:** `5c586f8` — feat(uw): add W-9 field model and prefill helpers  
**Date:** 2026-08-07

---

## Summary

Implemented pure JS W-9 field model, validation, ownership→tax-class mapping, and legal-entity prefill helpers per the task brief. Followed TDD: failing tests first (RED), implementation (GREEN), commit on feature branch. No deviations from brief interfaces; 14 tests all pass.

---

## Files Created

| File | Purpose |
|---|---|
| `src/lib/w9Model.js` | `emptyW9Fields`, `validateW9Fields`, `mapOwnershipToW9TaxClass`, `extractEinDigits` |
| `src/lib/w9Model.test.js` | Model + validation + mapping tests (10 cases) |
| `src/lib/w9Prefill.js` | `buildW9Prefill` from legal entity + optional control person / location fallback |
| `src/lib/w9Prefill.test.js` | Prefill tests (4 cases) |

---

## Interfaces (as shipped)

```js
emptyW9Fields() → {
  name, businessName, taxClassification, llcTaxClass, otherClassification,
  exemptPayeeCode, fatcaCode, address, city, state, zip,
  tinType: 'ein'|'ssn', tin, signatureName, signedAt
}

validateW9Fields(fields) → { ok: boolean, errors: string[] }
// Requires: name, address, city, state, zip, taxClassification, TIN (9 digits)

mapOwnershipToW9TaxClass(ownershipType, taxClassType) → { taxClassification, llcTaxClass? }

buildW9Prefill({ legalEntity, controlPerson?, locationFallback? }) → W-9 fields
// TIN from federalEIN digits only; never invented
```

---

## TDD Evidence

### RED — tests before implementation

**Command:**
```bash
node --test src/lib/w9Model.test.js src/lib/w9Prefill.test.js
```

**Output (excerpt):**
```
Error [ERR_MODULE_NOT_FOUND]: Cannot find module '...\src\lib\w9Model.js'
Error [ERR_MODULE_NOT_FOUND]: Cannot find module '...\src\lib\w9Prefill.js'
ℹ tests 2
ℹ pass 0
ℹ fail 2
```

Expected failure: implementation modules did not exist yet.

### GREEN — after implementation

**Command:**
```bash
node --test src/lib/w9Model.test.js src/lib/w9Prefill.test.js
```

**Output:**
```
▶ emptyW9Fields
  ✔ returns all W-9 keys with empty defaults and ein tinType
▶ mapOwnershipToW9TaxClass
  ✔ maps LIMITED_COMPANY + LLC_CORPORATION to llc with C class
  ✔ maps SOLE_PROPRIETORSHIP to individual
  ✔ maps CORPORATION to c_corp
  ✔ maps SUB_S_CORP to s_corp
▶ validateW9Fields
  ✔ passes when required fields including 9-digit EIN are present
  ✔ fails when TIN is missing
  ✔ fails when TIN is not 9 digits
  ✔ fails when name is missing
  ✔ fails when taxClassification is missing
▶ buildW9Prefill
  ✔ prefers entity mailing address over location fallback
  ✔ uses location fallback when entity has no mailing address
  ✔ extracts TIN digits from federalEIN only and never invents
  ✔ uses control person name for sole proprietorship
ℹ tests 14
ℹ pass 14
ℹ fail 0
```

All tests PASS.

---

## Self-Review

### Correctness

- **Tax-class mapping:** Brief cases covered. Also maps `SOLE_PROPRIETOR` (portal enum) to `individual`; LLC disregarded/partnership → `D`/`P`; partnerships, non-profit, trust for future Deal Room entities.
- **Validation:** Required fields per brief; TIN normalized to 9 digits via digit strip.
- **Prefill:** Mailing address wins when all four parts present; otherwise store fallback. TIN never invented. Sole prop uses control person full name for `name`, business DBA for `businessName`.

### Conventions

- Matches existing lib test pattern (`node:test`, `node:assert/strict`, ESM).
- Pure functions, no React, no Base44 — scoped correctly for Task 1.

### Minor notes (not blockers)

1. Brief test uses `LLC_CORPORATION` (portal value) not literal string `Corporation` — correct for codebase enums.
2. `tinType` always `ein` in prefill v1; sole-prop SSN from signer KYC deferred to later tasks (spec allows merchant fill).
3. `extractEinDigits` exported for reuse in Task 4 server inline copy.
4. No `package.json` test script — brief did not request; run via `node --test src/lib/w9Model.test.js src/lib/w9Prefill.test.js`.

### Scope compliance

- Only the four specified files created and committed.
- No unrelated changes committed.
- Did not push; did not start Tasks 2+.

---

## Concerns

None blocking. Sole-prop SSN prefill from control person KYC is intentionally out of scope for Task 1 (EIN-only per brief constraint).

---

## Next Steps (out of scope for Task 1)

- Task 2: Pin IRS PDF + `fillW9Pdf`
- Task 4: Inline `buildW9Prefill` / `validateW9Fields` into `manageUnderwritingRequest`
- Task 7: Deal Room prefill preview via client `buildW9Prefill`

---

## Review Fix — DISREGARDED_ENTITY mapping (2026-08-07)

**Commit:** `1d75a6e` — fix(uw): map DISREGARDED_ENTITY to W-9 LLC class D

**Change:** `mapLlcTaxClass` now treats schema/import value `DISREGARDED_ENTITY` the same as portal `LLC` → W-9 `llcTaxClass: 'D'`. Added unit test for `LIMITED_COMPANY` + `DISREGARDED_ENTITY`.

**Command:**
```bash
node --test src/lib/w9Model.test.js src/lib/w9Prefill.test.js
```

**Output summary:** 15 tests, 15 pass, 0 fail (includes new `DISREGARDED_ENTITY` → D case).

