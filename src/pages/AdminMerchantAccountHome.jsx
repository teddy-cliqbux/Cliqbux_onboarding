/**
 * Admin Merchant Account home — /admin/center/accounts/:merchantAccountId
 * CoPilot-inspired action-first overview: identity, primary CTA, dense summary,
 * then deals / legal entities / MID snapshot.
 */
import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Copy,
  Eye,
  FolderOpen,
  LayoutDashboard,
  Loader2,
  MapPin,
  UserRound,
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

function flagLabel(value) {
  const v = String(value || 'unknown').toLowerCase();
  if (v === 'compliant') return 'Compliant';
  if (v === 'non_compliant') return 'Non-compliant';
  if (v === 'yes' || v === 'on') return 'Yes';
  if (v === 'no' || v === 'off') return 'No';
  return 'Unknown';
}

function flagClass(value) {
  const v = String(value || 'unknown').toLowerCase();
  if (v === 'yes' || v === 'on' || v === 'compliant') return 'text-cb-success';
  if (v === 'no' || v === 'off' || v === 'non_compliant') return 'text-cb-danger';
  return 'text-gray-500';
}

function CopyButton({ value, label }) {
  const [copied, setCopied] = useState(false);
  if (!value) return null;
  return (
    <button
      type="button"
      title={`Copy ${label}`}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(String(value));
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch (err) {
          console.error('[AdminMerchantAccountHome copy]', err);
        }
      }}
      className="inline-flex items-center gap-1 text-cb-caption text-cb-accent hover:underline"
    >
      <Copy className="w-3 h-3" />
      {copied ? 'Copied' : 'Copy'}
    </button>
  );
}

function SummaryRow({ label, children }) {
  if (children == null || children === '') return null;
  return (
    <div className="grid grid-cols-[7.5rem_1fr] gap-2 py-1.5 border-b border-cb-border last:border-0">
      <dt className="text-cb-caption text-gray-500">{label}</dt>
      <dd className="text-cb-body text-gray-200 min-w-0 break-words">{children}</dd>
    </div>
  );
}

