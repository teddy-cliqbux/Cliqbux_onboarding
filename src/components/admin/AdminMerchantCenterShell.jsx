/**
 * Admin Merchant Center shell — sidebar + top bar + Outlet.
 * Wraps /admin/center/* only (Applications stays a linked destination).
 */
import { useState } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  AlertTriangle, Building2, ChevronLeft, ChevronRight, ClipboardList,
  FolderKanban, LayoutDashboard, Link2, Loader2, RefreshCw, Search, UserPlus, Users,
  Wrench,
} from 'lucide-react';
import { base44 } from '@/api/base44Client';

const inputCls =
  'w-full bg-cb-bg border border-cb-border rounded-cb px-3.5 py-2 text-cb-body text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-cb-accent';

const PORTFOLIO_NAV = [
  { to: '/admin/center', end: true, label: 'Dashboard', icon: LayoutDashboard },
  { to: '/admin/center/merchants', label: 'Merchants', icon: Building2 },
  { to: '/admin/center/prospects', label: 'Prospects', icon: Users },
  { to: '/admin/center/attention', label: 'Needs attention', icon: AlertTriangle },
  { to: '/admin/center/unlinked', label: 'Unlinked deals', icon: Link2 },
];

const WORK_NAV = [
  { to: '/admin/center/installations', label: 'Installations', icon: Wrench },
  { to: '/admin/center/sync-msp', label: 'Sync MSPWare', icon: RefreshCw },
  { to: '/admin/center/team', label: 'Team', icon: UserPlus },
];

function navClass({ isActive }, collapsed) {
  const base = collapsed
    ? 'flex items-center justify-center w-10 h-10 rounded-cb transition-colors'
    : 'flex items-center gap-2.5 px-3 py-2 rounded-cb text-cb-caption font-medium transition-colors';
  if (isActive) {
    return `${base} bg-cb-accent-muted text-cb-accent`;
  }
  return `${base} text-gray-400 hover:text-white hover:bg-cb-surface-raised`;
}

