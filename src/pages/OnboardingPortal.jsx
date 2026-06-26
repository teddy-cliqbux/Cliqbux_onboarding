import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import TopNav from '@/components/onboarding/TopNav';
import Step1Agreement from '@/components/onboarding/Step1Agreement';
import Step2BankDetails from '@/components/onboarding/Step2BankDetails';
import SuccessScreen from '@/components/onboarding/SuccessScreen';
import ErrorScreen from '@/components/onboarding/ErrorScreen';
import LoadingScreen from '@/components/onboarding/LoadingScreen';
import SelfServePricing from '@/components/onboarding/SelfServePricing';
import Step2Verification from '@/components/onboarding/Step2Verification';

const SELF_SERVE_TIERS = ['Self_Swiped', 'Self_Keyed', 'Self_CashDiscount'];

export default function OnboardingPortal() {
  const [mode, setMode] = useState(null); // 'sales' | 'self_serve'
  const [dealId, setDealId] = useState(null);
  const [profile, setProfile] = useState(null);
  const [locations, setLocations] = useState([]);
  const [plaidAccounts, setPlaidAccounts] = useState([]);
  const [verificationDone, setVerificationDone] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const id = params.get('dealId') || params.get('corporateId');

    if (id) {
      setMode('sales');
      setDealId(id);
    } else {
      // Self-serve: no deal ID in URL
      setMode('self_serve');
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (mode === 'sales' && dealId) {
      fetchMerchantData(dealId);
    }
  }, [mode, dealId]);

  const fetchMerchantData = async (id) => {
    setLoading(true);
    setError(null);
    try {
      const response = await base44.functions.invoke('getMerchantData', { corporateId: id });
      const data = response.data;

      if (data?.error) {
        setError({
          title: 'Merchant Not Found',
          message: "We couldn't find your merchant profile. Please verify your link or contact your Cliqbux representative."
        });
        return;
      }

      setProfile(data.profile);
      setLocations(data.locations || []);
    } catch (err) {
      setError({
        title: 'Connection Error',
        message: "We're having trouble loading your portal. Please try refreshing the page."
      });
    } finally {
      setLoading(false);
    }
  };

  const handleStatusChange = (newStatus) => {
    setProfile(prev => ({ ...prev, applicationStatus: newStatus }));
    if (newStatus === 'Quote Signed') {
      fetchMerchantData(profile.corporateId);
    }
  };

  // Self-serve: after pricing selection + HubSpot deal created
  const handleSelfServeComplete = (newProfile) => {
    setProfile(newProfile);
    setLocations([]);
    setMode('sales');
  };

  const handleVerificationComplete = async (bankingInfo) => {
    setPlaidAccounts(bankingInfo.plaidAccounts || []);
    // Refresh profile so UnderwritingPanel gets the IDV-populated identity fields
    if (bankingInfo.identity && profile?.corporateId) {
      try {
        const refreshed = await base44.functions.invoke('getMerchantData', { corporateId: profile.corporateId });
        if (refreshed.data?.profile) setProfile(refreshed.data.profile);
      } catch (_) { /* non-critical — panel will still show manual fields */ }
    }
    setVerificationDone(true);
  };

  // — Loading & Error states —
  if (loading) return <LoadingScreen />;
  if (error) return <ErrorScreen title={error.title} message={error.message} />;

  // — Self-serve flow: no dealId yet, show pricing cards —
  if (mode === 'self_serve' && !profile) {
    return <SelfServePricing onComplete={handleSelfServeComplete} />;
  }

  if (!profile) return <ErrorScreen />;

  const { applicationStatus, pricingTier } = profile;
  const isSelfServe = SELF_SERVE_TIERS.includes(pricingTier);

  const renderStep = () => {
    // Pricing confirmed → show verification first, then banking
    if (applicationStatus === 'Pricing Selected' || applicationStatus === 'Quote Signed') {
      if (!verificationDone) {
        return (
          <Step2Verification
            profile={profile}
            onVerified={handleVerificationComplete}
          />
        );
      }
      return (
        <Step2BankDetails
          profile={profile}
          locations={locations}
          plaidAccounts={plaidAccounts}
          onStatusChange={handleStatusChange}
        />
      );
    }

    // Sales flow — show agreement iframe first
    if (applicationStatus === 'Incomplete') {
      return (
        <Step1Agreement
          profile={profile}
          onStatusChange={handleStatusChange}
        />
      );
    }

    if (applicationStatus === 'Submitted') {
      return <SuccessScreen profile={profile} locations={locations} />;
    }

    return (
      <ErrorScreen
        title="Unexpected State"
        message="Your application is in an unexpected state. Please contact your Cliqbux representative."
      />
    );
  };

  const pricingTierLabel = {
    Standard: 'Standard',
    Premium: 'Premium',
    Custom: 'Custom',
    Self_Swiped: 'Traditional Swiped',
    Self_Keyed: 'Traditional Keyed',
    Self_CashDiscount: 'Cash Discount'
  }[pricingTier] || pricingTier;

  const pricingTierClass = {
    Premium: 'bg-amber-500/20 text-amber-400 border border-amber-500/30',
    Custom: 'bg-purple-500/20 text-purple-400 border border-purple-500/30',
    Standard: 'bg-gray-700 text-gray-300 border border-gray-600',
    Self_Swiped: 'bg-blue-500/20 text-blue-400 border border-blue-500/30',
    Self_Keyed: 'bg-purple-500/20 text-purple-400 border border-purple-500/30',
    Self_CashDiscount: 'bg-green-500/20 text-green-400 border border-green-500/30'
  }[pricingTier] || 'bg-gray-700 text-gray-300 border border-gray-600';

  return (
    <div className="portal-bg" style={{ fontFamily: 'Inter, sans-serif' }}>
      <TopNav applicationStatus={applicationStatus} verificationDone={verificationDone} />

      <div className="pt-16 min-h-screen flex flex-col items-center justify-start px-4 py-10">
        {/* Merchant greeting strip */}
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

        {/* Main onboarding card */}
        <div className="w-full max-w-4xl portal-card overflow-hidden">
          {renderStep()}
        </div>

        {/* Footer */}
        <div className="mt-8 text-center">
          <p className="text-gray-600 text-xs">
            Secured by <span className="text-amber-500 font-semibold">Cliqbux</span> &nbsp;·&nbsp; onboarding.cliqbux.com &nbsp;·&nbsp; {new Date().getFullYear()}
          </p>
        </div>
      </div>
    </div>
  );
}