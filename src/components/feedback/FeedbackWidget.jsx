import { useEffect, useRef, useState } from 'react';
import { MessageCircleWarning, X } from 'lucide-react';
import { invokePortalFunction, getMerchantToken } from '@/lib/merchantAuthFetch';
import { base44 } from '@/api/base44Client';

/**
 * Global Help & Feedback control — merchants and agents.
 * Explicit Submit only (no autosave). Files GitHub issues via submitProductFeedback.
 */
export default function FeedbackWidget() {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState('bug');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [expected, setExpected] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [doneUrl, setDoneUrl] = useState('');
  const panelRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target)) {
        if (e.target.closest?.('[data-feedback-widget-toggle]')) return;
        setOpen(false);
      }
    };
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const reset = () => {
    setTitle('');
    setDescription('');
    setExpected('');
    setType('bug');
    setError('');
    setDoneUrl('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    setDoneUrl('');
    try {
      const params = new URLSearchParams(window.location.search);
      const corporateId = params.get('corporateId') || params.get('dealId') || undefined;
      const payload = {
        type,
        title: title.trim(),
        description: description.trim(),
        expected: expected.trim() || undefined,
        corporateId,
        route: window.location.pathname + window.location.search,
        userAgent: navigator.userAgent,
      };

      let res;
      if (getMerchantToken()) {
        res = await invokePortalFunction('submitProductFeedback', payload);
      } else {
        res = await base44.functions.invoke('submitProductFeedback', payload);
      }
      if (res.data?.error) throw new Error(res.data.error);
      if (!res.data?.issueUrl) throw new Error('Feedback submitted but no issue URL returned');
      setDoneUrl(res.data.issueUrl);
      setTitle('');
      setDescription('');
      setExpected('');
    } catch (err) {
      setError(err?.message || 'Could not submit feedback');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed bottom-20 left-4 z-[70] md:bottom-6 md:left-6">
      <button
        type="button"
        data-feedback-widget-toggle
        aria-label="Help and feedback"
        aria-expanded={open}
        onClick={() => {
          setOpen((v) => !v);
          if (open) reset();
        }}
        className="inline-flex items-center gap-2 px-3 py-2 rounded-cb border border-cb-border bg-cb-surface-raised text-cb-caption normal-case tracking-normal text-gray-300 shadow-cb-overlay hover:border-cb-accent/50 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cb-accent"
      >
        {open ? <X className="w-4 h-4" /> : <MessageCircleWarning className="w-4 h-4 text-cb-accent" />}
        <span className="hidden sm:inline">{open ? 'Close' : 'Help & Feedback'}</span>
      </button>

      {open && (
        <div
          ref={panelRef}
          role="dialog"
          aria-label="Submit feedback"
          className="absolute bottom-14 left-0 w-[min(100vw-2rem,22rem)] rounded-cb border border-cb-border bg-cb-surface shadow-cb-overlay p-4"
        >
          <p className="font-display text-cb-title text-white mb-1">Help & Feedback</p>
          <p className="text-cb-caption normal-case tracking-normal text-gray-500 mb-3">
            Report a problem or suggest an improvement. We file it for triage — nothing ships without review.
          </p>

          {doneUrl ? (
            <div className="space-y-3">
              <p className="text-cb-body text-cb-success">Thanks — we got it.</p>
              <p className="text-cb-caption normal-case tracking-normal text-gray-400 break-all">
                Tracked as {doneUrl}
              </p>
              <button
                type="button"
                onClick={() => {
                  reset();
                  setOpen(false);
                }}
                className="w-full py-2 rounded-cb bg-cb-accent text-cb-bg font-medium text-cb-body"
              >
                Done
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-3">
              <div className="flex gap-1 p-0.5 rounded-cb bg-cb-bg border border-cb-border">
                {[
                  { id: 'bug', label: 'Bug' },
                  { id: 'enhancement', label: 'Idea' },
                ].map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setType(opt.id)}
                    className={`flex-1 py-1.5 rounded-cb text-cb-caption normal-case tracking-normal ${
                      type === opt.id
                        ? 'bg-cb-accent-muted text-cb-accent'
                        : 'text-gray-500 hover:text-gray-300'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>

              <label className="block">
                <span className="text-cb-caption normal-case tracking-normal text-gray-500">Short title</span>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  required
                  minLength={3}
                  maxLength={120}
                  className="mt-1 w-full rounded-cb border border-cb-border bg-cb-bg px-3 py-2 text-cb-body text-white focus:outline-none focus:border-cb-accent"
                  placeholder={type === 'bug' ? 'Signing button does nothing' : 'Add SMS reminders'}
                />
              </label>

              <label className="block">
                <span className="text-cb-caption normal-case tracking-normal text-gray-500">
                  {type === 'bug' ? 'What happened' : 'What would you like'}
                </span>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  required
                  minLength={10}
                  maxLength={4000}
                  rows={4}
                  className="mt-1 w-full rounded-cb border border-cb-border bg-cb-bg px-3 py-2 text-cb-body text-white focus:outline-none focus:border-cb-accent resize-y"
                  placeholder="Describe it in plain language…"
                />
              </label>

              <label className="block">
                <span className="text-cb-caption normal-case tracking-normal text-gray-500">
                  What you expected (optional)
                </span>
                <textarea
                  value={expected}
                  onChange={(e) => setExpected(e.target.value)}
                  maxLength={1000}
                  rows={2}
                  className="mt-1 w-full rounded-cb border border-cb-border bg-cb-bg px-3 py-2 text-cb-body text-white focus:outline-none focus:border-cb-accent resize-y"
                />
              </label>

              {error && (
                <p className="text-cb-caption normal-case tracking-normal text-cb-danger" role="alert">
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={busy}
                className="w-full py-2 rounded-cb bg-cb-accent text-cb-bg font-medium text-cb-body disabled:opacity-60"
              >
                {busy ? 'Sending…' : 'Submit'}
              </button>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
