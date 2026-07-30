/**
 * Admin Merchant Center dashboard — /admin/center
 * Same structure as merchant Setup: hero card, status strip, two-column launch + attention.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle, Building2, ClipboardList, Link2, Loader2, RefreshCw, Wrench,
} from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { ACCOUNT_STATUS_LABELS } from '@/lib/merchantAccountStatus';
import SetupStatusCard from '@/components/merchant-center/SetupStatusCard';

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
    for (const a of accounts) {
      if (a.status === 'live') live += 1;
      else if (a.status === 'onboarding') onboarding += 1;
      else if (a.status === 'needs_attention') needs_attention += 1;
    }
    return {
      total: accounts.length,
      live,
      onboarding,
      needs_attention,
      unlinked: unlinkedCount,
    };
  }, [accounts, unlinkedCount]);

  const attentionPreview = useMemo(
    () => accounts.filter((a) => a.status === 'needs_attention').slice(0, 5),
    [accounts],
  );

  const statusCards = [
    {
      id: 'attention',
      title: 'Needs attention',
      value: String(counts.needs_attention),
      caption: counts.needs_attention === 1 ? 'Account flagged' : 'Accounts flagged',
      to: '/admin/center/attention',
      icon: AlertTriangle,
    },
    {
      id: 'live',
      title: 'Live',
      value: String(counts.live),
      caption: 'Active processing accounts',
      to: '/admin/center/merchants?status=live',
      icon: Building2,
    },
    {
      id: 'onboarding',
      title: 'Onboarding',
      value: String(counts.onboarding),
      caption: 'Deals still in flight',
      to: '/admin/center/merchants?status=onboarding',
      icon: ClipboardList,
    },
    {
      id: 'unlinked',
      title: 'Unlinked deals',
      value: String(counts.unlinked),
      caption: 'No Merchant Account yet',
      to: '/admin/center/unlinked',
      icon: Link2,
    },
  ];

  const launchCards = [
    {
      to: '/admin/center/merchants',
      title: 'Merchants',
      body: 'Browse company accounts, deals, and processing status.',
      icon: Building2,
      cta: 'Open portfolio',
    },
    {
      to: '/admin/applications',
      title: 'Onboarding desk',
      body: 'Prep, nudge, and unstick deal applications.',
      icon: ClipboardList,
      cta: 'Open Applications',
    },
    {
      to: '/admin/center/installations',
      title: 'Installations',
      body: 'Jump into Deal Room runbooks for go-live work.',
      icon: Wrench,
      cta: 'Open installations',
    },
    {
      to: '/admin/center/sync-msp',
      title: 'Sync MSPWare',
      body: 'Pull approved MIDs into Merchant Center accounts.',
      icon: RefreshCw,
      cta: 'Sync portfolio',
    },
  ];

  if (loading) {
    return (
      <div className="space-y-4" aria-busy="true" aria-label="Loading dashboard">
        <div className="skeleton h-20 w-full !rounded-cb" />
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="skeleton h-[5.5rem] w-full !rounded-cb" />
          ))}
        </div>
        <div className="skeleton h-48 w-full !rounded-cb" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-cb-surface-raised rounded-cb border border-cb-border px-4 py-3">
        <p className="text-cb-caption uppercase text-gray-500">Merchant Center</p>
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 mt-0.5">
          <h1 className="font-display text-cb-title text-white">Portfolio dashboard</h1>
          <p className="text-cb-caption normal-case tracking-normal text-gray-400">
            {counts.total} account{counts.total === 1 ? '' : 's'}
          </p>
        </div>
      </div>

      {error && (
        <p className="text-cb-caption text-cb-danger border-l-2 border-cb-danger pl-3 bg-cb-surface rounded-cb py-3 pr-3">
          {error}
        </p>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        {statusCards.map((card) => {
          const Icon = card.icon;
          return (
            <Link key={card.id} to={card.to} className="block hover:opacity-95 transition-opacity">
              <SetupStatusCard
                title={card.title}
                value={card.value}
                caption={card.caption}
                icon={<Icon className="w-4 h-4" strokeWidth={2} />}
              />
            </Link>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-7 flex flex-col gap-4">
          {launchCards.map(({ to, title, body, icon: Icon, cta }) => (
            <Link
              key={to}
              to={to}
              className="bg-cb-surface-raised rounded-cb border border-cb-border border-l-2 border-l-cb-accent p-5 hover:border-cb-border-strong transition-colors"
            >
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 w-9 h-9 rounded-cb bg-cb-accent-muted flex items-center justify-center text-cb-accent">
                  <Icon className="w-4 h-4" strokeWidth={2} />
                </div>
                <div className="min-w-0 flex-1">
                  <h2 className="text-cb-body font-semibold text-white">{title}</h2>
                  <p className="text-cb-caption normal-case tracking-normal font-normal text-gray-500 mt-1">
                    {body}
                  </p>
                  <span className="inline-block mt-3 text-cb-caption font-semibold text-cb-accent">
                    {cta} →
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </div>

        <div className="lg:col-span-5 flex flex-col gap-4">
          <div className="bg-cb-surface-raised rounded-cb border border-cb-border p-5 flex-1">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <h2 className="text-cb-body font-semibold text-white">Needs attention</h2>
              <Link
                to="/admin/center/attention"
                className="text-cb-caption font-semibold text-cb-accent hover:opacity-90"
              >
                View all
              </Link>
            </div>
            {attentionPreview.length === 0 ? (
              <p className="text-cb-caption normal-case tracking-normal text-gray-500 py-4">
                Nothing flagged — no Error MIDs or MCC-help requests in this snapshot.
              </p>
            ) : (
              <ul className="space-y-2">
                {attentionPreview.map((a) => (
                  <li key={a.id}>
                    <Link
                      to={`/admin/center/accounts/${encodeURIComponent(a.id)}`}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-cb border border-cb-border bg-cb-surface px-3 py-2.5 hover:border-cb-border-strong"
                    >
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
                      <span className="text-cb-caption text-cb-accent shrink-0">Open</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="bg-cb-surface-raised rounded-cb border border-cb-border p-5">
            <p className="text-cb-caption uppercase text-gray-500 mb-1">Quick sync</p>
            <h3 className="text-cb-body font-semibold text-white">MSPWare portfolio</h3>
            <p className="text-cb-caption normal-case tracking-normal text-gray-500 mt-1">
              Pull approved Elavon MIDs into Merchant Accounts — dry run first, no HubSpot writes.
            </p>
            <Link
              to="/admin/center/sync-msp"
              className="mt-4 inline-flex w-full items-center justify-center rounded-cb bg-cb-accent text-cb-bg text-cb-caption font-semibold px-4 py-2.5 hover:opacity-90"
            >
              Sync from MSPWare
            </Link>
          </div>
        </div>
      </div>

      <div className="text-center pt-2 pb-2">
        <p className="text-cb-caption normal-case tracking-normal font-normal text-gray-600">
          Secured by <span className="text-cb-accent font-medium">Cliqbux</span>
          {' · '}
          Admin Merchant Center
          {' · '}
          {new Date().getFullYear()}
        </p>
      </div>
    </div>
  );
}
