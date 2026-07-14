import { createContext, useContext } from 'react';

/** Portal signing-phase form lock — provided by OnboardingPortal / dashboard. */
export const PortalLockContext = createContext({
  formsLocked: false,
  unlocking: false,
  onRequestUnlock: null,
});

export function usePortalLock() {
  return useContext(PortalLockContext);
}
