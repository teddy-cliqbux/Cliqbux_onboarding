import CliqbuxLogo from './CliqbuxLogo';
import ProgressTracker from './ProgressTracker';

export default function TopNav({ applicationStatus, currentStep, completedSteps, onNavigate }) {
  const showTracker = applicationStatus === 'Pricing Selected' || applicationStatus === 'Quote Signed' || applicationStatus === 'Submitted';
  return (
    <nav className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-6 sm:px-10 h-16"
      style={{
        background: 'rgba(14,19,25,0.82)',
        borderBottom: '1px solid rgba(255,255,255,0.07)',
        backdropFilter: 'blur(20px) saturate(1.4)',
        WebkitBackdropFilter: 'blur(20px) saturate(1.4)'
      }}
    >
      <CliqbuxLogo size="sm" />
      {showTracker && (
        <ProgressTracker
          currentStep={currentStep || 'agreement'}
          completedSteps={completedSteps || {}}
          onNavigate={onNavigate}
        />
      )}
    </nav>
  );
}