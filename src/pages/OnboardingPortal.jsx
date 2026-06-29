import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
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
// OnboardingSuccess no longer rendered here — submitted merchants are redirected to /onboarding/dashboard

const SELF_SERVE_TIERS = ['Self_Swiped', 'Self_Keyed', 'Self_CashDiscount'];

// Steps within the post-agreement flow
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

export default function OnboardingPortal() {
  const [mode, setMode]               = useState(null); // 'sales' | 'self_serve'
  const [dealId, setDealId]           = useState(null);
  const [profile, setProfile]         = useState(null);
  const [locations, setLocations]     = useState([]);
  const [step, setStep]               = useState(STEP_LOCATIONS); // within post-agreement flow
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState(null);
  const [redirected, setRedirected]   = useState(false);
  // Track which steps have been completed for the progress tracker
  const [completedSteps, setCompletedSteps] = useState({});
  // Track whether verification step had all signers verified (survives back navigation)
  const [signersVerified, setSignersVerified] = useState(false);

  const handleSignersVerified = (v) => {
    setSignersVerified(v);
    if (v) setCompletedSteps(prev => ({ ...prev, verify: true }));
  };
  const navigate                      = useNavigate();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const id    = params.get('dealId') || params.get('corporateId');
    const token = params.get('token');
    if (id)         { setMode('sales'); setDealId(id); }
    else if (token) { validateResumeToken(token); }
    else            { setMode('entry'); setLoading(false); }
  }, []);

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
      // Token valid — fetchMerchantData (triggered by dealId change) will set loading false
      setMode('sales');
      setDealId(data.corporateId);
    } catch {
      setError({ title: 'Connection Error', message: "We couldn't validate your link. Please try again or request a new one." });
      setLoading(false);
    }
  };

  useEffect(() => {
    if (mode === 'sales' && dealId) fetchMerchantData(dealId);
  }, [mode, dealId]);

  const fetchMerchantData = async (id) => {
    setLoading(true);
    setError(null);
    try {
      // Sync from HubSpot first (idempotent — won't overwrite existing progress)
      try {
        await base44.functions.invoke('syncFromHubspot', { dealId: id, force: false });
      } catch {
        // Non-fatal: if HubSpot sync fails, continue with whatever is in the database
        console.warn('[OnboardingPortal] HubSpot sync failed, continuing with existing data');
      }

      const res = await base44.functions.invoke('getMerchantData', { corporateId: id });
      const data = res.data;
      if (data?.error) {
        setError({ title: 'Merchant Not Found', message: "We couldn't find your merchant profile. Please verify your link or contact your Cliqbux representative." });
        return;
      }
      setProfile(data.profile);
      setLocations(data.locations || []);
      if (data.profile?.applicationStatus === 'Submitted') {
        setRedirected(true);
        navigate(`/onboarding/dashboard?dealId=${data.profile.corporateId}`, { replace: true });
        return;
      }
    } catch {
      setError({ title: 'Connection Error', message: "We're having trouble loading your portal. Please try refreshing the page." });
    } finally {
      setLoading(false);
    }
  };

  const handleStatusChange = (newStatus) => {
    setProfile(prev => ({ ...prev, applicationStatus: newStatus }));
    if (newStatus === 'Quote Signed') fetchMerchantData(profile.corporateId);
  };

  const handleSelfServeComplete = (newProfile) => {
    setProfile(newProfile);
    setLocations([]);
    setMode('sales');
  };

  const handleLocationsContinue = ({ locations: updatedLocations, legalEntities }) => {
    setLocations(updatedLocations);
    setCompletedSteps(prev => ({ ...prev, locations: true }));
    setStep(STEP_BANKING);
  };

  const handleBankingContinue = ({ locations: updatedLocations }) => {
    setLocations(updatedLocations);
    setCompletedSteps(prev => ({ ...prev, banking: true }));
    setStep(STEP_VERIFICATION);
  };

  const onBackStep = () => setStep(STEP_LOCATIONS);

  // Step key → internal step constant
  const handleNavigate = (stepKey) => {
    const map = { agreement: null, locations: STEP_LOCATIONS, banking: STEP_BANKING, verify: STEP_VERIFICATION };
    const target = map[stepKey];
    if (target) setStep(target);
  };

  const handleSigningComplete = async () => {
    // Mark submitted and redirect to dashboard
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