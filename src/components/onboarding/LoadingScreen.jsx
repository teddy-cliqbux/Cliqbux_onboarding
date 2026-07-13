import CliqbuxLogo from './CliqbuxLogo';

export default function LoadingScreen({ message = 'Loading your onboarding portal...' }) {
  return (
    <div className="portal-bg min-h-screen flex flex-col items-center justify-center gap-8 px-4" aria-busy="true" aria-label={message}>
      <div className="animate-logo-breathe">
        <CliqbuxLogo size="lg" />
      </div>
      <div className="w-full max-w-sm space-y-3">
        <div className="skeleton h-3 w-2/3 !rounded-cb mx-auto" />
        <div className="skeleton h-3 w-1/2 !rounded-cb mx-auto" />
        <div className="skeleton h-24 w-full !rounded-cb mt-4" />
        <div className="skeleton h-16 w-full !rounded-cb" />
        <p className="text-cb-caption normal-case tracking-normal font-normal text-gray-500 text-center pt-2">{message}</p>
      </div>
    </div>
  );
}
