# KK Lechon MSP One-Off Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One-off admin import that reads MSPWare app **78291** (read-only), creates a HubSpot onboarding deal on existing KK House of Lechon LLC + Kate D, seeds Base44 portal records with Cash Discount pricing, and leaves `mspApplicationNo` empty so signing creates a **new** template **#133** draft.

**Architecture:** Pure mapper (`src/lib/mspDraftImportMapper.js`) converts MSPWare form JSON → Base44-shaped payloads (unit-tested). Admin Deno function `importMspDraftOneOff` fetches MSPWare, runs the mapper (inlined copy kept in sync), optionally creates HubSpot deal + Base44 entities. Dry-run by default.

**Tech Stack:** Base44 Deno functions, HubSpot CRM v3, MSPWare PulsePoint API v2, Node `node:test` for mapper unit tests.

**Spec:** `docs/superpowers/specs/2026-07-23-kk-lechon-msp-oneoff-import-design.md`

## Global Constraints

- Source app **78291** is read-only — never PUT `/form`, never POST `/signatures` against it.
- Never set `MerchantMID.mspApplicationNo` to `78291`.
- Pricing is always `SELF_SERVE_CASH_DISCOUNT` (ignore Levi’s pricing method on 78291).
- Admin workspace session only — reject unauthenticated and merchant JWTs.
- Reuse HubSpot company **KK House of Lechon LLC** and contact **Kate D** when found; create deal only.
- One-off — no Applications UI, no permanent product surface.
- Do not commit unless Teddy explicitly asks (plan lists commit steps for when he does).

---

## File structure

| File | Responsibility |
|---|---|
| `src/lib/mspDraftImportMapper.js` | Pure map: MSP form → profile / legalEntity / location / mid / signers / gaps / preview |
| `src/lib/mspDraftImportMapper.test.js` | Unit tests for mapper |
| `base44/functions/importMspDraftOneOff/entry.ts` | Admin HTTP handler: fetch MSP, dryRun preview, live HubSpot + Base44 writes |
| `docs/superpowers/specs/2026-07-23-kk-lechon-msp-oneoff-import-design.md` | Already approved (reference only) |
| `AI_CHANNEL.md` | Append when live import succeeds |

---

### Task 1: Pure MSP → portal mapper + unit tests

**Files:**
- Create: `src/lib/mspDraftImportMapper.js`
- Create: `src/lib/mspDraftImportMapper.test.js`

**Interfaces:**
- Produces:
  - `mapMspFormToPortal(form: object, opts?: { controlPersonEmail?: string, controlPersonFirstName?: string }): MappedImport`
  - `MappedImport` shape:
    ```js
    {
      profile: {
        legalName, taxId, ownershipType, taxClassType, establishmentYear,
        productDescription, firstName, lastName, signerEmail, corporatePhone,
        pricingTier: 'SELF_SERVE_CASH_DISCOUNT',
        applicationStatus: 'Incomplete',
        portalLockStatus: 'unlocked',
      },
      legalEntity: {
        legalBusinessName, federalEIN, ownershipType, taxClassType,
        establishmentYear, mailingStreet, mailingCity, mailingState, mailingZip,
        legalAddressSameAsStore: boolean,
      },
      location: {
        dbaName, businessStreet, businessCity, businessState, businessZip,
        businessAddress, bankDetails: null | {
          routingNumber, accountNumber, accountType, authMethod: 'manual',
          accountNumberMasked,
        },
      },
      mid: {
        merchantName, dbaName, mccCode, industryType, pricingCategory,
        pricingMethod: 'TIERD', // CD boarding method; mapper forces this
        monthlyCardSales, avgSaleAmount, highestTicketAmount,
        cardPresentPct, internetPct, motoPct, businessWebsite,
        // mspApplicationNo intentionally omitted / null
        applicationStepStatus: 'In Review',
        isExistingAccount: false,
      },
      signers: Array<{
        firstName, lastName, signerEmail, ownershipPercentage,
        titleType, dobYear, dobMonth, dobDay,
        homeStreet, homeCity, homeState, homeZip,
        ssnLast4?: string, // full SSN only if present on form — store as taxId/ssn field used by manageSigner if schema has it
        isAuthorizedSigner: boolean,
        isPrimarySigner: boolean,
        identityStatus: 'Pending Invitation' | string,
      }>,
      gaps: string[], // human checklist for Kate
      preview: { sourceAppNo, legalName, dba, tinLast4, mcc, ownerNames, hasBank, percentHints },
    }
    ```

