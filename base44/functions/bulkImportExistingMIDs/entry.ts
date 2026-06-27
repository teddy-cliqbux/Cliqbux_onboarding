import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// ─── bulkImportExistingMIDs ──────────────────────────────────────────────────────
// Admin-only bulk import: iterates ALL MerchantCorporateProfile records in Base44
// and uses importExistingMIDs logic to match each to approved MSP PulsePoint apps.
//
// Query params:
//   ?dryRun=true     — reports matches, writes nothing
//   ?minElapsed=14   — only profiles updated more than N days ago (default 14, for re-tries)
//
// POST /functions/bulkImportExistingMIDs
// POST /functions/bulkImportExistingMIDs?dryRun=true

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const url = new URL(req.url);
    const body = req.method === 'POST'
      ? (await req.json().catch(() => ({}))) || {}
      : {};
    const dryRun = url.searchParams.get('dryRun') === 'true' || body?.dryRun === true;
    const minElapsedDays = Number(url.searchParams.get('minElapsed') ?? body?.minElapsed ?? 14);

    // Admin-only
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Unauthorized — admin role required' }, { status: 403 });
    }

    const mspBase = (Deno.env.get('MSP_BASE_URL') || 'https://api.msppulsepoint.com/v2').replace(/\/$/, '');
    const apiKey  = Deno.env.get('MSP_APP_KEY') || '';
    const appId   = Deno.env.get('MSP_APP_ID') || 'cliqbux';
    if (!apiKey) return Response.json({ error: 'MSP_APP_KEY env var not set' }, { status: 500 });

    const mspHeaders = { 'X-API-KEY': apiKey, 'X-App-ID': appId, 'Accept': 'application/json' };

    console.log(`[bulkImportExistingMIDs] Starting${dryRun ? ' DRY RUN' : ''} (minElapsed: ${minElapsedDays}d)`);

    // ── 1. Collect Base44 profiles with taxIds ────────────────────────────────
    const allProfiles = await base44.asServiceRole.entities.MerchantCorporateProfile.filter({});

    // Non-dry-run: skip recently-imported profiles (respect minElapsedDays)
    const profiles = dryRun
      ? allProfiles
      : allProfiles.filter((p) => {
          if (!p.taxId) return true;               // no TIN yet — never had a chance
          if (!p.updated_date) return true;
          const elapsed = (Date.now() - new Date(p.updated_date).getTime()) / 86_400_000;
          if (elapsed >= minElapsedDays) return true;       // stale enough to recheck
          // created recently (likely handled inline) — skip
          return false;
        });

    const tinToProfile = new Map();
    for (const p of profiles) {
      const raw = (p.taxId || '').replace(/\D/g, '');
      if (raw) {
        tinToProfile.set(raw, p);
      }
    }

    console.log(`[bulkImportExistingMIDs] ${allProfiles.length} profiles total, ${tinToProfile.size} have TINs, ${dryRun ? 'all checked' : `${profiles.length} eligible (elapsed >= ${minElapsedDays}d)`}`);

    // ── 2. Pull all Approved applications from MSPWare (once) ────────────────
    let allApps = [];
    let page = 1;
    while (true) {
      const listRes = await fetch(`${mspBase}/applications?page=${page}&limit=100`, { headers: mspHeaders });
      const listData = await listRes.json();
      const batch = listData?.applications || [];
      if (!batch.length) break;
      allApps = allApps.concat(batch);
      if (page >= (listData?.pages || 1)) break;
      page++;
    }

    const approvedApps = allApps.filter(a =>
      ['Approved', 'Complete'].includes(a.application_status) && a.mid
    );

    console.log(`[bulkImportExistingMIDs] ${allApps.length} MSP apps, ${approvedApps.length} approved with MID`);

    if (!approvedApps.length) {
      return Response.json({ success: true, mspwareAppsChecked: 0, message: 'No approved applications found in MSPWare portfolio' });
    }

    // ── 3. Check MSP-form TINs (bulk) and match to profiles ──────────────────
    // Build a map of appNo → form data only for the approved apps, so we can match.
    const formPromises = approvedApps.map(async (app) => {
      const appNo = app.merchantapplicationno;
      let appTIN = '';
      let form = null;
      try {
        const formRes = await fetch(`${mspBase}/applications/${appNo}/form`, { headers: mspHeaders });
        const formData = await formRes.json();
        form = formData?.form || {};
        appTIN = (form.tin || form.ssn || '').replace(/\D/g, '');
      } catch (_) {}
      return { appNo, dba: app.dba, mid: app.mid, app, appTIN, form };
    });

    const appForms = await Promise.all(formPromises);
    const matched: any[] = [];

    for (const af of appForms) {
      if (!af.appTIN || !af.form) continue;
      const profile = tinToProfile.get(af.appTIN);
      if (profile) {
        matched.push({
          ...af,
          corporateId: profile.corporateId,
          profile: { legalName: profile.legalName, taxId: `***${af.appTIN.slice(-4)}` },
        });
      }
    }

    console.log(`[bulkImportExistingMIDs] ${matched.length} application(s) matched ${tinToProfile.size} profiles by TIN`);

    // ── 4. Gather existing (already-imported) tracking per corporateId ────────
    const matchedCorporateIds = [...new Set(matched.map(m => m.corporateId))];
    const existingConcepts = await base44.asServiceRole.entities.MerchantProcessingConcept.filter({});
    const trackedPerCorporate = new Map();
    for (const corpId of matchedCorporateIds) {
      const tracked = existingConcepts.filter(c => c.corporateId === corpId);
      trackedPerCorporate.set(corpId, new Set(tracked.map(c => String(c.mspApplicationNo)).filter(Boolean)));
    }

    // ── 5. Gather existing locations per corporateId ─────────────────────────
    const allLocations = await base44.asServiceRole.entities.MerchantLocations.filter({});
    const locsPerCorporate = new Map();
    for (const corpId of matchedCorporateIds) {
      locsPerCorporate.set(corpId, allLocations.filter(l => l.corporateId === corpId));
    }

    // ── 6. Import ───────────────────────────────────────────────────────────
    const results = [];

    for (const m of matched) {
      const appNo = m.appNo;
      const corpId = m.corporateId;

      if (trackedPerCorporate.get(corpId)?.has(String(appNo))) {
        results.push({ appNo, dba: m.dba, corporateId: corpId, result: 'already_tracked' });
        continue;
      }

      const form = m.form;
      const appStreet = (form.business_address || '').trim().toLowerCase();
      const appZip = (form.business_zipcode || '').replace(/\D/g, '');

      if (dryRun) {
        results.push({
          appNo, dba: m.dba, mid: m.mid, corporateId: corpId,
          legalName: m.profile.legalName, taxId: m.profile.taxId,
          address: form.business_address,
          result: 'would_import',
          conceptData: {
            dbaName: form.full_dba_name || m.dba, mccCode: form.mcc,
            industryType: form.industry_type, pricingCategory: form.pricing_category,
            elavonMID: m.mid,
          },
        });
        continue;
      }

      // Real import — match or create location
      try {
        const existingLocs = locsPerCorporate.get(corpId) || [];
        let location = existingLocs.find(l => {
          const locStreet = (l.businessStreet || l.businessAddress || '').trim().toLowerCase();
          const locZip    = (l.businessZip || '').replace(/\D/g, '');
          return locStreet === appStreet && locZip === appZip;
        });

        if (!location) {
          location = await base44.asServiceRole.entities.MerchantLocations.create({
            corporateId: corpId,
            dbaName: form.full_dba_name || m.dba,
            businessStreet: form.business_address || '',
            businessCity: form.business_city || '',
            businessState: form.business_state_usa || '',
            businessZip: form.business_zipcode || '',
            businessAddress: [form.business_address, form.business_city, form.business_state_usa, form.business_zipcode].filter(Boolean).join(', '),
            applicationStepStatus: 'Active',
          });
          existingLocs.push(location);
        }

        await base44.asServiceRole.entities.MerchantProcessingConcept.create({
          locationId: location.id,
          corporateId: corpId,
          conceptName: m.dba,
          dbaName: form.full_dba_name || m.dba,
          mccCode: form.mcc || '',
          industryType: form.industry_type || 'RE',
          pricingCategory: form.pricing_category || '1',
          pricingMethod: form.pricing_method || 'ICPLS',
          monthlyCardSales: parseFloat(form.monthly_sales || '0') || null,
          avgSaleAmount: parseFloat(form.average_sales || '0') || null,
          highestTicketAmount: parseFloat(form.highest_ticket || '0') || null,
          cardPresentPct: parseFloat(form.cp_percent || '100') || 100,
          mspApplicationNo: String(appNo),
          elavonMID: String(m.mid || ''),
          isExistingAccount: true,
          existingAccountSource: 'mspware_import',
          applicationStepStatus: 'Active (Existing)',
        });

        results.push({ appNo, dba: m.dba, mid: m.mid, corporateId: corpId, locationId: location.id, result: 'imported' });
      } catch (err) {
        results.push({ appNo, dba: m.dba, corporateId: corpId, result: 'error', error: err.message });
      }
    }

    const imported = results.filter(r => r.result === 'imported').length;
    const alreadyTracked = results.filter(r => r.result === 'already_tracked').length;
    const wouldImport = results.filter(r => r.result === 'would_import').length;

    return Response.json({
      success: true,
      dryRun,
      mspwareAppsChecked: approvedApps.length,
      profilesWithTIN: tinToProfile.size,
      matchesByTIN: matched.length,
      imported: dryRun ? 0 : imported,
      alreadyTracked,
      wouldCreate: wouldImport,
      results,
    });

  } catch (error) {
    return Response.json({ error: error.message, stack: error.stack?.split('\n').slice(0, 3).join(' | ') }, { status: 500 });
  }
});