import { useState } from 'react';
import { Loader2, ArrowRight, CheckCircle, Percent } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import CliqbuxLogo from './CliqbuxLogo';
import FormCard from './FormCard';
import { normalizeBusinessName } from '@/lib/textUtils';

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
    badgeColor: 'bg-green-100 text-green-700',
    accentColor: 'border-green-200 hover:border-green-400',
    selectedColor: 'border-green-500 bg-green-50',
    iconColor: 'text-green-600',
    iconBg: 'bg-green-100',
    rate: '0%',
    fee: 'Processing Fees',
    rateLabel: 'ZERO PROCESSING COST'
  }
];

const inputCls = 'w-full border border-white/25 rounded-xl px-4 py-3 text-sm text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent bg-white/5';
const labelCls = 'text-xs font-semibold text-gray-100 uppercase tracking-wider mb-1.5 block';

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
      <div className="fixed top-0 left-0 right-0 z-50 bg-[#111318]/95 backdrop-blur border-b border-white/8 px-6 py-4 flex items-center justify-between">
        <CliqbuxLogo size="sm" />
        <span className="text-xs text-gray-100 font-mono">Secure Merchant Onboarding</span>
      </div>

      <div className="pt-24 pb-16 px-4 flex flex-col items-center">
        <div className="text-center mb-12 max-w-2xl">
          <div className="inline-flex items-center gap-2 bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs font-semibold px-4 py-2 rounded-full mb-6">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
            SELECT YOUR PRICING PLAN
          </div>
          <h1 className="text-4xl font-bold text-white mb-4 leading-tight">Choose Your Processing Model</h1>
          <p className="text-gray-100 text-lg leading-relaxed">Select your plan, then add locations — each storefront gets its own volume, industry, and bank account.</p>
        </div>

        {/* Pricing Cards — single card for now; grid retained for when more self-serve options exist */}
        <div className="grid grid-cols-1 gap-6 w-full max-w-md mb-10 mx-auto">
          {PRICING_CARDS.map((card, index) => {
            const Icon = card.icon;
            const isSelected = selectedCardIndex === index;
            return (
              <button key={index} onClick={() => handleSelectTier(card.key, index)}
                className={`relative text-left rounded-2xl border-2 p-7 transition-all duration-200 bg-white shadow-lg cursor-pointer
                  ${isSelected ? card.selectedColor + ' shadow-xl scale-[1.02]' : 'border-gray-200 hover:shadow-xl hover:scale-[1.01] ' + card.accentColor}`}>
              <span className={`absolute top-5 right-5 text-xs font-bold px-2.5 py-1 rounded-full ${card.badgeColor}`}>{card.badge}</span>
              {isSelected && <div className="absolute top-5 left-5"><CheckCircle className={`w-5 h-5 ${card.iconColor}`} /></div>}
              <div className={`w-12 h-12 rounded-xl ${card.iconBg} flex items-center justify-center mb-5 ${isSelected ? 'mt-6' : ''}`}>
                <Icon className={`w-6 h-6 ${card.iconColor}`} />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-2">{card.label}</h3>
              <p className="text-gray-500 text-sm mb-6 leading-relaxed">{card.description}</p>
              <div className="border-t border-gray-100 pt-5">
                <div className="flex items-baseline gap-1 mb-1">
                  <span className="text-3xl font-black text-gray-900">{card.rate}</span>
                  <span className="text-gray-400 text-sm font-medium">+ {card.fee} / txn</span>
                </div>
                <p className="text-xs text-gray-400 font-medium uppercase tracking-wider">{card.rateLabel}</p>
              </div>
              </button>
            );
          })}
        </div>

        {/* Contact Info Form */}
        {selectedTier && (
          <FormCard className="w-full max-w-lg">
            <div className="mb-7">
              <h2 className="text-xl font-bold text-white mb-1">Tell Us About Your Business</h2>
              <p className="text-gray-100 text-sm">Selected: <span className="font-semibold text-amber-400">{PRICING_CARDS[selectedCardIndex]?.label}</span></p>
            </div>

            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <div>
                <label className={labelCls}>Company Name <span className="text-red-400">*</span></label>
                <input type="text" value={basic.businessName} onChange={(e) => setBasic(p => ({ ...p, businessName: e.target.value }))}
                  placeholder="e.g. Acme Retail LLC" className={inputCls} required />
              </div>
              <div>
                <label className={labelCls}>Your Full Name <span className="text-red-400">*</span></label>
                <input type="text" value={basic.signerName} onChange={(e) => setBasic(p => ({ ...p, signerName: e.target.value }))}
                  placeholder="e.g. Jane Smith" className={inputCls} required />
              </div>
              <div>
                <label className={labelCls}>Business Email <span className="text-red-400">*</span></label>
                <input type="email" value={basic.signerEmail} onChange={(e) => setBasic(p => ({ ...p, signerEmail: e.target.value }))}
                  placeholder="e.g. owner@yourbusiness.com" className={inputCls} required />
              </div>
              <div>
                <label className={labelCls}>Business Phone</label>
                <input type="tel" value={basic.corporatePhone} onChange={(e) => setBasic(p => ({ ...p, corporatePhone: e.target.value }))}
                  placeholder="e.g. (865) 403-7301" className={inputCls} />
              </div>

              {error && <div className="bg-red-500/15 border border-red-500/30 rounded-xl px-4 py-3 text-red-300 text-sm">{error}</div>}

              <button type="submit" disabled={submitting}
                className="w-full flex items-center justify-center gap-3 bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 disabled:from-gray-600 disabled:to-gray-600 disabled:text-gray-400 text-white font-bold py-3.5 px-6 rounded-xl text-sm transition-all mt-2 shadow-lg shadow-amber-900/30">
                {submitting ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Creating your account...</>
                ) : (
                  <><ArrowRight className="w-4 h-4" /> Create Account &amp; Continue</>
                )}
              </button>
            </form>
          </FormCard>
        )}

        <p className="text-gray-100 text-xs mt-8 text-center">
          Secured by <span className="text-amber-500 font-semibold">Cliqbux</span> · onboarding.cliqbux.com · {new Date().getFullYear()}
        </p>
      </div>
    </div>
  );
}