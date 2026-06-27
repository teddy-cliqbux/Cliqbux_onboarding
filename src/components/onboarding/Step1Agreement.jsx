import { useState, useEffect } from 'react';
import { ExternalLink, RefreshCw, Clock } from 'lucide-react';

export default function Step1Agreement({ profile, onStatusChange }) {
  const [iframeError, setIframeError] = useState(false);
  const [pollingActive, setPollingActive] = useState(true);

  // Poll every 5 seconds to detect Quote Signed status
  useEffect(() => {
    if (!pollingActive) return;

    const interval = setInterval(async () => {
      try {
        const { base44 } = await import('@/api/base44Client');
        const response = await base44.functions.invoke('getMerchantData', {
          corporateId: profile.corporateId
        });
        const data = response.data;
        if (data?.profile?.applicationStatus === 'Quote Signed') {
          setPollingActive(false);
          onStatusChange('Quote Signed');
        }
      } catch (e) {
        // silently continue polling
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [pollingActive, profile.corporateId, onStatusChange]);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-8 pt-8 pb-6 border-b border-white/10">
        <div className="flex items-start justify-between">
          <div>
            <div className="inline-flex items-center gap-2 bg-blue-500/15 text-blue-300 text-xs font-semibold px-3 py-1.5 rounded-full mb-3">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
              STEP 1 OF 3 — MERCHANT AGREEMENT
            </div>
            <h2 className="text-2xl font-bold text-white mb-1.5">Review & Sign Your Agreement</h2>
            <p className="text-gray-400 text-sm">
              Hello, <span className="font-semibold text-white">{profile.legalName}</span>. Please review the merchant agreement below and sign to proceed.
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs text-gray-400 bg-white/5 border border-white/10 px-3 py-2 rounded-lg ml-4">
            <Clock className="w-3.5 h-3.5" />
            <span>Waiting for signature...</span>
          </div>
        </div>
      </div>

      {/* iFrame Area */}
      <div className="flex-1 px-8 py-6">
        {profile.hubspotQuoteUrl ? (
          <div className="relative rounded-xl overflow-hidden border border-white/10 bg-white/5" style={{ minHeight: '800px' }}>
            {iframeError ? (
              <div className="flex flex-col items-center justify-center h-full min-h-96 gap-4 p-8 text-center">
                <div className="w-12 h-12 rounded-full bg-amber-500/15 flex items-center justify-center">
                  <ExternalLink className="w-6 h-6 text-amber-400" />
                </div>
                <div>
                  <p className="font-semibold text-white mb-1">Unable to display agreement inline</p>
                  <p className="text-gray-400 text-sm mb-4">Your browser may be blocking the embedded view. Click below to open your agreement.</p>
                  <a
                    href={profile.hubspotQuoteUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold px-6 py-3 rounded-lg text-sm transition-colors"
                  >
                    <ExternalLink className="w-4 h-4" />
                    Open Agreement in New Tab
                  </a>
                </div>
              </div>
            ) : (
              <>
                <iframe
                  src={profile.hubspotQuoteUrl}
                  className="w-full"
                  style={{ minHeight: '800px', border: 'none' }}
                  title="Merchant Agreement"
                  onError={() => setIframeError(true)}
                  allow="payment"
                />
                {/* Fallback link always available */}
                <div className="absolute bottom-4 right-4">
                  <a
                    href={profile.hubspotQuoteUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs text-gray-400 hover:text-blue-500 transition-colors bg-white/80 backdrop-blur px-3 py-1.5 rounded-full shadow-sm border border-gray-200"
                  >
                    <ExternalLink className="w-3 h-3" />
                    Open in new tab
                  </a>
                </div>
              </>
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center min-h-96 bg-white/5 rounded-xl border-2 border-dashed border-white/10 gap-4">
            <RefreshCw className="w-8 h-8 text-gray-400 animate-spin" />
            <p className="text-gray-400 text-sm">Your agreement is being prepared. Please check back shortly.</p>
          </div>
        )}
      </div>

      {/* Footer note */}
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