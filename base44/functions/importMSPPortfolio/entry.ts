import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// ─── importMSPPortfolio ────────────────────────────────────────────────────────
// Bulk-imports the entire MSPWare/PulsePoint portfolio into Base44.
//
// For each approved application (with a MID):
//   1. Fetches form data from MSPWare to get TIN, address, owner info, pricing
//   2. Groups apps by TIN (= one corporate entity). Falls back to legal name if no TIN.
//   3. Creates MerchantCorporateProfile (one per corporate entity)
//   4. Creates MerchantLocations (one per unique physical address under that entity)
//   5. Creates MerchantProcessingConcept (one per MID)
//
// Safe to re-run — fully idempotent at all three levels.
// Admin-only.
//
// POST /functions/importMSPPortfolio
// POST /functions/importMSPPortfolio?dryRun=true

// ─── Reverse mappings (MSPWare codes → Base44 internal values) ────────────────

function mspOwnershipToInternal(code: string): string {
  const map: Record<string, string> = {
    'SP': 'SOLE_PROPRIETOR',
    'LL': 'LIMITED_COMPANY',
    'CO': 'CORPORATION',
    'SS': 'CORPORATION',     // S-corp — closest match in our enum
    'PA': 'GENERAL_PARTNERSHIP',
    'NP': 'NON_PROFIT',
    'T':  'CORPORATION',     // Trust — no exact match
  };
  return map[code] || 'CORPORATION';
}

function mspLlcClassToTaxClass(ownershipCode: string, llcClass: string): string | null {
  if (ownershipCode !== 'LL') return null;
  const map: Record<string, string> = {
    'D': 'DISREGARDED_ENTITY',
    'P': 'LLC_PARTNERSHIP',
    'C': 'LLC_CORPORATION',
  };
  return map[llcClass] || 'DISREGARDED_ENTITY';
}

function mspTitleToInternal(code: string): string {
  const map: Record<string, string> = {
    'OP':  'PROPRIETOR_OR_OWNER',
    'PP':  'PARTNER_OR_PRINCIPAL',
    'GM':  'GENERAL_MANAGER',
    'CEO': 'CHIEF_EXECUTIVE_OFFICER',
    'CFO': 'CHIEF_FINANCIAL_OFFICER',
    'COO': 'CHIEF_EXECUTIVE_OFFICER',  // no COO in our enum
    'P':   'PRESIDENT',
    'VP':  'VICE_PRESIDENT',
    'MM':  'MANAGING_MEMBER',
    'D':   'DIRECTOR',
    'O':   'AUTHORIZED_SIGNER',
    'T':   'TREASURER',
    'S':   'SECRETARY',
  };
  return map[code] || 'PROPRIETOR_OR_OWNER';
}

function parseDob(dobString: string): { dobYear: string; dobMonth: string; dobDay: string } {
  // MSPWare format: YYYY-MM-DD
  const parts = (dobString || '').split('-');
  return {
    dobYear:  parts[0] || '',
    dobMonth: parts[1] || '',
    dobDay:   parts[2] || '',
  };
}

function cleanDigits(s: string): string {
  return (s || '').replace(/\D/g, '');
}

function generateCorporateId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

// Run async tasks in parallel with a max concurrency cap
async function batchedParallel<T>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<any>
): Promise<any[]> {
  const results: any[] = [];
  for (let i = 0; i < items.length; i += concurrency) {
    const batch = items.slice(i, i + concurrency);
    const batchResults = await Promise.all(batch.map(fn));
    results.push(...batchResults);
  }
  return results;
}