- [ ] **Step 1: Write the failing test file**

```js
/**
 * Run: node --test src/lib/mspDraftImportMapper.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mapMspFormToPortal } from './mspDraftImportMapper.js';

const SAMPLE_FORM = {
  legal_dba_name: 'KK House of Lechon LLC',
  full_dba_name: 'KK House of Lechon and BBQ',
  tin: '123456789',
  ownership_type: 'LL',
  llc_class: 'C',
  year_business_established: '2019',
  products_or_services: 'Filipino BBQ and lechon',
  business_address: '100 Main St',
  business_city: 'San Diego',
  business_state_usa: 'CA',
  business_zipcode: '92101',
  business_phone: '6195550100',
  business_email: 'kate@example.com',
  mcc: '5812',
  industry_type: 'RS',
  pricing_category: '7',
  monthly_sales: '50000',
  average_sales: '45',
  highest_ticket: '200',
  cp_percent: '80',
  int_percent: '10',
  cnp_percent: '10',
  business_homepage_url: 'https://kklechon.example',
  deposit_account_rtg: '122000247',
  deposit_account_no: '9876543210',
  deposit_account_type: 'CK',
  owners: [
    {
      owner_firstname: 'Kate',
      owner_lastname: 'D',
      owner_email: 'kate@example.com',
      owner_ownership: '100',
      owner_title: 'MM',
      owner_dob: '1985-04-12',
      owner_address: '200 Home Ave',
      owner_city: 'San Diego',
      owner_state_usa: 'CA',
      owner_zipcode: '92102',
      principal_sign_agreement: true,
    },
  ],
};

describe('mapMspFormToPortal', () => {
  it('forces Cash Discount pricing and omits mspApplicationNo', () => {
    const m = mapMspFormToPortal(SAMPLE_FORM);
    assert.equal(m.profile.pricingTier, 'SELF_SERVE_CASH_DISCOUNT');
    assert.equal(m.mid.pricingMethod, 'TIERD');
    assert.equal(m.mid.mspApplicationNo, undefined);
    assert.equal(m.mid.isExistingAccount, false);
  });

  it('maps Omni split: int→internetPct, cnp→motoPct', () => {
    const m = mapMspFormToPortal(SAMPLE_FORM);
    assert.equal(m.mid.cardPresentPct, 80);
    assert.equal(m.mid.internetPct, 10);
    assert.equal(m.mid.motoPct, 10);
  });

  it('maps ownership LL + llc_class C → LIMITED_COMPANY + LLC_CORPORATION', () => {
    const m = mapMspFormToPortal(SAMPLE_FORM);
    assert.equal(m.profile.ownershipType, 'LIMITED_COMPANY');
    assert.equal(m.profile.taxClassType, 'LLC_CORPORATION');
    assert.equal(m.legalEntity.federalEIN, '123456789');
  });

  it('marks Kate as Control Person when first name matches', () => {
    const m = mapMspFormToPortal(SAMPLE_FORM, { controlPersonFirstName: 'Kate' });
    assert.equal(m.signers[0].isAuthorizedSigner, true);
    assert.equal(m.signers[0].isPrimarySigner, true);
  });

  it('masks TIN in preview and lists bank when present', () => {
    const m = mapMspFormToPortal(SAMPLE_FORM);
    assert.equal(m.preview.tinLast4, '6789');
    assert.equal(m.preview.hasBank, true);
    assert.equal(m.location.bankDetails.routingNumber, '122000247');
    assert.equal(m.location.bankDetails.accountType, 'checking');
  });

  it('never treats 5999 as a valid default MCC when form mcc empty', () => {
    const m = mapMspFormToPortal({ ...SAMPLE_FORM, mcc: '' });
    assert.equal(m.mid.mccCode, '');
    assert.ok(m.gaps.some((g) => /mcc/i.test(g)));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:msp-import` (add script in this task) or `node --test src/lib/mspDraftImportMapper.test.js`  
