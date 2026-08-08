/**
 * Admin Merchant Center shell — matches merchant Setup chrome:
 * portal-bg, fixed sidebar + Cliqbux logo, sticky top bar, max-w main.
 */
import { useState } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  AlertTriangle, Building2, ClipboardList, FolderKanban, LayoutDashboard,
  Link2, Loader2, RefreshCw, Search, Shield, UserPlus, Users, Wrench,
} from 'lucide-react';
import { base44 } from '@/api/base44Client';
import CliqbuxLogo from '@/components/onboarding/CliqbuxLogo';

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

function navLinkClass({ isActive }) {
  return `flex items-center gap-2 px-3 py-2 rounded-cb text-cb-body font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cb-accent ${
    isActive
      ? 'bg-cb-accent-muted text-cb-accent'
      : 'text-gray-400 hover:text-white'
  }`;
}

export default function AdminMerchantCenterShell() {
  const navigate = useNavigate();
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
        const hay = [d.legalName, d.dbaName, d.corporateId]
          .map((x) => String(x || '').toLowerCase())
          .join(' ');
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
      if (accounts.length > 1 || unlinked.length >= 1) {
        navigate(
          accounts.length
            ? `/admin/center/merchants?q=${encodeURIComponent(query)}`
            : `/admin/center/unlinked?q=${encodeURIComponent(query)}`,
        );
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
    <div className="portal-bg min-h-screen flex text-white" style={{ fontFamily: 'Inter, sans-serif' }}>
      <aside
        className="hidden md:flex w-56 flex-col border-r border-cb-border bg-cb-surface fixed inset-y-0 left-0 z-40"
        aria-label="Admin Merchant Center navigation"
      >
        <div className="px-4 py-5 border-b border-cb-border">
          <CliqbuxLogo size="sm" />
          <p className="text-cb-caption text-gray-500 mt-2">Admin · Merchant Center</p>
        </div>
        <nav className="flex-1 px-3 py-4 overflow-y-auto space-y-4" aria-label="Merchant Center">
          <div>
            <p className="text-cb-caption uppercase text-gray-600 px-3 mb-1.5">Portfolio</p>
            <div className="flex flex-col gap-0.5">
              {PORTFOLIO_NAV.map(({ to, end, label, icon: Icon }) => (
                <NavLink key={to} to={to} end={!!end} className={navLinkClass}>
                  <Icon className="w-4 h-4 flex-shrink-0" strokeWidth={2} />
                  {label}
                </NavLink>
              ))}
            </div>
          </div>
          <div>
            <p className="text-cb-caption uppercase text-gray-600 px-3 mb-1.5">Work</p>
            <div className="flex flex-col gap-0.5">
              <button
                type="button"
                onClick={() => navigate('/admin/applications')}
                className={navLinkClass({ isActive: false })}
              >
                <ClipboardList className="w-4 h-4 flex-shrink-0" strokeWidth={2} />
                Onboarding
              </button>
              <button
                type="button"
                onClick={() => navigate('/admin/applications')}
                className={navLinkClass({ isActive: false })}
              >
                <Shield className="w-4 h-4 flex-shrink-0" strokeWidth={2} />
                Underwriting
              </button>
              {WORK_NAV.map(({ to, label, icon: Icon }) => (
                <NavLink key={to} to={to} className={navLinkClass}>
                  <Icon className="w-4 h-4 flex-shrink-0" strokeWidth={2} />
                  {label}
                </NavLink>
              ))}
            </div>
          </div>
        </nav>
        <div className="px-3 py-4 border-t border-cb-border">
          <Link
            to="/admin/applications"
            className="flex items-center gap-2 px-3 py-2 rounded-cb text-cb-caption normal-case tracking-normal text-gray-500 hover:text-white"
          >
            <FolderKanban className="w-3.5 h-3.5" />
            Applications desk
          </Link>
        </div>
      </aside>

      <div className="flex-1 md:pl-56 min-h-screen flex flex-col">
        <header className="h-14 border-b border-cb-border bg-cb-surface/95 backdrop-blur px-4 sm:px-6 flex items-center gap-3 sticky top-0 z-30">
          <div className="md:hidden shrink-0">
            <CliqbuxLogo size="sm" />
          </div>
          <form onSubmit={runSearch} className="relative flex-1 min-w-0 max-w-xl">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            <input
              className={`${inputCls} pl-10 pr-10 py-1.5`}
              placeholder="Search company, domain, HubSpot company id, or Deal ID…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              aria-label="Global merchant search"
            />
            {searching && (
              <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-gray-500" />
            )}
          </form>
          <p className="hidden sm:block text-cb-caption text-gray-500 shrink-0">Staff admin</p>
        </header>

        {searchError && (
          <p className="px-4 sm:px-6 py-2 text-cb-caption text-cb-danger border-b border-cb-border">
            {searchError}
          </p>
        )}

        <main className="flex-1 px-4 sm:px-6 py-6 w-full max-w-[1400px] mx-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
