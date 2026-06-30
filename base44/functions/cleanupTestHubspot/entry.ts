import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// ─── cleanupTestHubspot ───────────────────────────────────────────────────────
// One-time admin function: deletes all junk "Self-Serve Onboarding" test deals
// from HubSpot, then removes any associated companies and contacts that have no
// remaining deals (i.e., were created solely for test purposes).
//
// POST /functions/cleanupTestHubspot
// Body: { dryRun?: boolean }  — defaults to true for safety
//
// Admin-only. Will not run without base44.auth.me().

const BATCH_SIZE = 100; // HubSpot batch archive limit

async function batchArchive(
  objectType: string,
  ids: string[],
  headers: Record<string, string>,
  dryRun: boolean,
  log: string[]
): Promise<number> {
  if (ids.length === 0) return 0;
  let deleted = 0;
  for (let i = 0; i < ids.length; i += BATCH_SIZE) {
    const chunk = ids.slice(i, i + BATCH_SIZE);
    log.push(`${dryRun ? '[DRY RUN] Would archive' : 'Archiving'} ${chunk.length} ${objectType}…`);
    if (!dryRun) {
      const res = await fetch(`https://api.hubapi.com/crm/v3/objects/${objectType}/batch/archive`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ inputs: chunk.map(id => ({ id })) }),
      });
      if (!res.ok) {
        const err = await res.text();
        log.push(`ERROR archiving ${objectType}: ${res.status} — ${err.slice(0, 200)}`);
      } else {
        deleted += chunk.length;
      }
    } else {
      deleted += chunk.length;
    }
  }
  return deleted;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const dryRun: boolean = body.dryRun !== false; // default true

    const hsKey = Deno.env.get('HUBSPOT_API_KEY');
    if (!hsKey) return Response.json({ error: 'HUBSPOT_API_KEY not set' }, { status: 500 });

    const headers = {
      'Authorization': `Bearer ${hsKey}`,
      'Content-Type': 'application/json',
    };

    const log: string[] = [];
    log.push(`Mode: ${dryRun ? 'DRY RUN (pass dryRun: false to execute)' : 'LIVE — changes will be made'}`);

    // ── Step 1: Find all Self-Serve Onboarding deals (paginated) ──────────────
    log.push('Step 1: Searching for Self-Serve Onboarding deals…');
    const dealIds: string[] = [];
    let after: string | undefined;

    do {
      const searchBody: Record<string, unknown> = {
        filterGroups: [{
          filters: [{
            propertyName: 'dealname',
            operator: 'CONTAINS_TOKEN',
            value: 'Self-Serve Onboarding',
          }]
        }],
        properties: ['dealname', 'dealstage'],
        limit: 200,
      };
      if (after) searchBody.after = after;

      const res = await fetch('https://api.hubapi.com/crm/v3/objects/deals/search', {
        method: 'POST',
        headers,
        body: JSON.stringify(searchBody),
      });
      const data = await res.json();
      if (!res.ok) {
        return Response.json({ error: `Deal search failed: ${res.status}`, details: data }, { status: 500 });
      }
      for (const deal of (data.results ?? [])) {
        dealIds.push(deal.id);
      }
      after = data.paging?.next?.after;
    } while (after);

    log.push(`Found ${dealIds.length} Self-Serve Onboarding deals to delete.`);

    // ── Step 2: Collect associated company and contact IDs ────────────────────
    log.push('Step 2: Collecting associated companies and contacts…');
    const associatedCompanyIds = new Set<string>();
    const associatedContactIds = new Set<string>();

    // Batch-fetch associations (100 at a time)
    for (let i = 0; i < dealIds.length; i += 100) {
      const chunk = dealIds.slice(i, i + 100);

      const [compRes, conRes] = await Promise.all([
        fetch(`https://api.hubapi.com/crm/v3/associations/deals/companies/batch/read`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ inputs: chunk.map(id => ({ id })) }),
        }),
        fetch(`https://api.hubapi.com/crm/v3/associations/deals/contacts/batch/read`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ inputs: chunk.map(id => ({ id })) }),
        }),
      ]);

      const compData = await compRes.json();
      const conData = await conRes.json();

      for (const result of (compData.results ?? [])) {
        for (const assoc of (result.to ?? [])) associatedCompanyIds.add(assoc.id);
      }
      for (const result of (conData.results ?? [])) {
        for (const assoc of (result.to ?? [])) associatedContactIds.add(assoc.id);
      }
    }

    log.push(`Associated companies: ${associatedCompanyIds.size}, contacts: ${associatedContactIds.size}`);

    // ── Step 3: Delete the deals ───────────────────────────────────────────────
    log.push('Step 3: Deleting deals…');
    const dealsDeleted = await batchArchive('deals', dealIds, headers, dryRun, log);

    // ── Step 4: Check which companies/contacts have no remaining deals ─────────
    // (After deletion, companies/contacts with 0 deals are orphans from testing)
    log.push('Step 4: Checking for orphaned companies and contacts…');

    const orphanCompanyIds: string[] = [];
    const orphanContactIds: string[] = [];

    if (!dryRun) {
      // Check companies
      for (const compId of associatedCompanyIds) {
        const res = await fetch(
          `https://api.hubapi.com/crm/v3/objects/companies/${compId}/associations/deals?limit=1`,
          { headers }
        );
        const data = await res.json();
        if ((data.results?.length ?? 0) === 0) orphanCompanyIds.push(compId);
      }

      // Check contacts
      for (const conId of associatedContactIds) {
        const res = await fetch(
          `https://api.hubapi.com/crm/v3/objects/contacts/${conId}/associations/deals?limit=1`,
          { headers }
        );
        const data = await res.json();
        if ((data.results?.length ?? 0) === 0) orphanContactIds.push(conId);
      }
    } else {
      // In dry run, assume all associated records would become orphans
      orphanCompanyIds.push(...associatedCompanyIds);
      orphanContactIds.push(...associatedContactIds);
    }

    log.push(`Orphaned companies (no remaining deals): ${orphanCompanyIds.length}`);
    log.push(`Orphaned contacts (no remaining deals): ${orphanContactIds.length}`);

    // ── Step 5: Delete orphaned companies and contacts ─────────────────────────
    log.push('Step 5: Deleting orphaned companies and contacts…');
    const companiesDeleted = await batchArchive('companies', orphanCompanyIds, headers, dryRun, log);
    const contactsDeleted = await batchArchive('contacts', orphanContactIds, headers, dryRun, log);

    log.push('Done.');

    return Response.json({
      success: true,
      dryRun,
      summary: {
        dealsFound: dealIds.length,
        dealsDeleted,
        orphanCompaniesFound: orphanCompanyIds.length,
        companiesDeleted,
        orphanContactsFound: orphanContactIds.length,
        contactsDeleted,
      },
      log,
    });

  } catch (error: any) {
    return Response.json({
      error: error.message,
      stack: error.stack?.split('\n').slice(0, 3).join(' | '),
    }, { status: 500 });
  }
});
