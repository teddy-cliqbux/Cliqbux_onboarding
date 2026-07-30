/**
 * Admin Merchant Center home — /admin/center
 * Portfolio of MerchantAccounts (company parents). Deal desk is a linked tool.
 */
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Building2, ChevronRight, FolderOpen, Loader2, Search,
} from 'lucide-react';
import { base44 } from '@/api/base44Client';
import {
  ACCOUNT_STATUS_LABELS,
} from '@/lib/merchantAccountStatus';

const inputCls =
  'w-full bg-cb-bg border border-cb-border rounded-cb px-3.5 py-2.5 text-cb-body text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-cb-accent';

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'live', label: 'Live' },
  { id: 'onboarding', label: 'Onboarding' },
  { id: 'needs_attention', label: 'Needs attention' },
  { id: 'prospect', label: 'Prospect' },
  { id: 'unlinked', label: 'Unlinked deals' },
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

function formatActivity(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      month: 'short', day: 'numeric', year: 'numeric',
    });
  } catch {
    return '—';
  }
}

export default function AdminMerchantPortfolio() {
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [accounts, setAccounts] = useState([]);
  const [total, setTotal] = useState(0);
  const [truncated, setTruncated] = useState(false);
  const [unlinked, setUnlinked] = useState([]);
  const [page, setPage] = useState(1);
  const pageSize = 50;

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(search.trim()), 250);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [filter, debouncedQ]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      if (filter === 'unlinked') {
        const res = await base44.functions.invoke('manageMerchantAccount', {
          action: 'listUnlinkedDeals',
        });
        if (res.data?.error) throw new Error(res.data.error);
        setUnlinked(res.data?.deals || []);
        setAccounts([]);
        setTotal((res.data?.deals || []).length);
        setTruncated(!!res.data?.truncated);
      } else {
        const res = await base44.functions.invoke('manageMerchantAccount', {
          action: 'list',
          q: debouncedQ || undefined,
          status: filter === 'all' ? undefined : filter,
          page,
          pageSize,
        });
        if (res.data?.error) throw new Error(res.data.error);
        setAccounts(res.data?.accounts || []);
        setTotal(Number(res.data?.total) || 0);
        setTruncated(!!res.data?.truncated);
        setUnlinked([]);
      }
    } catch (err) {
      console.error('[AdminMerchantPortfolio]', err);
      setError(err?.message || 'Could not load merchant accounts. Sign in as a Cliqbux admin and try again.');
      setAccounts([]);
      setUnlinked([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [filter, debouncedQ, page, pageSize]);

  useEffect(() => {
    load();
  }, [load]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="min-h-screen bg-cb-bg text-white">
      <header className="border-b border-cb-border bg-cb-surface">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-5 flex flex-wrap items-start gap-4">
          <div className="flex-1 min-w-0">
            <p className="text-cb-caption text-gray-500 mb-0.5">Admin</p>
            <h1 className="font-display text-cb-display text-white">Merchant Center</h1>
            <p className="text-cb-body-lg text-gray-400 mt-1 max-w-xl">
              All merchant accounts (companies). Open an account for deals, locations, and processing.
              Applications desk stays the deal pipeline tool.
            </p>
          </div>
          <Link
            to="/admin/applications"
            className="text-cb-caption font-semibold px-3 py-2 rounded-cb border border-cb-border text-gray-300 hover:text-white hover:border-cb-border-strong"
          >
            Applications desk
          </Link>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input
            className={`${inputCls} pl-10`}
            placeholder="Search company, domain, HubSpot company id, or Deal ID…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search merchant accounts"
            disabled={filter === 'unlinked'}
          />
        </div>

        <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Status filter">
          {FILTERS.map((f) => {
            const active = filter === f.id;
            return (
              <button
                key={f.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setFilter(f.id)}
                className={`text-cb-caption font-medium px-3 py-1.5 rounded-cb border transition-colors ${
                  active
                    ? 'bg-cb-accent-muted border-cb-accent text-cb-accent'
                    : 'border-cb-border text-gray-400 hover:text-white hover:border-cb-border-strong'
                }`}
              >
                {f.label}
              </button>
            );
          })}
        </div>

        {error && (
          <p className="text-cb-caption text-cb-danger border-l-2 border-cb-danger pl-3">{error}</p>
        )}
        {truncated && !error && (
          <p className="text-cb-caption text-gray-500">
            Showing a capped snapshot — refine search if a merchant is missing. Excel import will fill gaps later.
          </p>
        )}

        {loading && (
          <div className="flex items-center gap-2 text-cb-caption text-gray-500 py-12 justify-center">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading…
          </div>
        )}

        {!loading && filter === 'unlinked' && unlinked.length === 0 && (
          <div className="bg-cb-surface border border-cb-border rounded-cb p-6 text-center">
            <p className="text-cb-body text-gray-400">No unlinked deals.</p>
            <p className="text-cb-caption text-gray-600 mt-2">
              Every deal profile is linked to a Merchant Account.
            </p>
          </div>
        )}

        {!loading && filter !== 'unlinked' && accounts.length === 0 && (
          <div className="bg-cb-surface border border-cb-border rounded-cb p-6 text-center">
            <p className="text-cb-body text-gray-400">
              {debouncedQ ? 'No accounts match that search.' : 'No merchant accounts yet.'}
            </p>
            <p className="text-cb-caption text-gray-600 mt-2">
              Accounts appear when Quick Stage or HubSpot create links them. Excel import will fill the rest later.
            </p>
            <Link
              to="/admin/applications"
              className="inline-block mt-4 text-cb-caption font-semibold text-cb-accent hover:underline"
            >
              Open Applications desk
            </Link>
          </div>
        )}

        {!loading && filter === 'unlinked' && unlinked.length > 0 && (
          <ul className="space-y-2">
            {unlinked.map((d) => {
              const dealId = String(d.corporateId || '');
              const name = d.legalName || d.dbaName || dealId;
              return (
                <li
                  key={dealId || d.id}
                  className="bg-cb-surface border border-cb-border rounded-cb px-4 py-3"
                >
                  <div className="flex flex-wrap items-start gap-3 justify-between">
                    <div className="min-w-0">
                      <p className="text-cb-body font-semibold text-white truncate">{name}</p>
                      <p className="text-cb-caption text-gray-500 mt-0.5">
                        Deal ID <span className="font-mono text-gray-400">{dealId}</span>
                        {d.applicationStatus ? ` · ${d.applicationStatus}` : ''}
                      </p>
                      <p className="text-cb-caption text-gray-600 mt-1">
                        Not linked to a Merchant Account yet — do not invent a parent from this Deal ID.
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
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
        )}

        {!loading && filter !== 'unlinked' && accounts.length > 0 && (
          <>
            <p className="text-cb-caption text-gray-500">
              {total} account{total === 1 ? '' : 's'}
              {totalPages > 1 ? ` · page ${page} of ${totalPages}` : ''}
            </p>
            <ul className="space-y-2">
              {accounts.map((a) => {
                const statusLabel = ACCOUNT_STATUS_LABELS[a.status] || a.status;
                const mc = a.midCounts || {};
                return (
                  <li key={a.id}>
                    <Link
                      to={`/admin/center/accounts/${encodeURIComponent(a.id)}`}
                      className="flex flex-wrap items-center gap-3 justify-between bg-cb-surface border border-cb-border rounded-cb px-4 py-3 hover:border-cb-border-strong transition-colors"
                    >
                      <div className="min-w-0 flex-1 flex items-start gap-2">
                        <Building2 className="w-4 h-4 text-gray-500 flex-shrink-0 mt-0.5" />
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-cb-body font-semibold text-white truncate">{a.name}</p>
                            <span className={`text-cb-caption ${statusChipClass(a.status)}`}>
                              {statusLabel}
                            </span>
                          </div>
                          <p className="text-cb-caption text-gray-500 mt-0.5">
                            {a.dealCount || 0} deal{(a.dealCount || 0) === 1 ? '' : 's'}
                            {' · '}
                            {a.locationCount || 0} location{(a.locationCount || 0) === 1 ? '' : 's'}
                            {' · '}
                            {mc.live || 0} live / {mc.pending || 0} pending
                            {mc.error ? ` / ${mc.error} error` : ''}
                            {' · '}
                            Updated {formatActivity(a.lastActivity)}
                          </p>
                          {a.hubspotCompanyId && (
                            <p className="text-cb-caption font-mono text-gray-600 mt-0.5">
                              HubSpot company {a.hubspotCompanyId}
                            </p>
                          )}
                        </div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-gray-600 flex-shrink-0" />
                    </Link>
                  </li>
                );
              })}
            </ul>
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-2 pt-2">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="text-cb-caption px-3 py-1.5 rounded-cb border border-cb-border text-gray-300 disabled:opacity-40"
                >
                  Previous
                </button>
                <button
                  type="button"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                  className="text-cb-caption px-3 py-1.5 rounded-cb border border-cb-border text-gray-300 disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
