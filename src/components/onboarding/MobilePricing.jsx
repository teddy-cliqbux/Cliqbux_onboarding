import { useState } from 'react';
import { Loader2, Check, Percent } from 'lucide-react';
import { base44 } from '@/api/base44Client';
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
    description: 'Pass the processing cost to card-paying customers. Cash customers pay less.',
    badge: 'Zero Cost Processing',
    rate: '0%',
    fee: 'Processing Fees',
    rateLabel: 'ZERO PROCESSING COST',
  },
];

const inputCls = 'w-full bg-cb-bg border border-cb-border rounded-cb px-4 py-3.5 text-cb-body text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-cb-accent focus:border-transparent hover:border-cb-border-strong transition-colors';
const labelCls = 'text-cb-caption uppercase text-gray-500 mb-1.5 block';

export default function MobilePricing({ onComplete }) {
  const [selectedTier, setSelectedTier] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const [info, setInfo] = useState({ businessName: '', signerName: '', signerEmail: '', phone: '' });

  const handleSelectTier = (key) => {
    setSelectedTier(key);
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!selectedTier) { setError('Select a pricing plan.'); return; }
    if (!info.businessName || !info.signerName || !info.signerEmail) { setError('Fill in all required fields.'); return; }
    if (!info.signerEmail.includes('@')) { setError('Enter a valid email.'); return; }

    setSubmitting(true);
    try {
      const res = await base44.functions.invoke('createHubspotDeal', {
        businessName: normalizeBusinessName(info.businessName),
        signerName: info.signerName,
        signerEmail: info.signerEmail,
        pricingTier: selectedTier,
        corporatePhone: info.phone.replace(/\D/g, ''),
      });
      const data = res.data;
      if (data?.error) throw new Error(data.error);

      // Store the merchant JWT issued at signup so all subsequent portal
      // calls are authenticated (backend functions now require it).
      if (data.merchantToken) setMerchantToken(data.merchantToken);
      onComplete({
        corporateId: data.corporateId,
        firstName: info.signerName.split(' ')[0] || info.signerName,
        lastName: info.signerName.split(' ').slice(1).join(' ') || '',
        legalName: normalizeBusinessName(info.businessName),
        signerEmail: info.signerEmail,
        pricingTier: selectedTier,
        applicationStatus: 'Pricing Selected',
        merchantToken: data.merchantToken,
      });
    } catch (err) {
      setError(err.message || 'Something went wrong.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen portal-bg text-white px-4 pb-24">
      {/* Top bar */}
      <div className="sticky top-0 z-50 bg-cb-bg/95 backdrop-blur border-b border-cb-border px-1 py-3 flex items-center gap-3">
        <img src="/brand/cliqbux-mark.png" alt="Cliqbux" className="w-7 h-8 flex-shrink-0 object-contain" draggable={false} />
        <div className="flex-1">
          <p className="text-cb-body font-semibold text-white tracking-tight" style={{ fontFamily: "'Poppins', 'Inter', sans-serif", fontWeight: 700, letterSpacing: '-0.03em' }}>cliqbux</p>
          <p className="text-cb-caption normal-case tracking-normal font-normal text-gray-500">Secure Merchant Onboarding</p>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-cb-bg border border-cb-border border-l-2 border-l-cb-danger rounded-cb px-4 py-3 text-cb-danger text-cb-body mt-4">{error}</div>
      )}

      <div className="mt-6 space-y-4">
        <p className="text-cb-caption uppercase text-gray-500 mb-1 text-center">Choose Your Plan</p>

        {PRICING_CARDS.map((card) => {
          const isSelected = selectedTier === card.key;
          return (
            <button key={card.key} onClick={() => handleSelectTier(card.key)}
              className={`w-full text-left rounded-cb border p-5 transition-colors duration-200 ${
                isSelected ? 'bg-cb-surface-raised border-cb-accent' : 'bg-cb-surface border-cb-border'
              }`}>
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-cb flex items-center justify-center ${isSelected ? 'bg-cb-accent-muted' : 'bg-cb-bg'}`}>
                    <Percent className={`w-5 h-5 ${isSelected ? 'text-cb-accent' : 'text-gray-500'}`} />
                  </div>
                  <div>
                    <h3 className="text-cb-body font-semibold text-white">{card.label}</h3>
                    <span className="text-cb-caption normal-case tracking-normal font-normal text-gray-500">{card.badge}</span>
                  </div>
                </div>
                {isSelected && (
                  <span className="flex items-center justify-center w-6 h-6 rounded-full bg-cb-accent flex-shrink-0">
                    <Check className="w-3.5 h-3.5 text-cb-bg" strokeWidth={3} />
                  </span>
                )}
              </div>
              <p className="text-cb-caption normal-case tracking-normal font-normal text-gray-400 mt-3 leading-relaxed">{card.description}</p>
              <div className="border-t border-cb-border mt-4 pt-4">
                <p className="font-display text-cb-title text-white">{card.rate} <span className="text-cb-body font-normal text-gray-500">+ {card.fee}/txn</span></p>
                <p className="text-cb-caption uppercase text-gray-500 mt-1">{card.rateLabel}</p>
              </div>
            </button>
          );
        })}

        {/* Contact Info Form */}
        {selectedTier && (
          <form onSubmit={handleSubmit} className="space-y-4 mt-4">
            <div>
              <label className={labelCls}>Company Name <span className="text-cb-danger">*</span></label>
              <input type="text" value={info.businessName} onChange={(e) => setInfo(p => ({ ...p, businessName: e.target.value }))} placeholder="e.g. Acme Retail LLC"
                className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Your Full Name <span className="text-cb-danger">*</span></label>
              <input type="text" value={info.signerName} onChange={(e) => setInfo(p => ({ ...p, signerName: e.target.value }))} placeholder="e.g. Jane Smith"
                className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Business Email <span className="text-cb-danger">*</span></label>
              <input type="email" value={info.signerEmail} onChange={(e) => setInfo(p => ({ ...p, signerEmail: e.target.value }))} placeholder="e.g. owner@yourbusiness.com"
                className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Phone</label>
              <input type="tel" value={info.phone} onChange={(e) => setInfo(p => ({ ...p, phone: e.target.value }))} placeholder="e.g. (865) 403-7301"
                className={inputCls} />
            </div>
            <button type="submit" disabled={submitting}
              className="w-full bg-cb-accent hover:opacity-90 disabled:bg-cb-bg disabled:text-gray-600 disabled:border disabled:border-cb-border text-cb-bg font-semibold py-4 rounded-cb text-cb-body transition-colors mt-2">
              {submitting ? <><Loader2 className="w-4 h-4 animate-spin inline mr-2" /> Creating...</> : 'Create Account & Continue'}
            </button>
          </form>
        )}
      </div>

      {/* Footer */}
      <p className="text-cb-caption normal-case tracking-normal font-normal text-gray-600 text-center mt-8">
        Secured by <span className="text-cb-accent font-medium">Cliqbux</span> · onboarding.cliqbux.com · {new Date().getFullYear()}
      </p>
    </div>
  );
}
