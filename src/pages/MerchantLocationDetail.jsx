import { useEffect, useState, useCallback } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import MerchantCenterShell from '@/components/merchant-center/MerchantCenterShell';
import LocationGoLivePanel from '@/components/merchant-center/LocationGoLivePanel';
import MerchantBeforeInstall from '@/components/merchant-center/MerchantBeforeInstall';
import { getSession } from '@/lib/merchantCenterAuth';
import { invokePortalFunction, setMerchantToken } from '@/lib/merchantAuthFetch';
import { primaryMidForLocation, deriveLocationStatus, locationStatusLabel } from '@/lib/locationStatus';
import { composeFullAddress } from '@/lib/addressLine';

/**
 * Live location detail — business info, MID/boarding summary, statements link, go-live tools.
 */
export default function MerchantLocationDetail() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [profile, setProfile] = useState(null);
  const [location, setLocation] = useState(null);
  const [mids, setMids] = useState([]);
  const [accountName, setAccountName] = useState('');

  const load = useCallback(async () => {
    setError('');
    const paramsCorp = searchParams.get('dealId') || searchParams.get('corporateId');
    const imp = searchParams.get('impersonateToken');
    if (imp && paramsCorp) {
      setMerchantToken(imp);
      sessionStorage.setItem('portal_impersonating', String(paramsCorp));
    }

    const session = getSession();
    const corporateId = session?.corporateId || paramsCorp;
    if (!corporateId) {
      setError('Open your onboarding link to view this location.');
      setLoading(false);
      return;
    }

    try {
      const res = await invokePortalFunction('getMerchantData', { corporateId });
      if (res.data?.error) throw new Error(res.data.error);
      setProfile(res.data.profile);
      setAccountName(
        res.data.merchantAccount?.name ||
        res.data.profile?.legalName ||
        'Merchant account'
      );
      const locs = res.data.locations || [];
      const loc = locs.find((l) => String(l.id) === String(id));
      if (!loc) {
        setError('Location not found on this Merchant account.');
        setLoading(false);
        return;
      }
      setLocation(loc);
      setMids((res.data.merchantIDs || []).filter((m) => String(m.locationId) === String(loc.id)));
    } catch (err) {
      setError(err.message || 'Could not load location.');
    } finally {
      setLoading(false);
    }
  }, [id, searchParams]);

  useEffect(() => {
    load();
  }, [load]);

  const corporateId = profile?.corporateId;
  const primary = location ? primaryMidForLocation(location, mids) : null;
  const status = location
    ? deriveLocationStatus(location, mids, { applicationStatus: profile?.applicationStatus })
    : 'draft';

  if (loading) {
    return (
      <MerchantCenterShell title="Loading…" subtitle="Location" corporateId={corporateId} showDealLink>
        <div className="space-y-3" aria-busy="true">
          <div className="skeleton h-8 w-56 !rounded-cb" />
          <div className="skeleton h-32 w-full !rounded-cb" />
        </div>
      </MerchantCenterShell>
    );
  }

  return (
    <MerchantCenterShell
      title={accountName}
      subtitle="Location"
      corporateId={corporateId}
      showDealLink={!!corporateId}
    >
      <p className="mb-4">
        <Link
          to="/locations"
          className="text-cb-caption normal-case tracking-normal text-cb-accent hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cb-accent rounded"
        >
          ← Locations
        </Link>
      </p>

      {error && (
        <div className="rounded-cb border border-cb-border border-l-2 border-l-cb-danger bg-cb-surface-raised p-4" role="alert">
          <p className="text-cb-body text-white">{error}</p>
        </div>
      )}

      {!error && location && (
        <div className="space-y-6">
          <div>
            <p className="text-cb-caption uppercase text-gray-500 mb-1">
              {locationStatusLabel(status)}
            </p>
            <h1 className="font-display text-cb-display text-white">
              {location.dbaName || 'Location'}
            </h1>
            <p className="text-cb-body text-gray-400 mt-1">
              {location.businessAddress ||
                composeFullAddress({
                  street: location.businessStreet,
                  street2: location.businessStreet2,
                  city: location.businessCity,
                  state: location.businessState,
                  zip: location.businessZip,
                }) ||
                '—'}
            </p>
          </div>

          <section className="rounded-cb border border-cb-border bg-cb-surface-raised p-5 space-y-3">
            <h2 className="font-display text-cb-title text-white">Business information</h2>
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-cb-caption normal-case tracking-normal">
              <div>
                <dt className="text-gray-500">DBA</dt>
                <dd className="text-white text-cb-body mt-0.5">{location.dbaName || '—'}</dd>
              </div>
              <div>
                <dt className="text-gray-500">Address</dt>
                <dd className="text-white text-cb-body mt-0.5">
                  {location.businessAddress ||
                    composeFullAddress({
                      street: location.businessStreet,
                      street2: location.businessStreet2,
                      city: location.businessCity,
                      state: location.businessState,
                      zip: location.businessZip,
                    }) ||
                    '—'}
                </dd>
              </div>
            </dl>
          </section>

          <section className="rounded-cb border border-cb-border bg-cb-surface-raised p-5 space-y-3">
            <h2 className="font-display text-cb-title text-white">MID &amp; boarding</h2>
            {mids.length === 0 ? (
              <p className="text-cb-body text-gray-400">No merchant IDs on this location yet.</p>
            ) : (
              <ul className="divide-y divide-cb-border border border-cb-border rounded-cb overflow-hidden">
                {mids.map((m) => (
                  <li key={m.id} className="bg-cb-bg px-4 py-3 flex justify-between gap-3">
                    <div>
                      <p className="text-cb-body text-white font-medium">
                        {m.dbaName || m.merchantName || 'MID'}
                      </p>
                      <p className="text-cb-caption normal-case tracking-normal text-gray-500 mt-0.5">
                        {m.applicationStepStatus || '—'}
                        {m.mspApplicationNo ? ` · App #${m.mspApplicationNo}` : ''}
                      </p>
                    </div>
                    <div className="text-right">
                      {m.elavonMID ? (
                        <p className="font-mono text-cb-caption text-cb-success">{m.elavonMID}</p>
                      ) : (
                        <p className="text-cb-caption text-gray-600">MID pending</p>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {primary?.elavonMID && (
              <p className="text-cb-caption normal-case tracking-normal text-gray-500">
                Join key for POS and processor systems: <span className="font-mono text-gray-300">{primary.elavonMID}</span>
              </p>
            )}
          </section>

          <section className="rounded-cb border border-cb-border bg-cb-surface-raised p-5">
            <h2 className="font-display text-cb-title text-white mb-2">Statements</h2>
            <p className="text-cb-body text-gray-400 mb-3">
              Processor statements will appear here once the data feed is connected.
            </p>
            <Link
              to={`/account?mid=${encodeURIComponent(primary?.elavonMID || '')}`}
              className="text-cb-caption normal-case tracking-normal font-medium text-cb-accent underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cb-accent"
            >
              Open account &amp; statements
            </Link>
          </section>

          <MerchantBeforeInstall
            corporateId={corporateId}
            locationId={location.id}
          />

          <LocationGoLivePanel
            corporateId={corporateId}
            location={location}
            onUpdated={load}
          />
        </div>
      )}
    </MerchantCenterShell>
  );
}