Expected: FAIL — `Cannot find module './mspDraftImportMapper.js'`

- [ ] **Step 3: Implement mapper**

Create `src/lib/mspDraftImportMapper.js` with (complete implementation):

```js
/** Pure MSPWare form → Base44 portal payloads for one-off import. */

const OWNERSHIP_FROM_MSP = {
  SP: 'SOLE_PROPRIETOR',
  LL: 'LIMITED_COMPANY',
  CO: 'CORPORATION',
  SS: 'SUB_S_CORP',
  PA: 'GENERAL_PARTNERSHIP',
  NP: 'NON_PROFIT',
  T: 'TRUST',
};

const LLC_CLASS_FROM_MSP = {
  D: 'DISREGARDED_ENTITY',
  P: 'LLC_PARTNERSHIP',
  C: 'LLC_CORPORATION',
};

const TITLE_FROM_MSP = {
  OP: 'PROPRIETOR_OR_OWNER',
  PP: 'PARTNER_OR_PRINCIPAL',
  GM: 'GENERAL_MANAGER',
  CEO: 'CHIEF_EXECUTIVE_OFFICER',
  CFO: 'CHIEF_FINANCIAL_OFFICER',
  COO: 'CHIEF_EXECUTIVE_OFFICER',
  P: 'PRESIDENT',
  VP: 'VICE_PRESIDENT',
  MM: 'MANAGING_MEMBER',
  D: 'DIRECTOR',
  O: 'AUTHORIZED_SIGNER',
  T: 'TREASURER',
  S: 'SECRETARY',
};

function cleanDigits(s) {
  return String(s || '').replace(/\D/g, '');
}

function parseDob(dobString) {
  const parts = String(dobString || '').split('-');
  return { dobYear: parts[0] || '', dobMonth: parts[1] || '', dobDay: parts[2] || '' };
}

function mapAccountType(code) {
  if (code === 'SA') return 'savings';
  return 'checking'; // CK or unknown
}

/**
 * @param {Record<string, any>} form — MSPWare GET /form `form` object
 * @param {{ controlPersonEmail?: string, controlPersonFirstName?: string }} [opts]
 */
export function mapMspFormToPortal(form, opts = {}) {
  const f = form || {};
  const tin = cleanDigits(f.tin || f.ssn || '');
  const ownershipType = OWNERSHIP_FROM_MSP[f.ownership_type] || 'CORPORATION';
  const taxClassType =
    f.ownership_type === 'LL' ? LLC_CLASS_FROM_MSP[f.llc_class] || null : null;

  const street = String(f.business_address || '').trim();
  const city = String(f.business_city || '').trim();
  const state = String(f.business_state_usa || '').trim();
  const zip = String(f.business_zipcode || '').trim();
  const dba = String(f.full_dba_name || '').trim();
  const legalName = String(f.legal_dba_name || dba).trim();

  const routing = cleanDigits(f.deposit_account_rtg || '');
  const account = cleanDigits(f.deposit_account_no || '');
  const hasBank = Boolean(routing && account);

  const mccCode = String(f.mcc || '').trim();
  // Never invent 5999
  const gaps = [];
  if (!mccCode) gaps.push('MCC is missing — agent must set a real MCC before signing');
  if (mccCode === '5999') gaps.push('MCC 5999 is invalid — replace with a real category');
  if (!hasBank) gaps.push('Banking not on MSP form — connect bank in portal Banking step');
  if (!tin) gaps.push('TIN/EIN missing on MSP form');

  const cp = parseInt(String(f.cp_percent ?? '100'), 10) || 0;
  const internetPct = parseInt(String(f.int_percent ?? '0'), 10) || 0;
  const motoPct = parseInt(String(f.cnp_percent ?? '0'), 10) || 0; // Lesson #18 reverse

  const website = String(
    f.business_homepage_url || f.website || f.business_website || ''
  ).trim();
  if (internetPct > 0 && !website) {
    gaps.push('Online volume > 0% but no website — add businessWebsite on the MID');
  }

  const owners = Array.isArray(f.owners) ? f.owners : [];
  const cpEmail = String(opts.controlPersonEmail || '').trim().toLowerCase();
  const cpFirst = String(opts.controlPersonFirstName || 'Kate').trim().toLowerCase();

  const signers = owners.map((o, idx) => {
    const firstName = String(o.owner_firstname || '').trim();
    const lastName = String(o.owner_lastname || '').trim();
    const email = String(o.owner_email || f.business_email || '').trim().toLowerCase();
    const emailMatch = cpEmail && email === cpEmail;
    const nameMatch = firstName.toLowerCase() === cpFirst;
    const isControl =
      emailMatch || nameMatch || (owners.length === 1 && idx === 0);
    const dob = parseDob(o.owner_dob);
    if (!o.owner_dob) gaps.push(`Signer ${firstName} ${lastName}: DOB missing`);
    if (!email) gaps.push(`Signer ${firstName} ${lastName}: email missing`);

    return {
      firstName,
      lastName,
      signerEmail: email,
      ownershipPercentage: parseFloat(String(o.owner_ownership || '0')) || 0,
      titleType: TITLE_FROM_MSP[o.owner_title] || 'MANAGING_MEMBER',
      ...dob,
      homeStreet: String(o.owner_address || '').trim(),
      homeCity: String(o.owner_city || '').trim(),
      homeState: String(o.owner_state_usa || '').trim(),
      homeZip: String(o.owner_zipcode || '').trim(),
      isAuthorizedSigner: Boolean(isControl),
      isPrimarySigner: Boolean(isControl),
      identityStatus: 'Pending Invitation',
    };
  });

  if (!signers.some((s) => s.isAuthorizedSigner) && signers.length) {
    signers[0].isAuthorizedSigner = true;
    signers[0].isPrimarySigner = true;
  }
  if (!signers.length) gaps.push('No owners on MSP form — add Control Person in People step');

  const primary = signers.find((s) => s.isAuthorizedSigner) || signers[0] || {};

  const bankDetails = hasBank
    ? {
        routingNumber: routing,
        accountNumber: account,
        accountType: mapAccountType(f.deposit_account_type),
        authMethod: 'manual',
        accountNumberMasked: account.length > 4 ? `****${account.slice(-4)}` : '****',
      }
    : null;

  return {
    profile: {
      legalName,
      taxId: tin || null,
      ownershipType,
      ...(taxClassType ? { taxClassType } : {}),
      establishmentYear: String(f.year_business_established || ''),
      productDescription: String(f.products_or_services || ''),
      firstName: primary.firstName || '',
      lastName: primary.lastName || '',
      signerEmail: primary.signerEmail || String(f.business_email || '').toLowerCase(),
      corporatePhone: cleanDigits(f.business_phone || ''),
      pricingTier: 'SELF_SERVE_CASH_DISCOUNT',
      applicationStatus: 'Incomplete',
      portalLockStatus: 'unlocked',
    },
    legalEntity: {
      legalBusinessName: legalName,
      federalEIN: tin || '',
      ownershipType,
      ...(taxClassType ? { taxClassType } : {}),
      establishmentYear: String(f.year_business_established || ''),
      mailingStreet: '',
      mailingCity: '',
      mailingState: '',
      mailingZip: '',
      legalAddressSameAsStore: true,
    },
    location: {
      dbaName: dba || legalName,
      businessStreet: street,
      businessCity: city,
      businessState: state,
      businessZip: zip,
      businessAddress: [street, city, state, zip].filter(Boolean).join(', '),
      bankDetails,
    },
    mid: {
      merchantName: dba || legalName,
      dbaName: dba || legalName,
      mccCode: mccCode === '5999' ? '' : mccCode,
      industryType: String(f.industry_type || 'RE'),
      pricingCategory: String(f.pricing_category || '1'),
      pricingMethod: 'TIERD',
      monthlyCardSales: f.monthly_sales != null ? parseFloat(f.monthly_sales) : null,
      avgSaleAmount: f.average_sales != null ? parseFloat(f.average_sales) : null,
      highestTicketAmount: f.highest_ticket != null ? parseFloat(f.highest_ticket) : null,
      cardPresentPct: cp,
      internetPct,
      motoPct,
      businessWebsite: website || undefined,
      applicationStepStatus: 'In Review',
      isExistingAccount: false,
    },
    signers,
    gaps: [...new Set(gaps)],
    preview: {
      sourceAppNo: '78291',
      legalName,
      dba: dba || legalName,
      tinLast4: tin ? tin.slice(-4) : null,
      mcc: mccCode || null,
      ownerNames: signers.map((s) => `${s.firstName} ${s.lastName}`.trim()),
      hasBank,
      cardSplit: { cardPresentPct: cp, internetPct, motoPct },
    },
  };
}
```

