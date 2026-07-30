/**
 * Admin Merchant Account home — /admin/center/accounts/:merchantAccountId
 * Company parent view: deals (Deal ID = HubSpot, or MSP ref for msp-* imports), legal entities, MID snapshot.
 */
import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ArrowLeft, Eye, FolderOpen, LayoutDashboard, Loader2, MapPin, UserRound,
} from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { ACCOUNT_STATUS_LABELS } from '@/lib/merchantAccountStatus';
import { HANDOFF_STAGE_LABELS } from '@/lib/onboardingFacts';

const DESTINATIONS = [
  { id: 'portal', label: 'Portal', icon: Eye, title: 'Onboarding (People → Sign)' },
  { id: 'dashboard', label: 'Merchant Center', icon: LayoutDashboard, title: 'Deal board / post-signing' },
  { id: 'locations', label: 'Locations', icon: MapPin, title: 'Storefront list' },
  { id: 'account', label: 'Account', icon: UserRound, title: 'Account & MID join key' },
];

function statusChipClass(status) {
  switch (status) {
    case 'live':
      return 'text-cb-success';
    case 'needs_attention':
      return 'text-cb-danger';
    case 'onboarding':
      return 'text-cb-accent';
    default:
      return 'text-gray-400';
  }
}

function dealRefLabel(corporateId) {
  const id = String(corporateId || '');
  if (id.startsWith('msp-')) return 'MSP ref';
  return 'Deal ID';
}

function midStatusDot(status) {
  const st = String(status || '');
  if (st === 'Active' || st === 'Active (Existing)') return 'bg-cb-success';
  if (st === 'Error') return 'bg-cb-danger';
  if (st === 'Pending MID') return 'bg-cb-accent';
  return 'bg-gray-500';
}

