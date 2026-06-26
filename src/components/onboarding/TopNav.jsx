import CliqbuxLogo from './CliqbuxLogo';
import ProgressTracker from './ProgressTracker';

export default function TopNav({ applicationStatus, verificationDone }) {
  return (
    <nav className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-6 sm:px-10 h-16"
      style={{
        background: '#0F1929',
        borderBottom: '1px solid rgba(255,255,255,0.07)',
        backdropFilter: 'blur(12px)'
      }}
    >
      <CliqbuxLogo size="md" />
      {applicationStatus && (
        <ProgressTracker applicationStatus={applicationStatus} verificationDone={verificationDone} />
      )}
    </nav>
  );
}