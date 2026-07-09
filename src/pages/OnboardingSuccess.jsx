import { useState, useEffect } from 'react';
import { CheckCircle2, Clock, Loader2, Building2, Zap } from 'lucide-react';
import CliqbuxLogo from '@/components/onboarding/CliqbuxLogo';
import { invokePortalFunction } from '@/lib/merchantAuthFetch';

function MidTracker({ locations }) {
  const [liveLocations, setLiveLocations] = useState(locations);

  // Poll every 15s for MID provisioning updates
  useEffect(() => {
    if (!locations?.length) return;
    const corporateId = locations[0]?.corporateId;
    if (!corporateId) return;

    const poll = async () => {
      try {
        const res = await invokePortalFunction('getMerchantData', { corporateId });
        if (res.data?.locations) setLiveLocations(res.data.locations);
      } catch (_) {}
    };

    const interval = setInterval(poll, 15000);
    return () => clearInterval(interval);
  }, []);

  const allProvisioned = liveLocations.every(l => l.elavonMID);
  const provisioned = liveLocations.filter(l => l.elavonMID).length;

  return (
    <div className="w-full max-w-2xl">
      {/* Progress bar */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">MID Provisioning Progress</span>
          <span className="text-xs font-bold text-gray-700">{provisioned}/{liveLocations.length} Activated</span>
        </div>
        <div className="w-full bg-gray-100 rounded-full h-2">
          <div
            className="h-2 rounded-full bg-green-500 transition-all duration-700"
            style={{ width: liveLocations.length ? `${(provisioned / liveLocations.length) * 100}%` : '0%' }}
          />
        </div>
      </div>

      {/* Location rows */}
      <div className="flex flex-col gap-3">
        {liveLocations.map(loc => {
          const hasMID = !!loc.elavonMID;
          return (
            <div
              key={loc.id || loc.locationId}
              className={`flex items-center gap-4 px-5 py-4 rounded-xl border transition-colors ${hasMID ? 'bg-green-50 border-green-200' : 'bg-white border-gray-200'}`}
            >
              <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${hasMID ? 'bg-green-100' : 'bg-gray-100'}`}>
                {hasMID ? <CheckCircle2 className="w-5 h-5 text-green-600" /> : <Loader2 className="w-5 h-5 text-gray-400 animate-spin" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-900">{loc.dbaName}</p>
                <p className="text-xs text-gray-400 truncate">{loc.businessAddress}</p>
              </div>
              {hasMID ? (
                <div className="text-right flex-shrink-0">
                  <p className="text-xs text-gray-400 font-medium">Merchant ID</p>
                  <p className="text-sm font-bold text-green-700 font-mono">{loc.elavonMID}</p>
                </div>
              ) : (
                <span className="text-xs font-semibold text-amber-600 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-full flex-shrink-0">
                  Provisioning...
                </span>
              )}
            </div>
          );
        })}
      </div>

      {allProvisioned && (
        <div className="mt-6 flex items-center gap-3 bg-green-50 border border-green-200 rounded-xl px-5 py-4">
          <Zap className="w-5 h-5 text-green-600 flex-shrink-0" />
          <p className="text-sm font-semibold text-green-800">All locations are live and ready to process payments!</p>
        </div>
      )}
    </div>
  );
}

export default function OnboardingSuccess({ profile, locations }) {
  return (
    <div style={{ background: '#111827', minHeight: '100vh', fontFamily: 'Inter, sans-serif' }}>
      <div className="flex flex-col items-center justify-start px-4 py-16">
        {/* Logo */}
        <div className="mb-10">
          <CliqbuxLogo />
        </div>

        {/* Success hero */}
        <div className="flex flex-col items-center text-center mb-12">
          <div className="relative mb-6">
            <div className="w-20 h-20 rounded-full bg-green-500/20 flex items-center justify-center animate-checkmark">
              <CheckCircle2 className="w-10 h-10 text-green-400" />
            </div>
            <div className="absolute inset-0 rounded-full border-2 border-green-500/30 animate-ping" style={{ animationDuration: '2s' }} />
          </div>

          <h1 className="text-3xl font-bold text-white mb-3">Application Submitted!</h1>
          <p className="text-gray-400 text-base max-w-md">
            Your merchant application has been received and submitted to our banking partner.
            {profile?.signerEmail && (
              <> Confirmation details will be sent to <span className="text-amber-400 font-semibold">{profile.signerEmail}</span>.</>
            )}
          </p>
        </div>

        {/* MID Tracker */}
        {locations?.length > 0 && (
          <div className="w-full max-w-2xl mb-8">
            <div className="bg-white rounded-2xl shadow-2xl overflow-hidden">
              <div className="bg-gray-900 px-6 py-4 flex items-center gap-3">
                <Building2 className="w-5 h-5 text-amber-400" />
                <div>
                  <p className="text-white font-bold text-sm">Merchant ID Provisioning Tracker</p>
                  <p className="text-gray-400 text-xs mt-0.5">Updates automatically as Elavon activates your locations</p>
                </div>
                <div className="ml-auto flex items-center gap-1.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                  <span className="text-xs text-green-400 font-medium">Live</span>
                </div>
              </div>
              <div className="p-6">
                <MidTracker locations={locations} />
              </div>
            </div>
          </div>
        )}

        {/* What's next */}
        <div className="w-full max-w-2xl bg-white/5 border border-white/10 rounded-2xl px-6 py-5 mb-8">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4">What happens next</p>
          <div className="flex flex-col gap-3">
            {[
              { icon: '📋', label: 'Underwriting Review', desc: 'Elavon reviews your application (typically 1–2 business days)' },
              { icon: '🏦', label: 'Account Activation', desc: 'Merchant IDs are provisioned and appear in the tracker above' },
              { icon: '💳', label: 'Terminal Setup', desc: 'Your Cliqbux representative will contact you to configure your devices' },
            ].map((item, i) => (
              <div key={i} className="flex items-start gap-4">
                <span className="text-xl flex-shrink-0 mt-0.5">{item.icon}</span>
                <div>
                  <p className="text-sm font-semibold text-white">{item.label}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <p className="text-gray-600 text-xs">
          Secured by <span className="text-amber-500 font-semibold">Cliqbux</span> &nbsp;·&nbsp; onboarding.cliqbux.com &nbsp;·&nbsp; {new Date().getFullYear()}
        </p>
      </div>
    </div>
  );
}