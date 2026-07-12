import { useEffect, useState } from 'react';
import TopNav from '@/components/onboarding/TopNav';
import ProgressTracker from '@/components/onboarding/ProgressTracker';
import ApplicationTracker from '@/components/onboarding/ApplicationTracker';
import { MilestoneCard } from './OnboardingPortal';
import OnboardingLocations from './OnboardingLocations';
import OnboardingBanking from './OnboardingBanking';

// Dev-only visual harness for the onboarding portal redesign. Not part of the
// merchant flow — mounts the real step pages against a stubbed fetch layer so
// every visual state can be eyeballed without a merchant session or backend.
// See /dev/portal-preview route in App.jsx (DEV builds only).

const ENTITIES = [
  {
    entityId: 'ent-1', legalBusinessName: 'Bad Bakers LLC', federalEIN: '821234567',
    ownershipType: 'LIMITED_COMPANY', taxClassType: 'LLC_CORPORATION', establishmentYear: '2018',
    mailingStreet: '', mailingCity: '', mailingState: '', mailingZip: '',
  },
  {
    entityId: 'ent-2', legalBusinessName: 'Northside Hospitality Inc', federalEIN: '839876543',
    ownershipType: '', taxClassType: '', establishmentYear: '',
    mailingStreet: '', mailingCity: '', mailingState: '', mailingZip: '',
  },
];

const LOCATIONS = [
  {
    id: 'loc-1', locationId: 'loc-1', entityId: 'ent-1', dbaName: 'Main Street Cafe',
    businessAddress: '123 Main St, Union City, CA 94587', businessStreet: '123 Main St',
    businessCity: 'Union City', businessState: 'CA', businessZip: '94587',
    applicationStepStatus: 'Ready to Submit',
    bankDetails: { routingNumber: '021000021', accountNumber: '000123456789', authMethod: 'Plaid', accountNumberMasked: '••••6789', accountType: 'checking' },
  },
  {
    id: 'loc-2', locationId: 'loc-2', entityId: 'ent-1', dbaName: 'Bad Bakers – Santa Ana',
    businessAddress: '456 Bristol St, Santa Ana, CA 92704', businessStreet: '456 Bristol St',
    businessCity: 'Santa Ana', businessState: 'CA', businessZip: '92704',
    applicationStepStatus: 'In Review',
  },
  {
    id: 'loc-3', locationId: 'loc-3', entityId: 'ent-2', dbaName: 'Northside Deli',
    businessAddress: '789 Oak Ave, Fremont, CA 94536', businessStreet: '789 Oak Ave',
    businessCity: 'Fremont', businessState: 'CA', businessZip: '94536',
    applicationStepStatus: 'In Review',
  },
];

const MIDS = [
  {
    id: 'mid-1', locationId: 'loc-1', corporateId: 'preview', merchantName: 'Main Street Cafe',
    mccCode: '5812', industryType: 'RS', monthlyCardSales: '42000', avgSaleAmount: '38',
    highestTicketAmount: '250', cardPresentPct: 100, internetPct: 0, motoPct: 0,
    applicationStepStatus: 'Ready to Submit',
  },
  {
    id: 'mid-2', locationId: 'loc-1', corporateId: 'preview', merchantName: 'Main Street Cafe – Bar',
    mccCode: '', applicationStepStatus: 'In Review',
  },
  {
    id: 'mid-3', locationId: 'loc-2', corporateId: 'preview', merchantName: 'Bad Bakers – Santa Ana',
    mccCode: '5814', industryType: 'RS', monthlyCardSales: '25000', avgSaleAmount: '22',
    highestTicketAmount: '120', cardPresentPct: 100, internetPct: 0, motoPct: 0,
    applicationStepStatus: 'Pending MID',
  },
  {
    id: 'mid-4', locationId: 'loc-3', corporateId: 'preview', merchantName: 'Northside Deli',
    mccCode: '', applicationStepStatus: 'In Review',
  },
];

const PROFILE = {
  corporateId: 'preview', legalName: 'Bad Bakers LLC', signerEmail: 'owner@badbakers.com',
  pricingTier: 'SELF_SERVE_CASH_DISCOUNT', applicationStatus: 'Pricing Selected',
  legalEntities: ENTITIES,
};

// Mock responses per backend function name — everything else gets { success: true }
function mockResponse(fnName) {
  switch (fnName) {
    case 'manageLegalEntity': return { entities: ENTITIES };
    case 'listLocations': return { locations: LOCATIONS };
    case 'manageMerchantID': return { merchantIDs: MIDS };
    case 'getMerchantData': return { profile: PROFILE, locations: LOCATIONS, merchantMIDs: MIDS };
    default: return { success: true };
  }
}

