import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

/**
 * importMSPPortfolio — pull MSPWare approved apps with MIDs into Merchant Center.
 *
 * Approach A (2026-07-30): creates/links MerchantAccount + profile + location + MID.
 * No HubSpot writes. Never submits to Elavon (MSP read-only).
 *
 * POST { dryRun: true }              — preview only
 * POST { confirmLive: true }         — write (also accepts dryRun:false + confirmLive)
 * POST ?dryRun=true                  — query-param dry run (legacy)
 *
 * Idempotent: skips MIDs already tracked by mspApplicationNo; links existing profiles by TIN/name.
 */

function mspOwnershipToInternal(code: string): string {
  const map: Record<string, string> = {
    SP: 'SOLE_PROPRIETOR',
    LL: 'LIMITED_COMPANY',
    CO: 'CORPORATION',
    SS: 'SUB_S_CORP',
    PA: 'GENERAL_PARTNERSHIP',
    NP: 'NON_PROFIT',
    T: 'TRUST',
  };
  return map[code] || 'CORPORATION';
}

function mspLlcClassToTaxClass(ownershipCode: string, llcClass: string): string | null {
  if (ownershipCode !== 'LL') return null;
  const map: Record<string, string> = {
    D: 'DISREGARDED_ENTITY',
    P: 'LLC_PARTNERSHIP',
    C: 'LLC_CORPORATION',
  };
  return map[llcClass] || 'DISREGARDED_ENTITY';
}