export default function AdminMerchantAccountHome() {
  const { merchantAccountId } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [data, setData] = useState(null);
  const [busyKey, setBusyKey] = useState('');
  const [rowError, setRowError] = useState('');
  const [ctaBusy, setCtaBusy] = useState(false);

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

  const runPrimaryCta = async () => {
    const cta = data?.overview?.primaryCta;
    if (!cta) return;
    setCtaBusy(true);
    setRowError('');
    try {
      if (cta.kind === 'deal_room' && cta.corporateId) {
        navigate(`/admin/applications/${encodeURIComponent(cta.corporateId)}`);
        return;
      }
      if ((cta.kind === 'portal' || cta.kind === 'locations') && cta.corporateId) {
        await openImpersonate(cta.corporateId, cta.destination || cta.kind);
        return;
      }
      if (cta.kind === 'quick_stage' || cta.kind === 'applications') {
        navigate('/admin/applications');
        return;
      }
      if (cta.corporateId) {
        navigate(`/admin/applications/${encodeURIComponent(cta.corporateId)}`);
      } else {
        navigate('/admin/applications');
      }
    } finally {
      setCtaBusy(false);
    }
  };

  const account = data?.account;
  const statusLabel = ACCOUNT_STATUS_LABELS[data?.status] || data?.status;
  const midCounts = data?.midCounts || {};
  const overview = data?.overview;
  const summary = overview?.summary;
  const primaryCta = overview?.primaryCta;
  const bestDeal = overview?.bestDeal;

  const heroCopy = (() => {
    if (!data?.status) return 'Review this merchant account.';
    if (data.status === 'needs_attention') {
      return summary?.attentionReason
        || 'Something needs a fix before this account can move forward.';
    }
    if (data.status === 'onboarding') {
      return 'Continue boarding on the best deal for this company.';
    }
    if (data.status === 'live') {
      return 'Processing is live — open storefronts or jump into a deal.';
    }
    if (data.status === 'prospect' && !bestDeal) {
      return "Let's get this merchant signed up.";
    }
    return 'Open the primary deal for this company.';
  })();

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
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-baseline gap-2">
                <h1 className="font-display text-cb-display text-white">{account.name}</h1>
                {statusLabel && (
                  <span className={`text-cb-caption ${statusChipClass(data.status)}`}>{statusLabel}</span>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2 mt-1 text-cb-caption text-gray-500">
                {account.hubspotCompanyId && (
                  <span className="font-mono text-gray-400">
                    HubSpot {account.hubspotCompanyId}{' '}
                    <CopyButton value={account.hubspotCompanyId} label="HubSpot company id" />
                  </span>
                )}
                {summary?.reportingMid && (
                  <span className="font-mono text-gray-400">
                    MID {summary.reportingMid}{' '}
                    <CopyButton value={summary.reportingMid} label="reporting MID" />
                  </span>
                )}
                {account.domain && <span>{account.domain}</span>}
              </div>
            </div>
            {bestDeal?.corporateId && (
              <Link
                to={`/admin/applications/${encodeURIComponent(bestDeal.corporateId)}`}
                className="inline-flex items-center gap-1.5 text-cb-caption font-medium px-2.5 py-1.5 rounded-cb border border-cb-border text-gray-300 hover:text-white"
              >
                <FolderOpen className="w-3.5 h-3.5" />
                Best deal
              </Link>
            )}
          </div>
        )}
      </div>

      {!loading && account && (
        <>
          {rowError && (
            <p className="text-cb-caption text-cb-danger border-l-2 border-cb-danger pl-3">{rowError}</p>
          )}

          {/* Hero CTA */}
          <section className="bg-cb-surface border border-cb-border rounded-cb px-5 py-6 text-center">
            <p className="text-cb-caption text-gray-500 uppercase tracking-wide">Primary action</p>
            <p className="font-display text-cb-title text-white mt-2 max-w-xl mx-auto">{heroCopy}</p>
            {bestDeal && (
              <p className="text-cb-caption text-gray-500 mt-2">
                Best deal: {bestDeal.legalName || bestDeal.corporateId}
                {bestDeal.handoffStage
                  ? ` · ${HANDOFF_STAGE_LABELS[bestDeal.handoffStage] || bestDeal.handoffStage}`
                  : ''}
                {bestDeal.applicationStatus ? ` · ${bestDeal.applicationStatus}` : ''}
              </p>
            )}
            {primaryCta && (
              <button
                type="button"
                disabled={ctaBusy || !!busyKey}
                onClick={runPrimaryCta}
                className="mt-4 inline-flex items-center justify-center gap-2 text-cb-body font-semibold px-4 py-2.5 rounded-cb bg-cb-accent text-cb-bg hover:opacity-90 disabled:opacity-40"
              >
                {ctaBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                {primaryCta.label}
              </button>
            )}
          </section>

          <div className="flex flex-wrap gap-x-4 gap-y-1 text-cb-caption text-gray-400 border-b border-cb-border pb-4">
            <span>{data.dealCount || 0} deal{(data.dealCount || 0) === 1 ? '' : 's'}</span>
            <span>{data.locationCount || 0} location{(data.locationCount || 0) === 1 ? '' : 's'}</span>
            <span>{midCounts.live || 0} live MIDs</span>
            <span>{midCounts.pending || 0} pending</span>
            {(midCounts.error || 0) > 0 && (
              <span className="text-cb-danger">{midCounts.error} error</span>
            )}
          </div>

          {/* Account summary */}
          <section className="bg-cb-surface border border-cb-border rounded-cb px-4 py-3">
            <h2 className="font-display text-cb-title text-white mb-2">Account summary</h2>
            <dl>
              <SummaryRow label="Contact">
                {[summary?.contactName, summary?.contactEmail].filter(Boolean).join(' · ') || null}
              </SummaryRow>
              <SummaryRow label="Phone">{summary?.phone}</SummaryRow>
              <SummaryRow label="Legal">{summary?.legalName}</SummaryRow>
              <SummaryRow label="Tax ID">
                {summary?.taxIdMasked
                  ? `${summary.taxIdType || 'TIN'} ${summary.taxIdMasked}`
                  : null}
              </SummaryRow>
              <SummaryRow label="Address">{summary?.mailingAddress}</SummaryRow>
              <SummaryRow label="Bank">
                {summary?.bankLast4
                  ? `••••${summary.bankLast4}${summary.bankRoutingLast4 ? ` · routing ••••${summary.bankRoutingLast4}` : ''}`
                  : null}
              </SummaryRow>
              <SummaryRow label="Reporting MID">
                {summary?.reportingMid ? (
                  <span className="inline-flex items-center gap-2 font-mono">
                    {summary.reportingMid}
                    <CopyButton value={summary.reportingMid} label="reporting MID" />
                  </span>
                ) : null}
              </SummaryRow>
              <SummaryRow label="Processing">
                <span className={flagClass(summary?.flags?.processingLive)}>
                  {flagLabel(summary?.flags?.processingLive)}
                </span>
              </SummaryRow>
              <SummaryRow label="PCI">
                <span className={flagClass(summary?.flags?.pci)}>
                  {flagLabel(summary?.flags?.pci)}
                </span>
              </SummaryRow>
              <SummaryRow label="Paperless">
                <span className={flagClass(summary?.flags?.paperlessStatements)}>
                  {flagLabel(summary?.flags?.paperlessStatements)}
                </span>
              </SummaryRow>
              <SummaryRow label="POS enrolled">
                <span className={flagClass(summary?.flags?.posEnrolled)}>
                  {flagLabel(summary?.flags?.posEnrolled)}
                </span>
              </SummaryRow>
            </dl>
          </section>

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
                const isBest = bestDeal && dealId === String(bestDeal.corporateId || '');
                return (
                  <li
                    key={dealId || d.id}
                    className={`bg-cb-surface border rounded-cb px-4 py-3 ${
                      isBest ? 'border-cb-accent' : 'border-cb-border'
                    }`}
                  >
                    <div className="flex flex-wrap items-start gap-3 justify-between">
                      <div className="min-w-0">
                        <p className="text-cb-body font-semibold text-white">
                          {name}
                          {isBest && (
                            <span className="ml-2 text-cb-caption font-normal text-cb-accent">Best</span>
                          )}
                        </p>
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
                          Underwriting Room
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
