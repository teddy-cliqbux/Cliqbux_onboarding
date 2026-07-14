import { Lock } from 'lucide-react';
import { FORMS_LOCKED_MESSAGE, portalLockLabel } from '@/lib/portalLock';

/**
 * Quiet lock banner shown above locked portal steps.
 * Primary CTA is Unlock & Modify Details (parent supplies onUnlock).
 */
export default function FormsLockedBanner({ profile, onUnlock, unlocking = false, canUnlock = true }) {
  const label = portalLockLabel(profile);
  return (
    <div className="rounded-cb border border-cb-border bg-cb-bg px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-3 sm:justify-between">
      <div className="flex items-start gap-3 min-w-0">
        <span className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-cb-accent-muted text-cb-accent">
          <Lock className="w-3.5 h-3.5" />
        </span>
        <div className="min-w-0">
          <p className="text-cb-body font-medium text-white">Forms locked ({label})</p>
          <p className="text-cb-caption normal-case tracking-normal text-gray-500 mt-0.5">
            {FORMS_LOCKED_MESSAGE}
          </p>
        </div>
      </div>
      {canUnlock && onUnlock && (
        <button
          type="button"
          onClick={onUnlock}
          disabled={unlocking}
          className="flex-shrink-0 px-4 py-2 rounded-cb bg-cb-accent text-cb-bg text-cb-body font-semibold hover:brightness-110 disabled:opacity-50 transition-all"
        >
          {unlocking ? 'Unlocking…' : 'Unlock & Modify Details'}
        </button>
      )}
    </div>
  );
}