function mspTitleToInternal(code: string): string {
  const map: Record<string, string> = {
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
  return map[code] || 'PROPRIETOR_OR_OWNER';
}

function parseDob(dobString: string): { dobYear: string; dobMonth: string; dobDay: string } {
  const parts = (dobString || '').split('-');
  return {
    dobYear: parts[0] || '',
    dobMonth: parts[1] || '',
    dobDay: parts[2] || '',
  };
}

function cleanDigits(s: string): string {
  return (s || '').replace(/\D/g, '');
}

function parseEntities(raw: unknown): any[] {
  let v: any = raw ?? [];
  if (typeof v === 'string') {
    try { v = JSON.parse(v); } catch { v = []; }
  }
  return Array.isArray(v) ? v : [];
}

/** Stable MSP-local corporateId — not a HubSpot deal id. */
function stableMspCorporateId(tin: string, fallbackAppNo: string): string {
  if (tin && tin.length >= 4) return `msp-${tin}`;
  return `msp-app-${String(fallbackAppNo || 'unknown').replace(/\W/g, '')}`;
}

function newEntityId(): string {
  return crypto.randomUUID();
}

async function batchedParallel<T>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<any>,
): Promise<any[]> {
  const results: any[] = [];
  for (let i = 0; i < items.length; i += concurrency) {
    const batch = items.slice(i, i + concurrency);
    const batchResults = await Promise.all(batch.map(fn));
    results.push(...batchResults);
  }
  return results;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const url = new URL(req.url);
    const body = req.method === 'POST' ? (await req.json().catch(() => ({}))) || {} : {};

    const dryRunParam = url.searchParams.get('dryRun') === 'true' || body?.dryRun === true;
    const confirmLive = body?.confirmLive === true;
    // Live writes only with explicit confirmLive; anything else is dry-run-safe
    const dryRun = !confirmLive || dryRunParam === true;
    if (!dryRun && !confirmLive) {
      return Response.json({
        error: 'Live sync requires confirmLive: true. Run with dryRun: true first.',
      }, { status: 400 });
    }

    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Unauthorized — admin role required' }, { status: 403 });
    }

    const mspBase = (Deno.env.get('MSP_BASE_URL') || 'https://api.msppulsepoint.com/v2').replace(/\/$/, '');
    const apiKey = Deno.env.get('MSP_APP_KEY') || '';
    const appId = Deno.env.get('MSP_APP_ID') || 'cliqbux';
    if (!apiKey) return Response.json({ error: 'MSP_APP_KEY env var not set' }, { status: 500 });

    const mspHeaders = { 'X-API-KEY': apiKey, 'X-App-ID': appId, Accept: 'application/json' };

    console.log(`[importMSPPortfolio] Starting${dryRun ? ' DRY RUN' : ' LIVE'}...`);

    // ── 1. Pull applications ────────────────────────────────────────────────
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

    const approvedApps = allApps.filter((a) =>
      ['Approved', 'Complete'].includes(a.application_status) && a.mid
    );
    console.log(`[importMSPPortfolio] ${allApps.length} total apps, ${approvedApps.length} approved with MID`);

    // ── 2. Forms ────────────────────────────────────────────────────────────
    const enriched = await batchedParallel(approvedApps, 8, async (app: any) => {
      try {
        const formRes = await fetch(
          `${mspBase}/applications/${app.merchantapplicationno}/form`,
          { headers: mspHeaders },
        );
        const formData = await formRes.json();
        return { app, form: formData?.form || {} };
      } catch (err: any) {
        console.warn(`[importMSPPortfolio] form ${app.merchantapplicationno}: ${err.message}`);
        return { app, form: {} };
      }
    });

    // ── 3. Group by TIN / name ──────────────────────────────────────────────
    const groups = new Map<string, typeof enriched>();
    for (const item of enriched) {
      const tin = cleanDigits(item.form.tin || item.form.ssn || '');
      const groupKey = tin || (item.form.legal_dba_name || item.app.dba || '').trim().toUpperCase();
      if (!groupKey) continue;
      if (!groups.has(groupKey)) groups.set(groupKey, []);
      groups.get(groupKey)!.push(item);
    }
    console.log(`[importMSPPortfolio] ${groups.size} groups`);

    // ── 4. Existing Base44 state ────────────────────────────────────────────
    const [allProfiles, allMerchantMIDs, allAccounts] = await Promise.all([
      base44.asServiceRole.entities.MerchantCorporateProfile.filter({}),
      base44.asServiceRole.entities.MerchantMID.filter({}),
      base44.asServiceRole.entities.MerchantAccount.filter({}).catch(() => []),
    ]);

    const profileByTin = new Map<string, any>();
    const profileByName = new Map<string, any>();
    const profileByCorporateId = new Map<string, any>();
    for (const p of allProfiles || []) {
      if (p.taxId) profileByTin.set(cleanDigits(p.taxId), p);
      if (p.legalName) profileByName.set(String(p.legalName).trim().toUpperCase(), p);
      if (p.corporateId) profileByCorporateId.set(String(p.corporateId), p);
    }

    const accountByEin = new Map<string, any>();
    const accountByName = new Map<string, any>();
    const accountById = new Map<string, any>();
    for (const a of allAccounts || []) {
      accountById.set(String(a.id), a);
      if (a.name) accountByName.set(String(a.name).trim().toUpperCase(), a);
      for (const le of parseEntities(a.legalEntities)) {
        const ein = cleanDigits(le.federalEIN || '');
        if (ein) accountByEin.set(ein, a);
      }
    }

    const trackedAppNos = new Set(
      (allMerchantMIDs || []).map((c: any) => String(c.mspApplicationNo)).filter(Boolean),
    );

    const summary = {
      accounts: { created: 0, linked: 0 },
      corporateEntities: { found: 0, created: 0, skipped: 0, linkedToAccount: 0 },
      locations: { created: 0, skipped: 0 },
      merchantMIDs: { created: 0, skipped: 0, errors: 0 },
      mspAppsScanned: allApps.length,
      approvedWithMid: approvedApps.length,
      groups: groups.size,
    };
    const entityResults: any[] = [];

    // ── 5. Process groups ───────────────────────────────────────────────────
    for (const [groupKey, items] of groups) {
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
      const firstAppNo = String(rep.app.merchantapplicationno || '');
      const corporateIdStable = stableMspCorporateId(tin, firstAppNo);

      // ── MerchantAccount find-or-create ──────────────────────────────────
      let account =
        (tin && accountByEin.get(tin))
        || accountByName.get(legalName.toUpperCase())
        || null;
      let accountCreated = false;

      if (account) {
        summary.accounts.linked++;
      } else {
        const entityId = newEntityId();
        const legalEntities = tin
          ? [{
              entityId,
              legalBusinessName: legalName,
              federalEIN: tin,
              ownershipType: mspOwnershipToInternal(ownershipCode),
              ...(taxClassType ? { taxClassType } : {}),
              establishmentYear: form.year_business_established || '',
              mailingStreet: form.legal_address || form.business_address || '',
              mailingCity: form.legal_city || form.business_city || '',
              mailingState: form.legal_state_usa || form.business_state_usa || '',
              mailingZip: form.legal_zipcode || form.business_zipcode || '',
            }]
          : [];

        const accountPayload = {
          name: legalName || `MSP ${groupKey.slice(0, 24)}`,
          domain: null,
          hubspotCompanyId: null,
          legalEntities,
        };

        if (!dryRun) {
          account = await base44.asServiceRole.entities.MerchantAccount.create(accountPayload);
          accountById.set(String(account.id), account);
          if (tin) accountByEin.set(tin, account);
          accountByName.set(legalName.toUpperCase(), account);
        } else {
          account = { id: `[dry-run-account:${legalName}]`, ...accountPayload };
        }
        accountCreated = true;
        summary.accounts.created++;
      }

      const merchantAccountId = account.id;

      // ── Profile find-or-create ──────────────────────────────────────────
      let profile =
        (tin && profileByTin.get(tin))
        || profileByName.get(legalName.toUpperCase())
        || profileByCorporateId.get(corporateIdStable)
        || null;
      let profileCreated = false;

      if (profile) {
        summary.corporateEntities.skipped++;
        // Backfill merchantAccountId if missing
        if (!profile.merchantAccountId && !dryRun) {
          profile = await base44.asServiceRole.entities.MerchantCorporateProfile.update(profile.id, {
            merchantAccountId,
          });
          summary.corporateEntities.linkedToAccount++;
        } else if (!profile.merchantAccountId && dryRun) {
          summary.corporateEntities.linkedToAccount++;
        } else if (profile.merchantAccountId) {
          summary.corporateEntities.linkedToAccount++;
        }
      } else {
        summary.corporateEntities.found++;
        const profilePayload: Record<string, unknown> = {
          corporateId: corporateIdStable,
          merchantAccountId,
          legalName,
          dbaName: form.full_dba_name || rep.app.dba || legalName,
          signerEmail: email || `import+msp-${(tin || groupKey).slice(0, 8).toLowerCase()}@cliqbux.com`,
          taxId: tin || null,
          ownershipType: mspOwnershipToInternal(ownershipCode),
          ...(taxClassType ? { taxClassType } : {}),
          firstName: primaryOwner.owner_firstname || '',
          lastName: primaryOwner.owner_lastname || '',
          corporatePhone: phone,
          titleType: mspTitleToInternal(primaryOwner.owner_title || ''),
          ...dob,
          homeStreet: primaryOwner.owner_address || '',
          homeCity: primaryOwner.owner_city || '',
          homeState: primaryOwner.owner_state_usa || '',
          homeZip: primaryOwner.owner_zipcode || '',
          productDescription: form.products_or_services || '',
          establishmentYear: form.year_business_established || '',
          monthlyCardSales: form.monthly_sales || '',
          avgSaleAmount: form.average_sales || '',
          highestTicketAmount: form.highest_ticket || '',
          cardPresentPct: form.cp_percent || '100',
          mccCode: form.mcc || '',
          applicationStatus: 'Submitted',
          handoffStage: 'support',
          portalLockStatus: 'unlocked',
        };

        if (!dryRun) {
          profile = await base44.asServiceRole.entities.MerchantCorporateProfile.create(profilePayload);
          if (tin) profileByTin.set(tin, profile);
          profileByName.set(legalName.toUpperCase(), profile);
          profileByCorporateId.set(corporateIdStable, profile);
        } else {
          profile = { id: `[dry-run:${legalName}]`, ...profilePayload };
        }
        profileCreated = true;
        summary.corporateEntities.created++;
        summary.corporateEntities.linkedToAccount++;
      }

      const corporateId = String(profile.corporateId || corporateIdStable);

      const existingLocations: any[] = dryRun
        ? []
        : await base44.asServiceRole.entities.MerchantLocations.filter({ corporateId });

      const appResults: any[] = [];

      for (const { app, form: f } of items) {
        const appNo = String(app.merchantapplicationno);

        if (trackedAppNos.has(appNo)) {
          summary.merchantMIDs.skipped++;
          appResults.push({ appNo, dba: app.dba, mid: app.mid, result: 'mid_already_tracked' });
          continue;
        }

        const street = (f.business_address || '').trim().toLowerCase();
        const zip = cleanDigits(f.business_zipcode || '');

        let location = existingLocations.find((l: any) => {
          const ls = (l.businessStreet || l.businessAddress || '').trim().toLowerCase();
          const lz = cleanDigits(l.businessZip || '');
          return ls === street && lz === zip;
        });

        if (!location) {
          const locationPayload = {
            corporateId,
            dbaName: f.full_dba_name || app.dba,
            businessStreet: f.business_address || '',
            businessCity: f.business_city || '',
            businessState: f.business_state_usa || '',
            businessZip: f.business_zipcode || '',
            businessAddress: [f.business_address, f.business_city, f.business_state_usa, f.business_zipcode]
              .filter(Boolean).join(', '),
            applicationStepStatus: 'Active',
          };
          if (!dryRun) {
            location = await base44.asServiceRole.entities.MerchantLocations.create(locationPayload);
            existingLocations.push(location);
          } else {
            location = { id: `[dry-run-loc:${street}]`, ...locationPayload };
          }
          summary.locations.created++;
        } else {
          summary.locations.skipped++;
        }

        const merchantMIDPayload = {
          locationId: location.id,
          corporateId,
          merchantName: f.full_dba_name || app.dba,
          dbaName: f.full_dba_name || app.dba,
          mccCode: f.mcc || '',
          industryType: f.industry_type || 'RE',
          pricingCategory: f.pricing_category || '1',
          pricingMethod: f.pricing_method || 'ICPLS',
          monthlyCardSales: f.monthly_sales ? parseFloat(f.monthly_sales) : null,
          avgSaleAmount: f.average_sales ? parseFloat(f.average_sales) : null,
          highestTicketAmount: f.highest_ticket ? parseFloat(f.highest_ticket) : null,
          cardPresentPct: f.cp_percent ? parseFloat(f.cp_percent) : 100,
          mspApplicationNo: appNo,
          elavonMID: String(app.mid || ''),
          isExistingAccount: true,
          existingAccountSource: 'mspware_import',
          applicationStepStatus: 'Active (Existing)',
        };

        try {
          if (!dryRun) {
            await base44.asServiceRole.entities.MerchantMID.create(merchantMIDPayload);
            trackedAppNos.add(appNo);
          }
          summary.merchantMIDs.created++;
          appResults.push({
            appNo,
            dba: app.dba,
            mid: app.mid,
            result: dryRun ? 'would_create' : 'created',
          });
        } catch (err: any) {
          summary.merchantMIDs.errors++;
          appResults.push({ appNo, dba: app.dba, mid: app.mid, result: 'error', error: err.message });
        }
      }

      entityResults.push({
        groupKey,
        legalName,
        tin: tin ? `***${tin.slice(-4)}` : null,
        corporateId,
        merchantAccountId: dryRun && accountCreated ? account.id : merchantAccountId,
        accountCreated,
        profileCreated,
        mspRef: corporateId.startsWith('msp-'),
        apps: appResults,
      });
    }

    return Response.json({
      success: true,
      dryRun,
      confirmLive: !dryRun,
      hubspot: false,
      summary,
      entities: entityResults,
    });
  } catch (error: any) {
    console.error('[importMSPPortfolio]', error);
    return Response.json({
      error: error.message,
      stack: error.stack?.split('\n').slice(0, 3).join(' | '),
    }, { status: 500 });
  }
});
