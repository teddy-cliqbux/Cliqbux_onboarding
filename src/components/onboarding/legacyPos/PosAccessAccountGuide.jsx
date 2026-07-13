import { useState } from 'react';
import { Check, Copy, Loader2, ArrowRight } from 'lucide-react';
import { invokePortalFunction } from '@/lib/merchantAuthFetch';

const ACCESS_EMAIL = 'accounts@cliqbux.com';

const STEPS = [
  'Log into your legacy POS admin dashboard with an owner or admin account.',
  'Open Users / Team / Staff settings and create a new user.',
  `Set the email to ${ACCESS_EMAIL} and grant Admin or Manager permissions (read access to menus, items, and locations).`,
  'Save the user, then confirm below so we can finish the migration setup.',
];

export default function PosAccessAccountGuide({ corporateId, provider = 'other' }) {
  const [copied, setCopied] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');

  const copyEmail = async () => {
    try {
      await navigator.clipboard.writeText(ACCESS_EMAIL);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for older browsers / insecure contexts
      const el = document.createElement('textarea');
      el.value = ACCESS_EMAIL;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const confirmInvite = async () => {
    if (!corporateId || submitting) return;
    setSubmitting(true);
    setError('');
    try {
      await invokePortalFunction('submitLegacyPOSConnection', {
        corporateId,
        connectionMethod: 'access_account',
        provider: provider || 'other',
        notes: `Merchant confirmed invite path for ${ACCESS_EMAIL}`,
      });
      setSubmitted(true);
    } catch (e) {
      setError(e?.message || 'Could not notify our team. Please try again.');
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
          <p className="text-cb-body font-medium text-white">Invite path recorded</p>
        </div>
        <p className="text-cb-caption normal-case tracking-normal text-gray-400 mt-1">
          Your account manager has been notified. We&apos;ll accept the {ACCESS_EMAIL} invite and begin migration.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-cb-caption normal-case tracking-normal text-gray-500">
        Recommended path — you stay in control of credentials. Add Cliqbux as a user; we never need your password.
      </p>

      <ol className="space-y-2.5">
        {STEPS.map((text, i) => (
          <li key={i} className="flex gap-3">
            <span className="flex-shrink-0 flex items-center justify-center w-6 h-6 rounded-full bg-cb-accent-muted text-cb-caption font-semibold text-cb-accent">
              {i + 1}
            </span>
            <p className="text-cb-body text-gray-300 pt-0.5">{text}</p>
          </li>
        ))}
      </ol>

      <div className="flex flex-col sm:flex-row gap-2">
        <button
          type="button"
          onClick={copyEmail}
          className={`flex-1 inline-flex items-center justify-center gap-2 rounded-cb border px-3 py-2.5 text-cb-body font-medium transition-colors ${
            copied
              ? 'border-cb-success/40 bg-cb-success/10 text-cb-success'
              : 'border-cb-border bg-cb-bg text-white hover:border-cb-accent/50'
          }`}
        >
          {copied ? <Check className="w-4 h-4" strokeWidth={2.5} /> : <Copy className="w-4 h-4 text-cb-accent" />}
          {copied ? 'Copied' : ACCESS_EMAIL}
        </button>
      </div>

      <button
        type="button"
        onClick={confirmInvite}
        disabled={submitting}
        className="w-full inline-flex items-center justify-center gap-2 rounded-cb bg-cb-accent text-cb-bg font-semibold py-2.5 text-cb-body hover:opacity-95 disabled:opacity-60 transition-opacity"
      >
        {submitting ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <>
            I&apos;ve added the account — notify my AM
            <ArrowRight className="w-4 h-4" />
          </>
        )}
      </button>
      {error && (
        <p className="text-cb-caption normal-case tracking-normal text-cb-danger">{error}</p>
      )}
    </div>
  );
}
