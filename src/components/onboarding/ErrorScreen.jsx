import { AlertTriangle, RefreshCw } from 'lucide-react';
import CliqbuxLogo from './CliqbuxLogo';

export default function ErrorScreen({ title, message, onRetry }) {
  return (
    <div className="portal-bg min-h-screen flex flex-col items-center justify-center px-4">
      <div className="mb-8">
        <CliqbuxLogo size="lg" />
      </div>
      <div className="w-full max-w-md mx-auto bg-white/5 backdrop-blur-md rounded-2xl border border-white/10 shadow-lg p-10 text-center">
        <div className="w-16 h-16 rounded-full bg-red-500/15 flex items-center justify-center mx-auto mb-6">
          <AlertTriangle className="w-8 h-8 text-red-400" />
        </div>
        <h1 className="text-xl font-bold text-white mb-3">
          {title || 'Invalid Onboarding Link'}
        </h1>
        <p className="text-gray-400 text-sm leading-relaxed">
          {message || 'Your onboarding link appears to be invalid or has expired. Please contact your Cliqbux representative for assistance.'}
        </p>
        {onRetry && (
          <button
            onClick={onRetry}
            className="mt-6 inline-flex items-center gap-2 bg-amber-600 hover:bg-amber-500 text-white font-semibold px-5 py-2.5 rounded-xl text-sm transition-all"
          >
            <RefreshCw className="w-4 h-4" />
            Try Again
          </button>
        )}
        <div className="mt-8 pt-6 border-t border-white/10">
          <p className="text-xs text-gray-500">Need help? Contact <span className="text-amber-400 font-medium">support@cliqbux.com</span></p>
        </div>
      </div>
    </div>
  );
}