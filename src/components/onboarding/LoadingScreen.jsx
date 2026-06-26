import CliqbuxLogo from './CliqbuxLogo';

export default function LoadingScreen({ message = 'Loading your onboarding portal...' }) {
  return (
    <div className="portal-bg min-h-screen flex flex-col items-center justify-center gap-8">
      <CliqbuxLogo size="lg" />
      <div className="flex flex-col items-center gap-4">
        <div className="w-10 h-10 border-4 border-gray-700 border-t-blue-500 rounded-full animate-spin" />
        <p className="text-gray-400 text-sm font-medium">{message}</p>
      </div>
    </div>
  );
}