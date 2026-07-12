import CliqbuxLogo from './CliqbuxLogo';

export default function LoadingScreen({ message = 'Loading your onboarding portal...' }) {
  return (
    <div className="portal-bg min-h-screen flex flex-col items-center justify-center gap-8 px-4">
      <div className="animate-logo-breathe">
        <CliqbuxLogo size="lg" />
      </div>
      <div className="flex flex-col items-center gap-5">
        <div className="relative w-12 h-12">
          <div className="absolute inset-0 border-4 border-white/10 rounded-full" />
          <div className="absolute inset-0 border-4 border-transparent border-t-amber-400 rounded-full animate-spin-slow" />
        </div>
        <p className="text-gray-400 text-sm font-medium text-center max-w-xs">{message}</p>
      </div>
    </div>
  );
}