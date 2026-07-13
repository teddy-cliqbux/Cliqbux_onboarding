import { useState } from 'react';
import { ChevronDown, Loader2, ShieldCheck, ArrowRight, Check } from 'lucide-react';
import { invokePortalFunction } from '@/lib/merchantAuthFetch';
import {
  encryptPosPassword,
  POS_CONSENT_TEXT_VERSION,
  POS_CONSENT_WAIVER,
} from '@/lib/posCredentialCrypto';

const PROVIDERS = [
  { value: 'clover', label: 'Clover' },
  { value: 'square', label: 'Square' },
  { value: 'lightspeed', label: 'Lightspeed' },
  { value: 'shopify', label: 'Shopify' },
  { value: 'toast', label: 'Toast' },
  { value: 'other', label: 'Other' },
];

const inputCls =
  'w-full bg-cb-surface border border-cb-border rounded-cb px-3 py-2 text-cb-body text-white placeholder:text-gray-500 outline-none focus:ring-2 focus:ring-cb-accent focus:border-transparent';

export default function PosCredentialVault({ corporateId }) {
  const [provider, setProvider] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [consent, setConsent] = useState(false);
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');

  const canSubmit =
    !!corporateId &&
    !!provider &&
    username.trim().length > 0 &&
    password.length > 0 &&
    consent &&
    !submitting;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setError('');
    try {
      const { ciphertext } = await encryptPosPassword(password);
      // Clear plaintext from state before network call returns
      setPassword('');

      await invokePortalFunction('submitLegacyPOSConnection', {
        corporateId,
        connectionMethod: 'credential_vault',
        provider,
        username: username.trim(),
        passwordCiphertext: ciphertext,
        consentAccepted: true,
        consentTextVersion: POS_CONSENT_TEXT_VERSION,
        consentTimestamp: new Date().toISOString(),
        // Do NOT send password, ipAddress, or authorizedUserEmail — server derives audit fields
      });
      setSubmitted(true);
    } catch (err) {
      setError(err?.message || 'Secure submit failed. Please try again or use Option B.');
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="rounded-cb border border-cb-border border-l-2 border-l-cb-success bg-cb-bg px-4 py-4">
        <div className="flex items-center gap-2 mb-1">
          <span className="flex items-center justify-center w-6 h-6 rounded-full bg-cb-success/15">
            <Check className="w-3.5 h-3.5 text-cb-success" strokeWidth={3} />
          </span>
          <p className="text-cb-body font-medium text-white">Credentials submitted securely</p>
        </div>
        <p className="text-cb-caption normal-case tracking-normal text-gray-400 mt-1">
          Your password was encrypted in the browser before upload. Our team will review under pending status —
          we never store plaintext admin passwords.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3" autoComplete="off">
      <div className="flex items-start gap-2 rounded-cb border border-cb-border border-l-2 border-l-cb-accent bg-cb-bg px-3 py-2.5">
        <ShieldCheck className="w-4 h-4 text-cb-accent flex-shrink-0 mt-0.5" />
        <p className="text-cb-caption normal-case tracking-normal text-gray-400">
          High-risk fallback only. Prefer Option B when possible. Passwords are encrypted with RSA-OAEP in your
          browser before leaving this page.
        </p>
      </div>

      <div className="relative">
        <label className="text-cb-caption uppercase text-gray-500 mb-1.5 block">POS Provider</label>
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="w-full flex items-center justify-between bg-cb-bg border border-cb-border rounded-cb px-3 py-2.5 text-cb-body text-left hover:border-cb-border-strong transition-colors"
        >
          <span className={provider ? 'text-white' : 'text-gray-500'}>
            {provider ? PROVIDERS.find((o) => o.value === provider)?.label : 'Select provider…'}
          </span>
          <ChevronDown className={`w-4 h-4 text-gray-500 transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
        {open && (
          <div className="absolute left-0 right-0 top-full mt-1 bg-cb-surface-raised border border-cb-border rounded-cb shadow-cb-overlay z-20 overflow-hidden">
            {PROVIDERS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => {
                  setProvider(opt.value);
                  setOpen(false);
                }}
                className={`w-full text-left px-3 py-2.5 text-cb-body hover:bg-cb-bg transition-colors ${
                  provider === opt.value ? 'font-medium text-white' : 'text-gray-400'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        )}
      </div>

      <div>
        <label className="text-cb-caption uppercase text-gray-500 mb-1.5 block">Admin Username</label>
        <input
          type="text"
          name="pos_username"
          autoComplete="off"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="Admin username or email"
          className={inputCls}
        />
      </div>

      <div>
        <label className="text-cb-caption uppercase text-gray-500 mb-1.5 block">Admin Password</label>
        <input
          type="password"
          name="pos_password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Encrypted before upload"
          className={inputCls}
        />
      </div>

      <label className="flex items-start gap-3 rounded-cb border border-cb-border bg-cb-bg px-3 py-3 cursor-pointer">
        <input
          type="checkbox"
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
          className="mt-1 rounded border-cb-border text-cb-accent focus:ring-cb-accent"
        />
        <span className="text-cb-caption normal-case tracking-normal text-gray-400 leading-relaxed">
          {POS_CONSENT_WAIVER}
        </span>
      </label>

      <button
        type="submit"
        disabled={!canSubmit}
        className="w-full inline-flex items-center justify-center gap-2 rounded-cb bg-cb-accent text-cb-bg font-semibold py-2.5 text-cb-body hover:opacity-95 disabled:bg-cb-bg disabled:text-gray-600 disabled:border disabled:border-cb-border transition-colors"
      >
        {submitting ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <>
            Submit encrypted credentials
            <ArrowRight className="w-4 h-4" />
          </>
        )}
      </button>
      {error && (
        <p className="text-cb-caption normal-case tracking-normal text-cb-danger">{error}</p>
      )}
    </form>
  );
}
