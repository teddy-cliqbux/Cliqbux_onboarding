import { useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import MerchantCenterShell from '@/components/merchant-center/MerchantCenterShell';
import { getSession } from '@/lib/merchantCenterAuth';
import { invokePortalFunction, setMerchantToken } from '@/lib/merchantAuthFetch';

/**
 * Stage 4 — Account & statements shell.
 * No invented processor API; clearly marked empty/loading states.
 * MID is the join key shown when available.
 */
export default function MerchantAccountPage() {
  const [searchParams] = useSearchParams();
  const midFilter = searchParams.get('mid') || '';
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [profile, setProfile] = useState(null);
  const [mids, setMids] = useState([]);
  const [accountName, setAccountName] = useState('');

  const load = useCallback(async () => {
    const paramsCorp = searchParams.get('dealId') || searchParams.get('corporateId');
    const imp = searchParams.get('impersonateToken');
    if (imp && paramsCorp) {
      setMerchantToken(imp);
      sessionStorage.setItem('portal_impersonating', String(paramsCorp));
      const clean = new URL(window.location.href);
      clean.searchParams.delete('impersonateToken');
      window.history.replaceState({}, '', clean.pathname + clean.search);
    }
    const session = getSession();
    const corporateId = session?.corporateId || paramsCorp;
    if (!corporateId) {
      setError('Open your onboarding link to view account details.');
      setLoading(false);
      return;
    }
    try {
      const res = await invokePortalFunction('getMerchantData', { corporateId });
      if (res.data?.error) throw new Error(res.data.error);
      setProfile(res.data.profile);
      setMids(res.data.merchantIDs || []);
      setAccountName(
        res.data.merchantAccount?.name ||
        res.data.profile?.legalName ||
        'Merchant account'
      );
    } catch (err) {
      setError(err.message || 'Could not load account.');
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
  const liveMids = (mids || []).filter((m) => m.elavonMID);
  const shown = midFilter
    ? liveMids.filter((m) => String(m.elavonMID) === String(midFilter))
    : liveMids;

  return (
    <MerchantCenterShell
      title={accountName}
      subtitle="Account"
      corporateId={corporateId}
      showDealLink={!!corporateId}
    >
      <h1 className="font-display text-cb-display text-white mb-1">Account</h1>
      <p className="text-cb-body-lg text-gray-400 mb-8">
        Statements and account information for this Merchant account.
      </p>

      {loading && (
        <div className="space-y-3" aria-busy="true" aria-label="Loading account">
          <div className="skeleton h-24 w-full !rounded-cb" />
          <div className="skeleton h-40 w-full !rounded-cb" />
        </div>
      )}

      {error && (
        <div className="rounded-cb border border-cb-border border-l-2 border-l-cb-danger bg-cb-surface-raised p-4" role="alert">
          <p className="text-cb-body text-white">{error}</p>
        </div>
      )}

      {!loading && !error && (
        <div className="space-y-6">
          <section className="rounded-cb border border-cb-border bg-cb-surface-raised p-5 space-y-3">
            <h2 className="font-display text-cb-title text-white">Account information</h2>
            <dl className="space-y-2 text-cb-caption normal-case tracking-normal">
              <div className="flex justify-between gap-4">
                <dt className="text-gray-500">Legal name</dt>
                <dd className="text-white text-right">{profile?.legalName || '—'}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-gray-500">Contact</dt>
                <dd className="text-white text-right">{profile?.contactEmail || profile?.email || '—'}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-gray-500">Deal ID</dt>
                <dd className="font-mono text-gray-400 text-right">{corporateId || '—'}</dd>
              </div>
            </dl>
          </section>

          <section className="rounded-cb border border-cb-border bg-cb-surface-raised p-5 space-y-3">
            <h2 className="font-display text-cb-title text-white">Merchant IDs</h2>
            <p className="text-cb-caption normal-case tracking-normal text-gray-500">
              The MID is the join key for processor systems and the POS dashboard (linked in a later phase).
            </p>
            {shown.length === 0 ? (
              <p className="text-cb-body text-gray-400 py-2">
                No live MIDs yet. They appear here after Elavon activates processing.
              </p>
            ) : (
              <ul className="divide-y divide-cb-border border border-cb-border rounded-cb overflow-hidden">
                {shown.map((m) => (
                  <li key={m.id} className="bg-cb-bg px-4 py-3 flex justify-between">
                    <span className="text-cb-body text-white">{m.dbaName || m.merchantName}</span>
                    <span className="font-mono text-cb-caption text-cb-success">{m.elavonMID}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="rounded-cb border border-cb-border bg-cb-surface-raised p-5 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-display text-cb-title text-white">Statements</h2>
              <span className="text-cb-caption uppercase text-gray-600">Placeholder</span>
            </div>
            <p className="text-cb-body text-gray-400">
              Processor statements are not wired yet. When the feed is connected, monthly statements
              for each MID will list here — no separate HubSpot or email hunt required.
            </p>
            <div className="rounded-cb border border-dashed border-cb-border-strong bg-cb-bg px-4 py-8 text-center">
              <p className="text-cb-caption normal-case tracking-normal text-gray-600">
                No statements to show
              </p>
              <p className="text-cb-caption normal-case tracking-normal text-gray-500 mt-1">
                {midFilter
                  ? `Filtered to MID ${midFilter}`
                  : 'Select a live location to filter by MID, or check back after go-live.'}
              </p>
            </div>
          </section>
        </div>
      )}
    </MerchantCenterShell>
  );
}
