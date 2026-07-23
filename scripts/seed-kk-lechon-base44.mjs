/**
 * One-off seed: KK House of Lechon → Base44 using HubSpot deal 337553030880
 * and MSPWare form dump docs/exports/kk-lechon-226-form.json
 *
 * Run (after `npx base44 login`):
 *   Get-Content scripts/seed-kk-lechon-base44.mjs | npx base44 exec
 *
 * Does NOT set mspApplicationNo (signing creates new CD draft from template 133).
 * Does NOT mutate MSPWare app 226.
 */
import { readFileSync } from 'node:fs';
import { mapMspFormToPortal } from '../src/lib/mspDraftImportMapper.js';

const CORPORATE_ID = '337553030880';
const SOURCE_APP_NO = '226';
const PARENT_COMPANY = 'KK House of Lechon LLC';
const CONTACT_EMAIL = 'katesddlr@yahoo.com';

function generateToken() {
  const arr = new Uint8Array(24);
  crypto.getRandomValues(arr);
  return Array.from(arr)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

const raw = JSON.parse(readFileSync('docs/exports/kk-lechon-226-form.json', 'utf8'));
const form = raw.form || raw;
const mapped = mapMspFormToPortal(form, {
  controlPersonEmail: CONTACT_EMAIL,
  controlPersonFirstName: 'Kathleen',
});
mapped.preview.sourceAppNo = SOURCE_APP_NO;

const existing = await base44.asServiceRole.entities.MerchantCorporateProfile.filter(
  { corporateId: CORPORATE_ID },
  '-created_date',
  1
);
if (existing?.length) {
  console.log(
    JSON.stringify(
      {
        success: false,
        error: 'Profile already exists for this deal',
        corporateId: CORPORATE_ID,
        profileId: existing[0].id,
      },
      null,
      2
    )
  );
} else {
  // Prefer HubSpot company id from deal associations if SDK allows; else empty and create account by name.
  let hubspotCompanyId = '';
  try {
    const profilesByName = await base44.asServiceRole.entities.MerchantAccount.filter(
      {},
      '-created_date',
      50
    );
    const match = (profilesByName || []).find(
      (a) => String(a.name || '').toLowerCase() === PARENT_COMPANY.toLowerCase()
    );
    if (match) hubspotCompanyId = String(match.hubspotCompanyId || '');
  } catch {
    /* ignore */
  }

  let account = null;
  if (hubspotCompanyId) {
    const byHs = await base44.asServiceRole.entities.MerchantAccount.filter(
      { hubspotCompanyId },
      '-created_date',
      1
    );
    account = byHs?.[0] || null;
  }
  if (!account) {
    account = await base44.asServiceRole.entities.MerchantAccount.create({
      hubspotCompanyId: hubspotCompanyId || `deal-${CORPORATE_ID}`,
      name: PARENT_COMPANY,
      domain: CONTACT_EMAIL.split('@')[1] || '',
      legalEntities: [],
    });
  }

  const entityId = crypto.randomUUID();
  const legalEntities = [{ entityId, ...mapped.legalEntity }];

  const profile = await base44.asServiceRole.entities.MerchantCorporateProfile.create({
    corporateId: CORPORATE_ID,
    merchantAccountId: account.id,
    hubspotCompanyId: account.hubspotCompanyId || hubspotCompanyId || null,
    ...mapped.profile,
    legalEntities,
  });

  await base44.asServiceRole.entities.MerchantAccount.update(account.id, {
    legalEntities,
  }).catch(() => null);

  const location = await base44.asServiceRole.entities.MerchantLocations.create({
    corporateId: CORPORATE_ID,
    entityId,
    dbaName: mapped.location.dbaName,
    businessStreet: mapped.location.businessStreet,
    businessCity: mapped.location.businessCity,
    businessState: mapped.location.businessState,
    businessZip: mapped.location.businessZip,
    businessAddress: mapped.location.businessAddress,
    ...(mapped.location.bankDetails ? { bankDetails: mapped.location.bankDetails } : {}),
    applicationStepStatus: 'In Review',
  });

  const { mspApplicationNo: _drop, ...midFields } = mapped.mid;
  const mid = await base44.asServiceRole.entities.MerchantMID.create({
    corporateId: CORPORATE_ID,
    locationId: location.id,
    ...midFields,
    isExistingAccount: false,
    applicationStepStatus: 'In Review',
  });

  if (mid?.mspApplicationNo) {
    await base44.asServiceRole.entities.MerchantMID.update(mid.id, { mspApplicationNo: null });
    mid.mspApplicationNo = null;
  }

  const signerIds = [];
  for (const s of mapped.signers) {
    const signer = await base44.asServiceRole.entities.MerchantSigners.create({
      corporateId: CORPORATE_ID,
      merchantAccountId: account.id,
      firstName: s.firstName,
      lastName: s.lastName,
      signerEmail: s.signerEmail,
      ownershipPercentage: s.ownershipPercentage,
      titleType: s.titleType,
      dobYear: s.dobYear,
      dobMonth: s.dobMonth,
      dobDay: s.dobDay,
      homeStreet: s.homeStreet,
      homeCity: s.homeCity,
      homeState: s.homeState,
      homeZip: s.homeZip,
      isAuthorizedSigner: s.isAuthorizedSigner,
      isPrimarySigner: s.isPrimarySigner,
      identityStatus: s.identityStatus || 'Pending Invitation',
      verifyToken: generateToken(),
    });
    if (signer?.id) signerIds.push(String(signer.id));
  }

  const stage = await base44.asServiceRole.entities.StagedApplication.create({
    corporateId: CORPORATE_ID,
    status: 'draft',
    label: mapped.location.dbaName,
    includedLocationIds: [location.id],
    includedMidIds: [mid.id],
    includedSignerIds: signerIds,
    prefilledData: {
      source: 'msp_oneoff_226',
      sourceAppNo: SOURCE_APP_NO,
      merchantName: mapped.location.dbaName,
      parentCompanyName: PARENT_COMPANY,
      hubspotCompanyId: account.hubspotCompanyId,
      merchantAccountId: account.id,
      hubspotDealId: CORPORATE_ID,
    },
    accessToken: generateToken(),
    sentToEmail: mapped.profile.signerEmail || CONTACT_EMAIL,
  });

  console.log(
    JSON.stringify(
      {
        success: true,
        corporateId: CORPORATE_ID,
        sourceAppNo: SOURCE_APP_NO,
        profileId: profile.id,
        merchantAccountId: account.id,
        locationId: location.id,
        midId: mid.id,
        midHasMspApplicationNo: Boolean(mid.mspApplicationNo),
        signerIds,
        stageId: stage.id,
        gaps: mapped.gaps,
        preview: mapped.preview,
      },
      null,
      2
    )
  );
}
