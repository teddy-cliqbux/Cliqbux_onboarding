import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { invokePortalFunction } from '@/lib/merchantAuthFetch';

const PROVIDERS = [
  { id: 'clover', label: 'Clover', mark: 'C' },
  { id: 'square', label: 'Square', mark: '□' },
  { id: 'lightspeed', label: 'Lightspeed', mark: 'L' },
  { id: 'shopify', label: 'Shopify', mark: 'S' },
  { id: 'toast', label: 'Toast', mark: 'T' },
];

export default function PosOAuthGrid({ corporateId }) {
  const [busy, setBusy] = useState(null);
  const [done, setDone] = useState(null);
  const [error, setError] = useState('');

  const trackIntent = async (provider) => {
    if (!corporateId || busy) return;
    setBusy(provider);
    setError('');
    try {
      await invokePortalFunction('submitLegacyPOSConnection', {
        corporateId,
        connectionMethod: 'oauth',
        provider,
        notes: `OAuth intent tracked for ${provider}`,
      });
      setDone(provider);
    } catch (e) {
      setError(e?.message || 'Could not notify our team. Please try again.');
    } finally {
      setBusy(null);
    }
  };

  if (done) {
    const label = PROVIDERS.find((p) => p.id === done)?.label || done;
    return (
      <div className="rounded-cb border border-cb-border border-l-2 border-l-cb-accent bg-cb-bg px-4 py-4">
        <p className="text-cb-body font-medium text-white">Coming Soon</p>
        <p className="text-cb-caption normal-case tracking-normal font-normal text-gray-400 mt-1">
          Our team has been notified to coordinate a {label} cloud sync for your account.
          We&apos;ll reach out to finish OAuth authorization securely.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-cb-caption normal-case tracking-normal text-gray-500">
        Choose your POS to start a secure OAuth connection. Full provider apps are rolling out —
        selecting one notifies your Cliqbux team to coordinate.
      </p>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
        {PROVIDERS.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => trackIntent(p.id)}
            disabled={!!busy}
            className="flex flex-col items-center justify-center gap-2 rounded-cb border border-cb-border bg-cb-bg px-3 py-4 hover:border-cb-accent/60 hover:bg-cb-accent-muted/30 transition-colors disabled:opacity-60"
          >
            {busy === p.id ? (
              <Loader2 className="w-5 h-5 text-cb-accent animate-spin" />
            ) : (
              <span className="flex items-center justify-center w-10 h-10 rounded-cb bg-cb-surface-raised border border-cb-border font-display text-cb-title text-cb-accent">
                {p.mark}
              </span>
            )}
            <span className="text-cb-caption normal-case tracking-normal font-medium text-white">{p.label}</span>
          </button>
        ))}
      </div>
      {error && (
        <p className="text-cb-caption normal-case tracking-normal text-cb-danger">{error}</p>
      )}
    </div>
  );
}
