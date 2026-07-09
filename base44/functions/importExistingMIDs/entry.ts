import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// ─── importExistingMIDs ────────────────────────────────────────────────────────
// Queries MSPWare for all Approved applications in the Cliqbux portfolio,
// matches them against a merchant's TIN, and creates MerchantMID
// records (with isExistingAccount: true) for any that aren't already tracked.
//
// Also creates MerchantLocations records for addresses not yet in Base44.
//
// Call this when a merchant first logs into the portal (once per session is fine —
// the function is idempotent; it skips anything already imported).
//
// POST body: { corporateId: string }

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    // Admin-only: requires a Base44 workspace session. Merchant portal tokens
    // are deliberately NOT accepted here.
    let adminUser: any = null;
    try { adminUser = await base44.auth.me(); } catch { /* no session */ }
    if (!adminUser) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const { corporateId } = await req.json();

    if (!corporateId) return Response.json({ error: 'corporateId is required' }, { status: 400 });

    const mspBase = (Deno.env.get('MSP_BASE_URL') || 'https://api.msppulsepoint.com/v2').replace(/\/$/, '');
    const apiKey  = Deno.env.get('MSP_APP_KEY') || '';
    const appId   = Deno.env.get('MSP_APP_ID') || 'cliqbux';

    if (!apiKey) return Response.json({ error: 'MSP_APP_KEY env var not set' }, { status: 500 });

    const mspHeaders = {
      'X-API-KEY': apiKey,
      'X-App-ID':  appId,
      'Accept': 'application/json',
    };

    // ── 1. Get merchant's TIN from Base44 ────────────────────────────────────
    const profiles = await base44.asServiceRole.entities.MerchantCorporateProfile.filter({ corporateId });
    const profile = profiles?.[0];
    if (!profile) return Response.json({ error: 'Merchant profile not found' }, { status: 404 });

    const merchantTIN = (profile.taxId || '').replace(/\D/g, '');
    if (!merchantTIN) {
      return Response.json({ error: 'Merchant profile has no taxId — cannot match MSPWare applications' }, { status: 400 });
    }

    console.log(`[importExistingMIDs] Searching MSPWare for TIN ${merchantTIN} (corporateId: ${corporateId})`);

    // ── 2. Pull all Approved applications from MSPWare ───────────────────────
    // The /applications list endpoint has no TIN filter, so we pull all and
    // match by fetching form data. Portfolio is small (O(dozens) not O(thousands)).
    let allApps: any[] = [];
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

    // Filter to Approved only — no point importing New/Draft/Error
    const approvedApps = allApps.filter(a =>
      ['Approved', 'Complete'].includes(a.application_status) && a.mid
    );

    console.log(`[importExistingMIDs] ${allApps.length} total apps, ${approvedApps.length} approved with MID`);

    if (!approvedApps.length) {
      return Response.json({ success: true, message: 'No approved applications found in MSPWare portfolio', imported: 0 });
    }

    // ── 3. Already-tracked applications in Base44 ────────────────────────────
    const existingMerchantMIDs = await base44.asServiceRole.entities.MerchantMID.filter({ corporateId });
    const trackedAppNos = new Set(existingMerchantMIDs.map((c: any) => String(c.mspApplicationNo)).filter(Boolean));

    // ── 4. Match each approved app to this merchant by TIN ───────────────────
    const results: any[] = [];
    const toImport: any[] = [];

    await Promise.all(approvedApps.map(async (app) => {
      const appNo = app.merchantapplicationno;

      // Skip if already tracked
      if (trackedAppNos.has(String(appNo))) {
        results.push({ appNo, dba: app.dba, result: 'already_tracked' });
        return;
      }

      // Fetch form data to get TIN
      try {
        const formRes = await fetch(`${mspBase}/applications/${appNo}/form`, { headers: mspHeaders });
        const formData = await formRes.json();
        const appTIN = (formData?.form?.tin || formData?.form?.ssn || '').replace(/\D/g, '');

        if (appTIN !== merchantTIN) {
          // TIN doesn't match — not this merchant's application
          return;
        }

        toImport.push({ app, form: formData.form });
      } catch (err) {
        results.push({ appNo, dba: app.dba, result: 'error', error: err.message });
      }
    }));

    console.log(`[importExistingMIDs] ${toImport.length} application(s) matched TIN ${merchantTIN}`);

    // ── 5. Get existing locations for this corporateId ────────────────────────
    const existingLocations = await base44.asServiceRole.entities.MerchantLocations.filter({ corporateId });

    // ── 6. Import each matched application ───────────────────────────────────
    for (const { app, form } of toImport) {
      const appNo = app.merchantapplicationno;
      try {
        // Find or create matching MerchantLocations record by address
        const appStreet  = (form.business_address || '').trim().toLowerCase();
        const appZip     = (form.business_zipcode || '').replace(/\D/g, '');

        let location = existingLocations.find((l: any) => {
          const locStreet = (l.businessStreet || l.businessAddress || '').trim().toLowerCase();
          const locZip    = (l.businessZip || '').replace(/\D/g, '');
          return locStreet === appStreet && locZip === appZip;
        });

        if (!location) {
          // Create the location record from MSPWare form data
          location = await base44.asServiceRole.entities.MerchantLocations.create({
            corporateId,
            dbaName: form.full_dba_name || app.dba,
            businessStreet:  form.business_address || '',
            businessCity:    form.business_city || '',
            businessState:   form.business_state_usa || '',
            businessZip:     form.business_zipcode || '',
            businessAddress: [form.business_address, form.business_city, form.business_state_usa, form.business_zipcode].filter(Boolean).join(', '),
            applicationStepStatus: 'Active',
          });
          existingLocations.push(location);
          console.log(`[importExistingMIDs] Created location for "${app.dba}" (${form.business_address})`);
        }

        // Derive merchantMID fields from form data
        const mcc           = form.mcc || '';
        const industryType  = form.industry_type || 'RE';
        const pricingCat    = form.pricing_category || '1';
        const pricingMethod = form.pricing_method || 'ICPLS';

        // Create the MerchantMID record
        await base44.asServiceRole.entities.MerchantMID.create({
          locationId:          location.id,
          corporateId,
          merchantName:         app.dba,   // use DBA as merchantMID name; merchant can rename
          dbaName:             form.full_dba_name || app.dba,
          mccCode:             mcc,
          industryType,
          pricingCategory:     pricingCat,
          pricingMethod,
          monthlyCardSales:    parseFloat(form.monthly_sales || '0') || null,
          avgSaleAmount:       parseFloat(form.average_sales || '0') || null,
          highestTicketAmount: parseFloat(form.highest_ticket || '0') || null,
          cardPresentPct:      parseFloat(form.cp_percent || '100') || 100,
          mspApplicationNo:    String(appNo),
          elavonMID:           String(app.mid || ''),
          isExistingAccount:   true,
          existingAccountSource: 'mspware_import',
          applicationStepStatus: 'Active (Existing)',
        });

        results.push({ appNo, dba: app.dba, mid: app.mid, locationId: location.id, result: 'imported' });
        console.log(`[importExistingMIDs] Imported app ${appNo} "${app.dba}" MID ${app.mid}`);

      } catch (err) {
        console.error(`[importExistingMIDs] Failed to import app ${appNo}:`, err.message);
        results.push({ appNo, dba: app.dba, result: 'error', error: err.message });
      }
    }

    const imported = results.filter(r => r.result === 'imported').length;
    const alreadyTracked = results.filter(r => r.result === 'already_tracked').length;

    return Response.json({
      success: true,
      corporateId,
      merchantTIN: `***${merchantTIN.slice(-4)}`,   // masked for logs
      mspwareAppsChecked: approvedApps.length,
      tinMatches: toImport.length,
      imported,
      alreadyTracked,
      results,
    });

  } catch (error) {
    return Response.json({ error: error.message, stack: error.stack?.split('\n').slice(0, 3).join(' | ') }, { status: 500 });
  }
});
