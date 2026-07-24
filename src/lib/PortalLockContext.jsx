import { createContext, useContext } from 'react';

/** Portal signing-phase form lock — provided by OnboardingPortal / dashboard. */
export const PortalLockContext = createContext({
  formsLocked: false,
  unlocking: false,
  onRequestUnlock: null,
  canUnlock: false,
  /** Sync local lock when a write returns FORMS_LOCKED but profile state was stale. */
  setPortalLockStatus: null,
});

export function usePortalLock() {
  return useContext(PortalLockContext);
}