- [ ] **Step 4: Add npm script and run tests**

In `package.json` scripts add: `"test:msp-import": "node --test src/lib/mspDraftImportMapper.test.js"`

Run: `npm run test:msp-import`  
Expected: all tests PASS

- [ ] **Step 5: Commit (only if Teddy asked)**

```bash
git add src/lib/mspDraftImportMapper.js src/lib/mspDraftImportMapper.test.js package.json
git commit -m "$(cat <<'EOF'
feat: add MSP draft→portal mapper for KK Lechon one-off import

EOF
)"
```

---

### Task 2: Admin function — dry-run (fetch + map only)

**Files:**
- Create: `base44/functions/importMspDraftOneOff/entry.ts`

**Interfaces:**
- Consumes: `mapMspFormToPortal` (inline a verbatim copy of the mapper between sync markers; Base44 cannot import from `src/`)
- Produces: HTTP JSON `{ success, dryRun: true, mapped, appMeta, gaps }`

- [ ] **Step 1: Scaffold `entry.ts` with admin gate + dry-run path**

Hardcoded defaults (overridable by body):

```ts
const DEFAULT_SOURCE_APP_NO = '78291';
const DEFAULT_COMPANY_NAME = 'KK House of Lechon LLC';
const DEFAULT_CONTACT_FIRST = 'Kate';
```

