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
import OnboardingVerification from './OnboardingVerification';
import OnboardingSummary from './OnboardingSummary';
import MobilePricing from '@/components/onboarding/MobilePricing';
// OnboardingSuccess no longer rendered here — submitted merchants are redirected to /onboarding/dashboard

const SELF_SERVE_TIERS = ['Self_Swiped', 'Self_Keyed', 'Self_CashDiscount'];

// Steps within the post-agreement flow
const STEP_LOCATIONS    = 'locations';
const STEP_SUMMARY      = 'summary';
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
  const [redirected, setRedirected]     = useState(false);
  const navigate                      = useNavigate();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const id = params.get('dealId') || params.get('corporateId');
    if (id) { setMode('sales'); setDealId(id); }
    else    { setMode('self_serve'); setLoading(false); }
  }, []);

  useEffect(() => {
    if (mode === 'sales' && dealId) fetchMerchantData(dealId);
  }, [mode, dealId]);

  const fetchMerchantData = async (id) => {
    setLoading(true);
    setError(null);
    try {
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

  const handleLocationsContinue = ({ locations: updatedLocations }) => {
    setLocations(updatedLocations);
    setStep(STEP_SUMMARY);
  };

  const handleSummaryContinue = ({ locations: updatedLocations, concepts: summaryConcepts }) => {
    setStep(STEP_VERIFICATION);
  };

  const onBackStep = () => {
    // Returns to Step 1 (pricing). This step clears the profile so SelfServePricing
    // re-renders — when pricing is confirmed again, the portal re-enters Locations
    // with the *same saved locations* from state (sent via onContinue). Note:
    // picking a *different* pricing tier creates a new deal with a new corporateId,
    // so locations belonging to the old deal are naturally lost — that's expected.
    // Step 1 Agreement shows the signed quote as-is.
    setStep(STEP_LOCATIONS);
  };

  const handleSigningComplete = async () => {
    // Mark submitted and redirect to dashboard
    setProfile(prev => ({ ...prev, applicationStatus: 'Submitted' }));
    navigate(`/onboarding/dashboard?dealId=${profile.corporateId}`, { replace: true });
  };

  // — Loading & Error —
  if (loading || redirected) return <LoadingScreen />;
  if (error)   return <ErrorScreen title={error.title} message={error.message} />;

  // — Self-serve pricing —
  const isMobile = window.innerWidth < 480;
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
      if (step === STEP_SUMMARY) {
        return (
          <OnboardingSummary
            profile={profile}
            locations={locations}
            onContinue={handleSummaryContinue}
            onBack={() => setStep(STEP_LOCATIONS)}
          />
        );
      }
      if (step === STEP_VERIFICATION) {
        return (
          <OnboardingVerification
            profile={profile}
            locations={locations}
            onBack={() => setStep(STEP_SUMMARY)}
            onComplete={handleSigningComplete}
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

  return (
    <div className="portal-bg" style={{ fontFamily: 'Inter, sans-serif' }}>
      <TopNav applicationStatus={applicationStatus} />

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