// ─── Main ─────────────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const url = new URL(req.url);
    const body = req.method === 'POST' ? (await req.json().catch(() => ({}))) || {} : {};
    const dryRun = url.searchParams.get('dryRun') === 'true' || body?.dryRun === true;

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

    console.log(`[importMSPPortfolio] Starting${dryRun ? ' DRY RUN' : ''}...`);

    // ── 1. Pull all approved apps from MSPWare ────────────────────────────────
    let allApps: any[] = [];
    let page = 1;
    while (true) {
      const res = await fetch(`${mspBase}/applications?page=${page}&limit=100`, { headers: mspHeaders });
      const data = await res.json();
      const batch = data?.applications || [];
      if (!batch.length) break;
      allApps = allApps.concat(batch);
      if (page >= (data?.pages || 1)) break;
      page++;
    }

    const approvedApps = allApps.filter(a =>
      ['Approved', 'Complete'].includes(a.application_status) && a.mid
    );

    console.log(`[importMSPPortfolio] ${allApps.length} total apps, ${approvedApps.length} approved with MID`);

    // ── 2. Fetch form data for each app (batched, 8 at a time) ───────────────
    console.log(`[importMSPPortfolio] Fetching form data for ${approvedApps.length} apps...`);

    const enriched = await batchedParallel(approvedApps, 8, async (app: any) => {
      try {
        const formRes = await fetch(`${mspBase}/applications/${app.merchantapplicationno}/form`, { headers: mspHeaders });
        const formData = await formRes.json();
        return { app, form: formData?.form || {} };
      } catch (err: any) {
        console.warn(`[importMSPPortfolio] Could not fetch form for app ${app.merchantapplicationno}: ${err.message}`);
        return { app, form: {} };
      }
    });

    // ── 3. Group by TIN (fall back to legal name) ─────────────────────────────
    const groups = new Map<string, typeof enriched>();

    for (const item of enriched) {
      const tin = cleanDigits(item.form.tin || item.form.ssn || '');
      const groupKey = tin || (item.form.legal_dba_name || item.app.dba || '').trim().toUpperCase();

      if (!groupKey) continue;

      if (!groups.has(groupKey)) groups.set(groupKey, []);
      groups.get(groupKey)!.push(item);
    }

    console.log(`[importMSPPortfolio] ${groups.size} distinct corporate entities identified`);
    // Log groups for review
    for (const [gk, items] of groups) {
      const form = items[0].form;
      const apps = items.map(i => `${i.app.merchantapplicationno}="${i.app.dba}" MID:${i.app.mid}`).join(', ');
      console.log(`[importMSPPortfolio] GROUP: ${gk} | legal: ${form.legal_dba_name || items[0].app.dba} | owners: ${(form.owners?.[0]?.owner_firstname||'')} ${(form.owners?.[0]?.owner_lastname||'')} | apps: ${apps}`);
    }

    // ── 4. Load existing Base44 data for idempotency ─────────────────────────
    // Load all profiles so we can match by taxId globally
    const allProfiles = await base44.asServiceRole.entities.MerchantCorporateProfile.filter({});
    const profileByTin = new Map<string, any>();
    const profileByName = new Map<string, any>();
    for (const p of (allProfiles || [])) {
      if (p.taxId) profileByTin.set(cleanDigits(p.taxId), p);
      if (p.legalName) profileByName.set(p.legalName.trim().toUpperCase(), p);
    }

    // Load all existing concepts to check mspApplicationNo idempotency
    const allConcepts = await base44.asServiceRole.entities.MerchantProcessingConcept.filter({});
    const trackedAppNos = new Set((allConcepts || []).map((c: any) => String(c.mspApplicationNo)).filter(Boolean));

    // ── 5. Process each corporate group ──────────────────────────────────────
    const summary = {
      corporateEntities: { found: 0, created: 0, skipped: 0 },
      locations:         { created: 0, skipped: 0 },
      concepts:          { created: 0, skipped: 0, errors: 0 },
    };
    const entityResults: any[] = [];

    for (const [groupKey, items] of groups) {
      // Representative record for profile-level fields
      const rep = items[0];
      const form = rep.form;

      const tin = cleanDigits(form.tin || form.ssn || '');
      const legalName = (form.legal_dba_name || rep.app.dba || '').trim();
      const ownershipCode = form.ownership_type || 'CO';
      const primaryOwner = (form.owners || [])[0] || {};
      const dob = parseDob(primaryOwner.owner_dob || '');
      const email = primaryOwner.owner_email || form.business_email || form.chargebacks_retrievals_email || '';
      const phone = cleanDigits(form.business_phone || '');

      const taxClassType = mspLlcClassToTaxClass(ownershipCode, form.llc_class || '');

      // ── 5a. Find or create MerchantCorporateProfile ───────────────────────
      let profile = tin ? profileByTin.get(tin) : profileByName.get(legalName.toUpperCase());
      let profileCreated = false;

      if (profile) {
        summary.corporateEntities.skipped++;
      } else {
        summary.corporateEntities.found++;

        const corporateIdNew = generateCorporateId();

        const profilePayload = {
          corporateId:      corporateIdNew,
          legalName,
          signerEmail:      email || `import+${groupKey.slice(0, 8).toLowerCase().replace(/\s/g, '')}@cliqbux.com`,
          taxId:            tin || null,
          ownershipType:    mspOwnershipToInternal(ownershipCode),
          ...(taxClassType ? { taxClassType } : {}),
          firstName:             primaryOwner.owner_firstname || '',
          lastName:              primaryOwner.owner_lastname  || '',
          corporatePhone:        phone,
          titleType:             mspTitleToInternal(primaryOwner.owner_title || ''),
          ...dob,
          homeStreet:            primaryOwner.owner_address   || '',
          homeCity:              primaryOwner.owner_city      || '',
          homeState:             primaryOwner.owner_state_usa || '',
          homeZip:               primaryOwner.owner_zipcode   || '',
          productDescription:    form.products_or_services    || '',
          establishmentYear:     form.year_business_established || '',
          monthlyCardSales:      form.monthly_sales   || '',
          avgSaleAmount:         form.average_sales   || '',
          highestTicketAmount:   form.highest_ticket  || '',
          cardPresentPct:        form.cp_percent      || '100',
          mccCode:               form.mcc             || '',
          applicationStatus:     'Submitted',          // these are already-live merchants
        };

        if (!dryRun) {
          profile = await base44.asServiceRole.entities.MerchantCorporateProfile.create(profilePayload);
          profileByTin.set(tin, profile);
          profileByName.set(legalName.toUpperCase(), profile);
          profileCreated = true;
        } else {
          profile = { id: `[dry-run:${legalName}]`, corporateId: corporateIdNew, ...profilePayload };
          profileCreated = true;
        }
        summary.corporateEntities.created++;
      }

      const corporateId = profile.corporateId || profile.id;

      // Load existing locations for this corporateId (skip on dry run)
      const existingLocations: any[] = dryRun ? [] :
        await base44.asServiceRole.entities.MerchantLocations.filter({ corporateId });

      // ── 5b–c. Location + Concept per app ─────────────────────────────────
      const appResults: any[] = [];

      for (const { app, form: f } of items) {
        const appNo = String(app.merchantapplicationno);

        // Concept idempotency
        if (trackedAppNos.has(appNo)) {
          summary.concepts.skipped++;
          appResults.push({ appNo, dba: app.dba, mid: app.mid, result: 'concept_already_tracked' });
          continue;
        }

        const street = (f.business_address || '').trim().toLowerCase();
        const zip    = cleanDigits(f.business_zipcode || '');

        // Find or create location
        let location = existingLocations.find((l: any) => {
          const ls = (l.businessStreet || l.businessAddress || '').trim().toLowerCase();
          const lz = cleanDigits(l.businessZip || '');
          return ls === street && lz === zip;
        });

        let locationCreated = false;
        if (!location) {
          const locationPayload = {
            corporateId,
            dbaName:         f.full_dba_name || app.dba,
            businessStreet:  f.business_address  || '',
            businessCity:    f.business_city      || '',
            businessState:   f.business_state_usa || '',
            businessZip:     f.business_zipcode   || '',
            businessAddress: [f.business_address, f.business_city, f.business_state_usa, f.business_zipcode].filter(Boolean).join(', '),
            applicationStepStatus: 'Active',
          };

          if (!dryRun) {
            location = await base44.asServiceRole.entities.MerchantLocations.create(locationPayload);
            existingLocations.push(location);
          } else {
            location = { id: `[dry-run:${street}]`, ...locationPayload };
          }
          locationCreated = true;
          summary.locations.created++;
        } else {
          summary.locations.skipped++;
        }

        // Create concept
        const conceptPayload = {
          locationId:            location.id,
          corporateId,
          conceptName:           f.full_dba_name || app.dba,
          dbaName:               f.full_dba_name || app.dba,
          mccCode:               f.mcc           || '',
          industryType:          f.industry_type  || 'RE',
          pricingCategory:       f.pricing_category || '1',
          pricingMethod:         f.pricing_method   || 'ICPLS',
          monthlyCardSales:      f.monthly_sales  ? parseFloat(f.monthly_sales)  : null,
          avgSaleAmount:         f.average_sales  ? parseFloat(f.average_sales)  : null,
          highestTicketAmount:   f.highest_ticket ? parseFloat(f.highest_ticket) : null,
          cardPresentPct:        f.cp_percent     ? parseFloat(f.cp_percent)     : 100,
          mspApplicationNo:      appNo,
          elavonMID:             String(app.mid || ''),
          isExistingAccount:     true,
          existingAccountSource: 'mspware_import',
          applicationStepStatus: 'Active (Existing)',
        };

        try {
          if (!dryRun) {
            await base44.asServiceRole.entities.MerchantProcessingConcept.create(conceptPayload);
            trackedAppNos.add(appNo);
          }
          summary.concepts.created++;
          appResults.push({
          appNo,
          dba:             app.dba,
          result:          dryRun ? 'would_create' : 'created',
          });
          console.log(`[importMSPPortfolio] ${dryRun ? '[DRY] ' : ''}Concept "${app.dba}" MID ${app.mid} → corporateId ${corporateId}`);
        } catch (err: any) {
          summary.concepts.errors++;
          appResults.push({ appNo, dba: app.dba, mid: app.mid, result: 'error', error: err.message });
        }
      }

      entityResults.push({
        groupKey,
        legalName,
        tin: tin ? `***${tin.slice(-4)}` : null,
        corporateId,
        profileCreated,
        apps: appResults,
      });
    }

    return Response.json({
      success: true,
      dryRun,
      summary,
      entities: entityResults,
    });

  } catch (error: any) {
    return Response.json({
      error: error.message,
      stack: error.stack?.split('\n').slice(0, 3).join(' | '),
    }, { status: 500 });
  }
});