Body: `{ dryRun?: boolean, sourceAppNo?: string, parentCompanyName?: string, contactEmail?: string, confirmLive?: boolean }`

Rules:
- `dryRun` defaults to **true**
- Live write requires `dryRun: false` **and** `confirmLive: true`
- Admin: `await base44.auth.me()` — 401 if null
- Reject merchant Bearer JWT the same way other admin debug functions do (if token verifies as merchant, 401)

Fetch (read-only):
1. `GET ${mspBase}/applications/${sourceAppNo}`
2. `GET ${mspBase}/applications/${sourceAppNo}/form`

Then:

```ts
const form = formData?.form || formData;
const mapped = mapMspFormToPortal(form, {
  controlPersonEmail: contactEmail,
  controlPersonFirstName: DEFAULT_CONTACT_FIRST,
});
return Response.json({
  success: true,
  dryRun: true,
  sourceAppNo,
  appMeta: {
    dba: appData?.dba || appData?.application?.dba,
    status: appData?.application_status || appData?.status,
    salesperson: appData?.salespersonid,
  },
  preview: mapped.preview,
  gaps: mapped.gaps,
  mapped, // full payloads for Teddy to eyeball (mask account number in response if desired)
});
```

Mask in HTTP response: if `mapped.location.bankDetails?.accountNumber`, replace with masked only in the JSON returned (keep full digits only for live write path in memory).

- [ ] **Step 2: Publish note for Teddy**

Document in function header comment:

```
// POST /functions/importMspDraftOneOff
// Body (safe): { "dryRun": true }
// Body (live): { "dryRun": false, "confirmLive": true, "contactEmail": "kate@..." }
// Admin session required. Never mutates MSPWare app 78291.
```

- [ ] **Step 3: Commit (only if Teddy asked)**

```bash
git add base44/functions/importMspDraftOneOff/entry.ts
git commit -m "$(cat <<'EOF'
feat: add importMspDraftOneOff dry-run for KK Lechon

EOF
)"
```

---

### Task 3: Live path — HubSpot deal on existing company/contact

