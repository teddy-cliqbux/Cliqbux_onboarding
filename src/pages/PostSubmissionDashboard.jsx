import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check } from 'lucide-react';
import { motion } from 'framer-motion';
import confetti from 'canvas-confetti';
import CliqbuxLogo from '@/components/onboarding/CliqbuxLogo';
import UnderwritingTracker from '@/components/onboarding/UnderwritingTracker';
import EquipmentShippingModal from '@/components/onboarding/EquipmentShippingModal';
import EquipmentOrderPanel from '@/components/onboarding/EquipmentOrderPanel';
import InventoryUpload from '@/components/onboarding/InventoryUpload';
import ConnectLegacyPOS from '@/components/onboarding/ConnectLegacyPOS';
import LocationStatusTable from '@/components/onboarding/LocationStatusTable';
import { base44 } from '@/api/base44Client';
import {
  invokePortalFunction,
  setMerchantToken,
  merchantTokenHasImp,
} from '@/lib/merchantAuthFetch';

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

/** Agent/admin may preview this screen before the merchant has Submitted. */
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

export default function PostSubmissionDashboard() {
  const navigate = useNavigate();
  const [profile, setProfile] = useState(null);
  const [locations, setLocations] = useState([]);
  const [merchantIDs, setMerchantIDs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showShipping, setShowShipping] = useState(false);
  const [agentPreview, setAgentPreview] = useState(false);

  useEffect(() => {
    const load = async () => {
      const params = new URLSearchParams(window.location.search);
      let corporateId = params.get('dealId') || params.get('corporateId');
      const impersonateToken = params.get('impersonateToken');

      // Admin Applications "Dashboard" opens with a 30-min impersonation JWT.
      if (impersonateToken && corporateId) {
        setMerchantToken(impersonateToken);
        sessionStorage.setItem('portal_impersonating', String(corporateId));
        sessionStorage.setItem(`portal_agent_open_server_${corporateId}`, '1');
        const clean = new URL(window.location.href);
        clean.searchParams.delete('impersonateToken');
        window.history.replaceState({}, '', clean.pathname + clean.search);
      }

      if (!corporateId) {
        setLoading(false);
        return;
      }

      try {
        const isAgent = await resolveAgentAccess(corporateId);
        const res = await invokePortalFunction('getMerchantData', { corporateId });
        const data = res.data;
        if (data?.error) {
          setLoading(false);
          return;
        }
        setProfile(data.profile);
        setLocations(data.locations || []);
        setMerchantIDs(data.merchantIDs || []);

        const submitted = data.profile?.applicationStatus === 'Submitted';
        // Merchants cannot skip signing — only agents/admins may preview early.
        if (!submitted && !isAgent) {
          navigate(`/?dealId=${corporateId}`, { replace: true });
          return;
        }
        setAgentPreview(isAgent && !submitted);
        if (submitted && !isAgent) {
          fireSubmissionCelebration(corporateId);
        }
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
      <div className="portal-bg min-h-screen px-4 py-16" aria-busy="true" aria-label="Loading dashboard">
        <div className="max-w-3xl mx-auto space-y-4 pt-16">
          <div className="skeleton h-12 w-12 !rounded-full mx-auto" />
          <div className="skeleton h-4 w-40 !rounded-cb mx-auto" />
          <div className="skeleton h-8 w-56 !rounded-cb mx-auto" />
          <div className="skeleton h-4 w-72 !rounded-cb mx-auto" />
          <div className="skeleton h-28 w-full !rounded-cb mt-8" />
          <div className="skeleton h-40 w-full !rounded-cb" />
          <div className="skeleton h-24 w-full !rounded-cb" />
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
            {agentPreview ? (
              <span className="inline-flex items-center gap-1.5 text-cb-caption normal-case tracking-normal font-medium text-cb-accent border border-cb-border px-2.5 py-1 rounded-full">
                <span className="w-1.5 h-1.5 rounded-full bg-cb-accent" />
                Agent preview
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-cb-caption normal-case tracking-normal font-medium text-cb-success border border-cb-border px-2.5 py-1 rounded-full">
                <span className="w-1.5 h-1.5 rounded-full bg-cb-success" />
                Submitted
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="pt-16 min-h-screen px-4 py-8">
        <div className="max-w-3xl mx-auto flex flex-col gap-8">
          {agentPreview && (
            <div className="bg-cb-surface-raised border border-cb-border border-l-2 border-l-cb-accent text-gray-300 text-cb-body px-4 py-2.5 rounded-cb">
              Agent preview · merchant has not finished signing yet · Saves write to the live record · session ~30 min
            </div>
          )}

          {/* Welcome — signature calm celebration */}
          <motion.div
            className="text-center mb-2"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: 'spring', stiffness: 150, damping: 20 }}
          >
            <motion.span
              className={`inline-flex items-center justify-center w-12 h-12 rounded-full mb-4 ${agentPreview ? 'bg-cb-accent-muted' : 'bg-cb-success/15'}`}
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', stiffness: 150, damping: 20, delay: 0.05 }}
            >
              <Check className={`w-6 h-6 ${agentPreview ? 'text-cb-accent' : 'text-cb-success'}`} strokeWidth={2.5} />
            </motion.span>
            <p className="text-cb-caption uppercase text-gray-500 mb-2">
              {agentPreview ? 'Post-signing dashboard' : 'Application submitted'}
            </p>
            <h1 className="font-display text-cb-display text-white">
              {agentPreview ? 'Setup preview' : "You're all set"}
            </h1>
            <p className="text-cb-body-lg text-gray-400 mt-2 max-w-md mx-auto">
              {agentPreview
                ? 'Review equipment quote, shipping, and storefront setup before the merchant completes signing.'
                : 'Finish storefront setup below while Elavon reviews your application.'}
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
              {/* Equipment & Services — native invoice via getHubspotQuote;
                  sign/pay on HubSpot Payments (quote URL, new tab). */}
              <EquipmentOrderPanel corporateId={profile.corporateId} />

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

              {/* C: Legacy POS — three-tier secure connect */}
              <ConnectLegacyPOS corporateId={profile.corporateId} />
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
          locations={locations}
          onClose={() => setShowShipping(false)}
        />
      )}
    </div>
  );
}
