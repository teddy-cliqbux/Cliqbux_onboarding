import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, Check } from 'lucide-react';
import { motion } from 'framer-motion';
import confetti from 'canvas-confetti';
import CliqbuxLogo from '@/components/onboarding/CliqbuxLogo';
import UnderwritingTracker from '@/components/onboarding/UnderwritingTracker';
import EquipmentShippingModal from '@/components/onboarding/EquipmentShippingModal';
import InventoryUpload from '@/components/onboarding/InventoryUpload';
import LegacyPOSBridge from '@/components/onboarding/LegacyPOSBridge';
import LocationStatusTable from '@/components/onboarding/LocationStatusTable';
import { invokePortalFunction } from '@/lib/merchantAuthFetch';

/** One tasteful gold burst — signature moment for application submitted. */
function fireSubmissionCelebration(corporateId) {
  if (typeof window === 'undefined') return;
  const key = `cb_celebrated_${corporateId || 'anon'}`;
  if (sessionStorage.getItem(key)) return;
  sessionStorage.setItem(key, '1');

  const gold = '#FEAC27';
  const soft = '#F0AD4E';
  confetti({
    particleCount: 64,
    spread: 62,
    startVelocity: 28,
    gravity: 0.9,
    ticks: 160,
    origin: { y: 0.28 },
    colors: [gold, soft, '#FFFFFF', '#4ADE80'],
    disableForReducedMotion: true,
  });
}

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
        const res = await invokePortalFunction('getMerchantData', { corporateId });
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
        // Signature moment — fire after we know this is a real submitted session
        fireSubmissionCelebration(corporateId);
      } catch (_) {
        // Stay on page if load fails
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
          <p className="text-cb-body text-gray-500">Loading your dashboard...</p>
        </div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="portal-bg flex flex-col items-center justify-center gap-4 px-4">
        <CliqbuxLogo />
        <div className="text-center">
          <h1 className="font-display text-cb-title text-white mb-1">Dashboard Not Available</h1>
          <p className="text-cb-body text-gray-400 max-w-md">
            No merchant profile found. Please use your onboarding link or contact your Cliqbux representative.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="portal-bg" style={{ fontFamily: 'Inter, sans-serif' }}>
      {/* Nav */}
      <div className="fixed top-0 left-0 right-0 bg-cb-surface/95 backdrop-blur border-b border-cb-border z-40 px-6 py-3">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <CliqbuxLogo />
          <div className="flex items-center gap-3">
            <span className="text-cb-caption normal-case tracking-normal font-normal text-gray-400">{profile.legalName}</span>
            <span className="inline-flex items-center gap-1.5 text-cb-caption normal-case tracking-normal font-medium text-cb-success border border-cb-border px-2.5 py-1 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-cb-success" />
              Submitted
            </span>
          </div>
        </div>
      </div>

      <div className="pt-16 min-h-screen px-4 py-8">
        <div className="max-w-3xl mx-auto flex flex-col gap-8">
          {/* Welcome — signature calm celebration */}
          <motion.div
            className="text-center mb-2"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
          >
            <motion.span
              className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-cb-success/15 mb-4"
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', stiffness: 380, damping: 18, delay: 0.08 }}
            >
              <Check className="w-6 h-6 text-cb-success" strokeWidth={2.5} />
            </motion.span>
            <p className="text-cb-caption uppercase text-gray-500 mb-2">Application submitted</p>
            <h1 className="font-display text-cb-display text-white">You&apos;re all set</h1>
            <p className="text-cb-body-lg text-gray-400 mt-2 max-w-md mx-auto">
              Finish storefront setup below while Elavon reviews your application.
            </p>
          </motion.div>

          {/* Tracker */}
          {merchantIDs.length > 0 && <UnderwritingTracker locations={locations} merchantIDs={merchantIDs} />}

          {/* Location Status Table */}
          <LocationStatusTable
            locations={locations}
            merchantIDs={merchantIDs}
            corporateId={profile.corporateId}
            onStatusChanged={async () => {
              try {
                const res = await invokePortalFunction('getMerchantData', { corporateId: profile.corporateId });
                if (!res.data?.error) {
                  setLocations(res.data.locations || []);
                  setMerchantIDs(res.data.merchantIDs || []);
                }
              } catch (_) {}
            }}
          />

          {/* Checklist */}
          <div>
            <h2 className="text-cb-caption uppercase text-gray-400 mb-4">Complete Your Setup</h2>
            <div className="flex flex-col gap-4">
              {/* Equipment & Services Quote — per the 2026-07-10 flow reorder, the
                  quote is signed HERE, after the merchant application is submitted.
                  Embedding works because the quote serves from www.cliqbux.com
                  (HubSpot custom domain) with no X-Frame-Options/frame-ancestors —
                  verified 2026-07-10. HubSpot's own hs-sites URLs are NOT frameable. */}
              {profile.hubspotQuoteUrl && (
                <div className="bg-white rounded-cb border border-gray-100 p-5">
                  <div className="flex items-center justify-between mb-1">
                    <h3 className="text-sm font-bold text-gray-900">Review &amp; Sign Your Equipment Quote</h3>
                    <a href={profile.hubspotQuoteUrl} target="_blank" rel="noopener noreferrer"
                      className="text-xs font-semibold text-amber-600 hover:text-amber-700 underline">
                      Open in new tab
                    </a>
                  </div>
                  <p className="text-xs text-gray-500 mb-3">
                    Your equipment and services order. Review the line items and sign below to finalize.
                  </p>
                  <iframe
                    src={profile.hubspotQuoteUrl}
                    title="Equipment & Services Quote"
                    className="w-full rounded-lg border border-gray-200 bg-white"
                    style={{ height: 900 }}
                  />
                </div>
              )}

              {/* A: Equipment Shipping */}
              <div className="bg-cb-surface-raised rounded-cb border border-cb-border p-5">
                <div className="flex items-center justify-between mb-1">
                  <h3 className="text-cb-body font-semibold text-white">Equipment Shipping Router</h3>
                  <button
                    onClick={() => setShowShipping(true)}
                    className="text-cb-caption normal-case tracking-normal font-medium text-cb-accent hover:opacity-90 underline"
                  >
                    Route
                  </button>
                </div>
                <p className="text-cb-caption normal-case tracking-normal font-normal text-gray-500">
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
            <p className="text-cb-caption normal-case tracking-normal font-normal text-gray-600">
              Secured by <span className="text-cb-accent font-medium">Cliqbux</span> &nbsp;·&nbsp; onboarding.cliqbux.com &nbsp;·&nbsp; {new Date().getFullYear()}
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
