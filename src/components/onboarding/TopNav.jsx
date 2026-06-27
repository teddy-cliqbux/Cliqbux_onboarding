import CliqbuxLogo from './CliqbuxLogo';
import ProgressTracker from './ProgressTracker';

export default function TopNav({ applicationStatus }) {
  return (
    <nav className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-6 sm:px-10 h-16"
      style={{
        background: 'rgba(17,19,24,0.95)',
        borderBottom: '1px solid rgba(255,255,255,0.08)',
        backdropFilter: 'blur(16px)'
      }}
    >
      <CliqbuxLogo size="sm" />
      {applicationStatus && (
        <ProgressTracker applicationStatus={applicationStatus} />
      )}
    </nav>
  );
}