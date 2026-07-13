import { useState } from 'react';
import { Link2, ChevronDown, ArrowRight, Check } from 'lucide-react';

const POS_OPTIONS = [
  { value: 'clover', label: 'Clover' },
  { value: 'toast', label: 'Toast' },
  { value: 'square', label: 'Square' },
  { value: 'lightspeed', label: 'Lightspeed' },
  { value: 'other', label: 'Other Provider' },
];

export default function LegacyPOSBridge() {
  const [provider, setProvider] = useState('');
  const [token, setToken] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [open, setOpen] = useState(false);

  const handleSubmit = () => {
    if (!provider || !token.trim()) return;
    setSubmitted(true);
  };

  if (submitted) {
    return (
      <div className="bg-cb-surface-raised border border-cb-border border-l-2 border-l-cb-success rounded-cb p-5">
        <div className="flex items-center gap-3 mb-1">
          <span className="flex items-center justify-center w-7 h-7 rounded-full bg-cb-success/15 flex-shrink-0">
            <Check className="w-3.5 h-3.5 text-cb-success" strokeWidth={3} />
          </span>
          <h3 className="text-cb-body font-semibold text-white">POS Authorization Submitted</h3>
        </div>
        <p className="text-cb-caption normal-case tracking-normal font-normal text-gray-500 mt-1">
          Your {POS_OPTIONS.find((o) => o.value === provider)?.label || provider} integration request has been sent to your account manager.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-cb-surface-raised border border-cb-border rounded-cb p-5">
      <div className="flex items-center gap-2.5 mb-0.5">
        <Link2 className="w-4 h-4 text-gray-400" />
        <h3 className="text-cb-body font-semibold text-white">Connect Legacy POS Network</h3>
      </div>
      <p className="text-cb-caption normal-case tracking-normal font-normal text-gray-500 mb-4">
        Bridge your existing Point-of-Sale platform so Cliqbux can sync directly.
      </p>

      <div className="flex flex-col gap-3">
        {/* Provider dropdown */}
        <div className="relative">
          <button
            onClick={() => setOpen(!open)}
            className="w-full flex items-center justify-between bg-cb-bg border border-cb-border rounded-cb px-3 py-2.5 text-cb-body text-left hover:border-cb-border-strong transition-colors"
          >
            <span className={provider ? 'text-white' : 'text-gray-500'}>{provider ? POS_OPTIONS.find((o) => o.value === provider)?.label : 'Select your POS provider...'}</span>
            <ChevronDown className={`w-4 h-4 text-gray-500 transition-transform ${open ? 'rotate-180' : ''}`} />
          </button>
          {open && (
            <div className="absolute left-0 right-0 top-full mt-1 bg-cb-surface-raised border border-cb-border rounded-cb shadow-cb-overlay z-20 overflow-hidden">
              {POS_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => { setProvider(opt.value); setOpen(false); }}
                  className={`w-full text-left px-3 py-2.5 text-cb-body hover:bg-cb-bg transition-colors ${provider === opt.value ? 'font-medium text-white' : 'text-gray-400'}`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Token / invite instructions */}
        <div className="bg-cb-bg border border-cb-border border-l-2 border-l-cb-accent rounded-cb px-3 py-2.5">
          <p className="text-cb-caption uppercase text-gray-500 mb-1.5">
            {provider === 'other' ? 'Tell us which provider' : 'Connect via API Token'}
          </p>
          <input
            type="text"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder={
              provider === 'other'
                ? 'e.g. Datacap, Shift4, Global Payments...'
                : provider
                ? 'Paste your API token here...'
                : 'Select a provider first...'
            }
            disabled={!provider}
            className="w-full bg-cb-surface border border-cb-border rounded-cb px-3 py-2 text-cb-body text-white placeholder:text-gray-500 outline-none focus:ring-2 focus:ring-cb-accent focus:border-transparent disabled:opacity-50"
          />
          <p className="text-cb-caption normal-case tracking-normal font-normal text-gray-500 mt-1.5">
            {provider === 'clover'
              ? 'Go to Clover Dashboard → Apps → Create an API token with read access.'
              : provider === 'toast'
              ? 'Go to Toast Admin → Integrations → Generate a read-only API key.'
              : provider === 'square'
              ? 'Go to Square Developer Portal → OAuth → Connect cliqbux as integration manager.'
              : provider === 'lightspeed'
              ? 'Go to Lightspeed → Integrations → Generate a read-only API token.'
              : provider === 'other'
              ? 'Enter the provider name so we can reach out.'
              : ''}
          </p>
          {provider && provider !== 'other' && (
            <p className="text-cb-caption normal-case tracking-normal font-normal text-gray-500 mt-2 border-t border-cb-border pt-2">
              Alternatively, invite{' '}
              <span className="font-medium text-cb-accent">integrations@cliqbux.com</span> as an integration manager.
            </p>
          )}
        </div>

        <button
          onClick={handleSubmit}
          disabled={!provider || !token.trim()}
          className="w-full flex items-center justify-center gap-2 bg-cb-accent hover:opacity-90 disabled:bg-cb-bg disabled:text-gray-600 disabled:border disabled:border-cb-border text-cb-bg font-semibold py-2.5 rounded-cb text-cb-body transition-colors"
        >
          Submit & Notify My Account Manager <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
