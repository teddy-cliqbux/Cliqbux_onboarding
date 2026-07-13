import { useState } from 'react';
import { Loader2, ArrowRight, Check, Percent } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import CliqbuxLogo from './CliqbuxLogo';
import FormCard from './FormCard';
import { normalizeBusinessName } from '@/lib/textUtils';
import { setMerchantToken } from '@/lib/merchantAuthFetch';

// 2026-07-06: "Swiped & Keyed" (TRADITIONAL/Interchange Plus) card removed from
// self-serve pricing per Teddy — Interchange Plus is always custom-negotiated
// (no off-the-shelf self-serve template), and swiped/keyed specifically is on
// hold because Elavon doesn't support it yet and Cliqbux can't execute that
// agreement. Cash Discount is the only self-serve pricing option for now.
// See AGENTS.md.
const PRICING_CARDS = [
  {
    key: 'CASH_DISCOUNT',
    label: 'Cash Discount Program',
    icon: Percent,
    description: 'Pass the processing cost to card-paying customers. Cash customers pay less.',
    badge: 'Zero Cost Processing',
    rate: '0%',
    fee: 'Processing Fees',
    rateLabel: 'ZERO PROCESSING COST'
  }
];

const inputCls = 'w-full border border-cb-border rounded-cb px-4 py-3 text-cb-body text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-cb-accent focus:border-transparent bg-cb-bg hover:border-cb-border-strong transition-colors';
const labelCls = 'text-cb-caption uppercase text-gray-500 mb-1.5 block';

