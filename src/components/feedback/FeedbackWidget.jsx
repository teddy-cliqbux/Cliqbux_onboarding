import { useEffect, useRef, useState } from 'react';
import { Camera, MessageCircleWarning, X } from 'lucide-react';
import { invokePortalFunction, getMerchantToken } from '@/lib/merchantAuthFetch';
import { base44 } from '@/api/base44Client';
import { captureFeedbackScreenshot } from '@/lib/feedbackScreenshot';

/**
 * Global Help & Feedback control — merchants and agents.
 * Explicit Submit only (no autosave). Optional screenshot with SSN-only masking.
 * Files GitHub issues via submitProductFeedback — never show the tracker URL to users.
 */
export default function FeedbackWidget() {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState('bug');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [expected, setExpected] = useState('');
  const [busy, setBusy] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [error, setError] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [screenshotPreview, setScreenshotPreview] = useState('');
  const [screenshotBlob, setScreenshotBlob] = useState(null);
  const [screenshotNote, setScreenshotNote] = useState('');
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

  const clearScreenshot = () => {
    setScreenshotPreview('');
    setScreenshotBlob(null);
    setScreenshotNote('');
  };

  const reset = () => {
    setTitle('');
    setDescription('');
    setExpected('');
    setType('bug');
    setError('');
    setSubmitted(false);
    clearScreenshot();
  };

  const handleCapture = async () => {
    setError('');
    setCapturing(true);
    try {
      const { blob, dataUrl } = await captureFeedbackScreenshot();
      setScreenshotBlob(blob);
      setScreenshotPreview(dataUrl);
      setScreenshotNote('');
    } catch (err) {
      setError(err?.message || 'Could not capture screenshot');
      clearScreenshot();
    } finally {
      setCapturing(false);
    }
  };

  const uploadScreenshot = async (blob) => {
    const file = new File([blob], `feedback-${Date.now()}.jpg`, { type: 'image/jpeg' });
    const uploadResult = await base44.integrations.Core.UploadFile({ file });
    const url = uploadResult?.file_url;
    if (!url || !String(url).startsWith('https://')) {
      throw new Error('Upload did not return an https file URL');
    }
    return String(url);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setScreenshotNote('');
    setBusy(true);
    try {
      const params = new URLSearchParams(window.location.search);
      const corporateId = params.get('corporateId') || params.get('dealId') || undefined;

      let screenshotUrl;
      let screenshotBase64;
      if (screenshotBlob) {
        try {
          screenshotUrl = await uploadScreenshot(screenshotBlob);
        } catch (uploadErr) {
          try {
            const buf = await screenshotBlob.arrayBuffer();
            if (buf.byteLength <= 1.5 * 1024 * 1024) {
              const bytes = new Uint8Array(buf);
              let binary = '';
              for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
              screenshotBase64 = `data:image/jpeg;base64,${btoa(binary)}`;
            } else {
              setScreenshotNote(
                uploadErr?.message
                  ? `Screenshot could not be attached (${uploadErr.message}).`
                  : 'Screenshot could not be attached.'
              );
            }
          } catch {
            setScreenshotNote('Screenshot could not be attached.');
          }
        }
      }

      const payload = {
        type,
        title: title.trim(),
        description: description.trim(),
        expected: expected.trim() || undefined,
        corporateId,
        route: window.location.pathname + window.location.search,
        userAgent: navigator.userAgent,
        screenshotUrl,
        screenshotBase64,
      };

      let res;
      if (getMerchantToken()) {
        res = await invokePortalFunction('submitProductFeedback', payload);
      } else {
        res = await base44.functions.invoke('submitProductFeedback', payload);
      }
      if (res.data?.error) {
        const hint = res.data?.hint ? ` ${res.data.hint}` : '';
        throw new Error(`${res.data.error}${hint}`);
      }
      if (!res.data?.success && !res.data?.issueUrl && !res.data?.queued) {
        throw new Error(res.data?.message || 'Feedback submitted but no confirmation returned');
      }
      const hadScreenshot = Boolean(screenshotBlob);
      setSubmitted(true);
      setTitle('');
      setDescription('');
      setExpected('');
      clearScreenshot();
      if (hadScreenshot && !res.data?.screenshotAttached) {
        setScreenshotNote('Your note was sent; the screenshot could not be attached.');
      } else {
        setScreenshotNote('');
      }
    } catch (err) {
      setError(err?.message || 'Could not submit feedback');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed bottom-20 left-4 z-[70] md:bottom-6 md:left-6" data-feedback-widget>
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
          className="absolute bottom-14 left-0 w-[min(100vw-2rem,22rem)] max-h-[min(80vh,36rem)] rounded-cb border border-cb-border bg-cb-surface shadow-cb-overlay flex flex-col overflow-hidden"
        >
          <div className="px-4 pt-4 pb-2 flex-shrink-0">
            <p className="font-display text-cb-title text-white mb-1">Help & Feedback</p>
            <p className="text-cb-caption normal-case tracking-normal text-gray-500">
              Report a problem or suggest an improvement. We review every note — nothing ships without a human check.
            </p>
          </div>

          {submitted ? (
            <div className="px-4 pb-4 pt-2 space-y-3 flex-shrink-0">
              <p className="text-cb-body text-cb-success">
                {type === 'enhancement'
                  ? 'Thanks — we appreciate the idea.'
                  : 'Thanks — we got your report.'}
              </p>
              <p className="text-cb-caption normal-case tracking-normal text-gray-400">
                Our team will take a look. You can close this and keep working.
              </p>
              {screenshotNote && (
                <p className="text-cb-caption normal-case tracking-normal text-gray-500">{screenshotNote}</p>
              )}
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
            <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
              <div className="flex-1 min-h-0 overflow-y-auto px-4 space-y-3 pb-3">
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

                <div className="space-y-2">
                  <button
                    type="button"
                    onClick={handleCapture}
                    disabled={capturing || busy}
                    className="w-full inline-flex items-center justify-center gap-2 py-2 rounded-cb border border-cb-border bg-cb-bg text-cb-caption normal-case tracking-normal text-gray-300 hover:border-cb-accent/50 hover:text-white disabled:opacity-60"
                  >
                    <Camera className="w-4 h-4 text-cb-accent" />
                    {capturing ? 'Capturing…' : screenshotPreview ? 'Retake screenshot' : 'Capture screenshot'}
                  </button>
                  {screenshotPreview ? (
                    <div className="rounded-cb border border-cb-border bg-cb-bg p-2 space-y-2">
                      <img
                        src={screenshotPreview}
                        alt="Feedback screenshot preview"
                        className="w-full rounded-cb border border-cb-border max-h-36 object-cover object-top"
                      />
                      <p className="text-cb-caption normal-case tracking-normal text-gray-500">
                        SSN fields are hidden in this screenshot. Remove the image if anything sensitive still shows.
                      </p>
                      <button
                        type="button"
                        onClick={clearScreenshot}
                        className="text-cb-caption normal-case tracking-normal text-gray-400 hover:text-white"
                      >
                        Remove screenshot
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="flex-shrink-0 border-t border-cb-border px-4 py-3 space-y-2 bg-cb-surface">
                {error && (
                  <p className="text-cb-caption normal-case tracking-normal text-cb-danger" role="alert">
                    {error}
                  </p>
                )}
                {screenshotNote && !error && (
                  <p className="text-cb-caption normal-case tracking-normal text-gray-500">{screenshotNote}</p>
                )}
                <button
                  type="submit"
                  disabled={busy || capturing}
                  className="w-full py-2 rounded-cb bg-cb-accent text-cb-bg font-medium text-cb-body disabled:opacity-60"
                >
                  {busy ? 'Sending…' : 'Submit'}
                </button>
              </div>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
