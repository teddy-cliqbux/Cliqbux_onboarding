import CliqbuxLogo from './CliqbuxLogo';
import ProgressTracker from './ProgressTracker';

export default function TopNav({
  applicationStatus: _applicationStatus,
  currentStep,
  completedSteps,
  onNavigate,
  includeEquipment = false,
}) {
  // Always show step progress while the merchant is in the portal — including
  // Incomplete. (Critique 2026-07-15: logo-only chrome mid-flow hurt orientation.)
  // Equipment stays off the tracker until Submitted (dashboard owns that step).
  return (
    <nav className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-6 sm:px-10 h-16 bg-cb-bg/80 border-b border-cb-border backdrop-blur-[20px]">
      <CliqbuxLogo size="sm" />
      <ProgressTracker
        currentStep={currentStep || 'agreement'}
        completedSteps={completedSteps || {}}
        onNavigate={onNavigate}
        includeEquipment={includeEquipment}
      />
    </nav>
  );
}
