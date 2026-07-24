import { useEffect, useState, useCallback } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Plus, Trash2, Loader2 } from 'lucide-react';
import MerchantCenterShell from '@/components/merchant-center/MerchantCenterShell';
import { getSession, requireAuth } from '@/lib/merchantCenterAuth';
import { invokePortalFunction, setMerchantToken, merchantTokenHasImp } from '@/lib/merchantAuthFetch';
import { base44 } from '@/api/base44Client';
import {
  deriveLocationStatus,
  locationStatusLabel,
  locationStatusTone,
  primaryMidForLocation,
} from '@/lib/locationStatus';

function StatusDot({ status }) {
  const tone = locationStatusTone(status);
  const cls =
    tone === 'success' ? 'bg-cb-success' :
    tone === 'danger' ? 'bg-cb-danger' :
    tone === 'accent' ? 'bg-cb-accent' :
    'bg-gray-500';
  return (
    <span className="inline-flex items-center gap-2">
      <span className={`w-2 h-2 rounded-full ${cls}`} aria-hidden />
      <span className="text-cb-caption normal-case tracking-normal font-medium text-gray-300">
        {locationStatusLabel(status)}
      </span>
    </span>
  );
}

async function resolveAgentAccess(corporateId) {
  if (merchantTokenHasImp()) return true;
  if (sessionStorage.getItem('portal_impersonating') === String(corporateId)) return true;
  try {
    await base44.auth.me();
    return true;
  } catch {
    return false;
  }
}

/**
 * Merchant Center account home — storefront list with scannable status.
 * Stage 1 auth: deal-scoped magic-link JWT (corporateId from session or ?dealId=).
 */