export default function AdminMerchantAccountHome() {
  const { merchantAccountId } = useParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [data, setData] = useState(null);
  const [busyKey, setBusyKey] = useState('');
  const [rowError, setRowError] = useState('');

  const load = useCallback(async () => {
    if (!merchantAccountId) return;
    setLoading(true);
    setError('');
    try {
      const res = await base44.functions.invoke('manageMerchantAccount', {
        action: 'get',
        merchantAccountId,
      });
      if (res.data?.error) {
        const err = new Error(res.data.error);
        err.status = res.status;
        throw err;
      }
      setData(res.data);
    } catch (err) {
      console.error('[AdminMerchantAccountHome]', err);
      setData(null);
      setError(err?.message || 'Could not load this merchant account.');
    } finally {
      setLoading(false);
    }
  }, [merchantAccountId]);

  useEffect(() => {
    load();
  }, [load]);

  const openImpersonate = async (corporateId, destination) => {
    const key = `${corporateId}:${destination}`;
    setBusyKey(key);
    setRowError('');
    try {
      const res = await base44.functions.invoke('manageStagedApplication', {
        action: 'impersonate',
        corporateId,
        destination,
      });
      if (res.data?.error || !res.data?.portalUrl) {
        throw new Error(res.data?.error || 'Impersonation failed');
      }
      window.open(res.data.portalUrl, '_blank', 'noopener,noreferrer');
    } catch (err) {
      console.error('[AdminMerchantAccountHome impersonate]', err);
      setRowError(err?.message || 'Could not open merchant view');
    } finally {
      setBusyKey('');
    }
  };

  const account = data?.account;
  const statusLabel = ACCOUNT_STATUS_LABELS[data?.status] || data?.status;
  const midCounts = data?.midCounts || {};

  return (
    <div className="space-y-6">
      <div>
        <nav className="flex flex-wrap items-center gap-1.5 text-cb-caption text-gray-500 mb-2">
          <Link to="/admin/center/merchants" className="hover:text-white">
            Merchants
          </Link>
          <span aria-hidden>/</span>
          <span className="text-gray-400 truncate max-w-[16rem]">
            {loading ? '…' : (account?.name || 'Account')}
          </span>
        </nav>
        {loading && (
          <div className="flex items-center gap-2 text-cb-caption text-gray-500 py-4">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading account…
          </div>
        )}
        {!loading && error && (
          <div>
            <h1 className="font-display text-cb-display text-white">Account not found</h1>
            <p className="text-cb-body text-cb-danger mt-2 border-l-2 border-cb-danger pl-3">{error}</p>
            <Link
              to="/admin/center/merchants"
              className="inline-flex items-center gap-1.5 text-cb-caption text-cb-accent mt-3 hover:underline"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Back to Merchants
            </Link>
          </div>
        )}
        {!loading && account && (
          <>
            <div className="flex flex-wrap items-baseline gap-2">
              <h1 className="font-display text-cb-display text-white">{account.name}</h1>
              {statusLabel && (
                <span className={`text-cb-caption ${statusChipClass(data.status)}`}>{statusLabel}</span>
              )}
            </div>
            {account.hubspotCompanyId && (
              <p className="text-cb-caption font-mono text-gray-600 mt-1">
                HubSpot company {account.hubspotCompanyId}
              </p>
            )}
            {account.domain && (
              <p className="text-cb-caption text-gray-500 mt-0.5">{account.domain}</p>
            )}
          </>
        )}
      </div>

      {!loading && account && (
        <>
          {rowError && (
            <p className="text-cb-caption text-cb-danger border-l-2 border-cb-danger pl-3">{rowError}</p>
          )}

          <div className="flex flex-wrap gap-x-4 gap-y-1 text-cb-caption text-gray-400 border-b border-cb-border pb-4">
            <span>{data.dealCount || 0} deal{(data.dealCount || 0) === 1 ? '' : 's'}</span>
            <span>{data.locationCount || 0} location{(data.locationCount || 0) === 1 ? '' : 's'}</span>
            <span>{midCounts.live || 0} live MIDs</span>
            <span>{midCounts.pending || 0} pending</span>
            {(midCounts.error || 0) > 0 && (
              <span className="text-cb-danger">{midCounts.error} error</span>
            )}
          </div>

          <section>
            <h2 className="font-display text-cb-title text-white mb-3">Deals</h2>
            {(!data.deals || data.deals.length === 0) && (
              <p className="text-cb-caption text-gray-500">No deals linked to this account yet.</p>
            )}
            <ul className="space-y-2">
              {(data.deals || []).map((d) => {
                const dealId = String(d.corporateId || '');
                const name = d.legalName || d.dbaName || dealId;
                const handoff = d.handoffStage
                  ? (HANDOFF_STAGE_LABELS[d.handoffStage] || d.handoffStage)
                  : null;
                return (
                  <li
                    key={dealId || d.id}
                    className="bg-cb-surface border border-cb-border rounded-cb px-4 py-3"
                  >
                    <div className="flex flex-wrap items-start gap-3 justify-between">
                      <div className="min-w-0">
                        <p className="text-cb-body font-semibold text-white">{name}</p>
                        <p className="text-cb-caption text-gray-500 mt-0.5">
                          {dealRefLabel(dealId)}{' '}
                          <span className="font-mono text-gray-400">{dealId}</span>
                          {d.applicationStatus ? ` · ${d.applicationStatus}` : ''}
                          {handoff ? ` · ${handoff}` : ''}
                          {d.pricingTier ? ` · ${d.pricingTier}` : ''}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {DESTINATIONS.map(({ id, label, icon: Icon, title }) => {
                          const key = `${dealId}:${id}`;
                          const busy = busyKey === key;
                          return (
                            <button
                              key={id}
                              type="button"
                              title={title}
                              disabled={!!busyKey || !dealId}
                              onClick={() => openImpersonate(dealId, id)}
                              className="inline-flex items-center gap-1.5 text-cb-caption font-medium px-2.5 py-1.5 rounded-cb border border-cb-border text-gray-300 hover:text-white hover:border-cb-border-strong disabled:opacity-40"
                            >
                              {busy ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <Icon className="w-3.5 h-3.5" />
                              )}
                              {label}
                            </button>
                          );
                        })}
                        <Link
                          to={`/admin/applications?jump=${encodeURIComponent(dealId)}`}
                          className="inline-flex items-center gap-1.5 text-cb-caption font-medium px-2.5 py-1.5 rounded-cb border border-cb-border text-gray-300 hover:text-white"
                        >
                          Applications
                        </Link>
                        <Link
                          to={`/admin/applications/${encodeURIComponent(dealId)}`}
                          className="inline-flex items-center gap-1.5 text-cb-caption font-semibold px-2.5 py-1.5 rounded-cb bg-cb-accent text-cb-bg hover:opacity-90"
                        >
                          <FolderOpen className="w-3.5 h-3.5" />
                          Deal Room
                        </Link>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>

          <section>
            <h2 className="font-display text-cb-title text-white mb-3">Legal entities</h2>
            {(!account.legalEntities || account.legalEntities.length === 0) && (
              <p className="text-cb-caption text-gray-500">
                No legal entities on this account yet (edited in the portal / Applications).
              </p>
            )}
            <ul className="space-y-2">
              {(account.legalEntities || []).map((le) => (
                <li
                  key={le.entityId || le.federalEIN || le.legalBusinessName}
                  className="bg-cb-surface-raised border border-cb-border rounded-cb px-4 py-3"
                >
                  <p className="text-cb-body text-white">
                    {le.legalBusinessName || 'Unnamed entity'}
                  </p>
                  <p className="text-cb-caption text-gray-500 mt-0.5">
                    {le.federalEIN ? `EIN ${le.federalEIN}` : 'No EIN'}
                    {le.ownershipType ? ` · ${le.ownershipType}` : ''}
                    {le.taxClassType ? ` · ${le.taxClassType}` : ''}
                  </p>
                </li>
              ))}
            </ul>
          </section>

          <section>
            <h2 className="font-display text-cb-title text-white mb-3">Processing accounts</h2>
            {(!data.mids || data.mids.length === 0) && (
              <p className="text-cb-caption text-gray-500">No MIDs yet.</p>
            )}
            <ul className="space-y-2">
              {(data.mids || []).map((m) => (
                <li
                  key={m.id}
                  className="bg-cb-surface-raised border border-cb-border rounded-cb px-4 py-3 flex flex-wrap gap-2 items-start justify-between"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${midStatusDot(m.applicationStepStatus)}`} />
                      <p className="text-cb-body text-white truncate">
                        {m.dbaName || m.locationName || 'MID'}
                      </p>
                    </div>
                    <p className="text-cb-caption text-gray-500 mt-0.5">
                      {m.applicationStepStatus || 'Unknown'}
                      {m.locationName ? ` · ${m.locationName}` : ''}
                      {m.mccCode ? ` · MCC ${m.mccCode}` : ''}
                      {m.mccHelpRequested ? ' · needs MCC help' : ''}
                      {m.elavonMID ? ` · Elavon ${m.elavonMID}` : ''}
                    </p>
                    <p className="text-cb-caption font-mono text-gray-600 mt-0.5">
                      {dealRefLabel(m.corporateId)} {m.corporateId}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}
