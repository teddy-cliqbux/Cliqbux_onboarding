import { useState } from 'react';
import { Link2, ChevronDown, ArrowRight } from 'lucide-react';

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
      <div className="border border-green-200 bg-green-50 rounded-xl p-5">
        <div className="flex items-center gap-3 mb-1">
          <Link2 className="w-5 h-5 text-green-600" />
          <h3 className="text-sm font-bold text-green-800">POS Authorization Submitted</h3>
        </div>
        <p className="text-xs text-gray-600">
          Your {POS_OPTIONS.find((o) => o.value === provider)?.label || provider} integration request has been sent to your account manager.
        </p>
      </div>
    );
  }

  return (
    <div className="border border-gray-200 rounded-xl p-5">
      <div className="flex items-center gap-3 mb-0.5">
        <Link2 className="w-5 h-5 text-gray-900" />
        <h3 className="text-sm font-bold text-gray-900">Connect Legacy POS Network</h3>
      </div>
      <p className="text-xs text-gray-500 mb-4">
        Bridge your existing Point-of-Sale platform so Cliqbux can sync directly.
      </p>

      <div className="flex flex-col gap-3">
        {/* Provider dropdown */}
        <div className="relative">
          <button
            onClick={() => setOpen(!open)}
            className="w-full flex items-center justify-between bg-white border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-left"
          >
            <span className={provider ? 'text-gray-900' : 'text-gray-400'}>{provider ? POS_OPTIONS.find((o) => o.value === provider)?.label : 'Select your POS provider...'}</span>
            <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} />
          </button>
          {open && (
            <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-20">
              {POS_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => { setProvider(opt.value); setOpen(false); }}
                  className={`w-full text-left px-3 py-2.5 text-sm hover:bg-gray-100 ${provider === opt.value ? 'font-semibold text-gray-900' : 'text-gray-600'}`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Token / invite instructions */}
        <div className="bg-blue-50 border border-blue-100 rounded-lg px-3 py-2.5">
          <p className="text-[11px] font-semibold text-blue-800 mb-1">
            {provider === 'other' ? 'Tell us which provider:' : 'Connect via API Token'}
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
            className="w-full bg-white border border-blue-200 rounded-lg px-3 py-2 text-xs outline-none text-gray-900"
          />
          <p className="text-[10px] text-blue-600 mt-1">
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
            <p className="text-[10px] text-gray-500 mt-2 border-t border-blue-100 pt-2">
              Alternatively, invite{' '}
              <span className="font-bold text-blue-700">integrations@cliqbux.com</span> as an integration manager.
            </p>
          )}
        </div>

        <button
          onClick={handleSubmit}
          disabled={!provider || !token.trim()}
          className="w-full flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-600 disabled:bg-gray-200 disabled:text-gray-400 text-white font-bold py-2.5 rounded-lg text-sm transition-colors"
        >
          Submit & Notify My Account Manager <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}