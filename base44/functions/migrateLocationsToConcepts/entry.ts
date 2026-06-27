import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// ─── migrateLocationsToConcepts ───────────────────────────────────────────────
// One-time migration: reads existing MerchantLocations records that have
// mspApplicationNo or elavonMID and creates a MerchantProcessingConcept for each.
// Fetches real MCC/industry data from MSPWare form data rather than using defaults.
//
// Safe to re-run — idempotent (skips locations that already have a concept).
//
// Query params:
//   ?dryRun=true        — logs what would be created, writes nothing
//   ?corporateId=xxx    — limit to a single merchant for testing
//
// POST /functions/migrateLocationsToConcepts
// POST /functions/migrateLocationsToConcepts?dryRun=true
// POST /functions/migrateLocationsToConcepts?dryRun=true&corporateId=abc123

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const url = new URL(req.url);
    const dryRun = url.searchParams.get('dryRun') === 'true';
    const filterCorporateId = url.searchParams.get('corporateId') || null;

    // Admin-only — this is a destructive/structural operation
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Unauthorized — admin role required' }, { status: 403 });
    }

    const mspBase = (Deno.env.get('MSP_BASE_URL') || 'https://api.msppulsepoint.com/v2').replace(/\/$/, '');
    const apiKey  = Deno.env.get('MSP_APP_KEY') || '';
    const appId   = Deno.env.get('MSP_APP_ID') || 'cliqbux';

    if (!apiKey) return Response.json({ error: 'MSP_APP_KEY env var not set' }, { status: 500 });

    const mspHeaders = {
      'X-API-KEY': apiKey,
      'X-App-ID':  appId,
      'Accept': 'application/json',
    };

    console.log(`[migrateLocationsToConcepts] Starting${dryRun ? ' DRY RUN' : ''}${filterCorporateId ? ` for corporateId=${filterCorporateId}` : ''}`);

    // ── 1. Fetch legacy locations ────────────────────────────────────────────
    const filterArgs = filterCorporateId ? { corporateId: filterCorporateId } : {};
    const locations = await base44.asServiceRole.entities.MerchantLocations.filter(filterArgs);

    // Only migrate locations that have boarding data
    const eligible = (locations || []).filter((l: any) => l.mspApplicationNo || l.elavonMID);

    console.log(`[migrateLocationsToConcepts] ${locations?.length ?? 0} total locations, ${eligible.length} eligible (have mspApplicationNo or elavonMID)`);

    const results: any[] = [];
    let migratedCount = 0;
    let skippedCount = 0;

    for (const loc of eligible) {
      // ── 2. Idempotency check ───────────────────────────────────────────────
      const existing = await base44.asServiceRole.entities.MerchantProcessingConcept.filter({
        locationId: loc.id,
      });
      if (existing?.length) {
        skippedCount++;
        results.push({
          locationId: loc.id,
          dbaName: loc.dbaName,
          result: 'skipped',
          reason: `Already has ${existing.length} concept(s)`,
          existingConceptIds: existing.map((c: any) => c.id),
        });
        continue;
      }

      // ── 3. Pull real MCC / industry data from MSPWare ─────────────────────
      let mccCode         = '5999';   // misc retail fallback
      let industryType    = 'RE';     // Retail fallback
      let pricingCategory = '1';
      let pricingMethod   = 'ICPLS';
      let monthlyCardSales: number | null = null;
      let avgSaleAmount: number | null = null;
      let highestTicketAmount: number | null = null;
      let cardPresentPct  = 100;
      let processingStartDate: string | null = null;

      if (loc.mspApplicationNo) {
        try {
          const [formRes, appRes] = await Promise.all([
            fetch(`${mspBase}/applications/${loc.mspApplicationNo}/form`, { headers: mspHeaders }),
            fetch(`${mspBase}/applications/${loc.mspApplicationNo}`, { headers: mspHeaders }),
          ]);
          const formData = await formRes.json();
          const appData  = await appRes.json();

          const form = formData?.form || {};
          mccCode         = form.mcc           || mccCode;
          industryType    = form.industry_type  || industryType;
          pricingCategory = form.pricing_category || pricingCategory;
          pricingMethod   = form.pricing_method   || pricingMethod;
          monthlyCardSales    = form.monthly_sales   ? parseFloat(form.monthly_sales)   : null;
          avgSaleAmount       = form.average_sales   ? parseFloat(form.average_sales)   : null;
          highestTicketAmount = form.highest_ticket  ? parseFloat(form.highest_ticket)  : null;
          cardPresentPct      = form.cp_percent      ? parseFloat(form.cp_percent)      : 100;
          processingStartDate = appData?.created_on?.split(' ')?.[0] || null;
        } catch (err: any) {
          console.warn(`[migrateLocationsToConcepts] Could not fetch MSPWare data for app ${loc.mspApplicationNo}: ${err.message} — using fallback defaults`);
        }
      }

      // ── 4. Determine target status ─────────────────────────────────────────
      const applicationStepStatus = loc.elavonMID
        ? 'Active (Existing)'
        : (loc.mspApplicationNo ? 'Pending MID' : 'In Review');

      const conceptPayload = {
        locationId:           loc.id,
        corporateId:          loc.corporateId,
        conceptName:          loc.dbaName,
        dbaName:              loc.dbaName,
        mccCode,
        industryType,
        pricingCategory,
        pricingMethod,
        monthlyCardSales,
        avgSaleAmount,
        highestTicketAmount,
        cardPresentPct,
        mspApplicationNo:     loc.mspApplicationNo || null,
        elavonMID:            loc.elavonMID || null,
        isExistingAccount:    true,
        existingAccountSource: 'migration',
        applicationStepStatus,
        processingStartDate,
      };

      if (dryRun) {
        results.push({
          locationId: loc.id,
          dbaName: loc.dbaName,
          result: 'would_create',
          conceptPayload,
        });
      } else {
        try {
          const concept = await base44.asServiceRole.entities.MerchantProcessingConcept.create(conceptPayload);
          migratedCount++;
          results.push({
            locationId: loc.id,
            dbaName: loc.dbaName,
            mspApplicationNo: loc.mspApplicationNo,
            elavonMID: loc.elavonMID,
            conceptId: concept.id,
            applicationStepStatus,
            mccCode,
            industryType,
            result: 'migrated',
          });
          console.log(`[migrateLocationsToConcepts] Migrated "${loc.dbaName}" → concept ${concept.id} (${applicationStepStatus})`);
        } catch (err: any) {
          results.push({
            locationId: loc.id,
            dbaName: loc.dbaName,
            result: 'error',
            error: err.message,
          });
        }
      }
    }

    return Response.json({
      success: true,
      dryRun,
      filterCorporateId,
      totalLocations: locations?.length ?? 0,
      eligible: eligible.length,
      migrated:  dryRun ? 0 : migratedCount,
      skipped:   skippedCount,
      wouldCreate: dryRun ? results.filter(r => r.result === 'would_create').length : 0,
      results,
    });

  } catch (error: any) {
    return Response.json({
      error: error.message,
      stack: error.stack?.split('\n').slice(0, 3).join(' | '),
    }, { status: 500 });
  }
});
