import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import CliqbuxLogo from './CliqbuxLogo';

/**
 * PortalEntry — shown when someone visits the portal with no dealId/token in the URL.
 *
 * Two paths:
 *   1. "I have an existing application" → enter email → receive magic link
 *   2. "Start a new application" → onSelfServe() → SelfServePricing
 */
export default function PortalEntry({ onSelfServe }) {
  const [email, setEmail]       = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent]         = useState(false);
  const [error, setError]       = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      await base44.functions.invoke('sendResumeLink', { email: email.trim().toLowerCase() });
      setSent(true);
    } catch (err) {
      setError('Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="portal-bg min-h-screen flex flex-col items-center justify-center px-4 py-16">
      {/* Logo */}
      <div className="mb-10 text-center">
        <CliqbuxLogo size="md" />
        <p className="mt-3 text-cb-caption uppercase text-gray-500">Merchant Onboarding Portal</p>
      </div>

      <div className="w-full max-w-md">
        {sent ? (
          /* ── Sent confirmation ── */
          <div className="bg-cb-surface border border-cb-border rounded-cb p-10 text-center">
            <div className="w-12 h-12 bg-cb-success/15 rounded-full flex items-center justify-center mx-auto mb-5">
              <svg className="w-6 h-6 text-cb-success" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </div>
            <p className="text-cb-caption uppercase text-gray-500 mb-2">Link sent</p>
            <h2 className="font-display text-cb-title text-white mb-2">Check your email</h2>
            <p className="text-cb-body text-gray-400 leading-relaxed mb-6">
              We sent a link to <strong className="text-gray-200 font-medium">{email}</strong>. Click it to jump back into your application — no password needed. The link expires in 7 days.
            </p>
            <button
              onClick={() => { setSent(false); setEmail(''); }}
              className="text-cb-body text-gray-500 hover:text-gray-300 transition-colors"
            >
              Use a different email
            </button>
          </div>
        ) : (
          /* ── Email entry form ── */
          <div className="bg-cb-surface border border-cb-border rounded-cb p-10">
            <p className="text-cb-caption uppercase text-gray-500 mb-2">Welcome</p>
            <h2 className="font-display text-cb-title text-white mb-1">Resume your application</h2>
            <p className="text-cb-body text-gray-400 mb-8 leading-relaxed">
              Enter the email address you used when you started. We&apos;ll send you a secure link to pick up where you left off.
            </p>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-cb-caption uppercase text-gray-500 mb-1.5">
                  Email address
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                  disabled={submitting}
                  className="w-full px-4 py-3 rounded-cb bg-cb-bg border border-cb-border text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-cb-accent focus:border-transparent transition-colors text-cb-body disabled:opacity-50"
                />
              </div>

              {error && (
                <p className="text-cb-body text-cb-danger">{error}</p>
              )}

              <button
                type="submit"
                disabled={submitting || !email.trim()}
                className="w-full py-3 px-6 rounded-cb font-semibold text-cb-body transition-colors bg-cb-accent text-cb-bg hover:opacity-90 disabled:bg-cb-bg disabled:text-gray-600 disabled:border disabled:border-cb-border disabled:cursor-not-allowed"
              >
                {submitting ? 'Sending…' : 'Send me my application link →'}
              </button>
            </form>

            <div className="mt-8 pt-6 border-t border-cb-border text-center">
              <p className="text-cb-body text-gray-500 mb-3">Starting fresh?</p>
              <button
                onClick={onSelfServe}
                className="text-cb-body font-medium text-cb-accent hover:opacity-90 transition-colors"
              >
                Apply for a new merchant account →
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