export default function SelfServePricing({ onComplete }) {
  const [selectedTier, setSelectedTier] = useState(null);
  const [selectedCardIndex, setSelectedCardIndex] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const [basic, setBasic] = useState({ businessName: '', signerName: '', signerEmail: '', corporatePhone: '' });

  const handleSelectTier = (key, index) => {
    setSelectedTier(key);
    setSelectedCardIndex(index);
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!selectedTier) { setError('Please select a pricing plan.'); return; }
    if (!basic.businessName || !basic.signerName || !basic.signerEmail) { setError('Please fill in all required fields.'); return; }
    if (!basic.signerEmail.includes('@')) { setError('Please enter a valid email address.'); return; }

    setSubmitting(true);
    try {
      const normalizedName = normalizeBusinessName(basic.businessName);
      const response = await base44.functions.invoke('createHubspotDeal', {
        businessName: normalizedName,
        signerName: basic.signerName,
        signerEmail: basic.signerEmail,
        pricingTier: selectedTier,
        corporatePhone: basic.corporatePhone.replace(/\D/g, ''),
      });

      const data = response.data;
      if (data?.error) throw new Error(data.error);

      // Store the merchant JWT issued at signup so all subsequent portal
      // calls are authenticated (backend functions now require it).
      if (data.merchantToken) setMerchantToken(data.merchantToken);

      onComplete({
        corporateId: data.corporateId,
        firstName: basic.signerName.split(' ')[0] || basic.signerName,
        lastName: basic.signerName.split(' ').slice(1).join(' ') || '',
        legalName: normalizedName,
        signerEmail: basic.signerEmail,
        pricingTier: selectedTier,
        applicationStatus: 'Pricing Selected',
        merchantToken: data.merchantToken,
      });
    } catch (err) {
      setError(err.message || 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="portal-bg min-h-screen" style={{ fontFamily: 'Inter, sans-serif' }}>
      {/* Top bar */}
      <div className="fixed top-0 left-0 right-0 z-50 bg-cb-surface/95 backdrop-blur border-b border-cb-border px-6 py-4 flex items-center justify-between">
        <CliqbuxLogo size="sm" />
        <span className="text-cb-caption normal-case tracking-normal font-normal text-gray-400">Secure Merchant Onboarding</span>
      </div>

      <div className="pt-24 pb-16 px-4 flex flex-col items-center">
        <div className="text-center mb-12 max-w-2xl">
          <p className="text-cb-caption uppercase text-gray-500 mb-3">Select your pricing plan</p>
          <h1 className="font-display text-cb-display text-white mb-3">Choose Your Processing Model</h1>
          <p className="text-cb-body-lg text-gray-400 leading-relaxed">Select your plan, then add locations — each storefront gets its own volume, industry, and bank account.</p>
        </div>

        {/* Pricing Cards — single card for now; grid retained for when more self-serve options exist */}
        <div className="grid grid-cols-1 gap-6 w-full max-w-md mb-10 mx-auto">
          {PRICING_CARDS.map((card, index) => {
            const Icon = card.icon;
            const isSelected = selectedCardIndex === index;
            return (
              <button key={index} onClick={() => handleSelectTier(card.key, index)}
                className={`relative text-left rounded-cb border p-7 transition-colors duration-200 cursor-pointer
                  ${isSelected
                    ? 'bg-cb-surface-raised border-cb-accent'
                    : 'bg-cb-surface border-cb-border hover:border-cb-border-strong'}`}>
              <span className="absolute top-5 right-5 text-cb-caption normal-case tracking-normal font-medium text-cb-success border border-cb-border px-2.5 py-1 rounded-full">{card.badge}</span>
              {isSelected && (
                <div className="absolute top-5 left-5">
                  <span className="flex items-center justify-center w-6 h-6 rounded-full bg-cb-accent">
                    <Check className="w-3.5 h-3.5 text-cb-bg" strokeWidth={3} />
                  </span>
                </div>
              )}
              <div className={`w-12 h-12 rounded-cb bg-cb-accent-muted flex items-center justify-center mb-5 ${isSelected ? 'mt-6' : ''}`}>
                <Icon className="w-6 h-6 text-cb-accent" />
              </div>
              <h3 className="font-display text-cb-title text-white mb-2">{card.label}</h3>
              <p className="text-cb-body text-gray-400 mb-6 leading-relaxed">{card.description}</p>
              <div className="border-t border-cb-border pt-5">
                <div className="flex items-baseline gap-1 mb-1">
                  <span className="font-display text-cb-display text-white">{card.rate}</span>
                  <span className="text-cb-body text-gray-500">+ {card.fee} / txn</span>
                </div>
                <p className="text-cb-caption uppercase text-gray-500">{card.rateLabel}</p>
              </div>
              </button>
            );
          })}
        </div>

        {/* Contact Info Form */}
        {selectedTier && (
          <FormCard className="w-full max-w-lg">
            <div className="mb-7">
              <h2 className="font-display text-cb-title text-white mb-1">Tell Us About Your Business</h2>
              <p className="text-cb-body text-gray-400">Selected: <span className="font-medium text-cb-accent">{PRICING_CARDS[selectedCardIndex]?.label}</span></p>
            </div>

            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <div>
                <label className={labelCls}>Company Name <span className="text-cb-danger">*</span></label>
                <input type="text" value={basic.businessName} onChange={(e) => setBasic(p => ({ ...p, businessName: e.target.value }))}
                  placeholder="e.g. Acme Retail LLC" className={inputCls} required />
              </div>
              <div>
                <label className={labelCls}>Your Full Name <span className="text-cb-danger">*</span></label>
                <input type="text" value={basic.signerName} onChange={(e) => setBasic(p => ({ ...p, signerName: e.target.value }))}
                  placeholder="e.g. Jane Smith" className={inputCls} required />
              </div>
              <div>
                <label className={labelCls}>Business Email <span className="text-cb-danger">*</span></label>
                <input type="email" value={basic.signerEmail} onChange={(e) => setBasic(p => ({ ...p, signerEmail: e.target.value }))}
                  placeholder="e.g. owner@yourbusiness.com" className={inputCls} required />
              </div>
              <div>
                <label className={labelCls}>Business Phone</label>
                <input type="tel" value={basic.corporatePhone} onChange={(e) => setBasic(p => ({ ...p, corporatePhone: e.target.value }))}
                  placeholder="e.g. (865) 403-7301" className={inputCls} />
              </div>

              {error && <div className="bg-cb-bg border border-cb-border border-l-2 border-l-cb-danger rounded-cb px-4 py-3 text-cb-danger text-cb-body">{error}</div>}

              <button type="submit" disabled={submitting}
                className="w-full flex items-center justify-center gap-3 bg-cb-accent hover:opacity-90 disabled:bg-cb-bg disabled:text-gray-600 disabled:border disabled:border-cb-border text-cb-bg font-semibold py-3.5 px-6 rounded-cb text-cb-body transition-colors mt-2">
                {submitting ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Creating your account...</>
                ) : (
                  <><ArrowRight className="w-4 h-4" /> Create Account &amp; Continue</>
                )}
              </button>
            </form>
          </FormCard>
        )}

        <p className="text-cb-caption normal-case tracking-normal font-normal text-gray-600 mt-8 text-center">
          Secured by <span className="text-cb-accent font-medium">Cliqbux</span> · onboarding.cliqbux.com · {new Date().getFullYear()}
        </p>
      </div>
    </div>
  );
}