export default function AdminMerchantCenterShell() {
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false);
  const [q, setQ] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');

  const runSearch = async (e) => {
    e?.preventDefault?.();
    const query = q.trim();
    if (!query) return;
    setSearching(true);
    setSearchError('');
    try {
      const [listRes, unlinkedRes] = await Promise.all([
        base44.functions.invoke('manageMerchantAccount', {
          action: 'list',
          q: query,
          page: 1,
          pageSize: 10,
        }),
        base44.functions.invoke('manageMerchantAccount', {
          action: 'listUnlinkedDeals',
        }),
      ]);
      if (listRes.data?.error) throw new Error(listRes.data.error);
      if (unlinkedRes.data?.error) throw new Error(unlinkedRes.data.error);

      const accounts = listRes.data?.accounts || [];
      const unlinked = (unlinkedRes.data?.deals || []).filter((d) => {
        const hay = [
          d.legalName, d.dbaName, d.corporateId,
        ].map((x) => String(x || '').toLowerCase()).join(' ');
        return hay.includes(query.toLowerCase());
      });

      const qLower = query.toLowerCase();
      const exactUnlinked = unlinked.find(
        (d) => String(d.corporateId || '').toLowerCase() === qLower,
      );
      if (exactUnlinked) {
        navigate(`/admin/center/unlinked?q=${encodeURIComponent(query)}`);
        return;
      }
      if (accounts.length === 1) {
        navigate(`/admin/center/accounts/${encodeURIComponent(accounts[0].id)}`);
        return;
      }
      if (accounts.length > 1) {
        navigate(`/admin/center/merchants?q=${encodeURIComponent(query)}`);
        return;
      }
      if (unlinked.length === 1) {
        navigate(`/admin/center/unlinked?q=${encodeURIComponent(query)}`);
        return;
      }
      if (unlinked.length > 1) {
        navigate(`/admin/center/unlinked?q=${encodeURIComponent(query)}`);
        return;
      }
      navigate(`/admin/center/merchants?q=${encodeURIComponent(query)}`);
    } catch (err) {
      console.error('[AdminMerchantCenterShell search]', err);
      setSearchError(err?.message || 'Search failed');
    } finally {
      setSearching(false);
    }
  };

  return (
    <div className="min-h-screen bg-cb-bg text-white flex">
      <aside
        className={`flex-shrink-0 border-r border-cb-border bg-cb-surface flex flex-col transition-[width] ${
          collapsed ? 'w-[4.25rem]' : 'w-60'
        }`}
      >
        <div className={`border-b border-cb-border ${collapsed ? 'px-2 py-4' : 'px-4 py-4'}`}>
          {collapsed ? (
            <p className="text-cb-caption font-semibold text-cb-accent text-center">CB</p>
          ) : (
            <>
              <p className="text-cb-caption text-gray-500">Admin</p>
              <p className="font-display text-cb-title text-white mt-0.5">Merchant Center</p>
            </>
          )}
        </div>

        <nav className={`flex-1 overflow-y-auto py-3 space-y-4 ${collapsed ? 'px-2' : 'px-3'}`}>
          <div>
            {!collapsed && (
              <p className="text-cb-caption text-gray-600 uppercase tracking-wide px-3 mb-1.5">
                Portfolio
              </p>
            )}
            <ul className="space-y-0.5">
              {PORTFOLIO_NAV.map(({ to, end, label, icon: Icon }) => (
                <li key={to}>
                  <NavLink to={to} end={!!end} title={label} className={(s) => navClass(s, collapsed)}>
                    <Icon className="w-4 h-4 flex-shrink-0" />
                    {!collapsed && <span>{label}</span>}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>

          <div>
            {!collapsed && (
              <p className="text-cb-caption text-gray-600 uppercase tracking-wide px-3 mb-1.5">
                Work
              </p>
            )}
            <ul className="space-y-0.5">
              <li>
                <a
                  href="/admin/applications"
                  title="Onboarding — Applications desk"
                  className={navClass({ isActive: false }, collapsed)}
                  onClick={(e) => {
                    e.preventDefault();
                    navigate('/admin/applications');
                  }}
                >
                  <ClipboardList className="w-4 h-4 flex-shrink-0" />
                  {!collapsed && <span>Onboarding</span>}
                </a>
              </li>
              {WORK_NAV.map(({ to, label, icon: Icon }) => (
                <li key={to}>
                  <NavLink to={to} title={label} className={(s) => navClass(s, collapsed)}>
                    <Icon className="w-4 h-4 flex-shrink-0" />
                    {!collapsed && <span>{label}</span>}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        </nav>

        <div className={`border-t border-cb-border py-2 ${collapsed ? 'px-2' : 'px-3'}`}>
          <button
            type="button"
            onClick={() => setCollapsed((c) => !c)}
            className={navClass({ isActive: false }, collapsed)}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? (
              <ChevronRight className="w-4 h-4" />
            ) : (
              <>
                <ChevronLeft className="w-4 h-4" />
                <span>Collapse</span>
              </>
            )}
          </button>
        </div>
      </aside>

      <div className="flex-1 min-w-0 flex flex-col">
        <header className="flex-shrink-0 border-b border-cb-border bg-cb-surface px-4 sm:px-6 py-3 flex flex-wrap items-center gap-3">
          <form onSubmit={runSearch} className="relative flex-1 min-w-[12rem] max-w-xl">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            <input
              className={`${inputCls} pl-10 pr-10`}
              placeholder="Search company, domain, HubSpot company id, or Deal ID…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              aria-label="Global merchant search"
            />
            {searching && (
              <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-gray-500" />
            )}
          </form>
          <Link
            to="/admin/applications"
            className="inline-flex items-center gap-1.5 text-cb-caption font-semibold px-3 py-2 rounded-cb border border-cb-border text-gray-300 hover:text-white hover:border-cb-border-strong flex-shrink-0"
          >
            <FolderKanban className="w-3.5 h-3.5" />
            Applications desk
          </Link>
        </header>
        {searchError && (
          <p className="px-6 py-2 text-cb-caption text-cb-danger border-b border-cb-border">
            {searchError}
          </p>
        )}
        <div className="flex-1 min-h-0 overflow-y-auto">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
