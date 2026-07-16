import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Check } from 'lucide-react';
import { motion } from 'framer-motion';
import confetti from 'canvas-confetti';
import CliqbuxLogo from '@/components/onboarding/CliqbuxLogo';
import UnderwritingTracker from '@/components/onboarding/UnderwritingTracker';
import ApplicationTracker from '@/components/onboarding/ApplicationTracker';
import EquipmentShippingModal from '@/components/onboarding/EquipmentShippingModal';
import EquipmentOrderPanel from '@/components/onboarding/EquipmentOrderPanel';
import InventoryUpload from '@/components/onboarding/InventoryUpload';
import ConnectLegacyPOS from '@/components/onboarding/ConnectLegacyPOS';
import SetupGate from '@/components/onboarding/SetupGate';
import { base44 } from '@/api/base44Client';
import {
  invokePortalFunction,
  setMerchantToken,
  merchantTokenHasImp,
} from '@/lib/merchantAuthFetch';
import FormsLockedBanner from '@/components/onboarding/FormsLockedBanner';
import { isPortalFormsLocked } from '@/lib/portalLock';

const QUOTE_POLL_MS = 10_000;

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

function deriveQuoteFlags(quoteData, profile) {
  const quotePaid =
    quoteData?.isPaid === true ||
    String(quoteData?.paymentStatus || '').toUpperCase() === 'PAID' ||
    !!quoteData?.equipmentPaidAt ||
    !!profile?.equipmentPaidAt ||
    quoteData?.equipmentShippingStatus === 'ready_to_ship' ||
    profile?.equipmentShippingStatus === 'ready_to_ship';
  const quoteSigned =
    quoteData?.isSigned === true ||
    String(quoteData?.esignStatus || '').toUpperCase() === 'SIGNED' ||
    !!quoteData?.quoteSignedAt ||
    !!profile?.quoteSignedAt ||
    quotePaid;
  const lifecycle =
    quoteData?.quoteLifecycle ||
    (!quoteSigned ? 'awaiting_signature' : !quotePaid ? 'awaiting_payment' : 'paid');
  return { quotePaid, quoteSigned, lifecycle };
}

