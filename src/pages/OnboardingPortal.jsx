import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { setMerchantToken, getMerchantToken, clearMerchantToken, invokePortalFunction } from '@/lib/merchantAuthFetch';
import TopNav from '@/components/onboarding/TopNav';
import Step1Agreement from '@/components/onboarding/Step1Agreement';
import ErrorScreen from '@/components/onboarding/ErrorScreen';
import LoadingScreen from '@/components/onboarding/LoadingScreen';
import SelfServePricing from '@/components/onboarding/SelfServePricing';
// Plaid verification is now handled per-location inside OnboardingLocations
import OnboardingLocations from './OnboardingLocations';
import OnboardingBanking from './OnboardingBanking';
import OnboardingVerification from './OnboardingVerification';
import OnboardingSummary from './OnboardingSummary';
import MobilePricing from '@/components/onboarding/MobilePricing';
import PortalEntry from '@/components/onboarding/PortalEntry';
import ApplicationTracker from '@/components/onboarding/ApplicationTracker';
import { Lock, Check } from 'lucide-react';
// OnboardingSuccess no longer rendered here — submitted merchants are redirected to /onboarding/dashboard

const SELF_SERVE_TIERS = ['Self_Swiped', 'Self_Keyed', 'Self_CashDiscount'];

// Steps within the post-agreement flow
const STEP_WELCOME      = 'welcome';
const STEP_LOCATIONS    = 'locations';
const STEP_BANKING      = 'banking';
const STEP_VERIFICATION = 'verification';
const STEP_SUCCESS      = 'success';

const TIER_LABELS = {
  Standard: 'Standard', Premium: 'Premium', Custom: 'Custom',
  Self_Swiped: 'Traditional Swiped', Self_Keyed: 'Traditional Keyed', Self_CashDiscount: 'Cash Discount'
};
const TIER_CLASSES = {
  Premium:         'bg-amber-500/20 text-amber-400 border border-amber-500/30',
  Custom:          'bg-purple-500/20 text-purple-400 border border-purple-500/30',
  Standard:        'bg-gray-700 text-gray-300 border border-gray-600',
  Self_Swiped:     'bg-blue-500/20 text-blue-400 border border-blue-500/30',
  Self_Keyed:      'bg-purple-500/20 text-purple-400 border border-purple-500/30',
  Self_CashDiscount: 'bg-green-500/20 text-green-400 border border-green-500/30',
};

