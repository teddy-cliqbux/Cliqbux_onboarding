import { ExternalLink } from 'lucide-react';
import { SigningIframeOverlay } from '@/components/onboarding/SigningLoadWait';
import { SIGNING_IFRAME_HEIGHT_STYLE } from '@/lib/signingFrameLayout';

/**
 * BoldSign / MSP signing document frame.
 * Mobile: always expose Open signing form (new tab) — nested iframes often trap
 * touch scroll on phones (Trisha Mobile Test 2026-07-24).
 */
export default function SigningDocumentFrame({
  iframeUrl,
  iframeKey,
  title,
  subtitle,
  iframeReady,
  onIframeLoad,
  agentPreview = false,
  footer = null,
  tone = 'portal',
}) {
  if (!iframeUrl) return null;

  const isLight = tone === 'light';

  return (
    <div
      className={
        isLight
          ? 'rounded-xl border border-gray-200 overflow-visible'
          : 'border border-cb-border rounded-cb overflow-visible'
      }
      data-signing-frame="1"
    >
      {agentPreview && !isLight && (
        <div className="bg-cb-accent-muted border-b border-cb-border px-5 py-2.5">
          <p className="text-cb-caption normal-case tracking-normal text-cb-accent">
            Agent preview of the merchant&apos;s BoldSign link — same URL the merchant sees. Confirm it loads; avoid finishing the signature for them.
          </p>
        </div>
      )}
      <div
        className={
          isLight
            ? 'bg-gray-50 border-b border-gray-200 px-4 py-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between'
            : 'bg-cb-surface-raised border-b border-cb-border px-5 py-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between'
        }
      >
        <div className="flex items-center gap-2 min-w-0">
          {!isLight && <div className="w-1.5 h-1.5 rounded-full bg-cb-accent flex-shrink-0" />}
          <span className={isLight ? 'text-sm font-medium text-gray-800 truncate' : 'text-cb-body font-medium text-gray-200 truncate'}>
            {title}
            {subtitle ? (
              <span className={isLight ? 'text-gray-500 font-normal' : 'text-gray-500 font-normal'}>
                {' '}— {subtitle}
              </span>
            ) : null}
          </span>
        </div>
        <a
          id="open-signing"
          href={iframeUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={
            isLight
              ? 'inline-flex items-center justify-center gap-1.5 min-h-11 px-3 py-2 rounded-lg bg-amber-500 text-white text-sm font-semibold hover:bg-amber-600 self-start sm:self-auto'
              : 'inline-flex items-center justify-center gap-1.5 min-h-11 px-3 py-2 rounded-cb bg-cb-accent text-cb-bg text-cb-body font-semibold hover:opacity-90 self-start sm:self-auto'
          }
        >
          <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
          Open signing form
        </a>
      </div>
      <div className="relative" style={{ minHeight: SIGNING_IFRAME_HEIGHT_STYLE.minHeight }}>
        <SigningIframeOverlay tone={tone} visible={!!iframeUrl && !iframeReady} />
        <iframe
          key={iframeKey}
          src={iframeUrl}
          title={title || 'Merchant Processing Agreement'}
          className="w-full"
          style={SIGNING_IFRAME_HEIGHT_STYLE}
          allow="same-origin"
          onLoad={onIframeLoad}
        />
      </div>
      {footer}
    </div>
  );
}