**Files:**
- Modify: `base44/functions/importMspDraftOneOff/entry.ts`

**Interfaces:**
- Consumes: mapped profile email / company name
- Produces: `{ dealId, hubspotCompanyId, hubspotContactId }`

- [ ] **Step 1: Implement HubSpot helpers inside the function**

Follow patterns from `manageStagedApplication` `createLocalStage` + `createHubspotDeal`:

1. Search companies: `POST /crm/v3/objects/companies/search` filter `name EQ parentCompanyName` (default `KK House of Lechon LLC`). If missing → create company (fallback only).
2. Find contact:
   - Prefer `contactEmail` from body
   - Else use `mapped.profile.signerEmail`
   - Search contacts by email; if not found, search by firstname containing `Kate` + associated company (best-effort); if still missing, create contact from mapped signer (last resort)
3. Create deal:
   ```json
   {
     "properties": {
       "dealname": "<dba> — Onboarding",
       "dealstage": "appointmentscheduled",
       "pipeline": "default",
       "amount": "0",
       "processing_pricing_tier": "zero_cash_discount"
     }
   }
   ```
   If HubSpot rejects `processing_pricing_tier` option value, retry without it and set pricing only on Base44 profile (log warning).
4. Associate deal↔company (`deal_to_company`) and deal↔contact (`deal_to_contact`).
5. `corporateId = String(dealId)`.

- [ ] **Step 2: Guard**

If `MerchantCorporateProfile.filter({ corporateId })` already has a row → return **409** with existing id (do not double-import).

- [ ] **Step 3: Commit (only if Teddy asked)**

```bash
git add base44/functions/importMspDraftOneOff/entry.ts
git commit -m "$(cat <<'EOF'
feat: HubSpot deal creation in KK Lechon one-off import

EOF
)"
```

---

### Task 4: Live path — Base44 entities

**Files:**
- Modify: `base44/functions/importMspDraftOneOff/entry.ts`

**Interfaces:**
- Consumes: `corporateId`, `hubspotCompanyId`, `mapped`
- Produces: `{ profileId, locationId, midId, signerIds, merchantAccountId, stageId }`

- [ ] **Step 1: Create / link MerchantAccount**

```ts
let account = (await base44.asServiceRole.entities.MerchantAccount.filter({ hubspotCompanyId }, '-created_date', 1))?.[0];
if (!account) {
  account = await base44.asServiceRole.entities.MerchantAccount.create({
    hubspotCompanyId,
    name: parentCompanyName,
    legalEntities: [],
  });
}
```

- [ ] **Step 2: Create profile + legal entity**

```ts
const entityId = crypto.randomUUID();
const legalEntities = [{ entityId, ...mapped.legalEntity }];

const profile = await base44.asServiceRole.entities.MerchantCorporateProfile.create({
  corporateId,
  merchantAccountId: account.id,
  hubspotCompanyId,
  ...mapped.profile,
  legalEntities,
});

// Dual-write legalEntities onto account when possible
await base44.asServiceRole.entities.MerchantAccount.update(account.id, { legalEntities }).catch(() => null);
```

- [ ] **Step 3: Location + MID**

```ts
const location = await base44.asServiceRole.entities.MerchantLocations.create({
  corporateId,
  entityId,
  ...mapped.location,
  applicationStepStatus: 'In Review',
});

const mid = await base44.asServiceRole.entities.MerchantMID.create({
  corporateId,
  locationId: location.id,
  ...mapped.mid,
  // CRITICAL: do not spread mspApplicationNo; leave unset
});
```

Assert in code after create: if somehow `mid.mspApplicationNo` is set, clear it with an update.

- [ ] **Step 4: Signers + staged application**

For each mapped signer, create `MerchantSigners` with `corporateId`, `merchantAccountId`, `verifyToken` (32-byte hex like `generateToken` in manageStagedApplication).