export default function PostSubmissionDashboard() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [profile, setProfile] = useState(null);
  const [locations, setLocations] = useState([]);
  const [merchantIDs, setMerchantIDs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showShipping, setShowShipping] = useState(false);
  const [agentPreview, setAgentPreview] = useState(false);
  /** QuoteSignModal open — drives 10s pull poll (HubSpot tier has no workflow webhooks). */
  const [quoteModalOpen, setQuoteModalOpen] = useState(false);
  const [unlocking, setUnlocking] = useState(false);
  const lifecycleAtModalOpen = useRef(null);
  const profileRef = useRef(profile);
  profileRef.current = profile;

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

  const corporateId = profile?.corporateId;

  // ── On-load sync gateway ────────────────────────────────────────────────────
  // Silent HubSpot pull so email-link sign/pay is reflected when the merchant returns.
  useEffect(() => {
    if (!corporateId) return;
    let cancelled = false;
    (async () => {
      try {
        await invokePortalFunction('syncFromHubspot', { dealId: corporateId });
        if (cancelled) return;
        const res = await invokePortalFunction('getMerchantData', { corporateId });
        if (cancelled || res.data?.error) return;
        const p = res.data?.profile;
        if (p) {
          setProfile((prev) => (prev ? {
            ...prev,
            applicationStatus: p.applicationStatus ?? prev.applicationStatus,
            quoteSignedAt: p.quoteSignedAt ?? prev.quoteSignedAt,
            equipmentPaidAt: p.equipmentPaidAt ?? prev.equipmentPaidAt,
            equipmentShippingStatus: p.equipmentShippingStatus ?? prev.equipmentShippingStatus,
            hubspotQuoteUrl: p.hubspotQuoteUrl ?? prev.hubspotQuoteUrl,
          } : prev));
        }
        await queryClient.invalidateQueries({ queryKey: ['hubspotQuote', corporateId] });
      } catch {
        // Non-blocking — getHubspotQuote still loads live HubSpot state
      }
    })();
    return () => { cancelled = true; };
  }, [corporateId, queryClient]);

  // Shared TanStack cache with EquipmentOrderPanel
  const { data: quoteData, refetch: refetchQuote } = useQuery({
    queryKey: ['hubspotQuote', corporateId],
    queryFn: async () => {
      const res = await invokePortalFunction('getHubspotQuote', { corporateId });
      if (res.data?.error) throw new Error(res.data.error);
      return res.data;
    },
    enabled: !!corporateId,
    staleTime: quoteModalOpen ? 0 : 10 * 60 * 1000,
    refetchOnWindowFocus: true,
  });

  const { quotePaid, quoteSigned, lifecycle } = deriveQuoteFlags(quoteData, profile);

  // Snapshot lifecycle when modal opens so we can detect transitions
  useEffect(() => {
    if (quoteModalOpen) {
      lifecycleAtModalOpen.current = lifecycle;
    } else {
      lifecycleAtModalOpen.current = null;
    }
    // Capture open-time lifecycle only — do not re-run when lifecycle changes mid-poll
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quoteModalOpen]);

  // ── Active poll while QuoteSignModal is open (10s) ──────────────────────────
  // HubSpot workflow webhooks are unavailable on our tier — pull instead.
  useEffect(() => {
    if (!corporateId || !quoteModalOpen) return undefined;

    const tick = async () => {
      try {
        const result = await refetchQuote();
        const next = deriveQuoteFlags(result.data, profileRef.current);
        const started = lifecycleAtModalOpen.current;
        const advanced =
          (started === 'awaiting_signature' &&
            (next.lifecycle === 'awaiting_payment' || next.lifecycle === 'paid')) ||
          (started === 'awaiting_payment' && next.lifecycle === 'paid');
        if (advanced) {
          // Panel closes modal + celebrates via shared query data; refresh SetupGate stamps
          const res = await invokePortalFunction('getMerchantData', { corporateId });
          const p = res.data?.profile;
          if (p) {
            setProfile((prev) => (prev ? {
              ...prev,
              quoteSignedAt: p.quoteSignedAt ?? prev.quoteSignedAt,
              equipmentPaidAt: p.equipmentPaidAt ?? prev.equipmentPaidAt,
              equipmentShippingStatus: p.equipmentShippingStatus ?? prev.equipmentShippingStatus,
            } : prev));
          }
        }
      } catch {
        /* next tick retries */
      }
    };

    tick();
    const id = setInterval(tick, QUOTE_POLL_MS);
    return () => clearInterval(id);
  }, [corporateId, quoteModalOpen, refetchQuote]);

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
      <div className="fixed top-0 left-0 right-0 bg-cb-surface/95 backdrop-blur border-b border-cb-border z-40 px-6 py-3">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <CliqbuxLogo />
          <span className="text-cb-caption normal-case tracking-normal text-gray-500 truncate max-w-[50%]">
            {profile.legalName || 'Merchant'}
          </span>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 pt-24 pb-12">
        <div className="space-y-8">
          <motion.div
            className="text-center"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: 'spring', stiffness: 150, damping: 20 }}
          >
            <span className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-cb-success/15 mb-4">
              <Check className="w-6 h-6 text-cb-success" strokeWidth={2.5} />
            </span>
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

          {isPortalFormsLocked(profile) && (
            <FormsLockedBanner
              profile={profile}
              unlocking={unlocking}
              onUnlock={async () => {
                if (!profile?.corporateId || unlocking) return;
                setUnlocking(true);
                try {
                  const res = await invokePortalFunction('demoteApplication', {
                    corporateId: profile.corporateId,
                    reason: 'Application demoted for modifications',
                  });
                  if (res.data?.error) {
                    throw new Error(res.data.error);
                  }
                  navigate(`/?dealId=${encodeURIComponent(profile.corporateId)}`, { replace: true });
                } catch (err) {
                  throw err instanceof Error
                    ? err
                    : new Error(err?.message || 'Could not unlock the application.');
                } finally {
                  setUnlocking(false);
                }
              }}
            />
          )}

          {merchantIDs.length > 0 && <UnderwritingTracker locations={locations} merchantIDs={merchantIDs} />}

          {/* Underwriting pipeline — post-submit only (moved off Welcome Hub 2026-07-15) */}
          <ApplicationTracker currentStatus="SUBMITTED" />

          <div>
            <h2 className="text-cb-caption uppercase text-gray-400 mb-4">Complete Your Setup</h2>
            <div className="flex flex-col gap-4">
              <EquipmentOrderPanel
                corporateId={profile.corporateId}
                onModalOpenChange={setQuoteModalOpen}
              />

              <SetupGate
                state={quotePaid ? 'unlocked' : quoteSigned ? 'hold' : 'locked'}
                title={quotePaid ? null : quoteSigned ? 'Shipping Hold' : 'Shipping locked'}
                holdMessage="Shipping Hold — Terminals will ship once invoice payment is fully cleared."
                lockedMessage="Available after your quote is signed and paid."
              >
                <div className="bg-cb-surface-raised rounded-cb border border-cb-border p-5">
                  <div className="flex items-center justify-between mb-1">
                    <h3 className="text-cb-body font-semibold text-white">
                      {quotePaid ? 'Ready to Ship' : 'Equipment Shipping Router'}
                    </h3>
                    {quotePaid && (
                      <button
                        type="button"
                        onClick={() => setShowShipping(true)}
                        className="text-cb-caption normal-case tracking-normal font-medium text-cb-accent hover:opacity-90 underline"
                      >
                        Route
                      </button>
                    )}
                  </div>
                  <p className="text-cb-caption normal-case tracking-normal font-normal text-gray-500">
                    {quotePaid
                      ? 'Tell us where to ship your payment terminals — storefront, corporate mailing, or a staging warehouse.'
                      : 'Terminal shipping unlocks after your invoice is paid in full.'}
                  </p>
                </div>
              </SetupGate>

              <SetupGate
                state={quoteSigned ? 'unlocked' : 'locked'}
                title="Menu & inventory locked"
                lockedMessage="Available after your quote is signed."
              >
                <InventoryUpload
                  corporateId={profile.corporateId}
                  locations={locations}
                  merchantIDs={merchantIDs}
                />
              </SetupGate>

              <SetupGate
                state={quoteSigned ? 'unlocked' : 'locked'}
                title="Legacy POS locked"
                lockedMessage="Available after your quote is signed."
              >
                <ConnectLegacyPOS corporateId={profile.corporateId} />
              </SetupGate>
            </div>
          </div>

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
