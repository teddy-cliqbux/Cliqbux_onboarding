/**
 * Explicit wait state while MSPWare packages / BoldSign URLs are loading.
 * Indeterminate only — no fake percentage.
 */
export function SigningLoadWait({
  title = 'Preparing your signing documents',
  body = 'This can take up to a minute. Please stay on this page — the agreement will appear when it is ready.',
  tone = 'portal',
  children,
}) {
  const isLight = tone === 'light';
  return (
    <div
      className={
        isLight
          ? 'rounded-xl border border-amber-100 bg-amber-50 px-5 py-8 flex flex-col items-center text-center gap-4'
          : 'border border-cb-border rounded-cb bg-cb-surface-raised px-5 py-10 flex flex-col items-center text-center gap-4'
      }
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div
        className={
          isLight
            ? 'w-14 h-14 rounded-full border-2 border-amber-200 border-t-amber-500 animate-spin'
            : 'w-14 h-14 rounded-full border-2 border-cb-border border-t-cb-accent animate-spin'
        }
        aria-hidden="true"
      />
      <div className="max-w-md space-y-2">
        <p className={isLight ? 'text-base font-semibold text-gray-900' : 'text-cb-body font-semibold text-white'}>
          {title}
        </p>
        <p className={isLight ? 'text-sm text-gray-600' : 'text-cb-body text-gray-400'}>
          {body}
        </p>
      </div>
      <div
        className={
          isLight
            ? 'w-full max-w-xs h-1 rounded-full bg-amber-100 overflow-hidden'
            : 'w-full max-w-xs h-1 rounded-full bg-cb-bg overflow-hidden'
        }
        aria-hidden="true"
      >
        <div
          className={
            isLight
              ? 'h-full w-1/3 rounded-full bg-amber-500 signing-wait-bar'
              : 'h-full w-1/3 rounded-full bg-cb-accent signing-wait-bar'
          }
        />
      </div>
      {children}
    </div>
  );
}

/** Overlay while the BoldSign iframe document is still painting. */
export function SigningIframeOverlay({
  visible,
  message = 'Loading your signing form… Please wait.',
  tone = 'portal',
}) {
  if (!visible) return null;
  const isLight = tone === 'light';
  return (
    <div
      className={
        isLight
          ? 'absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-white/95 px-5'
          : 'absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-cb-bg/95 px-5'
      }
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div
        className={
          isLight
            ? 'w-12 h-12 rounded-full border-2 border-amber-200 border-t-amber-500 animate-spin'
            : 'w-12 h-12 rounded-full border-2 border-cb-border border-t-cb-accent animate-spin'
        }
        aria-hidden="true"
      />
      <p className={isLight ? 'text-sm text-gray-700 text-center max-w-sm' : 'text-cb-body text-gray-300 text-center max-w-sm'}>
        {message}
      </p>
      <div
        className={
          isLight
            ? 'w-48 h-1 rounded-full bg-amber-100 overflow-hidden'
            : 'w-48 h-1 rounded-full bg-cb-surface-raised overflow-hidden'
        }
        aria-hidden="true"
      >
        <div
          className={
            isLight
              ? 'h-full w-1/3 rounded-full bg-amber-500 signing-wait-bar'
              : 'h-full w-1/3 rounded-full bg-cb-accent signing-wait-bar'
          }
        />
      </div>
    </div>
  );
}
