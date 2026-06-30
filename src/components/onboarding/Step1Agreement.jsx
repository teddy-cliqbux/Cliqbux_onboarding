import { useState, useEffect } from 'react';
import { ExternalLink, Clock, RefreshCw } from 'lucide-react';

export default function Step1Agreement({ profile, onStatusChange }) {
  const [pollingActive, setPollingActive] = useState(true);

  useEffect(() => {
    if (!pollingActive || !profile?.corporateId) return;

    const interval = setInterval(async () => {
      try {
        const { base44 } = await import('@/api/base44Client');
        const response = await base44.functions.invoke('getMerchantData', {
          corporateId: profile.corporateId,
        });
        if (response.data?.profile?.applicationStatus === 'Quote Signed') {
          setPollingActive(false);
          onStatusChange('Quote Signed');
        }
      } catch {
        // silently continue polling
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [pollingActive, profile?.corporateId, onStatusChange]);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-8 pt-8 pb-6 border-b border-white/10">
        <div className="flex items-start justify-between">
          <div>
            <div className="inline-flex items-center gap-2 bg-blue-500/15 text-blue-300 text-xs font-semibold px-3 py-1.5 rounded-full mb-3">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
              STEP 1 OF 4 — MERCHANT AGREEMENT
            </div>
            <h2 className="text-2xl font-bold text-white mb-1.5">Review & Sign Your Agreement</h2>
            <p className="text-gray-400 text-sm">
              Hello, <span className="font-semibold text-white">{profile?.legalName}</span>. Please review the merchant agreement and sign to proceed.
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs text-gray-400 bg-white/5 border border-white/10 px-3 py-2 rounded-lg ml-4 flex-shrink-0">
            <Clock className="w-3.5 h-3.5" />
            <span>Waiting for signature...</span>
          </div>
        </div>
      </div>

      {/* Main area */}
      <div className="flex-1 px-8 py-10 flex items-center justify-center">
        {profile?.hubspotQuoteUrl ? (
          <div className="w-full max-w-lg text-center flex flex-col items-center gap-6">
            <div className="w-16 h-16 rounded-full bg-blue-500/15 flex items-center justify-center">
              <ExternalLink className="w-7 h-7 text-blue-400" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-white mb-2">Your agreement is ready to review</h3>
              <p className="text-gray-400 text-sm leading-relaxed">
                Click the button below to open your merchant agreement in a new tab. Read through the terms and sign electronically to continue your onboarding.
              </p>
            </div>
            <a
              href={profile.hubspotQuoteUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-semibold px-8 py-3.5 rounded-lg text-sm transition-colors"
            >
              <ExternalLink className="w-4 h-4" />
              Open Agreement
            </a>
            <p className="text-gray-500 text-xs">
              Once you sign, this page will automatically advance — no need to refresh.
            </p>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center gap-4 text-center">
            <RefreshCw className="w-8 h-8 text-gray-400 animate-spin" />
            <p className="text-gray-400 text-sm">Your agreement is being prepared. Please check back shortly.</p>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-8 pb-8">
        <div className="flex items-center gap-3 bg-amber-500/10 border border-amber-500/20 rounded-lg px-4 py-3">
          <div className="w-2 h-2 rounded-full bg-amber-400 animate-pulse flex-shrink-0" />
          <p className="text-amber-300 text-xs">
            <span className="font-semibold">Auto-detection active:</span> Once you sign the agreement, this page will automatically advance. No need to refresh.
          </p>
        </div>
      </div>
    </div>
  );
}