export default function DevPortalPreview() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // Force invokePortalFunction down its raw-fetch path, then stub fetch for
    // function calls only. Both are restored/cleared on unmount so the real
    // portal flow in the same dev session is unaffected.
    const hadToken = sessionStorage.getItem('merchant_jwt');
    sessionStorage.setItem('merchant_jwt', 'dev-preview-token');
    const realFetch = window.fetch;
    window.fetch = (url, opts) => {
      const u = typeof url === 'string' ? url : url?.url || '';
      const m = u.match(/\/functions\/([^/?]+)/);
      if (m) {
        return Promise.resolve(new Response(JSON.stringify(mockResponse(m[1])), {
          status: 200, headers: { 'Content-Type': 'application/json' },
        }));
      }
      return realFetch(url, opts);
    };
    setReady(true);
    return () => {
      window.fetch = realFetch;
      if (hadToken) sessionStorage.setItem('merchant_jwt', hadToken);
      else sessionStorage.removeItem('merchant_jwt');
    };
  }, []);

  if (!ready) return null;

  const noop = () => {};
  const sectionTitle = (t) => (
    <h2 className="text-sm font-mono text-amber-400/80 bg-amber-500/5 border border-amber-500/15 rounded-lg px-3 py-1.5 inline-block">{t}</h2>
  );

  return (
    <div className="portal-bg" style={{ fontFamily: 'Inter, sans-serif' }}>
      <TopNav
        applicationStatus="Pricing Selected"
        currentStep="banking"
        completedSteps={{ locations: true }}
        onNavigate={noop}
      />
      <div className="pt-24 pb-16 px-4 flex flex-col items-center gap-10">
        <div className="w-full max-w-4xl">
          <h1 className="font-display text-2xl font-semibold tracking-tight text-white">Portal UI Preview</h1>
          <p className="text-sm text-gray-500">Dev-only harness with mock data. Not linked from the merchant portal.</p>
        </div>

        <div className="w-full max-w-4xl space-y-3">
          {sectionTitle('ProgressTracker — states')}
          <div className="portal-card p-6 flex flex-col gap-6">
            <ProgressTracker currentStep="locations" completedSteps={{}} onNavigate={noop} />
            <ProgressTracker currentStep="banking" completedSteps={{ locations: true }} onNavigate={noop} />
            <ProgressTracker currentStep="quote" completedSteps={{ locations: true, banking: true, verify: true }} onNavigate={noop} />
          </div>
        </div>

        <div className="w-full max-w-4xl space-y-3">
          {sectionTitle('ApplicationTracker — dark restyle')}
          <ApplicationTracker currentStatus="DRAFT" />
          <ApplicationTracker currentStatus="UNDERWRITING_HOLD" />
        </div>

        <div className="w-full max-w-4xl space-y-3">
          {sectionTitle('MilestoneCard — states')}
          <div className="portal-card p-6 flex flex-col gap-3">
            <MilestoneCard index={1} title="Complete Merchant Profile & Storefronts" description="Review and confirm your legal entities, storefront locations, and Merchant IDs." done unlocked ctaLabel="Review" onCta={noop} />
            <MilestoneCard index={2} title="Link Deposit Bank Account" description="Connect or manually enter the bank account where your processing funds will deposit." unlocked ctaLabel="Set Up Banking" onCta={noop} />
            <MilestoneCard index={2} title="Complete Merchant Profile & Storefronts" description="We prefilled what we could — a few details still need your input:" unlocked attention attentionItems={[{ label: 'Northside Hospitality Inc', missing: ['Business Entity Type', 'Federal EIN'] }]} ctaLabel="Finish Details" onCta={noop} />
            <MilestoneCard index={3} title="Verify Identity & Sign Merchant Agreement" description="Verify signer identities and sign your merchant processing agreement." unlocked={false} ctaLabel="Continue to Verification" onCta={noop} />
          </div>
        </div>

        <div className="w-full max-w-4xl space-y-3">
          {sectionTitle('OnboardingLocations — full step (mock data)')}
          <div className="portal-card overflow-hidden">
            <OnboardingLocations profile={PROFILE} locations={LOCATIONS} onContinue={noop} onBack={noop} />
          </div>
        </div>

        <div className="w-full max-w-4xl space-y-3">
          {sectionTitle('OnboardingBanking — full step (mock data)')}
          <div className="portal-card overflow-hidden">
            <OnboardingBanking profile={PROFILE} onContinue={noop} onBack={noop} />
          </div>
        </div>
      </div>
    </div>
  );
}
