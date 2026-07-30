/**
 * Admin MSPWare portfolio sync — /admin/center/sync-msp
 * Dry run first, then confirm live. No HubSpot. Approach A.
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, RefreshCw } from 'lucide-react';
import { base44 } from '@/api/base44Client';

export default function AdminMspPortfolioSync() {
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [dryResult, setDryResult] = useState(null);
  const [liveResult, setLiveResult] = useState(null);

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

  return (
    <div className="px-4 sm:px-6 py-6 space-y-6 max-w-4xl">
      <div>
        <h1 className="font-display text-cb-display text-white">Sync from MSPWare</h1>
        <p className="text-cb-body-lg text-gray-400 mt-1 max-w-2xl">
          Pull approved applications with Elavon MIDs into Merchant Center accounts.
          Does not create HubSpot companies or deals. Does not submit anything to Elavon.
        </p>
      </div>

      <div className="bg-cb-surface border border-cb-border rounded-cb px-4 py-4 space-y-3">
        <p className="text-cb-caption text-gray-500">
          Always dry-run first. Live sync requires an explicit confirm after a successful dry run this session.
        </p>
        <div className="flex flex-wrap gap-2">
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
                'Live sync will create Merchant Accounts, locations, and MIDs in Base44 from MSPWare. HubSpot will not be touched. Continue?',
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

      {summary && (
        <section className="space-y-3">
          <div className="flex flex-wrap items-baseline gap-2">
            <h2 className="font-display text-cb-title text-white">
              {display?.dryRun ? 'Dry-run summary' : 'Live sync summary'}
            </h2>
            {display?.dryRun && (
              <span className="text-cb-caption text-cb-accent">No writes</span>
            )}
            {!display?.dryRun && (
              <span className="text-cb-caption text-cb-success">Written to Base44</span>
            )}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {[
              { label: 'MSP apps scanned', value: summary.mspAppsScanned },
              { label: 'Approved w/ MID', value: summary.approvedWithMid },
              { label: 'Account groups', value: summary.groups },
              { label: 'Accounts create', value: summary.accounts?.created },
              { label: 'Accounts link', value: summary.accounts?.linked },
              { label: 'Profiles create', value: summary.corporateEntities?.created },
              { label: 'MIDs create', value: summary.merchantMIDs?.created },
              { label: 'MIDs skip', value: summary.merchantMIDs?.skipped },
            ].map((k) => (
              <div
                key={k.label}
                className="bg-cb-surface border border-cb-border rounded-cb px-3 py-2"
              >
                <p className="text-cb-caption text-gray-500">{k.label}</p>
                <p className="font-display text-cb-title text-white tabular-nums mt-0.5">
                  {k.value ?? 0}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}

      {entities.length > 0 && (
        <section>
          <h2 className="font-display text-cb-title text-white mb-3">Groups</h2>
          <ul className="space-y-2">
            {entities.map((e) => (
              <li
                key={e.groupKey}
                className="bg-cb-surface border border-cb-border rounded-cb px-4 py-3"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-cb-body font-semibold text-white">{e.legalName}</p>
                    <p className="text-cb-caption text-gray-500 mt-0.5">
                      TIN {e.tin || '—'}
                      {' · '}
                      MSP ref <span className="font-mono text-gray-400">{e.corporateId}</span>
                      {e.accountCreated ? ' · new account' : ' · existing account'}
                      {e.profileCreated ? ' · new profile' : ' · existing profile'}
                    </p>
                    <p className="text-cb-caption text-gray-600 mt-1">
                      {(e.apps || []).length} app(s):{' '}
                      {(e.apps || []).map((a) => a.result).join(', ') || '—'}
                    </p>
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