export default function MerchantLocationsHome() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [profile, setProfile] = useState(null);
  const [locations, setLocations] = useState([]);
  const [merchantIDs, setMerchantIDs] = useState([]);
  const [openChecklistCount, setOpenChecklistCount] = useState(0);
  const [accountName, setAccountName] = useState('');
  const [isAgentViewer, setIsAgentViewer] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [actionError, setActionError] = useState('');

  const load = useCallback(async () => {
    setError('');
    setActionError('');
    const paramsCorp = searchParams.get('dealId') || searchParams.get('corporateId');
    const imp = searchParams.get('impersonateToken');
    if (imp && paramsCorp) {
      setMerchantToken(imp);
      sessionStorage.setItem('portal_impersonating', String(paramsCorp));
      const clean = new URL(window.location.href);
      clean.searchParams.delete('impersonateToken');
      window.history.replaceState({}, '', clean.pathname + clean.search);
    }

    let session;
    try {
      session = getSession();
      if (!session && paramsCorp) {
        session = { corporateId: paramsCorp, kind: 'url' };
      }
      if (!session) {
        requireAuth();
      }
    } catch (err) {
      setError(err.message || 'Open your onboarding link to view locations.');
      setLoading(false);
      return;
    }

    const corporateId = session.corporateId || paramsCorp;
    if (!corporateId) {
      setError('No Merchant account session. Open your onboarding link to continue.');
      setLoading(false);
      return;
    }

    try {
      const isAgent = await resolveAgentAccess(corporateId);
      setIsAgentViewer(isAgent);

      const res = await invokePortalFunction('getMerchantData', { corporateId });
      if (res.data?.error) throw new Error(res.data.error);
      setProfile(res.data.profile);
      setLocations(res.data.locations || []);
      setMerchantIDs(res.data.merchantIDs || []);
      setAccountName(
        res.data.merchantAccount?.name ||
        res.data.profile?.legalName ||
        'Merchant account'
      );

      try {
        const cl = await invokePortalFunction('manageMerchantChecklist', {
          action: 'list',
          corporateId,
        });
        setOpenChecklistCount(cl.data?.openCount || 0);
      } catch {
        setOpenChecklistCount(0);
      }
    } catch (err) {
      setError(err.message || 'Could not load locations.');
    } finally {
      setLoading(false);
    }
  }, [searchParams]);

  useEffect(() => {
    load();
  }, [load]);

  const paramsCorp = searchParams.get('dealId') || searchParams.get('corporateId');
  const sessionCorpId = getSession()?.corporateId;
  const corporateId = profile?.corporateId || sessionCorpId || paramsCorp;
  const quoteMissing =
    profile?.applicationStatus === 'Submitted' && !profile?.hubspotQuoteUrl && !profile?.equipmentPaidAt;

  const rows = (locations || []).map((loc) => {
    const status = deriveLocationStatus(loc, merchantIDs, {
      applicationStatus: profile?.applicationStatus,
      openChecklistCount,
      quoteMissing,
    });
    const mid = primaryMidForLocation(loc, merchantIDs);
    const boarded = ['Pending MID', 'Active', 'Active (Existing)'].includes(mid?.applicationStepStatus);
    const canAgentDelete = isAgentViewer && !boarded;
    return { loc, status, mid, canAgentDelete };
  });

  const order = { action_needed: 0, in_review: 1, submitted: 2, draft: 3, live: 4 };
  rows.sort((a, b) => (order[a.status] ?? 9) - (order[b.status] ?? 9));

  const addLocation = () => {
    if (!corporateId) return;
    navigate(`/?dealId=${encodeURIComponent(corporateId)}&step=locations`);
  };

  const deleteDraftLocation = async (loc) => {
    if (!loc?.id || deletingId) return;
    const label = loc.dbaName || 'this location';
    const ok = window.confirm(
      `Delete draft "${label}"?\n\nVoids any MSPWare draft MIDs and removes this storefront from Merchant Center, onboarding, Applications, and Deal Room.\n\nCannot delete after processor boarding.`
    );
    if (!ok) return;
    setDeletingId(loc.id);
    setActionError('');
    try {
      const res = await invokePortalFunction('removeSelfServeLocation', { locationId: loc.id });
      if (res.data?.error) throw new Error(res.data.error);
      setLocations((prev) => prev.filter((l) => l.id !== loc.id));
      setMerchantIDs((prev) => prev.filter((m) => m.locationId !== loc.id));
    } catch (err) {
      console.error('[MerchantLocationsHome.delete]', err);
      setActionError(err?.message || 'Could not delete location');
    } finally {
      setDeletingId(null);
    }
  };

  if (loading) {
    return (
      <MerchantCenterShell
        title="Loading…"
        subtitle="Merchant account"
        corporateId={corporateId}
        showDealLink={!!corporateId}
      >
        <div className="space-y-3" aria-busy="true">
          <div className="skeleton h-8 w-48 !rounded-cb" />
          <div className="skeleton h-16 w-full !rounded-cb" />
          <div className="skeleton h-16 w-full !rounded-cb" />
        </div>
      </MerchantCenterShell>
    );
  }

  return (
    <MerchantCenterShell
      title={accountName}
      subtitle="Merchant account"
      corporateId={corporateId}
      openChecklistCount={openChecklistCount}
      showDealLink={!!corporateId}
    >
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="font-display text-cb-display text-white">Locations</h1>
          <p className="text-cb-body-lg text-gray-400 mt-1">
            Every storefront on this Merchant account.
          </p>
        </div>
        <button
          type="button"
          onClick={addLocation}
          disabled={!corporateId}
          className="inline-flex items-center gap-1.5 rounded-cb bg-cb-accent text-cb-bg font-semibold text-cb-body px-4 py-2.5 hover:opacity-95 disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cb-accent"
        >
          <Plus className="w-4 h-4" />
          Add location
        </button>
      </div>

      {error && (
        <div className="mb-6 rounded-cb border border-cb-border border-l-2 border-l-cb-danger bg-cb-surface-raised p-4" role="alert">
          <p className="text-cb-body text-white font-medium">Could not load locations</p>
          <p className="text-cb-caption normal-case tracking-normal text-gray-400 mt-1">{error}</p>
        </div>
      )}

      {actionError && (
        <div className="mb-6 rounded-cb border border-cb-border border-l-2 border-l-cb-danger bg-cb-surface-raised p-4" role="alert">
          <p className="text-cb-body text-white font-medium">Could not delete</p>
          <p className="text-cb-caption normal-case tracking-normal text-gray-400 mt-1">{actionError}</p>
        </div>
      )}

      {!error && rows.length === 0 && (
        <div className="rounded-cb border border-cb-border bg-cb-surface-raised p-8 text-center">
          <p className="font-display text-cb-title text-white mb-2">No locations yet</p>
          <p className="text-cb-body text-gray-400 mb-6 max-w-sm mx-auto">
            Add your first storefront to start onboarding. You can come back here anytime from your magic link.
          </p>
          <button
            type="button"
            onClick={addLocation}
            className="inline-flex items-center gap-1.5 rounded-cb bg-cb-accent text-cb-bg font-semibold text-cb-body px-4 py-2.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cb-accent"
          >
            <Plus className="w-4 h-4" />
            Add location
          </button>
        </div>
      )}

      {rows.length > 0 && (
        <ul className="rounded-cb border border-cb-border bg-cb-surface overflow-hidden divide-y divide-cb-border">
          {rows.map(({ loc, status, mid, canAgentDelete }) => {
            const isLive = status === 'live' && mid?.elavonMID;
            const href = isLive
              ? `/locations/${encodeURIComponent(loc.id)}`
              : `/?dealId=${encodeURIComponent(corporateId)}`;
            return (
              <li key={loc.id} className="flex items-stretch">
                <Link
                  to={href}
                  className="flex flex-1 min-w-0 items-center justify-between gap-4 px-4 sm:px-5 py-4 hover:bg-cb-surface-raised transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-cb-accent"
                >
                  <div className="min-w-0">
                    <p className="text-cb-body text-white font-medium truncate">
                      {loc.dbaName || 'Untitled location'}
                    </p>
                    <p className="text-cb-caption normal-case tracking-normal text-gray-500 truncate mt-0.5">
                      {loc.businessAddress ||
                        [loc.businessCity, loc.businessState].filter(Boolean).join(', ') ||
                        'Address not set'}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1 flex-shrink-0">
                    <StatusDot status={status} />
                    {mid?.elavonMID && (
                      <span className="text-cb-caption font-mono text-gray-600">
                        MID {mid.elavonMID}
                      </span>
                    )}
                  </div>
                </Link>
                {canAgentDelete && (
                  <button
                    type="button"
                    onClick={() => deleteDraftLocation(loc)}
                    disabled={deletingId === loc.id}
                    title="Delete draft location (agent)"
                    aria-label={`Delete draft ${loc.dbaName || loc.id}`}
                    className="flex-shrink-0 px-3 border-l border-cb-border text-gray-600 hover:text-cb-danger hover:bg-cb-surface-raised transition-colors disabled:opacity-40"
                  >
                    {deletingId === loc.id
                      ? <Loader2 className="w-4 h-4 animate-spin" />
                      : <Trash2 className="w-4 h-4" />}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </MerchantCenterShell>
  );
}
