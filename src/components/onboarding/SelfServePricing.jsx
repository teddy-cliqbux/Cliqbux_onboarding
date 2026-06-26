import { useState } from 'react';
import { Loader2, ArrowRight, CheckCircle, Zap, CreditCard, Percent } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import CliqbuxLogo from './CliqbuxLogo';

const PRICING_CARDS = [
  {
    key: 'TRADITIONAL',
    label: 'Traditional Swiped',
    icon: CreditCard,
    rate: '2.49%',
    fee: '$0.10',
    description: 'Best for in-person card-present transactions with a physical terminal. Card-not-present (keyed) transactions are also covered at 2.89% + $0.30.',
    badge: 'Most Popular',
    badgeColor: 'bg-blue-100 text-blue-700',
    accentColor: 'border-blue-200 hover:border-blue-400',
    selectedColor: 'border-blue-500 bg-blue-50',
    iconColor: 'text-blue-600',
    iconBg: 'bg-blue-100'
  },
  {
    key: 'TRADITIONAL',
    label: 'Traditional Keyed',
    icon: Zap,
    rate: '2.89%',
    fee: '$0.30',
    description: 'Ideal for phone orders, mail orders, or card-not-present transactions. In-person swiped transactions are also covered at 2.49% + $0.10.',
    badge: 'Card Not Present',
    badgeColor: 'bg-purple-100 text-purple-700',
    accentColor: 'border-purple-200 hover:border-purple-400',
    selectedColor: 'border-purple-500 bg-purple-50',
    iconColor: 'text-purple-600',
    iconBg: 'bg-purple-100'
  },
  {
    key: 'CASH_DISCOUNT',
    label: 'Cash Discount Program',
    icon: Percent,
    rate: '0%',
    fee: 'Processing Fees',
    description: 'Pass the processing cost to card-paying customers. Cash customers pay less.',
    badge: 'Zero Cost Processing',
    badgeColor: 'bg-green-100 text-green-700',
    accentColor: 'border-green-200 hover:border-green-400',
    selectedColor: 'border-green-500 bg-green-50',
    iconColor: 'text-green-600',
    iconBg: 'bg-green-100'
  }
];

