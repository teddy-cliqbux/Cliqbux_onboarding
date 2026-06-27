import { useState } from 'react';
import { Loader2, Check, CreditCard, Percent } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { normalizeBusinessName } from '@/lib/textUtils';

const PRICING_CARDS = [
  {
    key: 'TRADITIONAL',
    label: 'Swiped & Keyed',
    description: 'Covers both in-person card-present and card-not-present transactions. Swiped rate at 2.49% + $0.10, keyed rate at 2.89% + $0.30.',
    badge: 'Most Popular',
    rate: '2.49%',
    fee: '$0.10',
    rateLabel: 'SWIPED · 2.89% + $0.30 KEYED',
  },
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

const OWNERSHIP_OPTIONS = [
  { value: 'LIMITED_COMPANY', label: 'LLC' },
  { value: 'CORPORATION', label: 'Corporation' },
  { value: 'SOLE_PROPRIETOR', label: 'Sole Proprietor' },
  { value: 'GENERAL_PARTNERSHIP', label: 'General Partnership' },
  { value: 'LIMITED_PARTNERSHIP', label: 'Limited Partnership' },
  { value: 'NON_PROFIT', label: 'Non-Profit' },
];

const TAX_OPTIONS = [
  { value: 'LLC_CORPORATION', label: 'LLC → Corporation' },
  { value: 'LLC_PARTNERSHIP', label: 'LLC → Partnership' },
  { value: 'CORPORATION', label: 'C-Corp' },
  { value: 'SOLE_PROP', label: 'Sole Proprietorship' },
  { value: 'PARTNERSHIP', label: 'Partnership' },
];

const TITLE_OPTIONS = [
  { value: 'OWNER', label: 'Owner' },
  { value: 'CHIEF_EXECUTIVE_OFFICER', label: 'CEO' },
  { value: 'PRESIDENT', label: 'President' },
  { value: 'PARTNER', label: 'Partner' },
  { value: 'DIRECTOR', label: 'Director' },
  { value: 'MANAGER', label: 'Manager' },
  { value: 'VICE_PRESIDENT', label: 'VP' },
];

const INDUSTRIES = [
  { value: 'RETAIL', label: 'Retail', mcc: '5999' },
  { value: 'RESTAURANT', label: 'Restaurant', mcc: '5812' },
  { value: 'GROCERY', label: 'Grocery', mcc: '5411' },
  { value: 'BAR', label: 'Bar / Lounge', mcc: '5813' },
  { value: 'CLOTHING', label: 'Clothing', mcc: '5699' },
  { value: 'ELECTRONICS', label: 'Electronics', mcc: '5732' },
  { value: 'FURNITURE', label: 'Furniture', mcc: '5712' },
  { value: 'AUTO', label: 'Auto Parts', mcc: '5571' },
  { value: 'HEALTH', label: 'Health', mcc: '8099' },
  { value: 'SALON', label: 'Salon / Spa', mcc: '7230' },
  { value: 'GYM', label: 'Fitness', mcc: '7941' },
  { value: 'HOTEL', label: 'Hotel', mcc: '7011' },
  { value: 'ECOMMERCE', label: 'E-Commerce', mcc: '5965' },
  { value: 'SERVICES', label: 'Services', mcc: '7299' },
];

const fieldCls = 'w-full bg-[#1A1D24] border border-white/25 rounded-xl px-4 py-3.5 text-sm text-white placeholder:text-gray-100 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent';
const selCls = 'w-full bg-[#1A1D24] border border-white/25 rounded-xl px-4 py-3.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent appearance-none';

export default function MobilePricing({ onComplete }) {
  const [selectedTier, setSelectedTier] = useState(null);
  const [step, setStep] = useState('plan'); // plan | info | details
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const [info, setInfo] = useState({ businessName: '', signerName: '', signerEmail: '', phone: '' });
  const [det, setDet] = useState({
    ownershipType: '', taxClassType: '', industryClass: '', mccCode: '',
    productDescription: '', establishmentYear: '', currentOwnershipYears: '', currentOwnershipMonths: '0',
    titleType: '', avgSaleAmount: '', monthlyCardSales: '', annualRevenue: '',
    highestTicketAmount: '', cardPresentPct: '100', internetPct: '0', motoPct: '0',
  });

  const handleSelectTier = (key) => {
    setSelectedTier(key);
    setError('');
  };

  const handleIndustry = (v) => {
    const m = INDUSTRIES.find(i => i.value === v);
    setDet(p => ({ ...p, industryClass: v, mccCode: m?.mcc || p.mccCode }));
  };

  const pctSum = () => ['cardPresentPct', 'internetPct', 'motoPct'].reduce((s, k) => s + (parseInt(det[k], 10) || 0), 0);

  const goInfo = () => {
    if (!selectedTier) { setError('Select a pricing plan.'); return; }
    setError('');
    setStep('info');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const goDetails = (e) => {
    e.preventDefault();
    if (!info.businessName || !info.signerName || !info.signerEmail) { setError('Fill in all required fields.'); return; }
    if (!info.signerEmail.includes('@')) { setError('Enter a valid email.'); return; }
    setError('');
    setStep('details');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!det.ownershipType) { setError('Select business type.'); return; }
    if (!det.taxClassType) { setError('Select tax classification.'); return; }
    if (!det.industryClass) { setError('Select industry.'); return; }
    if (!det.titleType) { setError('Select your title.'); return; }
    if (!det.productDescription.trim()) { setError('Describe your products or services.'); return; }
    if (!det.avgSaleAmount || !det.monthlyCardSales || !det.annualRevenue) { setError('Fill in all volume fields.'); return; }
    if (pctSum() !== 100) { setError(`Acceptance must total 100% (currently ${pctSum()}%).`); return; }

    setSubmitting(true);
    try {
      const res = await base44.functions.invoke('createHubspotDeal', {
        businessName: normalizeBusinessName(info.businessName),
        signerName: info.signerName,
        signerEmail: info.signerEmail,
        pricingTier: selectedTier,
        corporatePhone: info.phone.replace(/\D/g, ''),
        ownershipType: det.ownershipType,
        taxClassType: det.taxClassType,
        industryClass: det.industryClass,
        mccCode: det.mccCode,
        productDescription: det.productDescription,
        establishmentYear: det.establishmentYear,
        currentOwnershipYears: det.currentOwnershipYears,
        currentOwnershipMonths: det.currentOwnershipMonths,
        titleType: det.titleType,
        avgSaleAmount: det.avgSaleAmount,
        monthlyCardSales: det.monthlyCardSales,
        annualRevenue: det.annualRevenue,
        highestTicketAmount: det.highestTicketAmount || det.avgSaleAmount,
        highestTicketFrequency: 24,
        cardPresentPct: det.cardPresentPct,
        internetPct: det.internetPct,
        motoPct: det.motoPct,
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
      });
    } catch (err) {
      setError(err.message || 'Something went wrong.');
    } finally {
      setSubmitting(false);
    }
  };

  const StepDot = ({ n, label }) => (
    <div className="flex items-center gap-1.5">
      <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
        step === label ? 'bg-amber-500 text-black' : 'bg-white/20 text-gray-200'
      }`}>{n}</span>
      <span className={`text-xs font-semibold ${step === label ? 'text-amber-300' : 'text-gray-100'}`}>{label}</span>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#111111] text-white px-4 pb-24">
      {/* Top bar */}
      <div className="sticky top-0 z-50 bg-[#111111]/95 backdrop-blur border-b border-white/8 px-1 py-3 flex items-center gap-3">
        <svg viewBox="0 0 28 32" className="w-6 h-7 flex-shrink-0" fill="none"><path d="M14 0L0 8v16l14 8 14-8V8L14 0z" fill="#F59E0B"/><path d="M14 5l-9 5v12l9 5 9-5V10l-9-5z" fill="#111"/><path d="M14 8l-6 3.5v7L14 22l6-3.5v-7L14 8z" fill="#F59E0B"/><path d="M10 13.5h8M14 13.5V18" stroke="#111" strokeWidth="1.5" strokeLinecap="round"/></svg>
        <div className="flex-1">
          <p className="text-xs font-bold text-white tracking-tight">cliqbux</p>
          <p className="text-[10px] text-gray-100">Secure Merchant Onboarding</p>
        </div>
        <div className="flex items-center gap-2">
          <StepDot n={1} label={step === 'details' ? 'info' : 'plan'} />
          <div className="w-4 h-px bg-white/10" />
          <StepDot n={2} label={step === 'details' ? 'details' : 'info'} />
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-500/15 border border-red-500/30 rounded-xl px-4 py-3 text-red-300 text-xs mt-4">{error}</div>
      )}

      {/* Step 1 — Plan */}
      {step === 'plan' && (
        <div className="mt-6 space-y-4">
          <div className="text-center mb-2">
            <p className="text-[10px] text-gray-100 font-semibold uppercase tracking-widest mb-1">Step 1 of 3</p>
            <h1 className="text-xl font-bold text-white">Choose Your Plan</h1>
          </div>

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
                      {card.key === 'TRADITIONAL' ? <CreditCard className={`w-5 h-5 ${isSelected ? 'text-amber-600' : 'text-gray-500'}`} /> : <Percent className={`w-5 h-5 ${isSelected ? 'text-amber-600' : 'text-gray-500'}`} />}
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

          <button onClick={goInfo} disabled={!selectedTier}
            className="w-full bg-amber-500 hover:bg-amber-400 text-black font-bold py-4 rounded-xl text-sm transition-all disabled:opacity-30 mt-2">
            Continue
          </button>
        </div>
      )}

      {/* Step 2 — Business Info */}
      {step === 'info' && (
        <form onSubmit={goDetails} className="mt-6 space-y-4">
          <div className="mb-2">
            <p className="text-[10px] text-gray-100 font-semibold uppercase tracking-widest mb-1">Step 2 of 3</p>
            <h1 className="text-xl font-bold text-white">Your Business</h1>
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-100 mb-1.5 block">Business Legal Name <span className="text-red-400">*</span></label>
            <input type="text" value={info.businessName} onChange={(e) => setInfo(p => ({ ...p, businessName: e.target.value }))} placeholder="e.g. Acme Retail LLC" className={fieldCls} />
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-100 mb-1.5 block">Your Full Name <span className="text-red-400">*</span></label>
            <input type="text" value={info.signerName} onChange={(e) => setInfo(p => ({ ...p, signerName: e.target.value }))} placeholder="e.g. Jane Smith" className={fieldCls} />
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-100 mb-1.5 block">Business Email <span className="text-red-400">*</span></label>
            <input type="email" value={info.signerEmail} onChange={(e) => setInfo(p => ({ ...p, signerEmail: e.target.value }))} placeholder="e.g. owner@yourbusiness.com" className={fieldCls} />
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-100 mb-1.5 block">Phone</label>
            <input type="tel" value={info.phone} onChange={(e) => setInfo(p => ({ ...p, phone: e.target.value }))} placeholder="e.g. (865) 403-7301" className={fieldCls} />
          </div>

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={() => { setStep('plan'); setError(''); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
              className="border border-white/25 text-gray-100 font-semibold py-3.5 px-5 rounded-xl text-sm flex-shrink-0">Back</button>
            <button type="submit" className="flex-1 bg-amber-500 hover:bg-amber-400 text-black font-bold py-3.5 rounded-xl text-sm transition-all">Next: Details</button>
          </div>
        </form>
      )}

      {/* Step 3 — Business Details */}
      {step === 'details' && (
        <form onSubmit={handleSubmit} className="mt-6 space-y-5">
          <div className="mb-1">
            <p className="text-[10px] text-gray-100 font-semibold uppercase tracking-widest mb-1">Step 3 of 3</p>
            <h1 className="text-xl font-bold text-white">Processing Details</h1>
            <p className="text-xs text-gray-100 mt-1">Required by our processor for account setup.</p>
          </div>

          {/* Business Structure */}
          <div className="bg-[#1A1D24] rounded-2xl border border-white/10 p-5 space-y-3.5">
            <h3 className="text-sm font-bold text-white">Business Structure</h3>
            <select value={det.ownershipType} onChange={(e) => setDet(p => ({ ...p, ownershipType: e.target.value }))} className={selCls}>
              <option value="">Business type...</option>
              {OWNERSHIP_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <select value={det.taxClassType} onChange={(e) => setDet(p => ({ ...p, taxClassType: e.target.value }))} className={selCls}>
              <option value="">Tax class...</option>
              {TAX_OPTIONS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
            <select value={det.industryClass} onChange={(e) => handleIndustry(e.target.value)} className={selCls}>
              <option value="">Industry...</option>
              {INDUSTRIES.map(i => <option key={i.value} value={i.value}>{i.label}</option>)}
            </select>
            <select value={det.titleType} onChange={(e) => setDet(p => ({ ...p, titleType: e.target.value }))} className={selCls}>
              <option value="">Your title...</option>
              {TITLE_OPTIONS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
            <textarea value={det.productDescription} onChange={(e) => setDet(p => ({ ...p, productDescription: e.target.value }))}
              placeholder="What do you sell?" rows={2} className={fieldCls + ' resize-none'} />
            <div className="grid grid-cols-2 gap-3">
              <input type="number" value={det.establishmentYear} onChange={(e) => setDet(p => ({ ...p, establishmentYear: e.target.value }))}
                placeholder="Year est." className={fieldCls} />
              <div className="grid grid-cols-2 gap-2">
                <input type="number" value={det.currentOwnershipYears} onChange={(e) => setDet(p => ({ ...p, currentOwnershipYears: e.target.value }))}
                  placeholder="Yrs" className={fieldCls} />
                <input type="number" value={det.currentOwnershipMonths} onChange={(e) => setDet(p => ({ ...p, currentOwnershipMonths: e.target.value }))}
                  placeholder="Mos" className={fieldCls} />
              </div>
            </div>
          </div>

          {/* Processing Volume */}
          <div className="bg-[#1A1D24] rounded-2xl border border-white/10 p-5 space-y-3.5">
            <h3 className="text-sm font-bold text-white">Processing Volume</h3>
            <div className="grid grid-cols-2 gap-3">
              <input type="number" value={det.avgSaleAmount} onChange={(e) => setDet(p => ({ ...p, avgSaleAmount: e.target.value }))}
                placeholder="Avg sale $" className={fieldCls} />
              <input type="number" value={det.monthlyCardSales} onChange={(e) => setDet(p => ({ ...p, monthlyCardSales: e.target.value }))}
                placeholder="Monthly $" className={fieldCls} />
              <input type="number" value={det.annualRevenue} onChange={(e) => setDet(p => ({ ...p, annualRevenue: e.target.value }))}
                placeholder="Annual $" className={fieldCls} />
              <input type="number" value={det.highestTicketAmount} onChange={(e) => setDet(p => ({ ...p, highestTicketAmount: e.target.value }))}
                placeholder="Max ticket $" className={fieldCls} />
            </div>
          </div>

          {/* Acceptance Mix */}
          <div className="bg-[#1A1D24] rounded-2xl border border-white/10 p-5 space-y-3.5">
            <h3 className="text-sm font-bold text-white">Card Acceptance</h3>
            <p className="text-[10px] text-gray-100">How customers pay. Must total 100%.</p>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-[10px] text-gray-100 block mb-1">In-Person %</label>
                <input type="number" value={det.cardPresentPct} onChange={(e) => setDet(p => ({ ...p, cardPresentPct: e.target.value }))}
                  min="0" max="100" className={fieldCls} />
              </div>
              <div>
                <label className="text-[10px] text-gray-100 block mb-1">Online %</label>
                <input type="number" value={det.internetPct} onChange={(e) => setDet(p => ({ ...p, internetPct: e.target.value }))}
                  min="0" max="100" className={fieldCls} />
              </div>
              <div>
                <label className="text-[10px] text-gray-100 block mb-1">MOTO %</label>
                <input type="number" value={det.motoPct} onChange={(e) => setDet(p => ({ ...p, motoPct: e.target.value }))}
                  min="0" max="100" className={fieldCls} />
              </div>
            </div>
            {pctSum() !== 100 && (det.cardPresentPct || det.internetPct || det.motoPct) && (
              <p className="text-[11px] text-amber-300 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">Total {pctSum()}% — must be 100%.</p>
            )}
            {pctSum() === 100 && (
              <p className="text-[11px] text-green-300 bg-green-500/10 border border-green-500/20 rounded-lg px-3 py-2 flex items-center gap-1">
                <span className="w-3 h-3 rounded-full bg-green-400 inline-block" /> Total 100%
              </p>
            )}
          </div>

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={() => { setStep('info'); setError(''); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
              className="border border-white/25 text-gray-100 font-semibold py-3.5 px-5 rounded-xl text-sm flex-shrink-0">Back</button>
            <button type="submit" disabled={submitting}
              className="flex-1 bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 disabled:from-gray-600 disabled:to-gray-600 text-white font-bold py-3.5 rounded-xl text-sm transition-all shadow-lg shadow-amber-900/30">
              {submitting ? <><Loader2 className="w-4 h-4 animate-spin inline mr-2" /> Creating...</> : 'Create Account'}
            </button>
          </div>
        </form>
      )}

      {/* Footer */}
      <p className="text-gray-100 text-[10px] text-center mt-8">
        Secured by <span className="text-amber-400 font-bold">Cliqbux</span> · onboarding.cliqbux.com · {new Date().getFullYear()}
      </p>
    </div>
  );
}