/**
 * Admin MSPWare portfolio sync — /admin/center/sync-msp
 * Probe → dry run → confirm live. Owner → Legal Entity → MID. No HubSpot.
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, RefreshCw, Search } from 'lucide-react';
import { base44 } from '@/api/base44Client';

export default function AdminMspPortfolioSync() {
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [probeResult, setProbeResult] = useState(null);
  const [dryResult, setDryResult] = useState(null);
  const [liveResult, setLiveResult] = useState(null);

  const runProbe = async () => {
    setBusy('probe');
    setError('');
    try {
      const res = await base44.functions.invoke('probeMSPMerchantData', { sampleSize: 8 });
      if (res.data?.error) throw new Error(res.data.error);
      setProbeResult(res.data);
    } catch (err) {
      console.error('[AdminMspPortfolioSync] probe', err);
      setError(err?.message || 'Probe failed');
    } finally {
      setBusy('');
    }
  };

  const run = async (mode) => {
    setBusy(mode);
    setError('');
    if (mode === 'dry') setLiveResult(null);
    try {
      const payload = mode === 'dry'
        ? { dryRun: true }
        : { confirmLive: true, dryRun: false };
      const res = await base44.functions.invoke('importMSPPortfolio', payload);
      if (res.data?.error) throw new Error(res.data.error);
      if (mode === 'dry') setDryResult(res.data);
      else setLiveResult(res.data);
    } catch (err) {
      console.error('[AdminMspPortfolioSync]', err);
      setError(err?.message || 'Sync failed');
    } finally {
      setBusy('');
    }
  };

  const display = liveResult || dryResult;
  const summary = display?.summary;
  const entities = display?.entities || [];
  const cov = probeResult?.coverage;
  const owners = probeResult?.ownerClustering;

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="font-display text-cb-display text-white">Sync from MSPWare</h1>
        <p className="text-cb-body-lg text-gray-400 mt-1 max-w-2xl">
          Pull live merchants into Merchant Center as{' '}
          <span className="text-gray-300">Owner → Legal Entity → MID</span>
          {' '}(merchant contact email, then corporate name / federal tax id).
          No HubSpot. Nothing submitted to Elavon.
        </p>
      </div>

      <div className="bg-cb-surface border border-cb-border rounded-cb px-4 py-4 space-y-3">
        <p className="text-cb-caption text-gray-500">
          Probe first (owner clustering), then dry-run, then confirm live.
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={!!busy}
            onClick={runProbe}
            className="inline-flex items-center gap-2 text-cb-caption font-semibold px-3 py-2 rounded-cb border border-cb-border text-gray-300 hover:text-white disabled:opacity-40"
          >
            {busy === 'probe' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
            Probe MSP data
          </button>
          <button
            type="button"
            disabled={!!busy}
            onClick={() => run('dry')}
            className="inline-flex items-center gap-2 text-cb-caption font-semibold px-3 py-2 rounded-cb border border-cb-border text-gray-300 hover:text-white disabled:opacity-40"
          >
            {busy === 'dry' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            Dry run
          </button>
          <button
            type="button"
            disabled={!!busy || !dryResult?.success}
            onClick={() => {
              if (!window.confirm(
                'Live sync will create Merchant Accounts (by owner email), legal entities, locations, and MIDs. HubSpot will not be touched. Continue?',
              )) return;
              run('live');
            }}
            className="inline-flex items-center gap-2 text-cb-caption font-semibold px-3 py-2 rounded-cb bg-cb-accent text-cb-bg hover:opacity-90 disabled:opacity-40"
          >
            {busy === 'live' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
            Confirm live sync
          </button>
          <Link
            to="/admin/center/merchants"
            className="inline-flex items-center text-cb-caption font-medium px-3 py-2 rounded-cb border border-cb-border text-gray-400 hover:text-white"
          >
            View Merchants
          </Link>
        </div>
      </div>

      {error && (
        <p className="text-cb-caption text-cb-danger border-l-2 border-cb-danger pl-3">{error}</p>
      )}

      {probeResult?.success && (
        <section className="space-y-3">
          <h2 className="font-display text-cb-title text-white">Probe report</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {[
              { label: 'Merchants API total', value: probeResult.merchants?.total },
              { label: 'Unique owner emails', value: owners?.uniqueEmails },
              { label: 'Emails w/ 2+ MIDs', value: owners?.emailsWithMultipleMids },
              { label: 'Emails w/ 2+ corps', value: owners?.emailsWithMultipleCorps },
              { label: 'With federal_tax_id', value: owners?.withFederalTaxId },
              { label: 'With email', value: owners?.withEmail },
              { label: 'Apps Approved+MID', value: probeResult.applications?.approvedWithMid },
              { label: 'Signatures OK / miss', value: `${probeResult.formTinSupplement?.signaturesOk ?? 0} / ${probeResult.formTinSupplement?.signaturesMiss ?? 0}` },
            ].map((k) => (
              <div key={k.label} className="bg-cb-surface border border-cb-border rounded-cb px-3 py-2">
                <p className="text-cb-caption text-gray-500">{k.label}</p>
                <p className="font-display text-cb-title text-white tabular-nums mt-0.5">{k.value ?? '—'}</p>
              </div>
            ))}
          </div>
          {owners?.topMultiMid?.length > 0 && (
            <div className="bg-cb-surface border border-cb-border rounded-cb px-4 py-3 space-y-2">
              <p className="text-cb-caption text-gray-500">Top multi-MID owners (by email)</p>
              <ul className="space-y-1">
                {owners.topMultiMid.map((o) => (
                  <li key={o.emailHint} className="text-cb-caption text-gray-400">
                    <span className="text-white">{o.contact || o.emailHint}</span>
                    {' · '}{o.midCount} MID(s) · {o.corpCount} corp(s)
                    {o.corps?.length ? ` — ${o.corps.join(', ')}` : ''}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {cov && (
            <p className="text-cb-caption text-gray-500">
              CSV baseline {cov.merchantsExportApprovedMidBaseline} · gap vs CSV {cov.gapVsCsv} · apps vs merchants gap {cov.gapAppsVsMerchantsApi}
            </p>
          )}
        </section>
      )}

      {summary && (
        <section className="space-y-3">
          <div className="flex flex-wrap items-baseline gap-2">
            <h2 className="font-display text-cb-title text-white">
              {display?.dryRun ? 'Dry-run summary' : 'Live sync summary'}
            </h2>
            {display?.dryRun && <span className="text-cb-caption text-cb-accent">No writes</span>}
            {!display?.dryRun && <span className="text-cb-caption text-cb-success">Written to Base44</span>}
            <span className="text-cb-caption text-gray-500">Owner → Legal Entity → MID</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {[
              { label: 'Merchants importable', value: summary.importableMerchants },
              { label: 'Owner accounts', value: summary.ownerGroups ?? summary.groups },
              { label: 'Legal entities', value: summary.legalEntityGroups },
              { label: 'Unique owner emails', value: summary.uniqueOwnerEmails },
              { label: 'TIN unavailable', value: summary.tinUnavailable },
              { label: 'Accounts create', value: summary.accounts?.created },
              { label: 'Profiles create', value: summary.corporateEntities?.created },
              { label: 'MIDs create', value: summary.merchantMIDs?.created },
              { label: 'Signatures OK', value: summary.signaturesOk },
              { label: 'Email from signer', value: summary.emailFromSigner },
              { label: 'Apps matched by MID', value: summary.applicationsMatchedByMid },
              { label: 'Merchant fetch errors', value: summary.merchantFetchErrors },
            ].map((k) => (
              <div key={k.label} className="bg-cb-surface border border-cb-border rounded-cb px-3 py-2">
                <p className="text-cb-caption text-gray-500">{k.label}</p>
                <p className="font-display text-cb-title text-white tabular-nums mt-0.5">{k.value ?? 0}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {entities.length > 0 && (
        <section>
          <h2 className="font-display text-cb-title text-white mb-3">Owners</h2>
          <ul className="space-y-2">
            {entities.map((e) => (
              <li
                key={e.ownerKey || e.groupKey}
                className="bg-cb-surface border border-cb-border rounded-cb px-4 py-3"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-cb-body font-semibold text-white">
                      {e.ownerContact || e.legalName || 'Owner'}
                    </p>
                    <p className="text-cb-caption text-gray-500 mt-0.5">
                      {e.ownerEmail || 'no email'}
                      {e.emailSource ? ` (${e.emailSource})` : ''}
                      {' · '}
                      {e.legalEntityCount ?? e.legalEntities?.length ?? 0} legal entit(y/ies)
                      {' · '}
                      {e.midCount ?? 0} MID(s)
                      {e.accountCreated ? ' · new account' : ' · existing account'}
                    </p>
                    {(e.legalEntities || []).length > 0 && (
                      <ul className="mt-2 space-y-1 border-l border-cb-border pl-3">
                        {e.legalEntities.map((le) => (
                          <li key={le.legalKey} className="text-cb-caption text-gray-400">
                            <span className="text-gray-300">{le.legalName}</span>
                            {' · TIN '}{le.tin || '—'}
                            {le.tinSource ? ` (${le.tinSource})` : ''}
                            {' · '}{le.midCount} MID(s)
                            {(le.mids || []).slice(0, 4).map((m) => m.dba).filter(Boolean).length > 0 && (
                              <span className="text-gray-600">
                                {' — '}
                                {(le.mids || []).slice(0, 4).map((m) => m.dba).filter(Boolean).join(', ')}
                                {(le.mids || []).length > 4 ? '…' : ''}
                              </span>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  {!display?.dryRun && e.merchantAccountId && !String(e.merchantAccountId).startsWith('[') && (
                    <Link
                      to={`/admin/center/accounts/${encodeURIComponent(e.merchantAccountId)}`}
                      className="text-cb-caption font-semibold text-cb-accent hover:underline flex-shrink-0"
                    >
                      Open account
                    </Link>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
