import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { setMerchantToken, getMerchantToken, clearMerchantToken, invokePortalFunction, merchantTokenHasImp } from '@/lib/merchantAuthFetch';
import TopNav from '@/components/onboarding/TopNav';
import ErrorScreen from '@/components/onboarding/ErrorScreen';
import LoadingScreen from '@/components/onboarding/LoadingScreen';
import SelfServePricing from '@/components/onboarding/SelfServePricing';
// Plaid verification is now handled per-location inside OnboardingLocations
import OnboardingLocations from './OnboardingLocations';
import OnboardingBanking from './OnboardingBanking';
import OnboardingPeople from './OnboardingPeople';
import OnboardingSigning from './OnboardingSigning';
// OnboardingSummary import removed — the summary step was retired 2026-07-10
import MobilePricing from '@/components/onboarding/MobilePricing';
import PortalEntry from '@/components/onboarding/PortalEntry';
import { Lock, Check } from 'lucide-react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import AgentPricingBubble from '@/components/pricing/AgentPricingBubble';
import FormsLockedBanner from '@/components/onboarding/FormsLockedBanner';
import { PortalLockContext } from '@/lib/PortalLockContext';
import { isPortalFormsLocked } from '@/lib/portalLock';
import { readSigningFixStep } from '@/lib/signingErrorRouting';
import { isRosterConfiguredForPeopleStep, isRosterReadyForSigning } from '@/lib/signerRules';
// OnboardingSuccess no longer rendered here — submitted merchants are redirected to /onboarding/dashboard

// 2026-07-06: fixed a real bug here — this array checked for 'Self_CashDiscount'
// but the actual stored value (entity schema + HubSpot flow) was 'CASH_DISCOUNT'
// (now 'SELF_SERVE_CASH_DISCOUNT'), so self-serve Cash Discount merchants were
// NEVER actually recognized as self-serve. See AGENTS.md Critical Lesson #12.
// Self_Swiped/Self_Keyed left as-is — dormant/on hold, not deprecated.
const SELF_SERVE_TIERS = ['Self_Swiped', 'Self_Keyed', 'SELF_SERVE_CASH_DISCOUNT'];

// Steps within the post-agreement flow
const STEP_WELCOME      = 'welcome';
const STEP_PEOPLE       = 'people';
const STEP_LOCATIONS    = 'locations';
const STEP_BANKING      = 'banking';
const STEP_VERIFICATION = 'verification';
const STEP_SUCCESS      = 'success';

// Order used for directional step transitions (forward = slide left, back = slide right)
const STEP_ORDER = [STEP_WELCOME, STEP_PEOPLE, STEP_LOCATIONS, STEP_BANKING, STEP_VERIFICATION];

// pricingTier simplified 2026-07-06 to CUSTOM_FLAT_RATE / CUSTOM_INTERCHANGE_PLUS /
// SELF_SERVE_CASH_DISCOUNT (see AGENTS.md Critical Lesson #12). Legacy labels kept
// so any not-yet-migrated record still renders sensibly instead of showing a raw enum.
const TIER_LABELS = {
  CUSTOM_FLAT_RATE: 'Custom Flat Rate',
  CUSTOM_INTERCHANGE_PLUS: 'Custom Interchange Plus',
  SELF_SERVE_CASH_DISCOUNT: 'Cash Discount',
  // Legacy
  Standard: 'Standard', Premium: 'Premium', Custom: 'Custom', TRADITIONAL: 'Traditional',
  Self_Swiped: 'Traditional Swiped', Self_Keyed: 'Traditional Keyed', Self_CashDiscount: 'Cash Discount',
};
// Tier badge color-coding retired 2026-07-13 (token restraint pass): the plan
// name is a label, not a status, so it renders as one quiet token badge
// regardless of tier. TIER_LABELS above still supplies the display text.

// Named export so /dev/portal-preview can render the card states in isolation
const FIELD_LABELS = {
  ownershipType: 'Business type',
  taxClassType: 'Tax classification',
  establishmentYear: 'Year established',
  legalBusinessName: 'Legal business name',
  federalEIN: 'EIN',
  mailingStreet: 'Legal address street',
  mailingCity: 'Legal address city',
  mailingState: 'Legal address state',
  mailingZip: 'Legal address ZIP',
  dbaName: 'Doing-business-as name',
  businessStreet: 'Street address',
  businessCity: 'City',
  businessState: 'State',
  businessZip: 'ZIP',
  mccCode: 'Business category',
  industryType: 'Industry',
  monthlyCardSales: 'Monthly card sales',
  avgSaleAmount: 'Average sale',
  highestTicketAmount: 'Highest ticket',
  cardPresentPct: 'In-person card share',
  internetPct: 'Online card share',
  motoPct: 'Phone/mail card share',
  businessWebsite: 'Website',
  alcoholSalesPercentage: 'Alcohol sales %',
};

function humanizeFieldKey(key) {
  if (FIELD_LABELS[key]) return FIELD_LABELS[key];
  return String(key)
    .replace(/([A-Z])/g, ' $1')
    .replace(/_/g, ' ')
    .replace(/^./, (c) => c.toUpperCase())
    .trim();
}

