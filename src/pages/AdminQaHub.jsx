/**
 * Admin QA hub — /admin/center
 * Lists merchants (same source as Applications) and opens each POV:
 * Portal, Merchant Center, Locations, Account (impersonate JWT), Deal Room (admin).
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft, Building2, Eye, FolderOpen, LayoutDashboard, Loader2,
  MapPin, Search, UserRound,
} from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { HANDOFF_STAGE_LABELS } from '@/lib/onboardingFacts';

const inputCls =
  'w-full bg-cb-bg border border-cb-border rounded-cb px-3.5 py-2.5 text-cb-body text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-cb-accent';

const DESTINATIONS = [
  { id: 'portal', label: 'Portal', icon: Eye, title: 'Onboarding (People → Sign)' },
  { id: 'dashboard', label: 'Merchant Center', icon: LayoutDashboard, title: 'Deal board / post-signing' },
  { id: 'locations', label: 'Locations', icon: MapPin, title: 'Storefront list' },
  { id: 'account', label: 'Account', icon: UserRound, title: 'Account & MID join key' },
];

function stageLabel(profile) {
  const raw = profile?.handoffStage
    || (profile?.applicationStatus === 'Submitted' ? 'underwriting' : 'sales');
  return HANDOFF_STAGE_LABELS[raw] || raw;
}

export default function AdminQaHub() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [profiles, setProfiles] = useState([]);
  const [search, setSearch] = useState('');
  const [busyKey, setBusyKey] = useState('');
  const [rowError, setRowError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const list = await base44.entities.MerchantCorporateProfile.list('-updated_date', 200);
      setProfiles(list || []);
    } catch (err) {
      console.error('[AdminQaHub]', err);
      setError(err?.message || 'Could not load merchants. Sign in as a Cliqbux admin and try again.');
      setProfiles([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return profiles;
    return profiles.filter((p) => {
      const name = String(p.legalName || '').toLowerCase();
      const id = String(p.corporateId || '').toLowerCase();
      const dba = String(p.dbaName || '').toLowerCase();
      return name.includes(q) || id.includes(q) || dba.includes(q);
    });
  }, [profiles, search]);

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
      console.error('[AdminQaHub impersonate]', err);
      setRowError(err?.message || 'Could not open merchant view');
    } finally {
      setBusyKey('');
    }
  };

  return (
    <div className="min-h-screen bg-cb-bg text-white">
      <header className="border-b border-cb-border bg-cb-surface">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-5 flex flex-wrap items-start gap-4">
          <div className="flex-1 min-w-0">
            <Link
              to="/admin/applications"
              className="inline-flex items-center gap-1.5 text-cb-caption text-gray-400 hover:text-white mb-2"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Applications
            </Link>
            <p className="text-cb-caption text-gray-500 mb-0.5">Admin</p>
            <h1 className="font-display text-cb-display text-white">QA hub</h1>
            <p className="text-cb-body-lg text-gray-400 mt-1 max-w-xl">
              Open any test merchant as Portal, Merchant Center, Locations, Account, or Deal Room.
              Merchant views use a 30-minute impersonation session (saves write to the live record).
            </p>
          </div>
          <Link
            to="/admin/applications"
            className="text-cb-caption font-semibold px-3 py-2 rounded-cb border border-cb-border text-gray-300 hover:text-white hover:border-cb-border-strong"
          >
            Full Applications desk
          </Link>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input
            className={`${inputCls} pl-10`}
            placeholder="Search by name or deal ID…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search merchants"
          />
        </div>

        {error && (
          <p className="text-cb-caption text-cb-danger border-l-2 border-cb-danger pl-3">{error}</p>
        )}
        {rowError && (
          <p className="text-cb-caption text-cb-danger border-l-2 border-cb-danger pl-3">{rowError}</p>
        )}

        {loading && (
          <div className="flex items-center gap-2 text-cb-caption text-gray-500 py-12 justify-center">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading merchants…
          </div>
        )}

        {!loading && filtered.length === 0 && (
          <div className="bg-cb-surface border border-cb-border rounded-cb p-6 text-center">
            <p className="text-cb-body text-gray-400">
              {search.trim() ? 'No merchants match that search.' : 'No merchant profiles found.'}
            </p>
            <p className="text-cb-caption text-gray-600 mt-2">
              Stage a test deal from Applications, then refresh this page.
            </p>
          </div>
        )}

        <ul className="space-y-2">
          {filtered.map((p) => {
            const cid = String(p.corporateId || '');
            const name = p.legalName || p.dbaName || cid;
            return (
              <li
                key={cid}
                className="bg-cb-surface border border-cb-border rounded-cb px-4 py-3 hover:border-cb-border-strong transition-colors"
              >
                <div className="flex flex-wrap items-start gap-3 justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Building2 className="w-4 h-4 text-gray-500 flex-shrink-0" />
                      <p className="text-cb-body font-semibold text-white truncate">{name}</p>
                      <span className="text-cb-caption font-mono text-gray-600">{cid}</span>
                    </div>
                    <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1 text-cb-caption text-gray-500">
                      {p.applicationStatus && <span>{p.applicationStatus}</span>}
                      <span>{stageLabel(p)}</span>
                      {p.pricingTier && <span>{p.pricingTier}</span>}
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-1.5">
                    {DESTINATIONS.map(({ id, label, icon: Icon, title }) => {
                      const key = `${cid}:${id}`;
                      const busy = busyKey === key;
                      return (
                        <button
                          key={id}
                          type="button"
                          title={title}
                          disabled={!!busyKey}
                          onClick={() => openImpersonate(cid, id)}
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
                      to={`/admin/applications/${encodeURIComponent(cid)}`}
                      title="Deal Room (agent handoff, call notes, runbook)"
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
      </main>
    </div>
  );
}