export default function SelfServePricing({ onComplete }) {
  const [selectedTier, setSelectedTier] = useState(null);
  const [selectedCardIndex, setSelectedCardIndex] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ businessName: '', signerName: '', signerEmail: '' });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSelectTier = (key, index) => {
    setSelectedTier(key);
    setSelectedCardIndex(index);
    setShowForm(true);
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.businessName || !form.signerName || !form.signerEmail) {
      setError('Please fill in all fields.');
      return;
    }
    if (!form.signerEmail.includes('@')) {
      setError('Please enter a valid email address.');
      return;
    }

    setSubmitting(true);
    setError('');

    try {
      const response = await base44.functions.invoke('createHubspotDeal', {
        businessName: form.businessName,
        signerName: form.signerName,
        signerEmail: form.signerEmail,
        pricingTier: selectedTier
      });

      const data = response.data;
      if (data?.error) throw new Error(data.error);

      // Advance to Step 2 with new corporateId
      onComplete({
        corporateId: data.corporateId,
        legalName: form.businessName,
        signerEmail: form.signerEmail,
        pricingTier: selectedTier,
        applicationStatus: 'Pricing Selected'
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
        {/* Hero */}
        <div className="text-center mb-12 max-w-2xl">
          <div className="inline-flex items-center gap-2 bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs font-semibold px-4 py-2 rounded-full mb-6">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
            STEP 1 OF 3 — SELECT YOUR PRICING PLAN
          </div>
          <h1 className="text-4xl font-bold text-white mb-4 leading-tight">
            Choose Your Processing Model
          </h1>
          <p className="text-gray-400 text-lg leading-relaxed">
            Select the pricing plan that fits your business. Rates are locked — no hidden fees, no surprises.
          </p>
        </div>

        {/* Pricing Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full max-w-5xl mb-10">
          {PRICING_CARDS.map((card, index) => {
            const Icon = card.icon;
            const isSelected = selectedCardIndex === index;
            return (
              <button
                key={card.key}
                onClick={() => handleSelectTier(card.key, index)}
                className={`relative text-left rounded-2xl border-2 p-7 transition-all duration-200 bg-white shadow-lg cursor-pointer
                  ${isSelected ? card.selectedColor + ' shadow-xl scale-[1.02]' : 'border-gray-200 hover:shadow-xl hover:scale-[1.01] ' + card.accentColor}
                `}
              >
                {/* Badge */}
                <span className={`absolute top-5 right-5 text-xs font-bold px-2.5 py-1 rounded-full ${card.badgeColor}`}>
                  {card.badge}
                </span>

                {/* Selected indicator */}
                {isSelected && (
                  <div className="absolute top-5 left-5">
                    <CheckCircle className={`w-5 h-5 ${card.iconColor}`} />
                  </div>
                )}

                <div className={`w-12 h-12 rounded-xl ${card.iconBg} flex items-center justify-center mb-5 ${isSelected ? 'mt-6' : ''}`}>
                  <Icon className={`w-6 h-6 ${card.iconColor}`} />
                </div>

                <h3 className="text-xl font-bold text-gray-900 mb-2">{card.label}</h3>
                <p className="text-gray-500 text-sm mb-6 leading-relaxed">{card.description}</p>

                <div className="border-t border-gray-100 pt-5">
                  <div className="flex items-baseline gap-1 mb-1">
                    <span className="text-3xl font-black text-gray-900">{card.rate}</span>
                    {card.rate !== '0%' && <span className="text-gray-400 text-sm font-medium">+ {card.fee} / txn</span>}
                    {card.rate === '0%' && <span className="text-gray-400 text-sm font-medium">{card.fee}</span>}
                  </div>
                  <p className="text-xs text-gray-400 font-medium uppercase tracking-wider">
                    {card.rate === '0%' ? 'Zero processing cost' : 'Per transaction'}
                  </p>
                </div>
              </button>
            );
          })}
        </div>

        {/* Merchant Info Form */}
        {showForm && selectedTier && (
          <div className="w-full max-w-lg portal-card p-8 animate-in fade-in slide-in-from-bottom-4 duration-300">
            <div className="mb-6">
              <h2 className="text-xl font-bold text-gray-900 mb-1">Tell Us About Your Business</h2>
              <p className="text-gray-500 text-sm">
                Selected: <span className="font-semibold text-gray-700">{PRICING_CARDS.find(c => c.key === selectedTier)?.label}</span>
              </p>
            </div>

            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <div>
                <label className="text-sm font-semibold text-gray-700 mb-1.5 block">Business Legal Name</label>
                <input
                  type="text"
                  value={form.businessName}
                  onChange={(e) => setForm(p => ({ ...p, businessName: e.target.value }))}
                  placeholder="e.g. Acme Retail LLC"
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  required
                />
              </div>
              <div>
                <label className="text-sm font-semibold text-gray-700 mb-1.5 block">Your Full Name</label>
                <input
                  type="text"
                  value={form.signerName}
                  onChange={(e) => setForm(p => ({ ...p, signerName: e.target.value }))}
                  placeholder="e.g. Jane Smith"
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  required
                />
              </div>
              <div>
                <label className="text-sm font-semibold text-gray-700 mb-1.5 block">Business Email</label>
                <input
                  type="email"
                  value={form.signerEmail}
                  onChange={(e) => setForm(p => ({ ...p, signerEmail: e.target.value }))}
                  placeholder="e.g. owner@yourbusiness.com"
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  required
                />
              </div>

              {error && (
                <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-red-700 text-sm">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="w-full flex items-center justify-center gap-3 bg-gray-900 hover:bg-gray-800 disabled:bg-gray-300 text-white font-bold py-4 px-6 rounded-xl text-sm transition-all mt-2"
              >
                {submitting ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Creating your account...</>
                ) : (
                  <><ArrowRight className="w-4 h-4" /> Continue to Verification</>
                )}
              </button>
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