function MilestoneCard({ index, title, description, done, unlocked, ctaLabel, onCta, ctaDisabled }) {
  return (
    <div
      className={`flex items-start gap-4 rounded-xl border px-5 py-4 transition-colors ${
        done
          ? 'bg-green-500/10 border-green-500/30'
          : unlocked
            ? 'bg-white/5 border-white/10'
            : 'bg-white/[0.02] border-white/5 opacity-60'
      }`}
    >
      <div
        className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-sm font-bold ${
          done ? 'bg-green-500 text-white' : unlocked ? 'bg-blue-500 text-white' : 'bg-white/10 text-gray-500'
        }`}
      >
        {done ? <Check className="w-4 h-4" strokeWidth={3} /> : unlocked ? index : <Lock className="w-3.5 h-3.5" />}
      </div>

      <div className="flex-1 min-w-0">
        <h3 className={`text-sm font-semibold ${unlocked || done ? 'text-white' : 'text-gray-500'}`}>{title}</h3>
        <p className={`text-xs mt-0.5 ${unlocked || done ? 'text-gray-400' : 'text-gray-600'}`}>{description}</p>
      </div>

      <div className="flex-shrink-0">
        {done ? (
          <span className="inline-flex items-center gap-1 text-xs font-bold text-green-400 bg-green-500/15 border border-green-500/30 px-3 py-1.5 rounded-full">
            Complete <Check className="w-3.5 h-3.5" strokeWidth={3} />
          </span>
        ) : (
          <button
            onClick={onCta}
            disabled={!unlocked || ctaDisabled}
            className="text-xs font-semibold px-4 py-2 rounded-lg transition-colors bg-blue-600 hover:bg-blue-700 text-white disabled:bg-white/5 disabled:text-gray-600 disabled:cursor-not-allowed"
          >
            {ctaLabel}
          </button>
        )}
      </div>
    </div>
  );
}

export default function OnboardingPortal() {
  const [mode, setMode]               = useState(null); // 'sales' | 'self_serve'
  const [dealId, setDealId]           = useState(null);
  const [profile, setProfile]         = useState(null);
  const [locations, setLocations]     = useState([]);
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
      const res = await base44.functions.invoke('manageStagedApplication', { action: 'get', stageId });
      const stage = res.data?.stage;
      if (!stage) {
        setError({ title: 'Invalid Link', message: 'This staged application link is invalid or has expired.' });
        setLoading(false);
        return;
      }
      if (stage.accessToken !== token) {
        setError({ title: 'Invalid Link', message: 'This staged application link is invalid or has expired.' });
        setLoading(false);
        return;
      }
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

      const res  = await base44.functions.invoke('validateResumeToken', { token });
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
      const alreadySynced = checkData?.profile?.hubspotSynced === true;

      if (!alreadySynced && !hasLocations) {
        // First visit or no locations yet — pull from HubSpot silently
        try {
          await base44.functions.invoke('syncFromHubspot', { dealId: id });
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
      // Track that merchant opened the portal — creates a record if none exists
      if (mergedProfile?.corporateId && mergedProfile?.applicationStatus !== 'Submitted') {
        trackProgress(mergedProfile.corporateId, {
          currentStep: mergedProfile.applicationStatus === 'Incomplete' ? 'agreement' : 'locations',
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
    base44.functions.invoke('pushStatusToHubspot', { corporateId, milestone }).catch(() => {
      // Non-fatal — HubSpot sync is best-effort
    });
  };

  // Fire-and-forget progress tracking — upserts a StagedApplication record for admin visibility
  const trackProgress = (corporateId, progressData) => {
    if (!corporateId) return;
    base44.functions.invoke('manageStagedApplication', {
      action: 'trackProgress',
      corporateId,
      data: progressData,
    }).catch(() => {});
  };

  const handleStatusChange = (newStatus) => {
    setProfile(prev => ({ ...prev, applicationStatus: newStatus }));
    if (newStatus === 'Quote Signed') {
      fetchMerchantData(profile.corporateId);
      pushMilestoneToHubspot(profile.corporateId, 'agreement_signed');
      trackProgress(profile.corporateId, { currentStep: 'locations', completedSteps: { agreement: true } });
    }
  };

  // Welcome Hub polling — mirrors the auto-advance behavior Step1Agreement used
  // to provide on its own. While the merchant is sitting on the Welcome Hub with
  // an unsigned quote, quietly re-fetch every 5s; the moment the quote is signed
  // in the other tab, unlock Milestone 2 without requiring a manual refresh.
  useEffect(() => {
    if (step !== STEP_WELCOME || profile?.applicationStatus !== 'Incomplete' || !dealId) return;

    const intervalId = setInterval(async () => {
      const updatedProfile = await fetchMerchantData(dealId, { silent: true });
      if (updatedProfile?.applicationStatus === 'Pricing Selected' || updatedProfile?.applicationStatus === 'Quote Signed') {
        clearInterval(intervalId);
        handleStatusChange('Quote Signed');
      }
    }, 5000);

    return () => clearInterval(intervalId);
  }, [step, profile?.applicationStatus, dealId]);

  const handleSelfServeComplete = (newProfile) => {
    setProfile(newProfile);
    setLocations([]);
    setMode('sales');
  };

  const handleLocationsContinue = ({ locations: updatedLocations, legalEntities }) => {
    setLocations(updatedLocations);
    setCompletedSteps(prev => ({ ...prev, locations: true }));
    setStep(STEP_BANKING);
    pushMilestoneToHubspot(profile?.corporateId, 'locations_added');
    trackProgress(profile?.corporateId, { currentStep: 'banking', completedSteps: { agreement: true, locations: true } });
  };

  const handleBankingContinue = ({ locations: updatedLocations }) => {
    setLocations(updatedLocations);
    setCompletedSteps(prev => ({ ...prev, banking: true }));
    setStep(STEP_VERIFICATION);
    trackProgress(profile?.corporateId, { currentStep: 'verification', completedSteps: { agreement: true, locations: true, banking: true } });
  };

  const onBackStep = () => setStep(STEP_WELCOME);

  // Step key → internal step constant
  const handleNavigate = (stepKey) => {
    const map = { agreement: null, locations: STEP_LOCATIONS, banking: STEP_BANKING, verify: STEP_VERIFICATION };
    const target = map[stepKey];
    if (target) setStep(target);
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
  const pricingTierClass = TIER_CLASSES[pricingTier] || 'bg-gray-700 text-gray-300 border border-gray-600';

  const renderStep = () => {
    // Welcome Hub — macro-level landing page merchants see immediately upon
    // secure entry, before diving into the deep data-entry grids.
    if (step === STEP_WELCOME) {
      const m1Done = agreementDone; // quote reviewed & signed (or pricing selected for self-serve)
      const m2Done = !!allCompletedSteps.locations;
      const m3Done = !!allCompletedSteps.banking;
      const m2Unlocked = m1Done;
      const m3Unlocked = locations && locations.length > 0;
      const m4Unlocked = m1Done && m2Done && m3Done;
      const m4Done = applicationStatus === 'Submitted';

      return (
        <div className="px-6 sm:px-8 py-8 flex flex-col gap-6">
          <div>
            <p className="text-gray-500 text-xs font-medium uppercase tracking-widest mb-1">Welcome back,</p>
            <h2 className="text-2xl font-bold text-white leading-tight">{profile.legalName}</h2>
            <p className="text-gray-400 text-sm mt-1">
              Here's where things stand with your Cliqbux onboarding. Work through each milestone below to get processing.
            </p>
          </div>

          <ApplicationTracker currentStatus={applicationStatus === 'Submitted' ? 'SUBMITTED' : 'DRAFT'} />

          <div className="flex flex-col gap-3">
            <MilestoneCard
              index={1}
              title="Review & Sign Product Quote"
              description="Review your pricing and terms, then sign electronically to unlock the rest of onboarding."
              done={m1Done}
              unlocked={true}
              ctaLabel="→ Review & Sign Quote"
              onCta={() => window.open(profile.hubspotQuoteUrl, '_blank')}
              ctaDisabled={!profile.hubspotQuoteUrl}
            />
            <MilestoneCard
              index={2}
              title="Complete Merchant Profile & Storefronts"
              description="Add your legal entities, storefront locations, and Merchant IDs."
              done={m2Done}
              unlocked={m2Unlocked}
              ctaLabel="Configure Locations & MIDs"
              onCta={() => setStep(STEP_LOCATIONS)}
            />
            <MilestoneCard
              index={3}
              title="Link Deposit Bank Account"
              description="Connect or manually enter the bank account where your processing funds will deposit."
              done={m3Done}
              unlocked={m3Unlocked}
              ctaLabel="Set Up Banking"
              onCta={() => setStep(STEP_BANKING)}
            />
            <MilestoneCard
              index={4}
              title="Submit for Underwriting Processing"
              description="Verify signer identities and submit your completed application for approval."
              done={m4Done}
              unlocked={m4Unlocked}
              ctaLabel="Continue to Verification"
              onCta={() => setStep(STEP_VERIFICATION)}
            />
          </div>
        </div>
      );
    }

    // Pricing confirmed → locations & per-location banking
    if (applicationStatus === 'Pricing Selected' || applicationStatus === 'Quote Signed') {
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
            onBack={() => setStep(STEP_LOCATIONS)}
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
            onBack={() => setStep(STEP_BANKING)}
            onComplete={handleSigningComplete}
            onNavigate={handleNavigate}
          />
        );
      }
    }

    // Sales flow: agreement signing first
    if (applicationStatus === 'Incomplete') {
      return <Step1Agreement profile={profile} onStatusChange={handleStatusChange} />;
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
  const currentTrackerStep = applicationStatus === 'Incomplete' ? 'agreement' : (stepToKey[step] || 'locations');

  // Agreement is complete once pricing is selected/signed
  const agreementDone = applicationStatus === 'Pricing Selected' || applicationStatus === 'Quote Signed' || applicationStatus === 'Submitted';
  const allCompletedSteps = { ...completedSteps, ...(agreementDone ? { agreement: true } : {}) };

  return (
    <div className="portal-bg" style={{ fontFamily: 'Inter, sans-serif' }}>
      <TopNav
        applicationStatus={applicationStatus}
        currentStep={currentTrackerStep}
        completedSteps={allCompletedSteps}
        onNavigate={agreementDone ? handleNavigate : undefined}
      />

      <div className="pt-16 min-h-screen flex flex-col items-center justify-start px-4 py-10">
        {isImpersonating && (
          <div className="w-full max-w-4xl mb-4 bg-amber-500/15 border border-amber-500/30 text-amber-300 text-xs font-semibold px-4 py-2.5 rounded-xl text-center">
            Viewing as workspace agent — read-only mode. This is not a merchant session.
          </div>
        )}
        {/* Merchant greeting */}
        <div className="w-full max-w-4xl mb-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div>
              <p className="text-gray-500 text-xs font-medium uppercase tracking-widest mb-1">Welcome,</p>
              <h1 className="text-xl font-bold text-white leading-tight">{profile.legalName}</h1>
              <p className="text-gray-400 text-sm mt-0.5">{profile.signerEmail}</p>
            </div>
            <div className="flex flex-col items-end gap-1">
              {pricingTier && (
                <span className={`text-xs font-bold px-3 py-1 rounded-full ${pricingTierClass}`}>
                  {pricingTierLabel} Plan
                </span>
              )}
              {isSelfServe && (
                <span className="text-xs text-gray-500 font-medium bg-gray-800 px-2.5 py-0.5 rounded-full border border-gray-700">
                  Self-Serve
                </span>
              )}
              <span className="text-xs text-gray-600 font-mono">ID: {profile.corporateId}</span>
            </div>
          </div>
        </div>

        {/* Main card */}
        <div className="w-full max-w-4xl portal-card overflow-hidden">
          {renderStep()}
        </div>

        <div className="mt-8 text-center">
          <p className="text-gray-600 text-xs">
            Secured by <span className="text-amber-500 font-semibold">Cliqbux</span> &nbsp;·&nbsp; onboarding.cliqbux.com &nbsp;·&nbsp; {new Date().getFullYear()}
          </p>
        </div>
      </div>
    </div>
  );
}