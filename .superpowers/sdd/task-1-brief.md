### Task 1: W-9 domain model + prefill (TDD)

**Files:**
- Create: `src/lib/w9Model.js`
- Create: `src/lib/w9Model.test.js`
- Create: `src/lib/w9Prefill.js`
- Create: `src/lib/w9Prefill.test.js`

**Interfaces:**
- Produces:
  - `emptyW9Fields()` → `{ name, businessName, taxClassification, llcTaxClass, otherClassification, exemptPayeeCode, fatcaCode, address, city, state, zip, tinType: 'ein'|'ssn', tin, signatureName, signedAt }`
  - `validateW9Fields(fields)` → `{ ok: boolean, errors: string[] }` (require name, address, city, state, zip, tin 9 digits, taxClassification)
  - `mapOwnershipToW9TaxClass(ownershipType, taxClassType)` → `{ taxClassification, llcTaxClass? }`
  - `buildW9Prefill({ legalEntity, controlPerson?, locationFallback? })` → W-9 fields (TIN from `federalEIN` digits only; never invent)

- [ ] **Step 1: Write failing tests** for tax-class mapping (`LIMITED_COMPANY`+`Corporation` → LLC + C; `SOLE_PROPRIETORSHIP` → individual; `CORPORATION`/`SUB_S_CORP` → c_corp / s_corp), validation (missing TIN fails; 9-digit EIN passes), prefill (entity mailing address wins over store).

- [ ] **Step 2: Run tests — expect FAIL**

```bash
node --test src/lib/w9Model.test.js src/lib/w9Prefill.test.js
```

- [ ] **Step 3: Implement `w9Model.js` + `w9Prefill.js` until tests pass**

- [ ] **Step 4: Commit**

```bash
git add src/lib/w9Model.js src/lib/w9Model.test.js src/lib/w9Prefill.js src/lib/w9Prefill.test.js
git commit --trailer "Co-authored-by: Cursor <cursoragent@cursor.com>" -m "feat(uw): add W-9 field model and prefill helpers"
```
