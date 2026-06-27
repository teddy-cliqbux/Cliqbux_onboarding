import { useState } from 'react';
import { Loader2, ArrowRight, ArrowLeft, CheckCircle, CreditCard, Percent, Building2, DollarSign, BarChart3 } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import CliqbuxLogo from './CliqbuxLogo';
import { normalizeBusinessName } from '@/lib/textUtils';

const PRICING_CARDS = [
  {
    key: 'TRADITIONAL',
    label: 'Swiped & Keyed',
    icon: CreditCard,
    description: 'Covers both in-person card-present and card-not-present transactions. Swiped rate at 2.49% + $0.10, keyed rate at 2.89% + $0.30.',
    badge: 'Most Popular',
    badgeColor: 'bg-blue-100 text-blue-700',
    accentColor: 'border-blue-200 hover:border-blue-400',
    selectedColor: 'border-blue-500 bg-blue-50',
    iconColor: 'text-blue-600',
    iconBg: 'bg-blue-100',
    rate: '2.49%',
    fee: '$0.10',
    rateLabel: 'SWIPED · 2.89% + $0.30 KEYED'
  },
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

const OWNERSHIP_TYPES = [
  { value: 'LIMITED_COMPANY', label: 'LLC (Limited Liability Company)' },
  { value: 'CORPORATION', label: 'Corporation (Inc / Corp)' },
  { value: 'SOLE_PROPRIETOR', label: 'Sole Proprietor' },
  { value: 'GENERAL_PARTNERSHIP', label: 'General Partnership' },
  { value: 'LIMITED_PARTNERSHIP', label: 'Limited Partnership' },
  { value: 'NON_PROFIT', label: 'Non-Profit Organization' },
];

const TAX_CLASS_TYPES = [
  { value: 'LLC_CORPORATION', label: 'LLC taxed as Corporation' },
  { value: 'LLC_PARTNERSHIP', label: 'LLC taxed as Partnership' },
  { value: 'CORPORATION', label: 'C-Corporation' },
  { value: 'SOLE_PROP', label: 'Sole Proprietorship' },
  { value: 'PARTNERSHIP', label: 'Partnership' },
];

const TITLE_TYPES = [
  { value: 'CHIEF_EXECUTIVE_OFFICER', label: 'CEO / Chief Executive Officer' },
  { value: 'PRESIDENT', label: 'President' },
  { value: 'OWNER', label: 'Owner' },
  { value: 'DIRECTOR', label: 'Director' },
  { value: 'PARTNER', label: 'Partner' },
  { value: 'VICE_PRESIDENT', label: 'Vice President' },
  { value: 'MANAGER', label: 'Manager' },
];

// Industry options with default MCC codes
const INDUSTRIES = [
  { value: 'RETAIL', label: 'Retail — General Merchandise', mcc: '5999' },
  { value: 'RESTAURANT', label: 'Restaurant / Food Service', mcc: '5812' },
  { value: 'GROCERY', label: 'Grocery / Convenience Store', mcc: '5411' },
  { value: 'BAR', label: 'Bar / Nightclub / Lounge', mcc: '5813' },
  { value: 'CLOTHING', label: 'Clothing & Apparel', mcc: '5699' },
  { value: 'ELECTRONICS', label: 'Electronics & Computers', mcc: '5732' },
  { value: 'FURNITURE', label: 'Furniture & Home Goods', mcc: '5712' },
  { value: 'AUTO', label: 'Automotive Parts & Service', mcc: '5571' },
  { value: 'HEALTH', label: 'Health & Medical Services', mcc: '8099' },
  { value: 'SALON', label: 'Salon / Barber / Spa', mcc: '7230' },
  { value: 'GYM', label: 'Gym / Fitness / Recreation', mcc: '7941' },
  { value: 'HOTEL', label: 'Hotel / Lodging', mcc: '7011' },
  { value: 'ECOMMERCE', label: 'E-Commerce / Online Store', mcc: '5965' },
  { value: 'SERVICES', label: 'Professional Services (Other)', mcc: '7299' },
];

const inputCls = 'w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white';
const labelCls = 'text-sm font-semibold text-gray-700 mb-1.5 block';
const selectCls = 'w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white';

export default function SelfServePricing({ onComplete }) {
  const [selectedTier, setSelectedTier] = useState(null);
  const [selectedCardIndex, setSelectedCardIndex] = useState(null);
  const [page, setPage] = useState(1); // 1 = basic info, 2 = business details
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Page 1 fields
  const [basic, setBasic] = useState({ businessName: '', signerName: '', signerEmail: '', corporatePhone: '' });

  // Page 2 fields
  const [details, setDetails] = useState({
    ownershipType: '',
    taxClassType: '',
    industryClass: '',
    mccCode: '',
    productDescription: '',
    establishmentYear: '',
    currentOwnershipYears: '',
    currentOwnershipMonths: '0',
    titleType: '',
    avgSaleAmount: '',
    monthlyCardSales: '',
    annualRevenue: '',
    highestTicketAmount: '',
    cardPresentPct: '100',
    internetPct: '0',
    motoPct: '0',
  });

  const handleSelectTier = (key, index) => {
    setSelectedTier(key);
    setSelectedCardIndex(index);
    setError('');
  };

  const handleIndustryChange = (value) => {
    const match = INDUSTRIES.find(i => i.value === value);
    setDetails(p => ({ ...p, industryClass: value, mccCode: match?.mcc || p.mccCode }));
  };

  const acceptancePctSum = () => {
    return (parseInt(details.cardPresentPct, 10) || 0) +
           (parseInt(details.internetPct, 10) || 0) +
           (parseInt(details.motoPct, 10) || 0);
  };

  const handlePage1Next = (e) => {
    e.preventDefault();
    setError('');
    if (!selectedTier) { setError('Please select a pricing plan.'); return; }
    if (!basic.businessName || !basic.signerName || !basic.signerEmail) { setError('Please fill in all required fields.'); return; }
    if (!basic.signerEmail.includes('@')) { setError('Please enter a valid email address.'); return; }
    setPage(2);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!details.ownershipType) { setError('Please select your business type.'); return; }
    if (!details.taxClassType) { setError('Please select your tax classification.'); return; }
    if (!details.industryClass) { setError('Please select your industry.'); return; }
    if (!details.titleType) { setError('Please select your title.'); return; }
    if (!details.productDescription.trim()) { setError('Please describe your products or services.'); return; }
    if (!details.avgSaleAmount || !details.monthlyCardSales || !details.annualRevenue) {
      setError('Please fill in all volume fields.'); return;
    }
    const pctSum = acceptancePctSum();
    if (pctSum !== 100) { setError(`Card acceptance percentages must add up to 100% (currently ${pctSum}%).`); return; }

    setSubmitting(true);
    try {
      const normalizedName = normalizeBusinessName(basic.businessName);
      const response = await base44.functions.invoke('createHubspotDeal', {
        businessName: normalizedName,
        signerName: basic.signerName,
        signerEmail: basic.signerEmail,
        pricingTier: selectedTier,
        corporatePhone: basic.corporatePhone.replace(/\D/g, ''),
        ownershipType: details.ownershipType,
        taxClassType: details.taxClassType,
        industryClass: details.industryClass,
        mccCode: details.mccCode,
        productDescription: details.productDescription,
        establishmentYear: details.establishmentYear,
        currentOwnershipYears: details.currentOwnershipYears,
        currentOwnershipMonths: details.currentOwnershipMonths,
        titleType: details.titleType,
        avgSaleAmount: details.avgSaleAmount,
        monthlyCardSales: details.monthlyCardSales,
        annualRevenue: details.annualRevenue,
        highestTicketAmount: details.highestTicketAmount || details.avgSaleAmount,
        highestTicketFrequency: 24,
        cardPresentPct: details.cardPresentPct,
        internetPct: details.internetPct,
        motoPct: details.motoPct,
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
      <div className="fixed top-0 left-0 right-0 z-50 bg-gray-900/80 backdrop-blur border-b border-gray-800 px-6 py-4 flex items-center justify-between">
        <CliqbuxLogo size="sm" />
        <span className="text-xs text-gray-500 font-mono">Secure Merchant Onboarding</span>
      </div>

      <div className="pt-24 pb-16 px-4 flex flex-col items-center">
        {/* Progress indicator */}
        <div className="flex items-center gap-2 mb-8">
          <div className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full ${page === 1 ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' : 'bg-green-500/10 text-green-400 border border-green-500/20'}`}>
            {page > 1 ? <CheckCircle className="w-3 h-3" /> : <span className="w-3 h-3 rounded-full bg-amber-400 inline-block" />}
            1. Select Plan & Contact
          </div>
          <div className="w-6 h-px bg-gray-700" />
          <div className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full ${page === 2 ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' : 'bg-gray-800 text-gray-600 border border-gray-700'}`}>
            {page === 2 ? <span className="w-3 h-3 rounded-full bg-amber-400 inline-block" /> : <span className="w-3 h-3 rounded-full border border-gray-600 inline-block" />}
            2. Business Details
          </div>
        </div>

        {/* PAGE 1 — Pricing + Basic Info */}
        {page === 1 && (
          <>
            <div className="text-center mb-12 max-w-2xl">
              <div className="inline-flex items-center gap-2 bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs font-semibold px-4 py-2 rounded-full mb-6">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                STEP 1 OF 2 — SELECT YOUR PRICING PLAN
              </div>
              <h1 className="text-4xl font-bold text-white mb-4 leading-tight">Choose Your Processing Model</h1>
              <p className="text-gray-400 text-lg leading-relaxed">Select the pricing plan that fits your business. Rates are locked — no hidden fees, no surprises.</p>
            </div>

            {/* Pricing Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full max-w-3xl mb-10">
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

            {/* Basic Info Form */}
            {selectedTier && (
              <div className="w-full max-w-lg portal-card p-8 animate-in fade-in slide-in-from-bottom-4 duration-300">
                <div className="mb-6">
                  <h2 className="text-xl font-bold text-gray-900 mb-1">Tell Us About Your Business</h2>
                  <p className="text-gray-500 text-sm">Selected: <span className="font-semibold text-gray-700">{PRICING_CARDS[selectedCardIndex]?.label}</span></p>
                </div>

                <form onSubmit={handlePage1Next} className="flex flex-col gap-4">
                  <div>
                    <label className={labelCls}>Business Legal Name <span className="text-red-400">*</span></label>
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

                  {error && <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-red-700 text-sm">{error}</div>}

                  <button type="submit" className="w-full flex items-center justify-center gap-3 bg-gray-900 hover:bg-gray-800 text-white font-bold py-4 px-6 rounded-xl text-sm transition-all mt-2">
                    Next: Business Details <ArrowRight className="w-4 h-4" />
                  </button>
                </form>
              </div>
            )}
          </>
        )}

        {/* PAGE 2 — Business Details */}
        {page === 2 && (
          <div className="w-full max-w-2xl animate-in fade-in slide-in-from-bottom-4 duration-300">
            <div className="text-center mb-8">
              <div className="inline-flex items-center gap-2 bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs font-semibold px-4 py-2 rounded-full mb-4">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                STEP 2 OF 2 — BUSINESS DETAILS
              </div>
              <h1 className="text-3xl font-bold text-white mb-3">Business & Processing Details</h1>
              <p className="text-gray-400 text-sm">Required by our payment processor for account setup. Takes about 2 minutes.</p>
            </div>

            <form onSubmit={handleSubmit} className="flex flex-col gap-6">
              {/* Business Structure */}
              <div className="portal-card p-6">
                <div className="flex items-center gap-2 mb-5">
                  <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center"><Building2 className="w-4 h-4 text-blue-600" /></div>
                  <h3 className="font-bold text-gray-900 text-base">Business Structure</h3>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className={labelCls}>Business Type <span className="text-red-400">*</span></label>
                    <select value={details.ownershipType} onChange={(e) => setDetails(p => ({ ...p, ownershipType: e.target.value }))} className={selectCls} style={{ colorScheme: 'light' }} required>
                      <option value="">Select business type...</option>
                      {OWNERSHIP_TYPES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={labelCls}>Tax Classification <span className="text-red-400">*</span></label>
                    <select value={details.taxClassType} onChange={(e) => setDetails(p => ({ ...p, taxClassType: e.target.value }))} className={selectCls} style={{ colorScheme: 'light' }} required>
                      <option value="">Select tax class...</option>
                      {TAX_CLASS_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={labelCls}>Industry <span className="text-red-400">*</span></label>
                    <select value={details.industryClass} onChange={(e) => handleIndustryChange(e.target.value)} className={selectCls} style={{ colorScheme: 'light' }} required>
                      <option value="">Select industry...</option>
                      {INDUSTRIES.map(i => <option key={i.value} value={i.value}>{i.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={labelCls}>Your Title <span className="text-red-400">*</span></label>
                    <select value={details.titleType} onChange={(e) => setDetails(p => ({ ...p, titleType: e.target.value }))} className={selectCls} style={{ colorScheme: 'light' }} required>
                      <option value="">Select your title...</option>
                      {TITLE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>
                  </div>
                  <div className="md:col-span-2">
                    <label className={labelCls}>What do you sell? <span className="text-red-400">*</span></label>
                    <textarea value={details.productDescription} onChange={(e) => setDetails(p => ({ ...p, productDescription: e.target.value }))}
                      placeholder="e.g. Retail clothing, accessories, and gift items" rows={2}
                      className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none" required />
                  </div>
                  <div>
                    <label className={labelCls}>Year Established</label>
                    <input type="number" value={details.establishmentYear} onChange={(e) => setDetails(p => ({ ...p, establishmentYear: e.target.value }))}
                      placeholder="e.g. 2018" min="1900" max={new Date().getFullYear()} className={inputCls} />
                  </div>
                  <div className="flex gap-3">
                    <div className="flex-1">
                      <label className={labelCls}>Ownership (Years)</label>
                      <input type="number" value={details.currentOwnershipYears} onChange={(e) => setDetails(p => ({ ...p, currentOwnershipYears: e.target.value }))}
                        placeholder="e.g. 5" min="0" max="99" className={inputCls} />
                    </div>
                    <div className="flex-1">
                      <label className={labelCls}>Months</label>
                      <input type="number" value={details.currentOwnershipMonths} onChange={(e) => setDetails(p => ({ ...p, currentOwnershipMonths: e.target.value }))}
                        placeholder="0–11" min="0" max="11" className={inputCls} />
                    </div>
                  </div>
                </div>
              </div>

              {/* Processing Volume */}
              <div className="portal-card p-6">
                <div className="flex items-center gap-2 mb-5">
                  <div className="w-8 h-8 rounded-lg bg-green-50 flex items-center justify-center"><DollarSign className="w-4 h-4 text-green-600" /></div>
                  <h3 className="font-bold text-gray-900 text-base">Processing Volume</h3>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className={labelCls}>Avg Sale Amount ($) <span className="text-red-400">*</span></label>
                    <input type="number" value={details.avgSaleAmount} onChange={(e) => setDetails(p => ({ ...p, avgSaleAmount: e.target.value }))}
                      placeholder="e.g. 45" min="1" className={inputCls} required />
                  </div>
                  <div>
                    <label className={labelCls}>Monthly Card Volume ($) <span className="text-red-400">*</span></label>
                    <input type="number" value={details.monthlyCardSales} onChange={(e) => setDetails(p => ({ ...p, monthlyCardSales: e.target.value }))}
                      placeholder="e.g. 10000" min="1" className={inputCls} required />
                  </div>
                  <div>
                    <label className={labelCls}>Annual Revenue ($) <span className="text-red-400">*</span></label>
                    <input type="number" value={details.annualRevenue} onChange={(e) => setDetails(p => ({ ...p, annualRevenue: e.target.value }))}
                      placeholder="e.g. 120000" min="1" className={inputCls} required />
                  </div>
                  <div>
                    <label className={labelCls}>Highest Single Ticket ($)</label>
                    <input type="number" value={details.highestTicketAmount} onChange={(e) => setDetails(p => ({ ...p, highestTicketAmount: e.target.value }))}
                      placeholder="e.g. 500" min="1" className={inputCls} />
                    <p className="text-xs text-gray-400 mt-1">Largest expected single transaction</p>
                  </div>
                </div>
              </div>

              {/* Card Acceptance Mix */}
              <div className="portal-card p-6">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-8 h-8 rounded-lg bg-purple-50 flex items-center justify-center"><BarChart3 className="w-4 h-4 text-purple-600" /></div>
                  <h3 className="font-bold text-gray-900 text-base">Card Acceptance Mix</h3>
                </div>
                <p className="text-xs text-gray-500 mb-5">How do customers typically pay? Must add up to 100%.</p>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className={labelCls}>In-Person (%)</label>
                    <input type="number" value={details.cardPresentPct} onChange={(e) => setDetails(p => ({ ...p, cardPresentPct: e.target.value }))}
                      placeholder="e.g. 100" min="0" max="100" className={inputCls} />
                    <p className="text-[10px] text-gray-400 mt-1">Card present / swiped</p>
                  </div>
                  <div>
                    <label className={labelCls}>Online (%)</label>
                    <input type="number" value={details.internetPct} onChange={(e) => setDetails(p => ({ ...p, internetPct: e.target.value }))}
                      placeholder="e.g. 0" min="0" max="100" className={inputCls} />
                    <p className="text-[10px] text-gray-400 mt-1">E-commerce / website</p>
                  </div>
                  <div>
                    <label className={labelCls}>Phone/Mail (%)</label>
                    <input type="number" value={details.motoPct} onChange={(e) => setDetails(p => ({ ...p, motoPct: e.target.value }))}
                      placeholder="e.g. 0" min="0" max="100" className={inputCls} />
                    <p className="text-[10px] text-gray-400 mt-1">MOTO orders</p>
                  </div>
                </div>
                {acceptancePctSum() !== 100 && (details.cardPresentPct || details.internetPct || details.motoPct) && (
                  <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mt-3">
                    Total is {acceptancePctSum()}% — must equal 100%.
                  </p>
                )}
                {acceptancePctSum() === 100 && (
                  <p className="text-xs text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2 mt-3 flex items-center gap-1.5">
                    <CheckCircle className="w-3.5 h-3.5" /> Total is 100%
                  </p>
                )}
              </div>

              {error && <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-red-700 text-sm">{error}</div>}

              <div className="flex gap-3">
                <button type="button" onClick={() => { setPage(1); setError(''); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                  className="flex items-center gap-2 border border-gray-200 hover:bg-gray-50 text-gray-700 font-semibold py-4 px-5 rounded-xl text-sm transition-all flex-shrink-0">
                  <ArrowLeft className="w-4 h-4" /> Back
                </button>
                <button type="submit" disabled={submitting}
                  className="flex-1 flex items-center justify-center gap-3 bg-gray-900 hover:bg-gray-800 disabled:bg-gray-300 text-white font-bold py-4 px-6 rounded-xl text-sm transition-all">
                  {submitting ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> Creating your account...</>
                  ) : (
                    <><ArrowRight className="w-4 h-4" /> Create Account &amp; Continue</>
                  )}
                </button>
              </div>
            </form>
          </div>
        )}

        <p className="text-gray-600 text-xs mt-8 text-center">
          Secured by <span className="text-amber-500 font-semibold">Cliqbux</span> · onboarding.cliqbux.com · {new Date().getFullYear()}
        </p>
      </div>
    </div>
  );
}