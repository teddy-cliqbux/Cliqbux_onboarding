import { useEffect, useState, useRef } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { motion } from 'framer-motion';
import confetti from 'canvas-confetti';
import { X, ExternalLink, Check, CreditCard } from 'lucide-react';
import { Dialog, DialogPortal, DialogOverlay } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

const SPRING = { type: 'spring', stiffness: 150, damping: 20 };

function isLikelyFrameable(url) {
  if (!url) return false;
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host === 'www.cliqbux.com' || host === 'cliqbux.com' || host.endsWith('.cliqbux.com');
  } catch {
    return false;
  }
}

function fireModalConfetti() {
  const gold = '#FEAC27';
  confetti({
    particleCount: 48,
    spread: 56,
    startVelocity: 24,
    gravity: 0.95,
    ticks: 120,
    origin: { y: 0.35 },
    colors: [gold, '#F0AD4E', '#FFFFFF', '#4ADE80'],
    disableForReducedMotion: true,
  });
}

function formatMoney(n) {
  if (n == null || Number.isNaN(Number(n))) return '—';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(n));
}

/**
 * Immersive HubSpot quote modal.
 * mode: 'sign' — e-sign iframe | 'pay' — invoice summary + pay CTA (no sign panel)
 */
export default function QuoteSignModal({
  open,
  onOpenChange,
  quoteUrl,
  invoiceUrl,
  mode = 'sign',
  amount = null,
  title = null,
  paymentStatus = null,
  celebrating = false,
  celebrateLabel = 'You\'re all set',
}) {
  const [iframeLoaded, setIframeLoaded] = useState(false);
  const celebrated = useRef(false);
  const payUrl = invoiceUrl || quoteUrl;
  const frameable = isLikelyFrameable(quoteUrl);
  const isPay = mode === 'pay';
  const processing = String(paymentStatus || '').toUpperCase() === 'PROCESSING';

  useEffect(() => {
    if (!open) {
      setIframeLoaded(false);
      celebrated.current = false;
    }
  }, [open]);

  useEffect(() => {
    if (!celebrating || celebrated.current) return;
    celebrated.current = true;
    fireModalConfetti();
  }, [celebrating]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPortal>
        <DialogOverlay className="bg-black/70 backdrop-blur-sm" />
        <DialogPrimitive.Content
          className={cn(
            'fixed left-1/2 top-1/2 z-50 flex w-[min(96vw,920px)] max-h-[92vh] -translate-x-1/2 -translate-y-1/2',
            'flex-col overflow-hidden rounded-cb border border-cb-accent bg-[#0D0F14] shadow-cb-overlay',
            'duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out',
            'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
            'data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
            'focus:outline-none'
          )}
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <div className="flex items-center justify-between gap-3 border-b border-cb-border px-4 py-3 shrink-0">
            <DialogPrimitive.Title className="font-display text-cb-title text-white">
              {isPay ? 'View Invoice / Pay' : 'Review & Sign Quote'}
            </DialogPrimitive.Title>
            <DialogPrimitive.Close
              type="button"
              className="inline-flex h-8 w-8 items-center justify-center rounded-cb text-gray-400 hover:text-white hover:bg-cb-accent-muted transition-colors"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </DialogPrimitive.Close>
          </div>

          <DialogPrimitive.Description className="sr-only">
            {isPay
              ? 'Pay your HubSpot equipment invoice without leaving Cliqbux.'
              : 'Sign your HubSpot equipment quote without leaving Cliqbux.'}
          </DialogPrimitive.Description>

          {isPay ? (
            <div className="relative mx-4 my-4 flex-1 min-h-0">
              <div className="rounded-cb border border-cb-border bg-cb-bg p-6 space-y-5">
                <div className="flex items-start gap-3">
                  <span className="inline-flex h-10 w-10 items-center justify-center rounded-cb bg-cb-accent-muted border border-cb-border">
                    <CreditCard className="w-5 h-5 text-cb-accent" />
                  </span>
                  <div>
                    <p className="text-cb-caption uppercase text-gray-500 mb-1">Invoice</p>
                    <p className="font-display text-cb-title text-white">{title || 'Equipment & Services'}</p>
                    <p className="text-cb-caption normal-case tracking-normal text-gray-500 mt-1">
                      Quote signed — complete payment to release equipment shipping.
                    </p>
                  </div>
                </div>

                <div className="flex items-center justify-between border-t border-cb-border pt-4">
                  <span className="text-cb-caption uppercase text-gray-500">Amount due</span>
                  <span className="font-display text-cb-display text-white tabular-nums">{formatMoney(amount)}</span>
                </div>

                {processing ? (
                  <div className="rounded-cb border border-cb-border border-l-2 border-l-cb-accent bg-cb-surface-raised px-4 py-3">
                    <p className="text-cb-body font-medium text-white">Processing payment…</p>
                    <p className="text-cb-caption normal-case tracking-normal text-gray-500 mt-1">
                      Your card or ACH payment is processing. This screen will update automatically.
                    </p>
                  </div>
                ) : payUrl ? (
                  <div className="space-y-2">
                    {frameable ? (
                      <iframe
                        key={`pay-${payUrl}`}
                        src={payUrl}
                        title="HubSpot invoice payment"
                        className="w-full h-[50vh] rounded-cb border border-cb-border bg-white"
                        sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"
                      />
                    ) : null}
                    <a
                      href={payUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-full inline-flex items-center justify-center gap-2 rounded-cb bg-cb-accent text-cb-bg font-semibold text-cb-body py-3 hover:opacity-95"
                    >
                      {frameable ? 'Open payment page in new tab' : 'Pay invoice'}
                      <ExternalLink className="w-4 h-4" />
                    </a>
                  </div>
                ) : (
                  <p className="text-cb-caption text-gray-500">Payment link unavailable — contact your Cliqbux rep.</p>
                )}
              </div>

              {celebrating && (
                <CelebrateOverlay label={celebrateLabel} detail="Payment received — closing shortly…" />
              )}
            </div>
          ) : (
            <>
              <div className="px-4 pt-3 pb-2 shrink-0">
                <p className="text-cb-caption normal-case tracking-normal text-gray-500 text-center sm:text-left">
                  Having trouble viewing the signature panel?{' '}
                  {quoteUrl ? (
                    <a
                      href={quoteUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-cb-accent font-medium underline hover:opacity-90 inline-flex items-center gap-1"
                    >
                      Click here to open in a new tab
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  ) : (
                    <span className="text-gray-600">Quote link unavailable</span>
                  )}
                </p>
                {!frameable && quoteUrl && (
                  <p className="mt-1.5 text-cb-caption normal-case tracking-normal text-gray-500">
                    This quote host may block embedding — use the new-tab link if the panel stays blank.
                  </p>
                )}
              </div>

              <div className="relative mx-4 mb-4 flex-1 min-h-0">
                {!iframeLoaded && quoteUrl && frameable && (
                  <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 rounded-cb bg-[#0D0F14]">
                    <div className="skeleton h-3 w-40 !rounded-cb" />
                    <div className="skeleton h-[70%] w-full max-w-xl !rounded-cb" />
                    <p className="text-cb-caption normal-case tracking-normal text-cb-accent">Loading quote…</p>
                  </div>
                )}

                {quoteUrl && frameable ? (
                  <iframe
                    key={quoteUrl}
                    src={quoteUrl}
                    title="HubSpot equipment quote — sign"
                    className="w-full h-[80vh] max-h-[calc(92vh-8rem)] rounded-cb border border-cb-border bg-white"
                    onLoad={() => setIframeLoaded(true)}
                    sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"
                  />
                ) : quoteUrl ? (
                  <div className="flex h-[50vh] flex-col items-center justify-center gap-4 rounded-cb border border-cb-border bg-cb-bg px-6 text-center">
                    <p className="text-cb-body text-gray-300 max-w-md">
                      This quote can&apos;t be embedded securely in the portal. Open it in a new tab to sign.
                    </p>
                    <a
                      href={quoteUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 rounded-cb bg-cb-accent px-5 py-2.5 font-semibold text-cb-bg text-cb-body hover:opacity-95"
                    >
                      Open quote
                      <ExternalLink className="w-4 h-4" />
                    </a>
                  </div>
                ) : (
                  <div className="flex h-[40vh] items-center justify-center rounded-cb border border-cb-border bg-cb-bg">
                    <p className="text-cb-caption text-gray-500">No quote URL available</p>
                  </div>
                )}

                {celebrating && (
                  <CelebrateOverlay label={celebrateLabel} detail="Quote signed — closing shortly…" />
                )}
              </div>
            </>
          )}
        </DialogPrimitive.Content>
      </DialogPortal>
    </Dialog>
  );
}

function CelebrateOverlay({ label, detail }) {
  return (
    <motion.div
      className="absolute inset-0 z-20 flex flex-col items-center justify-center rounded-cb bg-[#0D0F14]/95"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.2 }}
    >
      <motion.span
        className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-cb-success/15 mb-4"
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={SPRING}
      >
        <Check className="h-8 w-8 text-cb-success" strokeWidth={2.5} />
      </motion.span>
      <p className="font-display text-cb-title text-white">{label}</p>
      <p className="text-cb-caption normal-case tracking-normal text-gray-400 mt-1">{detail}</p>
    </motion.div>
  );
}