Create `StagedApplication`:
```ts
{
  corporateId,
  status: 'draft',
  label: mapped.location.dbaName,
  includedLocationIds: [location.id],
  includedMidIds: [mid.id],
  includedSignerIds: signerIds,
  prefilledData: {
    source: 'msp_oneoff_78291',
    sourceAppNo: '78291',
    merchantName: mapped.location.dbaName,
  },
  accessToken: generateToken(),
  sentToEmail: mapped.profile.signerEmail,
}
```

- [ ] **Step 5: Live response**

```json
{
  "success": true,
  "dryRun": false,
  "corporateId": "<dealId>",
  "hubspotCompanyId": "...",
  "hubspotContactId": "...",
  "locationId": "...",
  "midId": "...",
  "signerIds": [],
  "gaps": [],
  "nextSteps": [
    "Publish/redeploy importMspDraftOneOff if not already",
    "Open Applications → impersonate portal for Kate",
    "Complete gaps, then Sign — new CD draft from template 133 will be created",
    "Leave MSPWare 78291 abandoned / do not board it"
  ]
}
```

- [ ] **Step 6: Commit (only if Teddy asked)**

```bash
git add base44/functions/importMspDraftOneOff/entry.ts
git commit -m "$(cat <<'EOF'
feat: Base44 seeding for KK Lechon one-off MSP import

EOF
)"
```

---

### Task 5: Execute dry-run → live (ops)

**Files:**
- Modify: `AI_CHANNEL.md` (append result after live success)

- [ ] **Step 1: Teddy pushes via GitHub Desktop + publishes `importMspDraftOneOff` in Base44**

- [ ] **Step 2: Dry-run from admin session**

```http
POST https://cliqbux-onboard-prime.base44.app/functions/importMspDraftOneOff
{ "dryRun": true }
```

Expected: `success: true`, `preview.sourceAppNo: "78291"`, DBA/legal match KK House, `gaps` listed, **no** Base44/HubSpot writes.

- [ ] **Step 3: Teddy confirms preview** (names, TIN last-4, MCC, owners, bank yes/no)

- [ ] **Step 4: Live run**

```http
POST .../importMspDraftOneOff
{
  "dryRun": false,
  "confirmLive": true,
  "contactEmail": "<kate's real HubSpot email>"
}
```

Expected: new HubSpot deal ID returned as `corporateId`; Application row appears; MID has **no** `mspApplicationNo`.

- [ ] **Step 5: Verify**

1. HubSpot: deal on KK House of Lechon LLC, associated to Kate, pricing Cash Discount if property stuck.
2. Base44 Applications: profile `pricingTier` = `SELF_SERVE_CASH_DISCOUNT`, Pricing 1/1.
3. Impersonate portal: locations/signers prefilled.
4. Confirm MSPWare **78291** unchanged (optional: `debugMSPFormRaw` with `{ "appNo": "78291" }` only — no `corporateId`/`confirmFill`).

- [ ] **Step 6: Append AI_CHANNEL success note** with `corporateId` and leftover `gaps`.

---

## Self-review (plan vs spec)

| Spec requirement | Task |
|---|---|
| Read-only 78291 | Task 2 fetch; Global Constraints |
| New HubSpot deal on existing company/contact | Task 3 |
| Cash Discount / SELF_SERVE_CASH_DISCOUNT | Task 1 mapper + Task 3 `zero_cash_discount` |
| Map form → profile/location/MID/signers/bank | Tasks 1 + 4 |
| Omni reverse map (int/cnp) | Task 1 tests + mapper |
| Never set mspApplicationNo to 78291 | Task 1 + Task 4 assert |
| New CD draft at signing via #133 | Implicit — empty mspApplicationNo + existing submitToMSP/signApplication |
| dryRun then live + confirmLive | Tasks 2–5 |
| Admin only / one-off | Task 2 gate |
| No permanent UI | No UI tasks |

**Placeholder scan:** none remaining.  
**Type consistency:** `mapMspFormToPortal` / `MappedImport` names consistent across tasks.

---

## Execution handoff

Plan complete and saved to `docs/superpowers/plans/2026-07-23-kk-lechon-msp-oneoff-import.md`.

**Two execution options:**

1. **Subagent-Driven (recommended)** — fresh subagent per task, review between tasks  
2. **Inline Execution** — run tasks in this session with checkpoints  

Which approach?
