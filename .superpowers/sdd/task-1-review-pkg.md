# Review package Task 1 (post-fix)
Base: ed8383ca307f8a241b9750ad3e5667e281df50fe
Head: 1d75a6e3b10954101f5cb81f4e12140a5399ab0b

## Commits
1d75a6e fix(uw): map DISREGARDED_ENTITY to W-9 LLC class D
5c586f8 feat(uw): add W-9 field model and prefill helpers


## Stat
 src/lib/w9Model.js        | 108 ++++++++++++++++++++++++++++++++++++++++++++++
 src/lib/w9Model.test.js   | 107 +++++++++++++++++++++++++++++++++++++++++++++
 src/lib/w9Prefill.js      |  75 ++++++++++++++++++++++++++++++++
 src/lib/w9Prefill.test.js |  95 ++++++++++++++++++++++++++++++++++++++++
 4 files changed, 385 insertions(+)


## Diff
```diff
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

```
