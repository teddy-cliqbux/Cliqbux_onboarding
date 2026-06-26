import { useState, useEffect, useRef } from 'react';
import { ArrowLeft, Lock, FileText, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import SignerRoster from '@/components/onboarding/SignerRoster';

export default function OnboardingVerification({ profile, locations, onBack, onComplete }) {
  const [signers, setSigners] = useState([]);
  const [allVerified, setAllVerified] = useState(false);
  const [totalOwnership, setTotalOwnership] = useState(0);

  // E-sign state
  const [envelopeUrl, setEnvelopeUrl] = useState(null);
  const [loadingEnvelope, setLoadingEnvelope] = useState(false);
  const [envelopeError, setEnvelopeError] = useState('');
  const [signing, setSigning] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const iframeRef = useRef(null);

  // When all required signers are cleared (verified or invite sent) → unlock submission
  useEffect(() => {
    if (allVerified && !envelopeUrl && !loadingEnvelope) {
      fetchEnvelope();
    }
  }, [allVerified]);

  const fetchEnvelope = async () => {
    setLoadingEnvelope(true);
    setEnvelopeError('');
    try {
      const res = await base44.functions.invoke('submitToElavon', {
        corporateId: profile.corporateId,
        mode: 'generate_envelope'
      });
      const url = res.data?.envelopeUrl || res.data?.signingUrl;
      if (!url) throw new Error('No signing URL returned. Please contact support.');
      setEnvelopeUrl(url);
    } catch (err) {
      setEnvelopeError(err.message || 'Failed to generate signing document.');
    } finally {
      setLoadingEnvelope(false);
    }
  };

  // Poll for completion via postMessage from iframe (DocuSign/HelloSign emit events)
  useEffect(() => {
    const handleMessage = async (event) => {
      const data = event.data;
      // Handle both DocuSign and generic signing_complete events
      const isComplete =
        data?.event === 'signing_complete' ||
        data?.type === 'signing_complete' ||
        data?.status === 'completed' ||
        data?.action === 'signing_complete';
      if (isComplete) {
        await handleSigningComplete();
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const handleSigningComplete = async () => {
    if (submitting) return;
    setSubmitting(true);
    setSubmitError('');
    try {
      const res = await base44.functions.invoke('submitToElavon', { corporateId: profile.corporateId });
      const data = res.data;
      if (data?.allSubmitted || data?.success) {
        onComplete();
      } else {
        setSubmitError('Submission encountered errors. Please contact support.');
      }
    } catch (err) {
      setSubmitError(err.message || 'Submission failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRosterChange = (valid, totalPct, signerList) => {
    setAllVerified(valid);
    setTotalOwnership(totalPct);
  };

  return (
    <div className="flex flex-col">
      {/* Header */}
      <div className="px-8 pt-8 pb-6 border-b border-gray-100">
        <div className="inline-flex items-center gap-2 bg-purple-50 text-purple-700 text-xs font-semibold px-3 py-1.5 rounded-full mb-3">
          <span className="w-1.5 h-1.5 rounded-full bg-purple-500" />
          STEP 3 OF 3 — IDENTITY &amp; SIGNING
        </div>
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold text-gray-900 mb-1.5">Principal &amp; Corporate Verification</h2>
            <p className="text-gray-500 text-sm">Verify all beneficial owners, then review and sign your processing agreement.</p>
          </div>
          <button
            onClick={onBack}
            className="flex-shrink-0 flex items-center gap-2 text-sm font-medium text-gray-500 border border-gray-200 hover:bg-gray-50 px-4 py-2 rounded-xl transition-all"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </button>
        </div>
      </div>

      <div className="px-8 py-6 flex flex-col gap-8">
        {/* Signer Roster */}
        <SignerRoster
          profile={profile}
          onValidChange={handleRosterChange}
        />

        {/* E-Sign Section */}
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${allVerified ? 'bg-green-100' : 'bg-gray-100'}`}>
              <FileText className={`w-4 h-4 ${allVerified ? 'text-green-600' : 'text-gray-400'}`} />
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-900">Review &amp; Sign Merchant Processing Agreement</p>
              <p className="text-xs text-gray-500">Your multi-location processing agreement — required to activate your accounts</p>
            </div>
          </div>

          {/* Locked state */}
          {!allVerified && (
            <div className="border-2 border-dashed border-gray-200 rounded-xl flex flex-col items-center justify-center py-14 gap-3 bg-gray-50">
              <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center">
                <Lock className="w-6 h-6 text-gray-300" />
              </div>
              <p className="text-sm font-semibold text-gray-400">Signing Locked</p>
              <p className="text-xs text-gray-400 text-center max-w-xs">
                All beneficial owners with ≥25% ownership must be verified or have a pending invitation before proceeding.
              </p>
            </div>
          )}

          {/* Loading envelope */}
          {allVerified && loadingEnvelope && (
            <div className="border border-gray-200 rounded-xl flex flex-col items-center justify-center py-14 gap-3 bg-white">
              <Loader2 className="w-8 h-8 text-gray-400 animate-spin" />
              <p className="text-sm font-semibold text-gray-500">Preparing your signing document...</p>
              <p className="text-xs text-gray-400">Compiling multi-location agreement package</p>
            </div>
          )}

          {/* Envelope error */}
          {allVerified && envelopeError && (
            <div className="border border-red-200 bg-red-50 rounded-xl flex items-start gap-3 px-5 py-4">
              <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-red-800">Unable to Load Agreement</p>
                <p className="text-xs text-red-600 mt-1">{envelopeError}</p>
                <button
                  onClick={fetchEnvelope}
                  className="mt-2 text-xs font-semibold text-red-700 underline"
                >
                  Try again
                </button>
              </div>
            </div>
          )}

          {/* E-sign iframe */}
          {allVerified && envelopeUrl && !loadingEnvelope && (
            <div className="border border-gray-200 rounded-xl overflow-hidden shadow-sm">
              <div className="bg-gray-50 border-b border-gray-200 px-5 py-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-green-500" />
                  <span className="text-xs font-semibold text-gray-700">Merchant Processing Agreement — Ready to Sign</span>
                </div>
                <span className="text-xs text-gray-400">Secured · {locations.length} location{locations.length !== 1 ? 's' : ''} included</span>
              </div>
              <iframe
                ref={iframeRef}
                src={envelopeUrl}
                title="Merchant Processing Agreement"
                className="w-full"
                style={{ height: 680, border: 'none', display: 'block' }}
                allow="camera; microphone"
              />
            </div>
          )}

          {/* Manual complete button (fallback if postMessage doesn't fire) */}
          {allVerified && envelopeUrl && (
            <div className="flex flex-col gap-2">
              {submitError && (
                <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-xl px-5 py-4">
                  <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-red-700">{submitError}</p>
                </div>
              )}
              <button
                onClick={handleSigningComplete}
                disabled={submitting}
                className="w-full flex items-center justify-center gap-2 text-sm font-bold text-white bg-green-700 hover:bg-green-800 disabled:bg-gray-300 py-3.5 rounded-xl transition-all"
              >
                {submitting ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Processing submission...</>
                ) : (
                  <><CheckCircle2 className="w-4 h-4" /> I Have Signed — Complete Application</>
                )}
              </button>
              <p className="text-center text-xs text-gray-400">
                Click after completing your signature in the document above
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}