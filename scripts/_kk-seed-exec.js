const payload = JSON.parse(await Deno.readTextFile("scripts/_kk-seed-payload.json"));
const CORPORATE_ID = payload.corporateId;
const mapped = payload.mapped;
const PARENT_COMPANY = payload.parentCompanyName;
const CONTACT_EMAIL = payload.contactEmail;
const SOURCE_APP_NO = payload.sourceAppNo;

function generateToken() {
  const arr = new Uint8Array(24);
  crypto.getRandomValues(arr);
  return Array.from(arr).map((b) => b.toString(16).padStart(2, "0")).join("");
}

const existing = await base44.entities.MerchantCorporateProfile.filter(
  { corporateId: CORPORATE_ID },
  "-created_date",
  1,
);
if (existing?.length) {
  console.log(JSON.stringify({
    success: false,
    error: "Profile already exists",
    corporateId: CORPORATE_ID,
    profileId: existing[0].id,
  }, null, 2));
} else {
  // MerchantAccount may be unpublished in this app — seed profile without account parent.
  const entityId = crypto.randomUUID();
  const legalEntities = [{ entityId, ...mapped.legalEntity }];
  const profile = await base44.entities.MerchantCorporateProfile.create({
    corporateId: CORPORATE_ID,
    ...mapped.profile,
    legalEntities,
  });

  const location = await base44.entities.MerchantLocations.create({
    corporateId: CORPORATE_ID,
    entityId,
    dbaName: mapped.location.dbaName,
    businessStreet: mapped.location.businessStreet,
    businessCity: mapped.location.businessCity,
    businessState: mapped.location.businessState,
    businessZip: mapped.location.businessZip,
    businessAddress: mapped.location.businessAddress,
    ...(mapped.location.bankDetails ? { bankDetails: mapped.location.bankDetails } : {}),
    applicationStepStatus: "In Review",
  });

  const mid = await base44.entities.MerchantMID.create({
    corporateId: CORPORATE_ID,
    locationId: location.id,
    ...mapped.mid,
    isExistingAccount: false,
    applicationStepStatus: "In Review",
  });
  if (mid?.mspApplicationNo) {
    await base44.entities.MerchantMID.update(mid.id, { mspApplicationNo: null });
    mid.mspApplicationNo = null;
  }

  const signerIds = [];
  for (const s of mapped.signers) {
    const signer = await base44.entities.MerchantSigners.create({
      corporateId: CORPORATE_ID,
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
      identityStatus: s.identityStatus || "Pending Invitation",
      verifyToken: generateToken(),
    });
    if (signer?.id) signerIds.push(String(signer.id));
  }

  const stage = await base44.entities.StagedApplication.create({
    corporateId: CORPORATE_ID,
    status: "draft",
    label: mapped.location.dbaName,
    includedLocationIds: [location.id],
    includedMidIds: [mid.id],
    includedSignerIds: signerIds,
    prefilledData: {
      source: "msp_oneoff_226",
      sourceAppNo: SOURCE_APP_NO,
      merchantName: mapped.location.dbaName,
      parentCompanyName: PARENT_COMPANY,
      hubspotDealId: CORPORATE_ID,
    },
    accessToken: generateToken(),
    sentToEmail: mapped.profile.signerEmail || CONTACT_EMAIL,
  });

  console.log(JSON.stringify({
    success: true,
    corporateId: CORPORATE_ID,
    sourceAppNo: SOURCE_APP_NO,
    profileId: profile.id,
    locationId: location.id,
    midId: mid.id,
    midHasMspApplicationNo: Boolean(mid.mspApplicationNo),
    signerIds,
    stageId: stage.id,
    gaps: mapped.gaps,
    note: "Seeded without MerchantAccount (entity not published in app)",
  }, null, 2));
}
