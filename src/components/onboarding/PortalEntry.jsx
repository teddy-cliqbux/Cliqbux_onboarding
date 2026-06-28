import { useState } from 'react';
import { base44 } from '@/api/base44Client';

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
        <span style={{ color: '#F59E0B', fontSize: 28, fontWeight: 800, letterSpacing: '-0.5px' }}>⬡ cliqbux</span>
        <p className="mt-2 text-gray-400 text-sm">Merchant Onboarding Portal</p>
      </div>

      <div className="w-full max-w-md">
        {sent ? (
          /* ── Sent confirmation ── */
          <div className="portal-card p-10 text-center">
            <div className="w-14 h-14 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-5">
              <svg className="w-7 h-7 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </div>
            <h2 className="text-xl font-bold text-white mb-2">Check your email</h2>
            <p className="text-gray-400 text-sm leading-relaxed mb-6">
              We sent a link to <strong className="text-gray-200">{email}</strong>. Click it to jump back into your application — no password needed. The link expires in 7 days.
            </p>
            <button
              onClick={() => { setSent(false); setEmail(''); }}
              className="text-sm text-gray-500 hover:text-gray-300 transition-colors"
            >
              Use a different email
            </button>
          </div>
        ) : (
          /* ── Email entry form ── */
          <div className="portal-card p-10">
            <h2 className="text-xl font-bold text-white mb-1">Resume your application</h2>
            <p className="text-gray-400 text-sm mb-8 leading-relaxed">
              Enter the email address you used when you started. We'll send you a secure link to pick up where you left off.
            </p>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
                  Email address
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                  disabled={submitting}
                  className="w-full px-4 py-3 rounded-xl bg-gray-800 border border-gray-700 text-white placeholder-gray-500 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition-colors text-sm disabled:opacity-50"
                />
              </div>

              {error && (
                <p className="text-red-400 text-sm">{error}</p>
              )}

              <button
                type="submit"
                disabled={submitting || !email.trim()}
                className="w-full py-3 px-6 rounded-xl font-bold text-sm transition-all"
                style={{
                  background: submitting || !email.trim() ? '#374151' : '#F59E0B',
                  color: submitting || !email.trim() ? '#6B7280' : '#111827',
                  cursor: submitting || !email.trim() ? 'not-allowed' : 'pointer',
                }}
              >
                {submitting ? 'Sending…' : 'Send me my application link →'}
              </button>
            </form>

            <div className="mt-8 pt-6 border-t border-gray-700 text-center">
              <p className="text-sm text-gray-500 mb-3">Starting fresh?</p>
              <button
                onClick={onSelfServe}
                className="text-sm font-semibold text-amber-400 hover:text-amber-300 transition-colors"
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
