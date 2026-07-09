import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// deleteMerchant — fully removes a merchant's records from OUR database (Base44
// entities only). Does NOT touch MSPWare/PulsePoint — any application drafted
// there stays as-is; this only cleans up our own test/dev clutter.
//
// Deletes, for a given corporateId, every record in:
//   MerchantCorporateProfile, MerchantMID, MerchantLocations, MerchantSigners,
//   StagedApplication (both admin-created stages and __auto_track__ records)
//
// Requires confirmDelete: true as a guard against accidental calls — corporateId
// alone is not enough. This is a permanent, irreversible action.
//
// POST /functions/deleteMerchant
// Body: { corporateId, confirmDelete: true }

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    // Admin-only: requires a Base44 workspace session. Merchant portal tokens
    // are deliberately NOT accepted here.
    let adminUser: any = null;
    try { adminUser = await base44.auth.me(); } catch { /* no session */ }
    if (!adminUser) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const body = await req.json();
    const { corporateId, confirmDelete } = body;

    if (!corporateId) {
      return Response.json({ error: 'corporateId is required' }, { status: 400 });
    }
    if (confirmDelete !== true) {
      return Response.json({ error: 'confirmDelete: true is required to perform this irreversible action' }, { status: 400 });
    }

    const deleted: Record<string, number> = {
      MerchantCorporateProfile: 0,
      MerchantMID: 0,
      MerchantLocations: 0,
      MerchantSigners: 0,
      StagedApplication: 0,
    };

    const [profiles, mids, locations, signers, stages] = await Promise.all([
      base44.asServiceRole.entities.MerchantCorporateProfile.filter({ corporateId }),
      base44.asServiceRole.entities.MerchantMID.filter({ corporateId }),
      base44.asServiceRole.entities.MerchantLocations.filter({ corporateId }),
      base44.asServiceRole.entities.MerchantSigners.filter({ corporateId }),
      base44.asServiceRole.entities.StagedApplication.filter({ corporateId }),
    ]);

    for (const p of profiles) {
      await base44.asServiceRole.entities.MerchantCorporateProfile.delete(p.id);
      deleted.MerchantCorporateProfile++;
    }
    for (const m of mids) {
      await base44.asServiceRole.entities.MerchantMID.delete(m.id);
      deleted.MerchantMID++;
    }
    for (const l of locations) {
      await base44.asServiceRole.entities.MerchantLocations.delete(l.id);
      deleted.MerchantLocations++;
    }
    for (const s of signers) {
      await base44.asServiceRole.entities.MerchantSigners.delete(s.id);
      deleted.MerchantSigners++;
    }
    for (const st of stages) {
      await base44.asServiceRole.entities.StagedApplication.delete(st.id);
      deleted.StagedApplication++;
    }

    return Response.json({ success: true, corporateId, deleted });
  } catch (error: any) {
    return Response.json({ error: error.message, stack: error.stack?.split('\n').slice(0, 5).join(' | ') }, { status: 500 });
  }
});
