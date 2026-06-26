import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import TopNav from '@/components/onboarding/TopNav';
import Step1Agreement from '@/components/onboarding/Step1Agreement';
import Step2BankDetails from '@/components/onboarding/Step2BankDetails';
import SuccessScreen from '@/components/onboarding/SuccessScreen';
import ErrorScreen from '@/components/onboarding/ErrorScreen';
import LoadingScreen from '@/components/onboarding/LoadingScreen';

export default function OnboardingPortal() {
  const [corporateId, setCorporateId] = useState(null);
  const [profile, setProfile] = useState(null);
  const [locations, setLocations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Read corporateId from URL on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const id = params.get('corporateId');
    if (!id) {
      setError({ title: 'Missing Onboarding Link', message: 'No merchant ID was found in your link. Please contact your Cliqbux representative to get a valid onboarding URL.' });
      setLoading(false);
    } else {
      setCorporateId(id);
    }
  }, []);

  // Fetch merchant data when corporateId is ready
  useEffect(() => {
    if (!corporateId) return;
    fetchMerchantData();
  }, [corporateId]);

  const fetchMerchantData = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await base44.functions.invoke('getMerchantData', { corporateId });
      const data = response.data;

      if (data?.error) {
        setError({
          title: 'Merchant Not Found',
          message: 'We couldn\'t find your merchant profile. Please verify your link or contact your Cliqbux representative.'
        });
        return;
      }

      setProfile(data.profile);
      setLocations(data.locations || []);
    } catch (err) {
      setError({
        title: 'Connection Error',
        message: 'We\'re having trouble loading your portal. Please try refreshing the page. If the issue persists, contact your Cliqbux representative.'
      });
    } finally {
      setLoading(false);
    }
  };

  const handleStatusChange = (newStatus) => {
    setProfile(prev => ({ ...prev, applicationStatus: newStatus }));

    // If advancing to next step, re-fetch fresh location data
    if (newStatus === 'Quote Signed') {
      fetchMerchantData();
    }
  };

  if (loading) {
    return <LoadingScreen />;
  }

  if (error) {
    return <ErrorScreen title={error.title} message={error.message} />;
  }

  if (!profile) {
    return <ErrorScreen />;
  }

  const { applicationStatus } = profile;

  const renderStep = () => {
    if (applicationStatus === 'Incomplete') {
      return (
        <Step1Agreement
          profile={profile}
          onStatusChange={handleStatusChange}
        />
      );
    }

    if (applicationStatus === 'Quote Signed') {
      return (
        <Step2BankDetails
          profile={profile}
          locations={locations}
          onStatusChange={handleStatusChange}
        />
      );
    }

    if (applicationStatus === 'Submitted') {
      return (
        <SuccessScreen
          profile={profile}
          locations={locations}
        />
      );
    }

    return <ErrorScreen title="Unexpected State" message="Your application is in an unexpected state. Please contact your Cliqbux representative." />;
  };

  return (
    <div className="portal-bg" style={{ fontFamily: 'Inter, sans-serif' }}>
      <TopNav applicationStatus={applicationStatus} />

      {/* Main content — offset for fixed nav */}
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
              {profile.pricingTier && (
                <span className={`text-xs font-bold px-3 py-1 rounded-full
                  ${profile.pricingTier === 'Premium' ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' : ''}
                  ${profile.pricingTier === 'Custom' ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30' : ''}
                  ${profile.pricingTier === 'Standard' ? 'bg-gray-700 text-gray-300 border border-gray-600' : ''}
                `}>
                  {profile.pricingTier} Plan
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