import { useEffect, useState } from 'react';
import CliqbuxLogo from '@/components/onboarding/CliqbuxLogo';
import TopNav from '@/components/onboarding/TopNav';
import ProgressTracker from '@/components/onboarding/ProgressTracker';
import ApplicationTracker from '@/components/onboarding/ApplicationTracker';
import { MilestoneCard } from './OnboardingPortal';
import OnboardingLocations from './OnboardingLocations';
import OnboardingBanking from './OnboardingBanking';
import OnboardingVerification from './OnboardingVerification';

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
  firstName: 'Jane', lastName: 'Baker',
  legalEntities: ENTITIES,
};

// One unverified primary signer — exercises the roster's verify CTA + the
// "Signing Locked" state (allVerified stays false until identity is Verified).
const SIGNERS = [
  {
    id: 'sig-1', firstName: 'Jane', lastName: 'Baker', signerEmail: 'owner@badbakers.com',
    ownershipPercentage: 100, isPrimarySigner: true, identityStatus: 'Pending Invitation',
  },
];

// Mock responses per backend function name — everything else gets { success: true }
function mockResponse(fnName) {
  switch (fnName) {
    case 'manageLegalEntity': return { entities: ENTITIES };
    case 'listLocations': return { locations: LOCATIONS };
    case 'manageMerchantID': return { merchantIDs: MIDS };
    case 'getMerchantData': return { profile: PROFILE, locations: LOCATIONS, merchantMIDs: MIDS };
    case 'manageSigner': return { signers: SIGNERS };
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

  // Self-capture mode: /dev/portal-preview?capture=1 posts a JPEG of each
  // section to a local receiver on 127.0.0.1:5199 (see AGENTS.md — the Cowork
  // browser pane can't take native screenshots). No-op without the receiver.
  useEffect(() => {
    if (!ready) return;
    const run = async () => {
      // Run when ?capture=1 is set, or when the local receiver is up (probe).
      if (!new URLSearchParams(window.location.search).get('capture')) {
        const up = await fetch('http://127.0.0.1:5199/', { method: 'OPTIONS' }).then(r => r.ok || r.status === 204).catch(() => false);
        if (!up) return;
      }
      await new Promise(r => setTimeout(r, 1500));
      document.querySelectorAll('[style]').forEach(el => {
        if (el.style.opacity === '0') el.style.opacity = '1';
        if (el.style.transform && el.style.transform !== 'none') el.style.transform = 'none';
      });
      const { default: html2canvas } = await import('html2canvas');
      const snap = async (el, name) => {
        const canvas = await html2canvas(el, { backgroundColor: '#0E1319', scale: 0.85, logging: false });
        const blob = await new Promise(r => canvas.toBlob(r, 'image/jpeg', 0.85));
        await fetch(`http://127.0.0.1:5199/?name=${name}.jpg`, { method: 'POST', body: blob });
      };
      const sections = [...document.querySelectorAll('[data-capture]')];
      for (const el of sections) {
        try { await snap(el, el.dataset.capture); }
        catch (err) { console.error('[DevPortalPreview capture]', el.dataset.capture, err); }
      }
      // Also open the SignerDetailsModal (portal to body) and snapshot it
      try {
        const verifyBtn = [...document.querySelectorAll('button')].find(b => b.textContent.includes('Complete Identity Verification'));
        if (verifyBtn) {
          verifyBtn.click();
          await new Promise(r => setTimeout(r, 500));
          const modal = document.querySelector('.fixed.inset-0.z-\\[9999\\]');
          if (modal) await snap(modal, 'signer-modal');
        }
      } catch (err) { console.error('[DevPortalPreview capture] signer-modal', err); }
      console.log('[DevPortalPreview] capture complete:', sections.length, 'sections + modal');
    };
    run();
  }, [ready]);

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
          {sectionTitle('Design tokens — spec sheet (tokens.css)')}
          <div className="portal-card p-8 space-y-8" id="token-section">
            {/* Color */}
            <div>
              <p className="text-cb-caption uppercase text-gray-500 mb-3">Color</p>
              <div className="grid grid-cols-3 sm:grid-cols-5 gap-3">
                {[
                  ['bg', 'bg-cb-bg'], ['surface', 'bg-cb-surface'], ['surface-raised', 'bg-cb-surface-raised'],
                  ['accent', 'bg-cb-accent'], ['accent-muted', 'bg-cb-accent-muted'],
                  ['border', 'bg-cb-border'], ['border-strong', 'bg-cb-border-strong'],
                  ['success', 'bg-cb-success'], ['danger', 'bg-cb-danger'],
                ].map(([name, cls]) => (
                  <div key={name}>
                    <div className={`${cls} h-12 rounded-cb border border-cb-border`} />
                    <p className="text-cb-caption text-gray-400 mt-1.5">{name}</p>
                  </div>
                ))}
              </div>
            </div>
            {/* Type */}
            <div>
              <p className="text-cb-caption uppercase text-gray-500 mb-3">Type scale</p>
              <div className="space-y-2">
                <p className="text-cb-display font-display text-white">Display 28 — Merchant onboarding</p>
                <p className="text-cb-title font-display text-white">Title 20 — Link bank accounts</p>
                <p className="text-cb-body-lg text-gray-300">Body-lg 16 — Connect a bank account to each location.</p>
                <p className="text-cb-body text-gray-400">Body 14 — Default UI text for forms, rows, and descriptions.</p>
                <p className="text-cb-caption uppercase text-gray-500">Caption 12 — Field label</p>
              </div>
            </div>
            {/* Elevation + radius */}
            <div>
              <p className="text-cb-caption uppercase text-gray-500 mb-3">Elevation (2) &amp; radius (1)</p>
              <div className="flex gap-6">
                <div className="bg-cb-surface-raised shadow-cb-raised rounded-cb border border-cb-border px-6 py-4 text-cb-body text-gray-300">raised</div>
                <div className="bg-cb-surface-raised shadow-cb-overlay rounded-cb border border-cb-border-strong px-6 py-4 text-cb-body text-gray-300">overlay</div>
              </div>
            </div>
          </div>
        </div>

        <div className="w-full max-w-4xl space-y-3">
          {sectionTitle('Brand mark — sizes')}
          <div className="portal-card p-8 flex items-end gap-10" id="brand-section">
            <div style={{ transform: 'scale(3)', transformOrigin: 'bottom left', marginRight: '120px' }}>
              <CliqbuxLogo size="lg" />
            </div>
            <CliqbuxLogo size="lg" />
            <CliqbuxLogo size="md" />
            <CliqbuxLogo size="sm" />
          </div>
        </div>

        <div className="w-full max-w-4xl space-y-3">
          {sectionTitle('ProgressTracker — states')}
          <div className="portal-card p-6 flex flex-col gap-6">
            <ProgressTracker currentStep="locations" completedSteps={{}} onNavigate={noop} />
            <ProgressTracker currentStep="banking" completedSteps={{ locations: true }} onNavigate={noop} />
            <ProgressTracker currentStep="quote" completedSteps={{ locations: true, banking: true, verify: true }} onNavigate={noop} />
          </div>
        </div>

        <div className="w-full max-w-4xl space-y-3" data-capture="app-tracker">
          {sectionTitle('ApplicationTracker — dark restyle')}
          <ApplicationTracker currentStatus="DRAFT" />
          <ApplicationTracker currentStatus="UNDERWRITING_HOLD" />
        </div>

        <div className="w-full max-w-4xl space-y-3">
          {sectionTitle('MilestoneCard — states')}
          <div className="portal-card p-6 flex flex-col gap-3" data-capture="milestones">
            <MilestoneCard index={1} title="Complete Merchant Profile & Storefronts" description="Review and confirm your legal entities, storefront locations, and Merchant IDs." done unlocked ctaLabel="Review" onCta={noop} />
            <MilestoneCard index={2} title="Link Deposit Bank Account" description="Connect or manually enter the bank account where your processing funds will deposit." unlocked ctaLabel="Set Up Banking" onCta={noop} />
            <MilestoneCard index={2} title="Complete Merchant Profile & Storefronts" description="We prefilled what we could — a few details still need your input:" unlocked attention attentionItems={[{ label: 'Northside Hospitality Inc', missing: ['Business Entity Type', 'Federal EIN'] }]} ctaLabel="Finish Details" onCta={noop} />
            <MilestoneCard index={3} title="Verify Identity & Sign Merchant Agreement" description="Verify signer identities and sign your merchant processing agreement." unlocked={false} ctaLabel="Continue to Verification" onCta={noop} />
          </div>
        </div>

        <div className="w-full max-w-4xl space-y-3">
          {sectionTitle('OnboardingLocations — full step (mock data)')}
          <div className="portal-card overflow-hidden" data-capture="locations-step">
            <OnboardingLocations profile={PROFILE} locations={LOCATIONS} onContinue={noop} onBack={noop} />
          </div>
        </div>

        <div className="w-full max-w-4xl space-y-3">
          {sectionTitle('OnboardingBanking — full step (mock data)')}
          <div className="portal-card overflow-hidden" data-capture="banking-step">
            <OnboardingBanking profile={PROFILE} onContinue={noop} onBack={noop} />
          </div>
        </div>

        <div className="w-full max-w-4xl space-y-3">
          {sectionTitle('OnboardingVerification — full step (mock data)')}
          <div className="portal-card overflow-hidden" data-capture="verification-step">
            <OnboardingVerification profile={PROFILE} locations={LOCATIONS} initialSignersVerified={false} onSignersVerified={noop} onBack={noop} onComplete={noop} onNavigate={noop} />
          </div>
        </div>
      </div>
    </div>
  );
}