export function MilestoneCard({ index, title, description, done, unlocked, ctaLabel, onCta, ctaDisabled, attention, attentionItems = [] }) {
  const reduceMotion = useReducedMotion();
  return (
    <motion.div
      initial={reduceMotion ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={reduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 150, damping: 20, delay: index * 0.05 }}
      className={`flex flex-col sm:flex-row sm:items-start gap-4 rounded-cb border px-5 py-4 transition-colors ${
        unlocked || done
          ? 'bg-cb-surface-raised border-cb-border hover:border-cb-border-strong'
          : 'bg-cb-surface-raised border-cb-border opacity-55'
      }`}
    >
      <div className="flex items-start gap-4 min-w-0 flex-1">
        <div
          className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-cb-body font-semibold ${
            done ? 'bg-cb-success text-cb-bg' : attention ? 'bg-cb-accent text-cb-bg' : unlocked ? 'bg-cb-accent-muted text-cb-accent border border-cb-accent/40' : 'bg-cb-bg text-gray-600 border border-cb-border'
          }`}
        >
          {done ? <Check className="w-4 h-4" strokeWidth={3} /> : unlocked ? index : <Lock className="w-3.5 h-3.5" />}
        </div>

        <div className="flex-1 min-w-0">
          <h3 className={`text-cb-body font-semibold ${unlocked || done ? 'text-white' : 'text-gray-500'}`}>{title}</h3>
          <p className={`text-cb-body mt-0.5 ${unlocked || done ? 'text-gray-400' : 'text-gray-600'}`}>{description}</p>
          {/* Per-record list of what the applicant still needs to fill in */}
          {attention && attentionItems.length > 0 && (
            <ul className="mt-2.5 flex flex-col gap-1.5">
              {attentionItems.slice(0, 5).map((it, i) => (
                <li key={i} className="text-cb-body text-gray-400 flex items-start gap-2">
                  <span className="mt-1.5 w-1 h-1 rounded-full bg-cb-accent flex-shrink-0" />
                  <span><span className="font-medium text-gray-300">{it.label}:</span> {(it.missing || []).map(humanizeFieldKey).join(', ')}</span>
                </li>
              ))}
              {attentionItems.length > 5 && (
                <li className="text-cb-caption normal-case tracking-normal font-normal text-gray-500 pl-3">…and {attentionItems.length - 5} more</li>
              )}
            </ul>
          )}
        </div>
      </div>

      <div className="flex-shrink-0 w-full sm:w-auto sm:self-center">
        {done ? (
          <span className="inline-flex items-center gap-2.5 w-full sm:w-auto justify-between sm:justify-end">
            <span className="inline-flex items-center gap-1.5 text-cb-caption normal-case tracking-normal text-gray-400">
              <Check className="w-3.5 h-3.5 text-cb-success" strokeWidth={3} /> Complete
            </span>
            {/* Completed steps stay reachable for review/edits — prefilled data
                especially needs merchant eyes on it before submission */}
            {onCta && unlocked && (
              <button onClick={onCta}
                className="text-cb-body font-medium px-3 py-1.5 rounded-cb border border-cb-border text-gray-300 hover:text-white hover:border-cb-border-strong transition-colors">
                Review
              </button>
            )}
          </span>
        ) : (
          <button
            onClick={onCta}
            disabled={!unlocked || ctaDisabled}
            className="w-full sm:w-auto text-cb-body font-semibold px-4 py-2.5 sm:py-2 rounded-cb transition-colors bg-cb-accent hover:opacity-90 text-cb-bg disabled:bg-cb-bg disabled:text-gray-600 disabled:border disabled:border-cb-border disabled:cursor-not-allowed"
          >
            {ctaLabel}
          </button>
        )}
      </div>
    </motion.div>
  );
}

export default function OnboardingPortal() {
  const [mode, setMode]               = useState(null); // 'sales' | 'self_serve'
  const [dealId, setDealId]           = useState(null);
  const [profile, setProfile]         = useState(null);
  const [unlocking, setUnlocking]     = useState(false);
  const [locations, setLocations]     = useState([]);
  // Backend-computed data-completeness report (entity/location/MID missing fields)
  const [readiness, setReadiness]     = useState(null);
  const [step, setStep]               = useState(STEP_WELCOME); // within post-agreement flow
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState(null);
  const [redirected, setRedirected]   = useState(false);
  const [stagedApp, setStagedApp]     = useState(null); // active StagedApplication record
  const stagedAppRef                  = useRef(null);   // readable in async fetchMerchantData
  // Track which steps have been completed for the progress tracker
  const [completedSteps, setCompletedSteps] = useState({});
  // Track whether verification step had all signers verified (survives back navigation)
  const [signersVerified, setSignersVerified] = useState(false);
  // Live roster for Welcome Hub — People completion must derive from saved signers,
  // not only in-memory completedSteps.people (lost on refresh / never Continue).
  const [portalSigners, setPortalSigners] = useState([]);
  // Bump on unlock so Verification remounts clean (no auto-restaging stale packages)
  const [verifySessionKey, setVerifySessionKey] = useState(0);
  // true when a workspace admin opened the portal via impersonate (30-min JWT)
  // or via ?corporateId= with a workspace session. Saves are allowed — sales
  // guides merchants live. Banner warns that writes hit the live merchant record.
  const [isImpersonating, setIsImpersonating] = useState(false);
  // Directional step motion: 1 = forward (slide left), -1 = back (slide right)
  const [stepDir, setStepDir] = useState(1);
  const stepRef = useRef(step);

  const goToStep = (next) => {
    const from = STEP_ORDER.indexOf(stepRef.current);
    const to = STEP_ORDER.indexOf(next);
    if (from >= 0 && to >= 0 && from !== to) {
      setStepDir(to > from ? 1 : -1);
    } else {
      setStepDir(1);
    }
    stepRef.current = next;
    setStep(next);
  };

  const handleSignersVerified = (v) => {
    setSignersVerified(v);
    if (v) setCompletedSteps(prev => ({ ...prev, verify: true }));
  };
  const navigate                      = useNavigate();
  // Must be called unconditionally — before any early return. Calling it after
  // the loading/error gates caused React #310 ("Rendered more hooks than during
  // the previous render") and a white screen once the portal finished loading.
  const reduceMotion = useReducedMotion();
  const stepSpring = reduceMotion
    ? { duration: 0 }
    : { type: 'spring', stiffness: 150, damping: 20 };

  useEffect(() => {
    const params  = new URLSearchParams(window.location.search);
    const id      = params.get('dealId') || params.get('corporateId');
    const token   = params.get('token');
    const stageId = params.get('stageId');
    const impersonateToken = params.get('impersonateToken');

    // Admin impersonation: short-lived merchant JWT minted by manageStagedApplication
    // action "impersonate". Store it, strip from the address bar, open the live portal.
    // Agent open is counted server-side on the impersonate call — mark it so we don't
    // also emit a merchant portal_open from this tab.
    if (impersonateToken && id) {
      setMerchantToken(impersonateToken);
      sessionStorage.setItem('portal_impersonating', String(id));
      sessionStorage.setItem(`portal_agent_open_server_${id}`, '1');
      sessionStorage.setItem(`portal_open_logged_agent_${id}`, '1');
      setIsImpersonating(true);
      setMode('sales');
      setDealId(id);
      const clean = new URL(window.location.href);
      clean.searchParams.delete('impersonateToken');
      window.history.replaceState({}, '', clean.pathname + clean.search);
      return;
    }

    if (stageId && token) { validateStageToken(stageId, token); }
    else if (id)          { handleDirectAccess(id); }
    else if (token)       { validateResumeToken(token); }
    else                  { setMode('entry'); setLoading(false); }
  }, []);

  // A dealId/corporateId in the URL with no merchant token could be a legitimate
  // sales-rep/agent link, or someone guessing/copying another merchant's id.
  // Gate on an existing merchant session first, then fall back to checking for
  // an authenticated Base44 workspace session (agent) before allowing any access.
  const handleDirectAccess = async (id) => {
    // Already-established merchant session for this tab (e.g. resumed earlier
    // via magic link, or admin impersonation JWT still in sessionStorage).
    if (getMerchantToken()) {
      if (sessionStorage.getItem('portal_impersonating') === String(id)) {
        setIsImpersonating(true);
      }
      setMode('sales');
      setDealId(id);
      return;
    }

    setLoading(true);
    try {
      await base44.auth.me();
      // Valid workspace session without a merchant JWT — still allow interactive
      // access (admin actor via invokePortalFunction fallback). Prefer the
      // impersonate action for a proper 30-min merchant JWT when guiding Saves.
      sessionStorage.setItem('portal_impersonating', String(id));
      setIsImpersonating(true);
      setMode('sales');
      setDealId(id);
    } catch {
      // No merchant token and no workspace session. Agents sign in via /login
      // (wired in App.jsx — previously missing, which made this path a blank/404).
      // Merchants should use their email invite link, not a bare corporateId URL.
      setProfile(null);
      setLocations([]);
      setDealId(null);
      setMode(null);
      clearMerchantToken();
      sessionStorage.removeItem('portal_impersonating');
      setLoading(false);
      const from = encodeURIComponent(window.location.href);
      window.location.replace(`/login?from_url=${from}`);
    }
  };

  const validateStageToken = async (stageId, token) => {
    setLoading(true);
    try {
      // Server-side validation: the backend compares the token and, on success,
      // returns a signed merchant JWT that authenticates every portal call in
      // this session. The stage's accessToken is never sent back to the browser.
      const res = await invokePortalFunction('manageStagedApplication', { action: 'validate', stageId, token });
      const stage = res.data?.success ? res.data.stage : null;
      if (!stage) {
        setError({ title: 'Invalid Link', message: 'This staged application link is invalid or has expired.' });
        setLoading(false);
        return;
      }
      setMerchantToken(res.data.merchantToken);
      sessionStorage.removeItem('portal_impersonating');
      setIsImpersonating(false);
      setStagedApp(stage);
      stagedAppRef.current = stage;
      setMode('sales');
      setDealId(stage.corporateId);
    } catch (err) {
      console.error('[validateStageToken] error:', err);
      // If the function call failed (e.g. auth/network), fall back to loading by corporateId
      // from the stage record directly — attempt to treat token as a resume token instead
      setError({ title: 'Connection Error', message: "We couldn't validate your link. Please try again or contact support." });
      setLoading(false);
    }
  };

  const validateResumeToken = async (token) => {
    setLoading(true);
    try {
      // Check if we already validated this token in this session
      const sessionKey = `resume_corp_${token}`;
      const cachedCorporateId = sessionStorage.getItem(sessionKey);
      if (cachedCorporateId) {
        setMode('sales');
        setDealId(cachedCorporateId);
        return;
      }

      const res  = await invokePortalFunction('validateResumeToken', { token });
      const data = res.data;
      if (!data?.success || !data?.corporateId) {
        setError({
          title: data?.expired ? 'Link Expired' : 'Invalid Link',
          message: data?.error || 'This link is no longer valid. Please request a new one from the portal.',
        });
        setLoading(false);
        return;
      }
      // Cache in session so refreshes within the same browser session work
      sessionStorage.setItem(sessionKey, data.corporateId);
      // Store the signed merchant token for use by invokePortalFunction on
      // subsequent calls — persists in sessionStorage same as the corporateId above.
      setMerchantToken(data.merchantToken);
      sessionStorage.removeItem('portal_impersonating');
      setIsImpersonating(false);
      // Token valid — fetchMerchantData (triggered by dealId change) will set loading false
      setMode('sales');
      setDealId(data.corporateId);
    } catch {
      setError({ title: 'Connection Error', message: "We couldn't validate your link. Please try again or request a new one." });
      setLoading(false);
    }
  };

  useEffect(() => {
    if (mode === 'sales' && dealId) initMerchantData(dealId);
  }, [mode, dealId]);

  // On first load with a dealId, sync from HubSpot before fetching local data.
  // This pre-populates locations/MIDs from the sales rep's HubSpot record so the
  // merchant doesn't have to enter them manually.
  const initMerchantData = async (id) => {
    setLoading(true);
    setError(null);
    try {
      // Quick pre-check: does this profile already have locations? If yes, skip sync
      // to avoid unnecessary HubSpot API calls on every portal visit.
      const checkRes = await invokePortalFunction('getMerchantData', { corporateId: id });
      const checkData = checkRes.data;
      const hasLocations = (checkData?.locations?.length ?? 0) > 0;
      // Sync on first visit (no locations yet) AND on every visit while the
      // quote is unsigned — the quote link and esign status live in HubSpot,
      // so reloading after the rep publishes (or the merchant signs) the quote
      // picks up the change without any rep action or webhook.
      const quotePending = checkData?.profile?.applicationStatus === 'Incomplete';

      if (!hasLocations || quotePending) {
        try {
          await invokePortalFunction('syncFromHubspot', { dealId: id });
        } catch {
          // Non-fatal — if HubSpot sync fails, merchant can still fill in manually
        }
      }
      // Merchant opened the portal — advance HubSpot stage (best-effort)
      pushMilestoneToHubspot(id, 'link_opened');
    } catch (err) {
      console.error('[initMerchantData] pre-check/sync error:', err);
      // If even the pre-check fails, fall through to fetchMerchantData which will handle it
    }
    await fetchMerchantData(id);
  };

  // silent=true is used by the Welcome Hub background poll — it must never flash
  // the full-screen LoadingScreen/ErrorScreen (both gated on loading/error state)
  // while quietly checking for a status change every few seconds.
  const fetchMerchantData = async (id, { silent = false } = {}) => {
    if (!silent) {
      setLoading(true);
      setError(null);
    }
    try {
      // Note: syncFromHubspot is already called in initMerchantData — do NOT call it again here
      // to avoid unnecessary API calls and rate limiting.
      const res = await invokePortalFunction('getMerchantData', { corporateId: id });
      const data = res.data;
      if (data?.error) {
        if (!silent) {
          setError({ title: 'Merchant Not Found', message: "We couldn't find your merchant profile. Please verify your link or contact your Cliqbux representative." });
        }
        return;
      }
      // Apply staged application filters if present
      let mergedProfile = data.profile;
      let filteredLocations = data.locations || [];
      const stage = stagedAppRef.current;
      if (stage && stage.label !== '__auto_track__') {
        if (stage.prefilledData && Object.keys(stage.prefilledData).length > 0) {
          mergedProfile = { ...mergedProfile, ...stage.prefilledData };
        }
        if (stage.includedLocationIds?.length > 0) {
          filteredLocations = filteredLocations.filter(l => stage.includedLocationIds.includes(l.id || l.locationId));
        }
      }
      setProfile(mergedProfile);
      setLocations(filteredLocations);
      setReadiness(data.readiness || null);

      // People hub completion: load roster and derive from saved Control Person
      // (same pattern as Locations/Banking deriving from location/bank records).
      // Without this, refresh always showed "Set up people" even when Michael was
      // already Control Person + Verified (Porky's 2026-07-20).
      try {
        const signerRes = await invokePortalFunction('manageSigner', {
          action: 'list',
          corporateId: id,
        });
        const list = signerRes.data?.signers || [];
        setPortalSigners(list);
        const peopleConfigured = isRosterConfiguredForPeopleStep(list);
        const kycReady = isRosterReadyForSigning(list);
        if (peopleConfigured) {
          setCompletedSteps((prev) => (prev.people ? prev : { ...prev, people: true }));
        }
        if (kycReady) {
          setSignersVerified(true);
          setCompletedSteps((prev) => (prev.verify ? prev : { ...prev, verify: true }));
        }
        if (peopleConfigured && !silent && mergedProfile?.corporateId && mergedProfile?.applicationStatus !== 'Submitted') {
          trackProgress(mergedProfile.corporateId, {
            completedSteps: { people: true, ...(kycReady ? { verify: true } : {}) },
          });
        }
      } catch (signerErr) {
        console.warn('[fetchMerchantData] signer list for People hub (non-fatal):', signerErr?.message || signerErr);
      }

      // Heartbeat metadata + portal_open (once per tab). Agent View opens are
      // counted by manageStagedApplication impersonate — never log those as merchant.
      if (mergedProfile?.corporateId && mergedProfile?.applicationStatus !== 'Submitted') {
        const corp = String(mergedProfile.corporateId);
        const isAgentSession = !!(
          isImpersonating
          || sessionStorage.getItem('portal_impersonating') === corp
          || merchantTokenHasImp()
        );
        const patch = {
          merchantName: mergedProfile.legalName,
          signerEmail: mergedProfile.signerEmail,
          pricingTier: mergedProfile.pricingTier,
          applicationStatus: mergedProfile.applicationStatus,
        };
        if (isAgentSession) {
          const openKey = `portal_open_logged_agent_${corp}`;
          const serverCounted = sessionStorage.getItem(`portal_agent_open_server_${corp}`);
          if (!serverCounted && !sessionStorage.getItem(openKey)) {
            patch.activityEvent = { type: 'portal_open', actor: 'agent' };
            sessionStorage.setItem(openKey, '1');
          }
        } else {
          const openKey = `portal_open_logged_merchant_${corp}`;
          if (!sessionStorage.getItem(openKey)) {
            patch.activityEvent = { type: 'portal_open', actor: 'merchant' };
            sessionStorage.setItem(openKey, '1');
          }
        }
        trackProgress(mergedProfile.corporateId, patch);
      }
      if (data.profile?.applicationStatus === 'Submitted') {
        setRedirected(true);
        navigate(`/onboarding/dashboard?dealId=${data.profile.corporateId}`, { replace: true });
        return;
      }
      return mergedProfile;
    } catch {
      if (!silent) {
        setError({ title: 'Connection Error', message: "We're having trouble loading your portal. Please try refreshing the page." });
      }
    } finally {
      if (!silent) setLoading(false);
    }
  };

  // Fire-and-forget HubSpot stage update — never blocks the UI
  const pushMilestoneToHubspot = (corporateId, milestone) => {
    if (!corporateId) return;
    invokePortalFunction('pushStatusToHubspot', { corporateId, milestone }).catch(() => {
      // Non-fatal — HubSpot sync is best-effort
    });
  };

  // Fire-and-forget progress tracking — upserts a StagedApplication record for admin visibility
  const trackProgress = (corporateId, progressData) => {
    if (!corporateId) return;
    invokePortalFunction('manageStagedApplication', {
      action: 'trackProgress',
      corporateId,
      data: progressData,
    }).catch(() => {});
  };

  // Merchant time-in-portal (visible-tab heartbeats). Credits real elapsed
  // seconds since the last credit (capped at 5 min) so a delayed/throttled
  // interval still lands as e.g. 5m in the admin UI, not a flat +1m.
  // Agent/impersonation sessions are not timed — opens are enough for admin.
  useEffect(() => {
    if (mode !== 'sales' || !dealId) return undefined;
    if (profile?.applicationStatus === 'Submitted') return undefined;
    const isAgent = (
      isImpersonating
      || sessionStorage.getItem('portal_impersonating') === String(dealId)
      || merchantTokenHasImp()
    );
    if (isAgent) return undefined;
    const INTERVAL_MS = 60 * 1000;
    const MAX_CREDIT_SECS = 300; // must match backend session_tick cap
    let lastCreditAt = Date.now();
    const tick = () => {
      const now = Date.now();
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
        // Freeze the clock while hidden — don't credit background time.
        lastCreditAt = now;
        return;
      }
      const secs = Math.min(MAX_CREDIT_SECS, Math.max(0, Math.round((now - lastCreditAt) / 1000)));
      lastCreditAt = now;
      if (secs < 1) return;
      trackProgress(dealId, {
        activityEvent: { type: 'session_tick', actor: 'merchant', seconds: secs },
      });
    };
    const id = setInterval(tick, INTERVAL_MS);
    return () => clearInterval(id);
  }, [mode, dealId, isImpersonating, profile?.applicationStatus]);

  // (2026-07-10 flow reorder: the old quote-signing poll and Step1Agreement
  // status handler were removed — the equipment quote is now signed on the
  // post-submission dashboard and gates nothing in this flow.)

  const handleSelfServeComplete = (newProfile) => {
    setProfile(newProfile);
    setLocations([]);
    setMode('sales');
    // Persist the merchant session token issued by createHubspotDeal, and put
    // corporateId in the URL — without both of these, a page refresh had no
    // way to recognize this merchant and fell all the way back to the
    // pricing/entry screen, even though their data was already saved server-side.
    if (newProfile.merchantToken) setMerchantToken(newProfile.merchantToken);
    if (newProfile.corporateId) {
      const params = new URLSearchParams(window.location.search);
      params.set('dealId', newProfile.corporateId);
      navigate(`${window.location.pathname}?${params.toString()}`, { replace: true });
    }
  };

  const handlePeopleContinue = () => {
    setCompletedSteps(prev => ({ ...prev, people: true }));
    goToStep(STEP_LOCATIONS);
    trackProgress(profile?.corporateId, {
      currentStep: 'locations',
      completedSteps: { agreement: true, people: true },
    });
  };

  const handleLocationsContinue = ({ locations: updatedLocations, legalEntities }) => {
    setLocations(updatedLocations);
    setCompletedSteps(prev => ({ ...prev, locations: true }));
    goToStep(STEP_BANKING);
    pushMilestoneToHubspot(profile?.corporateId, 'locations_added');
    trackProgress(profile?.corporateId, {
      currentStep: 'banking',
      completedSteps: { agreement: true, people: true, locations: true },
    });
  };

  const handleBankingContinue = ({ locations: updatedLocations }) => {
    setLocations(updatedLocations);
    setCompletedSteps(prev => ({ ...prev, banking: true }));
    goToStep(STEP_VERIFICATION);
    trackProgress(profile?.corporateId, {
      currentStep: 'verification',
      completedSteps: { agreement: true, people: true, locations: true, banking: true },
    });
  };

  const onBackStep = () => goToStep(STEP_WELCOME);

  const handleRequestUnlock = async () => {
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
      const nextStatus = res.data?.profile?.applicationStatus || 'Incomplete';
      setProfile((prev) => ({
        ...prev,
        applicationStatus: nextStatus,
        portalLockStatus: 'unlocked',
      }));
      setSignersVerified(false);
      setVerifySessionKey((k) => k + 1);

      // Route to the step that matches the last signing failure (ownership → verify,
      // bank → banking, MCC/entity → locations). Default to Identity & Signing so
      // merchants can fix signers without being dumped on Locations.
      const fixKey = readSigningFixStep(profile.corporateId) || 'verify';
      const stepMap = {
        people: STEP_PEOPLE,
        locations: STEP_LOCATIONS,
        banking: STEP_BANKING,
        verify: STEP_VERIFICATION,
      };
      goToStep(stepMap[fixKey] || STEP_VERIFICATION);
    } catch (err) {
      console.error('[demoteApplication]', err);
      throw err instanceof Error
        ? err
        : new Error(err?.message || 'Could not unlock the application. Please try again or contact support.');
    } finally {
      setUnlocking(false);
    }
  };

  // Step key → internal step constant
  const handleNavigate = (stepKey) => {
    const map = {
      quote: null,
      people: STEP_PEOPLE,
      locations: STEP_LOCATIONS,
      banking: STEP_BANKING,
      verify: STEP_VERIFICATION,
    };
    const target = map[stepKey];
    if (target) goToStep(target);
  };

  const handleSigningComplete = async () => {
    // Persist Submitted on the profile (not just React/track state) so refresh + lock stay correct.
    try {
      await invokePortalFunction('updateMerchantProfile', {
        corporateId: profile?.corporateId,
        fields: { applicationStatus: 'Submitted' },
      });
    } catch (err) {
      console.error('[handleSigningComplete] failed to persist Submitted', err);
    }
    pushMilestoneToHubspot(profile?.corporateId, 'application_submitted');
    trackProgress(profile?.corporateId, {
      currentStep: 'submitted',
      completedSteps: { agreement: true, people: true, locations: true, banking: true, verify: true },
      applicationStatus: 'Submitted',
    });
    setProfile(prev => ({
      ...prev,
      applicationStatus: 'Submitted',
      portalLockStatus: 'all_signed',
      handoffStage: prev?.handoffStage || 'underwriting',
    }));
    navigate(`/onboarding/dashboard?dealId=${profile.corporateId}`, { replace: true });
  };

  // — Loading & Error —
  if (loading || redirected) return <LoadingScreen />;
  if (error)   return <ErrorScreen title={error.title} message={error.message} />;

  // — No dealId/token: show email-entry gate —
  const isMobile = window.innerWidth < 480;
  if (mode === 'entry') {
    return (
      <PortalEntry
        onSelfServe={() => setMode('self_serve')}
      />
    );
  }

  // — Self-serve pricing —
  if (mode === 'self_serve' && !profile) {
    return isMobile
      ? <MobilePricing onComplete={handleSelfServeComplete} />
      : <SelfServePricing onComplete={handleSelfServeComplete} />;
  }
  if (!profile) return <ErrorScreen />;

  const { applicationStatus, pricingTier } = profile;
  const isSelfServe = SELF_SERVE_TIERS.includes(pricingTier);
  const pricingTierLabel = TIER_LABELS[pricingTier] || pricingTier;
  const formsLocked = isPortalFormsLocked(profile);

  const renderStep = () => {
    // Welcome Hub — macro-level landing page merchants see immediately upon
    // secure entry, before diving into the deep data-entry grids.
    // 2026-07-10 FLOW REORDER (Teddy): data entry and the MERCHANT AGREEMENT come
    // first; the equipment QUOTE is signed LAST, embedded on the post-submission
    // dashboard. Nothing in the application flow is gated on the quote anymore.
    if (step === STEP_WELCOME) {
      // Derive completion from actual saved data, not just this browser tab's
      // in-memory completedSteps — otherwise resuming after a refresh (or in a
      // new tab via a resume link) re-locks milestones the merchant already
      // finished, even though the data is safely on the server.
      const hasLocations = (locations?.length ?? 0) > 0;
      // People "done" = Continue clicked OR roster has exactly one Control Person
      // (live signers), OR legacy all-KYC-ready. Locations alone do NOT mark People done.
      const rosterPeopleDone = isRosterConfiguredForPeopleStep(portalSigners);
      const hasPeople = !!allCompletedSteps.people || signersVerified || rosterPeopleDone;
      const hasBanking = hasLocations && locations.every(l => l.bankDetails?.routingNumber);
      // "Complete" means the data can actually build a valid application — the
      // backend readiness check covers entity, location, and MID required fields.
      // HubSpot prefill creates partially-filled records, so records merely
      // existing is NOT completion (Teddy, 2026-07-10).
      const dataReady = readiness ? readiness.complete : hasLocations;
      const mPeopleDone = hasPeople;
      const m1Done = hasLocations && dataReady;
      const m1Attention = hasLocations && !dataReady;
      const attentionItems = readiness ? [
        ...(readiness.entities || []).map(e => ({ label: e.name, missing: e.missing })),
        ...(readiness.locations || []).map(l => ({ label: l.dbaName, missing: l.missing })),
        ...(readiness.mids || []).map(m => ({ label: m.dbaName, missing: m.missing })),
      ] : [];
      const m2Done = !!allCompletedSteps.banking || hasBanking;
      const m3Done = applicationStatus === 'Submitted';
      const mLocUnlocked = mPeopleDone || hasLocations;
      const m2Unlocked = hasLocations;
      const m3Unlocked = m1Done && m2Done;

      return (
        <div className="px-6 sm:px-8 py-10 flex flex-col gap-8">
          <div>
            <p className="text-cb-caption uppercase text-gray-500 mb-2">Your application</p>
            <h2 className="font-display text-cb-display text-white">{profile.legalName}</h2>
            <p className="text-cb-body-lg text-gray-400 mt-2 max-w-xl">
              Start with who signs and owns the business, then Locations, Banking, and Sign & Submit. Invite remote owners early so their KYC can finish while you work.
            </p>
          </div>

          <div className="flex flex-col gap-3">
            <MilestoneCard
              index={1}
              title="People & KYC"
              description="Name the Control Person (who signs) and Beneficial Owners. Invite anyone who isn't here — they can finish identity checks remotely."
              done={mPeopleDone}
              unlocked={true}
              ctaLabel={mPeopleDone ? 'Review people' : 'Set up people'}
              onCta={() => goToStep(STEP_PEOPLE)}
            />
            <MilestoneCard
              index={2}
              title="Locations"
              description={m1Attention
                ? 'We prefilled what we could from your Cliqbux representative — a few details still need your input:'
                : 'Confirm your legal entities, storefronts, and how each location takes cards.'}
              done={m1Done}
              attention={m1Attention}
              attentionItems={attentionItems}
              unlocked={mLocUnlocked}
              ctaLabel={m1Attention ? 'Finish Details' : 'Set up locations'}
              onCta={() => goToStep(STEP_LOCATIONS)}
              ctaDisabled={!mLocUnlocked}
            />
            <MilestoneCard
              index={3}
              title="Banking"
              description="Connect or manually enter the bank account where your processing funds will deposit."
              done={m2Done}
              unlocked={m2Unlocked}
              ctaLabel="Set up banking"
              onCta={() => goToStep(STEP_BANKING)}
            />
            <MilestoneCard
              index={4}
              title="Sign & Submit"
              description={signersVerified
                ? 'Sign your merchant processing agreement and submit for underwriting approval.'
                : 'Opens when every Beneficial Owner and the Control Person finish KYC. Keep working on Locations and Banking while you wait.'}
              done={m3Done}
              unlocked={m3Unlocked}
              ctaLabel={signersVerified ? 'Continue to signing' : 'Check signing status'}
              onCta={() => goToStep(STEP_VERIFICATION)}
            />
            {/* Equipment is dashboard-only until Submitted (critique 2026-07-15).
                Agents still reach the dashboard via the impersonation banner CTA. */}
            {m3Done && (
              <MilestoneCard
                index={5}
                title="Equipment"
                description="Your equipment and services order — review and sign on the post-signing dashboard."
                done={quoteSigned}
                unlocked={true}
                ctaLabel="Open Dashboard"
                onCta={() => navigate(`/onboarding/dashboard?dealId=${profile.corporateId}`)}
              />
            )}
          </div>
        </div>
      );
    }

    // Deep data-entry steps — available regardless of quote status
    // (2026-07-10 reorder: the equipment quote no longer gates anything)
    {
      if (step === STEP_PEOPLE) {
        return (
          <OnboardingPeople
            profile={profile}
            onContinue={handlePeopleContinue}
            onBack={onBackStep}
          />
        );
      }
      if (step === STEP_LOCATIONS) {
        return (
          <OnboardingLocations
            profile={profile}
            locations={locations}
            onContinue={handleLocationsContinue}
            onBack={() => goToStep(STEP_PEOPLE)}
          />
        );
      }
      if (step === STEP_BANKING) {
        return (
          <OnboardingBanking
            profile={profile}
            onContinue={handleBankingContinue}
            onBack={() => goToStep(STEP_LOCATIONS)}
          />
        );
      }
      if (step === STEP_VERIFICATION) {
        return (
          <OnboardingSigning
            key={`verify-${verifySessionKey}`}
            profile={profile}
            locations={locations}
            initialSignersVerified={signersVerified}
            onSignersVerified={handleSignersVerified}
            onBack={() => goToStep(STEP_BANKING)}
            onComplete={handleSigningComplete}
            onNavigate={handleNavigate}
          />
        );
      }
    }

    return (
      <ErrorScreen
        title="Unexpected State"
        message="Your application is in an unexpected state. Please contact your Cliqbux representative."
      />
    );
  };

  // Map internal step → tracker key. On the Welcome Hub, highlight the next
  // incomplete merchant step so ProgressTracker matches the worklist.
  const stepToKey = {
    [STEP_PEOPLE]: 'people',
    [STEP_LOCATIONS]: 'locations',
    [STEP_BANKING]: 'banking',
    [STEP_VERIFICATION]: 'verify',
  };
  // 2026-07-10 flow reorder: the equipment quote is signed LAST (embedded on the
  // post-submission dashboard). 'Quote Signed' status = HubSpot esign came back
  // SIGNED via syncFromHubspot or the quote_signed webhook.
  const quoteSigned = applicationStatus === 'Quote Signed' || !!profile.quoteSignedAt;
  const hasLocsForTracker = (locations?.length ?? 0) > 0;
  const hasBankForTracker = hasLocsForTracker && locations.every((l) => l.bankDetails?.routingNumber);
  const dataReadyForTracker = readiness ? readiness.complete : hasLocsForTracker;
  // Derive from live saved data (not only in-memory Continue clicks) so refresh
  // keeps Banking/Locations gold when the merchant already finished them.
  const allCompletedSteps = {
    ...completedSteps,
    ...(quoteSigned ? { quote: true } : {}),
    ...(isRosterConfiguredForPeopleStep(portalSigners) ? { people: true } : {}),
    ...(hasLocsForTracker && dataReadyForTracker ? { locations: true } : {}),
    ...(hasBankForTracker ? { banking: true } : {}),
    ...(isRosterReadyForSigning(portalSigners) || signersVerified ? { verify: true } : {}),
  };
  let currentTrackerStep = stepToKey[step] || 'people';
  if (step === STEP_WELCOME) {
    if (!(allCompletedSteps.people || signersVerified || hasLocsForTracker)) currentTrackerStep = 'people';
    else if (!(hasLocsForTracker && dataReadyForTracker)) currentTrackerStep = 'locations';
    else if (!(allCompletedSteps.banking || hasBankForTracker)) currentTrackerStep = 'banking';
    else if (applicationStatus !== 'Submitted') currentTrackerStep = 'verify';
    else currentTrackerStep = quoteSigned ? 'quote' : 'verify';
  }

  return (
    <PortalLockContext.Provider value={{
      formsLocked,
      unlocking,
      onRequestUnlock: handleRequestUnlock,
      canUnlock: isImpersonating || merchantTokenHasImp(),
      setPortalLockStatus: (status) => setProfile((prev) => (prev ? { ...prev, portalLockStatus: status } : prev)),
    }}>
    <div className="portal-bg font-body">
      <TopNav
        applicationStatus={applicationStatus}
        currentStep={currentTrackerStep}
        completedSteps={allCompletedSteps}
        onNavigate={handleNavigate}
        includeEquipment={applicationStatus === 'Submitted'}
      />

      {(isImpersonating || merchantTokenHasImp()) && profile?.corporateId && (
        <AgentPricingBubble
          corporateId={profile.corporateId}
          onPricingApplied={(data) => {
            const next = data?.pricing || data?.profile;
            if (!next) return;
            setProfile(prev => prev ? {
              ...prev,
              pricingType: next.pricingType ?? prev.pricingType,
              pricingTier: next.pricingTier ?? prev.pricingTier,
              customMarkupPercentage: next.customMarkupPercentage ?? prev.customMarkupPercentage,
              customPerTxFee: next.customPerTxFee ?? prev.customPerTxFee,
              customAuthPerCard: next.customAuthPerCard ?? prev.customAuthPerCard,
            } : prev);
          }}
        />
      )}

      <div className="pt-16 min-h-screen flex flex-col items-center justify-start px-4 py-10">
        {isImpersonating && (
          <div className="w-full max-w-4xl mb-4 bg-cb-surface-raised border border-cb-border border-l border-l-cb-accent text-gray-300 text-cb-body px-4 py-2.5 rounded-cb flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <span>
              Impersonating merchant · Corp {profile.corporateId} · Saves write to the live record · session ~30 min
            </span>
            <button
              type="button"
              onClick={() => navigate(`/onboarding/dashboard?dealId=${profile.corporateId}`)}
              className="text-cb-caption font-semibold px-3 py-1.5 rounded-cb bg-cb-accent text-cb-bg hover:opacity-90 whitespace-nowrap self-start sm:self-auto min-h-11"
            >
              Post-signing dashboard
            </button>
          </div>
        )}
        {/* Merchant greeting — hidden on Welcome Hub (card has its own header).
            Corp ID is agent-only (critique 2026-07-15: ops chrome on merchant hub). */}
        {step !== STEP_WELCOME && (
          <div className="w-full max-w-4xl mb-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div>
                <p className="text-cb-caption uppercase text-gray-500 mb-1">Welcome</p>
                <h1 className="font-display text-cb-title text-white">{profile.legalName}</h1>
                <p className="text-cb-body text-gray-500 mt-0.5">{profile.signerEmail}</p>
              </div>
              <div className="flex flex-col items-end gap-1.5">
                {pricingTier && (
                  <span className="text-cb-caption normal-case tracking-normal font-medium text-gray-300 border border-cb-border px-3 py-1 rounded-full">
                    {pricingTierLabel} Plan
                  </span>
                )}
                {isImpersonating && (profile.customMarkupPercentage != null || profile.customPerTxFee != null) && (
                  <span className="text-cb-caption text-gray-500">
                    {[
                      profile.customMarkupPercentage != null && Number.isFinite(Number(profile.customMarkupPercentage))
                        ? `${Number(profile.customMarkupPercentage)}%`
                        : null,
                      profile.customPerTxFee != null && Number.isFinite(Number(profile.customPerTxFee))
                        ? `$${Number(profile.customPerTxFee).toFixed(2)}/txn`
                        : null,
                      profile.customAuthPerCard != null && Number.isFinite(Number(profile.customAuthPerCard))
                        ? `$${Number(profile.customAuthPerCard).toFixed(2)} auth`
                        : null,
                    ].filter(Boolean).join(' · ')}
                  </span>
                )}
                {isSelfServe && (
                  <span className="text-cb-caption normal-case tracking-normal font-normal text-gray-500">
                    Self-Serve
                  </span>
                )}
                {isImpersonating && (
                  <span className="text-cb-caption normal-case tracking-normal font-normal text-gray-600 font-mono">ID: {profile.corporateId}</span>
                )}
              </div>
            </div>
          </div>
        )}

        {formsLocked && (
          <div className="w-full max-w-4xl mb-4 sticky top-16 z-30">
            <FormsLockedBanner
              profile={profile}
              onUnlock={handleRequestUnlock}
              unlocking={unlocking}
              canUnlock={isImpersonating || merchantTokenHasImp()}
            />
          </div>
        )}

        {/* Main card — directional step transitions via framer-motion */}
        <div className="w-full max-w-4xl portal-card overflow-hidden">
          <AnimatePresence mode="wait" initial={false} custom={stepDir}>
            <motion.div
              key={step}
              custom={stepDir}
              initial={reduceMotion ? false : (dir) => ({ opacity: 0, x: dir * 24 })}
              animate={{ opacity: 1, x: 0 }}
              exit={reduceMotion ? undefined : (dir) => ({ opacity: 0, x: dir * -24 })}
              transition={stepSpring}
            >
              {renderStep()}
            </motion.div>
          </AnimatePresence>
        </div>

        <div className="mt-8 text-center">
          <p className="text-cb-caption normal-case tracking-normal font-normal text-gray-600">
            Secured by <span className="text-cb-accent font-medium">Cliqbux</span> &nbsp;·&nbsp; onboarding.cliqbux.com &nbsp;·&nbsp; {new Date().getFullYear()}
          </p>
        </div>
      </div>
    </div>
    </PortalLockContext.Provider>
  );
}
