/**
 * Admin Merchant Center — portfolio list views (inside shell).
 * Modes via prop or route: all | live | onboarding | prospect | needs_attention | unlinked
 */
import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  Building2, ChevronRight, FolderOpen, Loader2,
} from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { ACCOUNT_STATUS_LABELS } from '@/lib/merchantAccountStatus';

const MERCHANT_FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'live', label: 'Live' },
  { id: 'onboarding', label: 'Onboarding' },
  { id: 'needs_attention', label: 'Needs attention' },
  { id: 'prospect', label: 'Prospect' },
];

const TITLES = {
  all: { title: 'Merchants', subtitle: 'Company accounts (Merchant Account parents).' },
  live: { title: 'Live', subtitle: 'Accounts with at least one active processing MID.' },
  onboarding: { title: 'Onboarding', subtitle: 'Accounts with deals still in flight.' },
  prospect: { title: 'Prospects', subtitle: 'Accounts not yet live or in active onboarding.' },
  needs_attention: { title: 'Needs attention', subtitle: 'Error MIDs, MCC help, or related flags.' },
  unlinked: {
    title: 'Unlinked deals',
    subtitle: 'Deal profiles without a Merchant Account — Deal ID is not a company parent.',
  },
};

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

/**
 * @param {{ mode?: 'all'|'live'|'onboarding'|'prospect'|'needs_attention'|'unlinked' }} props
 */
export default function AdminMerchantPortfolio({ mode: modeProp = 'all' }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const urlStatus = searchParams.get('status');
  const urlQ = searchParams.get('q') || '';

  const lockedMode = modeProp !== 'all' ? modeProp : null;
  const [pillFilter, setPillFilter] = useState(
    () => (modeProp === 'all' && urlStatus) || 'all',
  );

  useEffect(() => {
    if (lockedMode) return;
    if (urlStatus && MERCHANT_FILTERS.some((f) => f.id === urlStatus)) {
      setPillFilter(urlStatus);
    }
  }, [urlStatus, lockedMode]);

  const filter = lockedMode || pillFilter;
  const isUnlinked = filter === 'unlinked';

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [accounts, setAccounts] = useState([]);
  const [total, setTotal] = useState(0);
  const [truncated, setTruncated] = useState(false);
  const [unlinked, setUnlinked] = useState([]);
  const [page, setPage] = useState(1);
  const pageSize = 50;

  useEffect(() => {
    setPage(1);
  }, [filter, urlQ]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      if (isUnlinked) {
        const res = await base44.functions.invoke('manageMerchantAccount', {
          action: 'listUnlinkedDeals',
        });
        if (res.data?.error) throw new Error(res.data.error);
        let deals = res.data?.deals || [];
        const q = urlQ.trim().toLowerCase();
        if (q) {
          deals = deals.filter((d) => {
            const hay = [d.legalName, d.dbaName, d.corporateId]
              .map((x) => String(x || '').toLowerCase())
              .join(' ');
            return hay.includes(q);
          });
        }
        setUnlinked(deals);
        setAccounts([]);
        setTotal(deals.length);
        setTruncated(!!res.data?.truncated);
      } else {
        const res = await base44.functions.invoke('manageMerchantAccount', {
          action: 'list',
          q: urlQ.trim() || undefined,
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
  }, [filter, isUnlinked, urlQ, page, pageSize]);

  useEffect(() => {
    load();
  }, [load]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const meta = TITLES[filter] || TITLES.all;

  const onPill = (id) => {
    setPillFilter(id);
    const next = new URLSearchParams(searchParams);
    if (id === 'all') next.delete('status');
    else next.set('status', id);
    setSearchParams(next, { replace: true });
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-cb-display text-white">{meta.title}</h1>
        <p className="text-cb-body-lg text-gray-400 mt-1 max-w-2xl">{meta.subtitle}</p>
        {urlQ && (
          <p className="text-cb-caption text-gray-500 mt-2">
            Search: <span className="text-gray-300">{urlQ}</span>
            {' · '}
            <button
              type="button"
              className="text-cb-accent hover:underline"
              onClick={() => {
                const next = new URLSearchParams(searchParams);
                next.delete('q');
                setSearchParams(next, { replace: true });
              }}
            >
              Clear
            </button>
          </p>
        )}
      </div>

      {!lockedMode && (
        <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Status filter">
          {MERCHANT_FILTERS.map((f) => {
            const active = pillFilter === f.id;
            return (
              <button
                key={f.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => onPill(f.id)}
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
      )}

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

      {!loading && isUnlinked && unlinked.length === 0 && (
        <div className="bg-cb-surface border border-cb-border rounded-cb p-6 text-center">
          <p className="text-cb-body text-gray-400">
            {urlQ ? 'No unlinked deals match that search.' : 'No unlinked deals.'}
          </p>
          <p className="text-cb-caption text-gray-600 mt-2">
            Every deal profile is linked to a Merchant Account.
          </p>
        </div>
      )}

      {!loading && !isUnlinked && accounts.length === 0 && (
        <div className="bg-cb-surface border border-cb-border rounded-cb p-6 text-center">
          <p className="text-cb-body text-gray-400">
            {urlQ ? 'No accounts match that search.' : 'No merchant accounts in this view.'}
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

      {!loading && isUnlinked && unlinked.length > 0 && (
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
                      Underwriting Room
                    </Link>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {!loading && !isUnlinked && accounts.length > 0 && (
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
    </div>
  );
}
