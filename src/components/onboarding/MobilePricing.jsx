import { useState } from 'react';
import { Loader2, Check, Percent } from 'lucide-react';
import { base44 } from '@/api/base44Client';
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
    description: 'Pass the processing cost to card-paying customers. Cash customers pay less.',
    badge: 'Zero Cost Processing',
    rate: '0%',
    fee: 'Processing Fees',
    rateLabel: 'ZERO PROCESSING COST',
  },
];

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
    <div className="min-h-screen bg-[#111111] text-white px-4 pb-24">
      {/* Top bar */}
      <div className="sticky top-0 z-50 bg-[#111111]/95 backdrop-blur border-b border-white/8 px-1 py-3 flex items-center gap-3">
        <svg viewBox="0 0 28 32" className="w-6 h-7 flex-shrink-0" fill="none"><path d="M14 0L0 8v16l14 8 14-8V8L14 0z" fill="#F59E0B"/><path d="M14 5l-9 5v12l9 5 9-5V10l-9-5z" fill="#111"/><path d="M14 8l-6 3.5v7L14 22l6-3.5v-7L14 8z" fill="#F59E0B"/><path d="M10 13.5h8M14 13.5V18" stroke="#111" strokeWidth="1.5" strokeLinecap="round"/></svg>
        <div className="flex-1">
          <p className="text-xs font-bold text-white tracking-tight">cliqbux</p>
          <p className="text-[10px] text-gray-100">Secure Merchant Onboarding</p>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-500/15 border border-red-500/30 rounded-xl px-4 py-3 text-red-300 text-xs mt-4">{error}</div>
      )}

      <div className="mt-6 space-y-4">
        <p className="text-[10px] text-gray-100 font-semibold uppercase tracking-widest mb-1 text-center">Choose Your Plan</p>

        {PRICING_CARDS.map((card) => {
          const isSelected = selectedTier === card.key;
          return (
            <button key={card.key} onClick={() => handleSelectTier(card.key)}
              className={`w-full text-left rounded-2xl border-2 p-5 transition-all duration-200 bg-white shadow-md ${
                isSelected ? 'border-amber-500 shadow-amber-900/20 scale-[1.01]' : 'border-gray-200 hover:border-gray-300'
              }`}>
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${isSelected ? 'bg-amber-100' : 'bg-gray-100'}`}>
                    <Percent className={`w-5 h-5 ${isSelected ? 'text-amber-600' : 'text-gray-500'}`} />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-gray-900">{card.label}</h3>
                    <span className="text-[10px] text-gray-500">{card.badge}</span>
                  </div>
                </div>
                {isSelected && <Check className="w-5 h-5 text-amber-500 flex-shrink-0" />}
              </div>
              <p className="text-xs text-gray-500 mt-3 leading-relaxed">{card.description}</p>
              <div className="border-t border-gray-100 mt-4 pt-4">
                <p className="text-2xl font-black text-gray-900">{card.rate} <span className="text-sm font-medium text-gray-400">+ {card.fee}/txn</span></p>
                <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider mt-1">{card.rateLabel}</p>
              </div>
            </button>
          );
        })}

        {/* Contact Info Form */}
        {selectedTier && (
          <form onSubmit={handleSubmit} className="space-y-4 mt-4">
            <div>
              <label className="text-xs font-semibold text-gray-100 mb-1.5 block">Business Legal Name <span className="text-red-400">*</span></label>
              <input type="text" value={info.businessName} onChange={(e) => setInfo(p => ({ ...p, businessName: e.target.value }))} placeholder="e.g. Acme Retail LLC"
                className="w-full bg-[#1A1D24] border border-white/25 rounded-xl px-4 py-3.5 text-sm text-white placeholder:text-gray-100 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent" />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-100 mb-1.5 block">Your Full Name <span className="text-red-400">*</span></label>
              <input type="text" value={info.signerName} onChange={(e) => setInfo(p => ({ ...p, signerName: e.target.value }))} placeholder="e.g. Jane Smith"
                className="w-full bg-[#1A1D24] border border-white/25 rounded-xl px-4 py-3.5 text-sm text-white placeholder:text-gray-100 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent" />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-100 mb-1.5 block">Business Email <span className="text-red-400">*</span></label>
              <input type="email" value={info.signerEmail} onChange={(e) => setInfo(p => ({ ...p, signerEmail: e.target.value }))} placeholder="e.g. owner@yourbusiness.com"
                className="w-full bg-[#1A1D24] border border-white/25 rounded-xl px-4 py-3.5 text-sm text-white placeholder:text-gray-100 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent" />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-100 mb-1.5 block">Phone</label>
              <input type="tel" value={info.phone} onChange={(e) => setInfo(p => ({ ...p, phone: e.target.value }))} placeholder="e.g. (865) 403-7301"
                className="w-full bg-[#1A1D24] border border-white/25 rounded-xl px-4 py-3.5 text-sm text-white placeholder:text-gray-100 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent" />
            </div>
            <button type="submit" disabled={submitting}
              className="w-full bg-amber-500 hover:bg-amber-400 disabled:bg-gray-600 disabled:text-gray-400 text-black font-bold py-4 rounded-xl text-sm transition-all mt-2">
              {submitting ? <><Loader2 className="w-4 h-4 animate-spin inline mr-2" /> Creating...</> : 'Create Account & Continue'}
            </button>
          </form>
        )}
      </div>

      {/* Footer */}
      <p className="text-gray-100 text-[10px] text-center mt-8">
        Secured by <span className="text-amber-400 font-bold">Cliqbux</span> · onboarding.cliqbux.com · {new Date().getFullYear()}
      </p>
    </div>
  );
}