import { AlertTriangle } from 'lucide-react';
import CliqbuxLogo from './CliqbuxLogo';

export default function ErrorScreen({ title, message }) {
  return (
    <div className="portal-bg min-h-screen flex flex-col items-center justify-center px-4">
      <div className="mb-8">
        <CliqbuxLogo size="lg" />
      </div>
      <div className="portal-card max-w-md w-full p-10 text-center">
        <div className="w-16 h-16 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-6">
          <AlertTriangle className="w-8 h-8 text-red-500" />
        </div>
        <h1 className="text-xl font-bold text-gray-900 mb-3">
          {title || 'Invalid Onboarding Link'}
        </h1>
        <p className="text-gray-500 text-sm leading-relaxed">
          {message || 'Your onboarding link appears to be invalid or has expired. Please contact your Cliqbux representative for assistance.'}
        </p>
        <div className="mt-8 pt-6 border-t border-gray-100">
          <p className="text-xs text-gray-400">Need help? Contact <span className="text-blue-500 font-medium">support@cliqbux.com</span></p>
        </div>
      </div>
    </div>
  );
}