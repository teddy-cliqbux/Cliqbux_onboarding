import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { invokePortalFunction } from '@/lib/merchantAuthFetch';
import PosProviderLogo from '@/components/onboarding/legacyPos/PosProviderLogo';
import { friendlyPosError } from '@/components/onboarding/legacyPos/posErrors';

const PROVIDERS = [
  { id: 'clover', label: 'Clover' },
  { id: 'square', label: 'Square' },
  { id: 'lightspeed', label: 'Lightspeed' },
  { id: 'shopify', label: 'Shopify' },
  { id: 'toast', label: 'Toast' },
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
      setError(friendlyPosError(e?.message));
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
            className="flex flex-col items-center justify-center gap-2.5 rounded-cb border border-cb-border bg-cb-bg px-3 py-4 hover:border-cb-accent/60 hover:bg-cb-accent-muted/30 transition-colors disabled:opacity-60"
          >
            {busy === p.id ? (
              <Loader2 className="w-5 h-5 text-cb-accent animate-spin" />
            ) : (
              <PosProviderLogo provider={p.id} />
            )}
            <span className="text-cb-caption normal-case tracking-normal font-medium text-white">{p.label}</span>
          </button>
        ))}
      </div>
      {error && (
        <p className="text-cb-caption normal-case tracking-normal text-cb-danger leading-relaxed">{error}</p>
      )}
    </div>
  );
}
