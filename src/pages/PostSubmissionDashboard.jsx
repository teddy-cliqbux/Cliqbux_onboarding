import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import CliqbuxLogo from '@/components/onboarding/CliqbuxLogo';
import UnderwritingTracker from '@/components/onboarding/UnderwritingTracker';
import EquipmentShippingModal from '@/components/onboarding/EquipmentShippingModal';
import InventoryUpload from '@/components/onboarding/InventoryUpload';
import LegacyPOSBridge from '@/components/onboarding/LegacyPOSBridge';
import LocationStatusTable from '@/components/onboarding/LocationStatusTable';

export default function PostSubmissionDashboard() {
  const navigate = useNavigate();
  const [profile, setProfile] = useState(null);
  const [locations, setLocations] = useState([]);
  const [merchantIDs, setMerchantIDs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showShipping, setShowShipping] = useState(false);

  useEffect(() => {
    const load = async () => {
      const params = new URLSearchParams(window.location.search);
      let corporateId = params.get('dealId') || params.get('corporateId');

      if (!corporateId) {
        setLoading(false);
        return;
      }

      try {
        const res = await base44.functions.invoke('getMerchantData', { corporateId });
        const data = res.data;
        if (data?.error) {
          setLoading(false);
          return;
        }
        setProfile(data.profile);
        setLocations(data.locations || []);
        setMerchantIDs(data.merchantIDs || []);
        if (data.profile?.applicationStatus !== 'Submitted') {
          navigate(`/?dealId=${corporateId}`, { replace: true });
          return;
        }
      } catch (_) {
        // Stay on page ifload fails
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  if (loading) {
    return (
      <div className="portal-bg flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 text-gray-400 animate-spin" />
          <p className="text-sm text-gray-500">Loading your dashboard...</p>
        </div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="portal-bg flex flex-col items-center justify-center gap-4 px-4">
        <CliqbuxLogo />
        <div className="text-center">
          <h1 className="text-xl font-bold text-white mb-1">Dashboard Not Available</h1>
          <p className="text-sm text-gray-400 max-w-md">
            No merchant profile found. Please use your onboarding link or contact your Cliqbux representative.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="portal-bg" style={{ fontFamily: 'Inter, sans-serif' }}>
      {/* Nav */}
      <div className="fixed top-0 left-0 right-0 bg-white/95 backdrop-blur border-b border-gray-100 z-40 px-6 py-3">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <CliqbuxLogo />
          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-400 font-medium">{profile.legalName}</span>
            <span className="text-xs font-semibold text-green-700 bg-green-50 border border-green-200 px-2.5 py-1 rounded-full">Submitted</span>
          </div>
        </div>
      </div>

      <div className="pt-16 min-h-screen px-4 py-8">
        <div className="max-w-3xl mx-auto flex flex-col gap-8">
          {/* Welcome */}
          <div className="text-center mb-2">
            <h1 className="text-2xl font-bold text-white">Storefront Configuration Setup</h1>
            <p className="text-gray-400 text-sm mt-1">
              Finish setting up while Elavon processes your application.
            </p>
          </div>

          {/* Tracker */}
          {merchantIDs.length > 0 && <UnderwritingTracker locations={locations} merchantIDs={merchantIDs} />}

          {/* Location Status Table */}
          <LocationStatusTable
            locations={locations}
            merchantIDs={merchantIDs}
            corporateId={profile.corporateId}
            onStatusChanged={async () => {
              try {
                const res = await base44.functions.invoke('getMerchantData', { corporateId: profile.corporateId });
                if (!res.data?.error) {
                  setLocations(res.data.locations || []);
                  setMerchantIDs(res.data.merchantIDs || []);
                }
              } catch (_) {}
            }}
          />

          {/* Checklist */}
          <div>
            <h2 className="text-sm font-bold text-gray-300 uppercase tracking-wider mb-4">Complete Your Setup</h2>
            <div className="flex flex-col gap-4">
              {/* A: Equipment Shipping */}
              <div className="bg-white rounded-xl border border-gray-100 p-5">
                <div className="flex items-center justify-between mb-1">
                  <h3 className="text-sm font-bold text-gray-900">Equipment Shipping Router</h3>
                  <button
                    onClick={() => setShowShipping(true)}
                    className="text-xs font-semibold text-amber-600 hover:text-amber-700 underline"
                  >
                    Route
                  </button>
                </div>
                <p className="text-xs text-gray-500">
                  Tell us where to ship your payment terminals — storefront, corporate mailing, or a staging warehouse.
                </p>
              </div>

              {/* B: Inventory & Menu */}
              <InventoryUpload corporateId={profile.corporateId} />

              {/* C: Legacy POS Bridge */}
              <LegacyPOSBridge />
            </div>
          </div>

          {/* Footer */}
          <div className="text-center pt-4 pb-6">
            <p className="text-gray-600 text-xs">
              Secured by <span className="text-amber-500 font-semibold">Cliqbux</span> &nbsp;·&nbsp; onboarding.cliqbux.com &nbsp;·&nbsp; {new Date().getFullYear()}
            </p>
          </div>
        </div>
      </div>

      {showShipping && (
        <EquipmentShippingModal
          profile={profile}
          locations={locations}
          onClose={() => setShowShipping(false)}
        />
      )}
    </div>
  );
}