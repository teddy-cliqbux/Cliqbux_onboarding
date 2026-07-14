import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// ─── migrateToMerchantMIDs ─────────────────────────────────────────────────────
// One-time migration, in two parts:
//
//   Part A — Legacy table copy: reads any records still sitting in the old
//   MerchantProcessingConcept collection (pre-rename) and copies them into the
//   new MerchantMID collection as-is (renaming conceptName -> merchantName).
//   This is what makes old data visible again after the entity rename.
//
//   Part B — Derive from locations: reads MerchantLocations records that have
//   mspApplicationNo or elavonMID but still have no MerchantMID, and creates
//   one for each. Fetches real MCC/industry data from MSPWare form data rather
//   than using defaults.
//
// Safe to re-run — idempotent (skips locations that already have a MID, and
// skips legacy records whose locationId already has a MID).
//
// Query params:
//   ?dryRun=true        — logs what would be created, writes nothing
//   ?corporateId=xxx    — limit to a single merchant for testing
//
// POST /functions/migrateToMerchantMIDs
// POST /functions/migrateToMerchantMIDs?dryRun=true
// POST /functions/migrateToMerchantMIDs?dryRun=true&corporateId=abc123

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const url = new URL(req.url);
    const body = req.method === 'POST'
      ? (await req.json().catch(() => ({}))) || {}
      : {};
    const dryRun = url.searchParams.get('dryRun') === 'true' || body?.dryRun === true;
    const filterCorporateId = url.searchParams.get('corporateId') || body?.corporateId || null;

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

    console.log(`[migrateToMerchantMIDs] Starting${dryRun ? ' DRY RUN' : ''}${filterCorporateId ? ` for corporateId=${filterCorporateId}` : ''}`);

    const filterArgs = filterCorporateId ? { corporateId: filterCorporateId } : {};

    // Existing MerchantMID records, keyed by locationId — used for idempotency in both parts.
    const existingMIDs = await base44.asServiceRole.entities.MerchantMID.filter(filterArgs);
    const midLocationIds = new Set((existingMIDs || []).map((m: any) => m.locationId));

    // ── Part A: copy any records left in the legacy MerchantProcessingConcept table ──
    // The old collection may no longer be reachable once no schema file references it;
    // treat any lookup failure as "nothing left to migrate" rather than failing the run.
    let legacyRecords: any[] = [];
    try {
      legacyRecords = await base44.asServiceRole.entities.MerchantProcessingConcept.filter(filterArgs);
    } catch (err: any) {
      console.warn(`[migrateToMerchantMIDs] Legacy MerchantProcessingConcept table not reachable (${err.message}) — skipping Part A`);
    }

    const legacyResults: any[] = [];
    let legacyCopied = 0;
    let legacySkipped = 0;

    for (const legacy of (legacyRecords || [])) {
      if (midLocationIds.has(legacy.locationId)) {
        legacySkipped++;
        legacyResults.push({ locationId: legacy.locationId, dbaName: legacy.dbaName, result: 'skipped', reason: 'MerchantMID already exists for this location' });
        continue;
      }

      const { id: _oldId, conceptName, ...rest } = legacy;
      const midPayload = {
        ...rest,
        merchantName: legacy.merchantName || conceptName || legacy.dbaName || '',
      };

      if (dryRun) {
        legacyResults.push({ locationId: legacy.locationId, dbaName: legacy.dbaName, result: 'would_copy', midPayload });
      } else {
        try {
          const created = await base44.asServiceRole.entities.MerchantMID.create(midPayload);
          midLocationIds.add(legacy.locationId);
          legacyCopied++;
          legacyResults.push({ locationId: legacy.locationId, dbaName: legacy.dbaName, midId: created.id, result: 'copied' });
          console.log(`[migrateToMerchantMIDs] Copied legacy record "${legacy.dbaName}" → MerchantMID ${created.id}`);
        } catch (err: any) {
          legacyResults.push({ locationId: legacy.locationId, dbaName: legacy.dbaName, result: 'error', error: err.message });
        }
      }
    }

    // ── Part B: derive a MerchantMID for any location that still doesn't have one ──
    const locations = await base44.asServiceRole.entities.MerchantLocations.filter(filterArgs);

    // Only migrate locations that have boarding data
    const eligible = (locations || []).filter((l: any) => l.mspApplicationNo || l.elavonMID);

    console.log(`[migrateToMerchantMIDs] ${locations?.length ?? 0} total locations, ${eligible.length} eligible (have mspApplicationNo or elavonMID)`);

    const derivedResults: any[] = [];
    let derivedCount = 0;
    let derivedSkipped = 0;

    for (const loc of eligible) {
      // ── Idempotency check — including any MID just copied in Part A ──────────
      if (midLocationIds.has(loc.id)) {
        derivedSkipped++;
        derivedResults.push({
          locationId: loc.id,
          dbaName: loc.dbaName,
          result: 'skipped',
          reason: 'Already has a MerchantMID',
        });
        continue;
      }

      // ── Pull real MCC / industry data from MSPWare ─────────────────────────
      let mccCode         = '';   // never invent 5999 — leave blank if unknown
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
          console.warn(`[migrateToMerchantMIDs] Could not fetch MSPWare data for app ${loc.mspApplicationNo}: ${err.message} — using fallback defaults`);
        }
      }

      // ── Determine target status ────────────────────────────────────────────
      const applicationStepStatus = loc.elavonMID
        ? 'Active (Existing)'
        : (loc.mspApplicationNo ? 'Pending MID' : 'In Review');

      const merchantMIDPayload = {
        locationId:           loc.id,
        corporateId:          loc.corporateId,
        merchantName:         loc.dbaName,
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
        derivedResults.push({
          locationId: loc.id,
          dbaName: loc.dbaName,
          result: 'would_create',
          merchantMIDPayload,
        });
      } else {
        try {
          const merchantMID = await base44.asServiceRole.entities.MerchantMID.create(merchantMIDPayload);
          derivedCount++;
          derivedResults.push({
            locationId: loc.id,
            dbaName: loc.dbaName,
            mspApplicationNo: loc.mspApplicationNo,
            elavonMID: loc.elavonMID,
            midId: merchantMID.id,
            applicationStepStatus,
            mccCode,
            industryType,
            result: 'migrated',
          });
          console.log(`[migrateToMerchantMIDs] Migrated "${loc.dbaName}" → MID ${merchantMID.id} (${applicationStepStatus})`);
        } catch (err: any) {
          derivedResults.push({
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
      legacyTableCopy: {
        found: legacyRecords?.length ?? 0,
        copied: dryRun ? 0 : legacyCopied,
        skipped: legacySkipped,
        wouldCopy: dryRun ? legacyResults.filter(r => r.result === 'would_copy').length : 0,
        results: legacyResults,
      },
      derivedFromLocations: {
        totalLocations: locations?.length ?? 0,
        eligible: eligible.length,
        migrated: dryRun ? 0 : derivedCount,
        skipped: derivedSkipped,
        wouldCreate: dryRun ? derivedResults.filter(r => r.result === 'would_create').length : 0,
        results: derivedResults,
      },
    });

  } catch (error: any) {
    return Response.json({
      error: error.message,
      stack: error.stack?.split('\n').slice(0, 3).join(' | '),
    }, { status: 500 });
  }
});
