/**
 * Admin Merchant Center dashboard — /admin/center
 * KPI counts + launch tiles + needs-attention preview (no charts).
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle, Building2, ClipboardList, Link2, Loader2, Wrench,
} from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { ACCOUNT_STATUS_LABELS } from '@/lib/merchantAccountStatus';

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

export default function AdminMerchantDashboard() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [accounts, setAccounts] = useState([]);
  const [unlinkedCount, setUnlinkedCount] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [listRes, unlinkedRes] = await Promise.all([
        base44.functions.invoke('manageMerchantAccount', {
          action: 'list',
          page: 1,
          pageSize: 100,
        }),
        base44.functions.invoke('manageMerchantAccount', {
          action: 'listUnlinkedDeals',
        }),
      ]);
      if (listRes.data?.error) throw new Error(listRes.data.error);
      if (unlinkedRes.data?.error) throw new Error(unlinkedRes.data.error);
      setAccounts(listRes.data?.accounts || []);
      setUnlinkedCount((unlinkedRes.data?.deals || []).length);
    } catch (err) {
      console.error('[AdminMerchantDashboard]', err);
      setError(err?.message || 'Could not load dashboard. Sign in as a Cliqbux admin.');
      setAccounts([]);
      setUnlinkedCount(0);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const counts = useMemo(() => {
    let live = 0;
    let onboarding = 0;
    let needs_attention = 0;
    let prospect = 0;
    for (const a of accounts) {
      if (a.status === 'live') live += 1;
      else if (a.status === 'onboarding') onboarding += 1;
      else if (a.status === 'needs_attention') needs_attention += 1;
      else prospect += 1;
    }
    return {
      total: accounts.length,
      live,
      onboarding,
      needs_attention,
      prospect,
      unlinked: unlinkedCount,
    };
  }, [accounts, unlinkedCount]);

  const attentionPreview = useMemo(
    () => accounts.filter((a) => a.status === 'needs_attention').slice(0, 5),
    [accounts],
  );

  const kpis = [
    { label: 'Accounts', value: counts.total, to: '/admin/center/merchants' },
    { label: 'Live', value: counts.live, to: '/admin/center/merchants?status=live' },
    { label: 'Onboarding', value: counts.onboarding, to: '/admin/center/merchants?status=onboarding' },
    { label: 'Needs attention', value: counts.needs_attention, to: '/admin/center/attention' },
    { label: 'Unlinked deals', value: counts.unlinked, to: '/admin/center/unlinked' },
  ];

  const launches = [
    {
      to: '/admin/center/merchants',
      title: 'Merchants',
      body: 'Browse company accounts, deals, and processing status.',
      icon: Building2,
      primary: true,
    },
    {
      to: '/admin/applications',
      title: 'Onboarding desk',
      body: 'Prep, nudge, and unstick deal applications.',
      icon: ClipboardList,
      primary: false,
    },
    {
      to: '/admin/center/installations',
      title: 'Installations',
      body: 'Jump into Deal Room runbooks for go-live work.',
      icon: Wrench,
      primary: false,
    },
    {
      to: '/admin/center/unlinked',
      title: 'Unlinked deals',
      body: 'Deals not yet tied to a Merchant Account.',
      icon: Link2,
      primary: false,
    },
  ];

  return (
    <div className="px-4 sm:px-6 py-6 space-y-8 max-w-6xl">
      <div>
        <h1 className="font-display text-cb-display text-white">Dashboard</h1>
        <p className="text-cb-body-lg text-gray-400 mt-1 max-w-2xl">
          Launch into merchant accounts, onboarding, and installations. Applications desk stays the deal pipeline tool.
        </p>
      </div>

      {error && (
        <p className="text-cb-caption text-cb-danger border-l-2 border-cb-danger pl-3">{error}</p>
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-cb-caption text-gray-500 py-8">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading portfolio…
        </div>
      ) : (
        <>
          <section>
            <h2 className="font-display text-cb-title text-white mb-3">At a glance</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
              {kpis.map((k) => (
                <Link
                  key={k.label}
                  to={k.to}
                  className="bg-cb-surface border border-cb-border rounded-cb px-4 py-3 hover:border-cb-border-strong transition-colors"
                >
                  <p className="text-cb-caption text-gray-500">{k.label}</p>
                  <p className="font-display text-cb-title text-white mt-1 tabular-nums">{k.value}</p>
                </Link>
              ))}
            </div>
          </section>

          <section>
            <h2 className="font-display text-cb-title text-white mb-3">Launch</h2>
            <div className="grid sm:grid-cols-2 gap-2">
              {launches.map(({ to, title, body, icon: Icon, primary }) => (
                <Link
                  key={to}
                  to={to}
                  className={`flex gap-3 rounded-cb border px-4 py-4 transition-colors ${
                    primary
                      ? 'bg-cb-accent text-cb-bg border-cb-accent hover:opacity-90'
                      : 'bg-cb-surface border-cb-border hover:border-cb-border-strong'
                  }`}
                >
                  <Icon className={`w-5 h-5 flex-shrink-0 mt-0.5 ${primary ? 'text-cb-bg' : 'text-gray-500'}`} />
                  <div className="min-w-0">
                    <p className={`text-cb-body font-semibold ${primary ? 'text-cb-bg' : 'text-white'}`}>
                      {title}
                    </p>
                    <p className={`text-cb-caption mt-0.5 ${primary ? 'text-cb-bg/80' : 'text-gray-500'}`}>
                      {body}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          </section>

          <section>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <h2 className="font-display text-cb-title text-white">Needs attention</h2>
              <Link
                to="/admin/center/attention"
                className="text-cb-caption font-semibold text-cb-accent hover:underline"
              >
                View all
              </Link>
            </div>
            {attentionPreview.length === 0 ? (
              <p className="text-cb-caption text-gray-500 border border-cb-border rounded-cb px-4 py-6 bg-cb-surface">
                Nothing flagged — no Error MIDs or MCC-help requests in this snapshot.
              </p>
            ) : (
              <ul className="space-y-2">
                {attentionPreview.map((a) => (
                  <li key={a.id}>
                    <Link
                      to={`/admin/center/accounts/${encodeURIComponent(a.id)}`}
                      className="flex flex-wrap items-center justify-between gap-2 bg-cb-surface border border-cb-border rounded-cb px-4 py-3 hover:border-cb-border-strong"
                    >
                      <div className="min-w-0 flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 text-cb-danger flex-shrink-0" />
                        <div className="min-w-0">
                          <p className="text-cb-body font-semibold text-white truncate">{a.name}</p>
                          <p className="text-cb-caption text-gray-500">
                            <span className={statusChipClass(a.status)}>
                              {ACCOUNT_STATUS_LABELS[a.status] || a.status}
                            </span>
                            {' · '}
                            {a.dealCount || 0} deal{(a.dealCount || 0) === 1 ? '' : 's'}
                          </p>
                        </div>
                      </div>
                      <span className="text-cb-caption text-gray-500">Open account</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}
