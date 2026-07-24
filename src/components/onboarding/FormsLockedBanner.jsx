import { useState } from 'react';
import { Lock } from 'lucide-react';
import { FORMS_LOCKED_MESSAGE, FORMS_LOCKED_MESSAGE_AGENT, DEMOTE_CONFIRM_MESSAGE, portalLockLabel } from '@/lib/portalLock';

/**
 * Unlock control with in-place confirm (no window.confirm / alert) — critique 2026-07-15.
 * Parent onUnlock should perform demoteApplication and throw on failure.
 * Use next to locked fields (legal address) and inside FormsLockedBanner.
 */
export function UnlockModifyControls({
  onUnlock,
  unlocking = false,
  confirmMessage = DEMOTE_CONFIRM_MESSAGE,
  buttonClassName = 'flex-shrink-0 min-h-11 px-4 py-2 rounded-cb bg-cb-accent text-cb-bg text-cb-body font-semibold hover:opacity-90 disabled:opacity-50 transition-opacity',
  buttonLabel = 'Unlock & Modify Details',
}) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState(null);

  if (!onUnlock) return null;

  const handleConfirmUnlock = async () => {
    if (unlocking) return;
    setError(null);
    try {
      await onUnlock();
      setConfirming(false);
    } catch (err) {
      setError(err?.message || 'Could not unlock the application. Please try again or contact support.');
    }
  };

  return (
    <div className="flex flex-col gap-3 w-full sm:w-auto sm:min-w-[14rem]">
      {!confirming && (
        <button
          type="button"
          onClick={() => { setError(null); setConfirming(true); }}
          disabled={unlocking}
          className={buttonClassName}
        >
          {unlocking ? 'Unlocking…' : buttonLabel}
        </button>
      )}
      {confirming && (
        <div className="rounded-cb border border-cb-border border-l-cb-accent bg-cb-surface-raised px-4 py-3 space-y-3 w-full">
          <p className="text-cb-body text-gray-300">{confirmMessage}</p>
          {error && (
            <p className="text-cb-body text-cb-danger" role="alert">{error}</p>
          )}
          <div className="flex flex-col-reverse sm:flex-row gap-2 sm:justify-end">
            <button
              type="button"
              onClick={() => { setConfirming(false); setError(null); }}
              disabled={unlocking}
              className="min-h-11 px-4 py-2 rounded-cb border border-cb-border text-cb-body text-gray-300 hover:text-white hover:border-cb-border-strong transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleConfirmUnlock}
              disabled={unlocking}
              className="min-h-11 px-4 py-2 rounded-cb bg-cb-accent text-cb-bg text-cb-body font-semibold hover:opacity-90 disabled:opacity-50 transition-opacity"
            >
              {unlocking ? 'Unlocking…' : 'Yes, unlock'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Quiet lock banner shown above locked portal steps.
 */
export default function FormsLockedBanner({
  profile,
  onUnlock,
  unlocking = false,
  canUnlock = true,
  confirmMessage = DEMOTE_CONFIRM_MESSAGE,
}) {
  const label = portalLockLabel(profile);
  const message = canUnlock ? FORMS_LOCKED_MESSAGE_AGENT : FORMS_LOCKED_MESSAGE;

  return (
    <div className="rounded-cb border border-cb-border bg-cb-bg px-4 py-3 flex flex-col gap-3 shadow-cb-overlay">
      <div className="flex flex-col sm:flex-row sm:items-start gap-3 sm:justify-between">
        <div className="flex items-start gap-3 min-w-0">
          <span className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-cb-accent-muted text-cb-accent">
            <Lock className="w-3.5 h-3.5" />
          </span>
          <div className="min-w-0">
            <p className="text-cb-body font-medium text-white">Forms locked ({label})</p>
            <p className="text-cb-caption normal-case tracking-normal text-gray-500 mt-0.5">
              {message}
            </p>
          </div>
        </div>
        {canUnlock && onUnlock && (
          <UnlockModifyControls
            onUnlock={onUnlock}
            unlocking={unlocking}
            confirmMessage={confirmMessage}
          />
        )}
      </div>
    </div>
  );
}
