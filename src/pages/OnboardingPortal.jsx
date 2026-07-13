import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { setMerchantToken, getMerchantToken, clearMerchantToken, invokePortalFunction } from '@/lib/merchantAuthFetch';
import TopNav from '@/components/onboarding/TopNav';
import ErrorScreen from '@/components/onboarding/ErrorScreen';
import LoadingScreen from '@/components/onboarding/LoadingScreen';
import SelfServePricing from '@/components/onboarding/SelfServePricing';
// Plaid verification is now handled per-location inside OnboardingLocations
import OnboardingLocations from './OnboardingLocations';
import OnboardingBanking from './OnboardingBanking';
import OnboardingVerification from './OnboardingVerification';
// OnboardingSummary import removed — the summary step was retired 2026-07-10
import MobilePricing from '@/components/onboarding/MobilePricing';
import PortalEntry from '@/components/onboarding/PortalEntry';
import ApplicationTracker from '@/components/onboarding/ApplicationTracker';
import { Lock, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
// OnboardingSuccess no longer rendered here — submitted merchants are redirected to /onboarding/dashboard

// 2026-07-06: fixed a real bug here — this array checked for 'Self_CashDiscount'
// but the actual stored value (entity schema + HubSpot flow) was 'CASH_DISCOUNT'
// (now 'SELF_SERVE_CASH_DISCOUNT'), so self-serve Cash Discount merchants were
// NEVER actually recognized as self-serve. See AGENTS.md Critical Lesson #12.
// Self_Swiped/Self_Keyed left as-is — dormant/on hold, not deprecated.
const SELF_SERVE_TIERS = ['Self_Swiped', 'Self_Keyed', 'SELF_SERVE_CASH_DISCOUNT'];

// Steps within the post-agreement flow
const STEP_WELCOME      = 'welcome';
const STEP_LOCATIONS    = 'locations';
const STEP_BANKING      = 'banking';
const STEP_VERIFICATION = 'verification';
const STEP_SUCCESS      = 'success';

// Order used for directional step transitions (forward = slide left, back = slide right)
const STEP_ORDER = [STEP_WELCOME, STEP_LOCATIONS, STEP_BANKING, STEP_VERIFICATION];

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
export function MilestoneCard({ index, title, description, done, unlocked, ctaLabel, onCta, ctaDisabled, attention, attentionItems = [] }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: index * 0.07, ease: [0.22, 1, 0.36, 1] }}
      whileHover={unlocked && !done ? { y: -2 } : undefined}
      className={`flex items-start gap-4 rounded-cb border px-5 py-4 transition-colors ${
        unlocked || done
          ? 'bg-cb-surface-raised border-cb-border hover:border-cb-border-strong'
          : 'bg-cb-surface-raised border-cb-border opacity-55'
      }`}
    >
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
                <span><span className="font-medium text-gray-300">{it.label}:</span> {it.missing.join(', ')}</span>
              </li>
            ))}
            {attentionItems.length > 5 && (
              <li className="text-cb-caption normal-case tracking-normal font-normal text-gray-500 pl-3">…and {attentionItems.length - 5} more</li>
            )}
          </ul>
        )}
      </div>

      <div className="flex-shrink-0">
        {done ? (
          <span className="inline-flex items-center gap-2.5">
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
            className="text-cb-body font-semibold px-4 py-2 rounded-cb transition-colors bg-cb-accent hover:opacity-90 text-cb-bg disabled:bg-cb-bg disabled:text-gray-600 disabled:border disabled:border-cb-border disabled:cursor-not-allowed"
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
  // true when a Base44 workspace user (agent) is viewing via a direct dealId/corporateId
  // link with no merchant token — read-only, view-only access, not a merchant session.
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

  useEffect(() => {
    const params  = new URLSearchParams(window.location.search);
    const id      = params.get('dealId') || params.get('corporateId');
    const token   = params.get('token');
    const stageId = params.get('stageId');
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
    // via magic link) — trust it as before, no extra check needed.
    if (getMerchantToken()) {
      setMode('sales');
      setDealId(id);
      return;
    }

    setLoading(true);
    try {
      await base44.auth.me();
      // Valid workspace session — allow read-only impersonation view, not a
      // merchant session. Write actions still need to be gated per-screen in
      // a follow-up pass; this only grants view access at the routing level.
      setIsImpersonating(true);
      setMode('sales');
      setDealId(id);
    } catch {
      // No merchant token and no workspace session — wipe state and redirect
      // to Base44's hosted login, returning here afterward if they sign in.
      setProfile(null);
      setLocations([]);
      setDealId(null);
      setMode(null);
      clearMerchantToken();
      base44.auth.redirectToLogin(window.location.href);
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
      // Track that merchant opened the portal — creates a record if none exists
      if (mergedProfile?.corporateId && mergedProfile?.applicationStatus !== 'Submitted') {
        trackProgress(mergedProfile.corporateId, {
          currentStep: 'locations',
          merchantName: mergedProfile.legalName,
          signerEmail: mergedProfile.signerEmail,
          pricingTier: mergedProfile.pricingTier,
          applicationStatus: mergedProfile.applicationStatus,
        });
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

  const handleLocationsContinue = ({ locations: updatedLocations, legalEntities }) => {
    setLocations(updatedLocations);
    setCompletedSteps(prev => ({ ...prev, locations: true }));
    goToStep(STEP_BANKING);
    pushMilestoneToHubspot(profile?.corporateId, 'locations_added');
    trackProgress(profile?.corporateId, { currentStep: 'banking', completedSteps: { agreement: true, locations: true } });
  };

  const handleBankingContinue = ({ locations: updatedLocations }) => {
    setLocations(updatedLocations);
    setCompletedSteps(prev => ({ ...prev, banking: true }));
    goToStep(STEP_VERIFICATION);
    trackProgress(profile?.corporateId, { currentStep: 'verification', completedSteps: { agreement: true, locations: true, banking: true } });
  };

  const onBackStep = () => goToStep(STEP_WELCOME);

  // Step key → internal step constant
  const handleNavigate = (stepKey) => {
    const map = { quote: null, locations: STEP_LOCATIONS, banking: STEP_BANKING, verify: STEP_VERIFICATION };
    const target = map[stepKey];
    if (target) goToStep(target);
  };

  const handleSigningComplete = async () => {
    // Mark submitted, sync to HubSpot, redirect to dashboard
    pushMilestoneToHubspot(profile?.corporateId, 'application_submitted');
    trackProgress(profile?.corporateId, { currentStep: 'submitted', completedSteps: { agreement: true, locations: true, banking: true, verify: true }, applicationStatus: 'Submitted' });
    setProfile(prev => ({ ...prev, applicationStatus: 'Submitted' }));
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
      const hasBanking = hasLocations && locations.every(l => l.bankDetails?.routingNumber);
      // "Complete" means the data can actually build a valid application — the
      // backend readiness check covers entity, location, and MID required fields.
      // HubSpot prefill creates partially-filled records, so records merely
      // existing is NOT completion (Teddy, 2026-07-10).
      const dataReady = readiness ? readiness.complete : hasLocations;
      const m1Done = hasLocations && dataReady;
      const m1Attention = hasLocations && !dataReady;
      const attentionItems = readiness ? [
        ...readiness.entities.map(e => ({ label: e.name, missing: e.missing })),
        ...readiness.locations.map(l => ({ label: l.dbaName, missing: l.missing })),
        ...readiness.mids.map(m => ({ label: `${m.dbaName} (Merchant ID)`, missing: m.missing })),
      ] : [];
      const m2Done = !!allCompletedSteps.banking || hasBanking;
      const m3Done = applicationStatus === 'Submitted';
      const m2Unlocked = hasLocations;
      const m3Unlocked = m1Done && m2Done;

      return (
        <div className="px-6 sm:px-8 py-10 flex flex-col gap-8">
          <div>
            <p className="text-cb-caption uppercase text-gray-500 mb-2">Welcome back</p>
            <h2 className="font-display text-cb-display text-white">{profile.legalName}</h2>
            <p className="text-cb-body-lg text-gray-400 mt-2 max-w-xl">
              Here's where things stand with your Cliqbux onboarding. Work through each milestone below to get processing.
            </p>
          </div>

          <ApplicationTracker currentStatus={applicationStatus === 'Submitted' ? 'SUBMITTED' : 'DRAFT'} />

          <div className="flex flex-col gap-3">
            <MilestoneCard
              index={1}
              title="Complete Merchant Profile & Storefronts"
              description={m1Attention
                ? 'We prefilled what we could from your Cliqbux representative — a few details still need your input:'
                : 'Review and confirm your legal entities, storefront locations, and Merchant IDs.'}
              done={m1Done}
              attention={m1Attention}
              attentionItems={attentionItems}
              unlocked={true}
              ctaLabel={m1Attention ? 'Finish Details' : 'Configure Locations & MIDs'}
              onCta={() => goToStep(STEP_LOCATIONS)}
            />
            <MilestoneCard
              index={2}
              title="Link Deposit Bank Account"
              description="Connect or manually enter the bank account where your processing funds will deposit."
              done={m2Done}
              unlocked={m2Unlocked}
              ctaLabel="Set Up Banking"
              onCta={() => goToStep(STEP_BANKING)}
            />
            <MilestoneCard
              index={3}
              title="Verify Identity & Sign Merchant Agreement"
              description="Verify signer identities, sign your merchant processing agreement, and submit for underwriting approval."
              done={m3Done}
              unlocked={m3Unlocked}
              ctaLabel="Continue to Verification"
              onCta={() => goToStep(STEP_VERIFICATION)}
            />
            <MilestoneCard
              index={4}
              title="Review & Sign Equipment Quote"
              description="Your equipment and services order — signed on your dashboard after the merchant application is submitted."
              done={quoteSigned}
              unlocked={m3Done}
              ctaLabel="Open Dashboard"
              onCta={() => navigate(`/onboarding/dashboard?dealId=${profile.corporateId}`)}
            />
          </div>
        </div>
      );
    }

    // Deep data-entry steps — available regardless of quote status
    // (2026-07-10 reorder: the equipment quote no longer gates anything)
    {
      if (step === STEP_LOCATIONS) {
        return (
          <OnboardingLocations
            profile={profile}
            locations={locations}
            onContinue={handleLocationsContinue}
            onBack={onBackStep}
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
          <OnboardingVerification
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

  // Map internal step → tracker key
  const stepToKey = { [STEP_LOCATIONS]: 'locations', [STEP_BANKING]: 'banking', [STEP_VERIFICATION]: 'verify' };
  const currentTrackerStep = stepToKey[step] || 'locations';

  // 2026-07-10 flow reorder: the equipment quote is signed LAST (embedded on the
  // post-submission dashboard). 'Quote Signed' status = HubSpot esign came back
  // SIGNED via syncFromHubspot or the quote_signed webhook.
  const quoteSigned = applicationStatus === 'Quote Signed';
  const allCompletedSteps = { ...completedSteps, ...(quoteSigned ? { quote: true } : {}) };

  return (
    <div className="portal-bg" style={{ fontFamily: 'Inter, sans-serif' }}>
      <TopNav
        applicationStatus={applicationStatus}
        currentStep={currentTrackerStep}
        completedSteps={allCompletedSteps}
        onNavigate={handleNavigate}
      />

      <div className="pt-16 min-h-screen flex flex-col items-center justify-start px-4 py-10">
        {isImpersonating && (
          <div className="w-full max-w-4xl mb-4 bg-cb-surface-raised border border-cb-border border-l-2 border-l-cb-accent text-gray-300 text-cb-body px-4 py-2.5 rounded-cb">
            Viewing as workspace agent — read-only mode. This is not a merchant session.
          </div>
        )}
        {/* Merchant greeting */}
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
              {isSelfServe && (
                <span className="text-cb-caption normal-case tracking-normal font-normal text-gray-500">
                  Self-Serve
                </span>
              )}
              <span className="text-cb-caption normal-case tracking-normal font-normal text-gray-600 font-mono">ID: {profile.corporateId}</span>
            </div>
          </div>
        </div>

        {/* Main card — directional step transitions via framer-motion */}
        <div className="w-full max-w-4xl portal-card overflow-hidden">
          <AnimatePresence mode="wait" initial={false} custom={stepDir}>
            <motion.div
              key={step}
              custom={stepDir}
              initial={(dir) => ({ opacity: 0, x: dir * 28 })}
              animate={{ opacity: 1, x: 0 }}
              exit={(dir) => ({ opacity: 0, x: dir * -20 })}
              transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
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
  );
}
