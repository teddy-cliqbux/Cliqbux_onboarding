import { useState, useEffect, useRef } from 'react';
import { ArrowLeft, Lock, FileText, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import SignerRoster from '@/components/onboarding/SignerRoster';

export default function OnboardingVerification({ profile, locations, onBack, onComplete }) {
  const [signers, setSigners] = useState([]);
  const [allVerified, setAllVerified] = useState(false);
  const [totalOwnership, setTotalOwnership] = useState(0);

  // Document / signing state
  const [envelopeUrl, setEnvelopeUrl] = useState(null);   // blob URL or '__ready__'
  const [loadingEnvelope, setLoadingEnvelope] = useState(false);
  const [envelopeError, setEnvelopeError] = useState('');
  const [loadingStep, setLoadingStep] = useState('');      // human-readable progress

  // Board submission state
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  const [identityResolved, setIdentityResolved] = useState(false);
  const iframeRef = useRef(null);
  const blobUrlRef = useRef(null);

  // Revoke blob URL on unmount to avoid memory leaks
  useEffect(() => {
    return () => {
      if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current);
    };
  }, []);

  // Gate document fetch behind identity verification
  useEffect(() => {
    if (allVerified && !envelopeUrl && !loadingEnvelope && identityResolved) {
      fetchDocuments();
    }
  }, [allVerified, identityResolved]);

  // Give background ops a moment to settle before triggering doc fetch
  useEffect(() => {
    if (allVerified && !identityResolved) {
      const timer = setTimeout(() => setIdentityResolved(true), 800);
      return () => clearTimeout(timer);
    }
  }, [allVerified]);

  const fetchDocuments = async () => {
    setLoadingEnvelope(true);
    setEnvelopeError('');
    try {
      // Step 1 — list required documents (validates payload against Elavon)
      setLoadingStep('Validating merchant data with Elavon...');
      const listRes = await base44.functions.invoke('listDocuments', {
        corporateId: profile.corporateId
      });
      const userDocumentListMap = listRes.data?.userDocumentListMap || null;

      // Step 2 — retrieve signing document content
      setLoadingStep('Compiling your Merchant Processing Agreement...');
      const getRes = await base44.functions.invoke('getDocuments', {
        corporateId: profile.corporateId,
        userDocumentListMap
      });

      const { htmlContent, documentUrl } = getRes.data || {};

      if (htmlContent) {
        // Render HTML from Elavon in an iframe via a blob URL
        if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current);
        const blob = new Blob([htmlContent], { type: 'text/html' });
        const url = URL.createObjectURL(blob);
        blobUrlRef.current = url;
        setEnvelopeUrl(url);
      } else if (documentUrl) {
        setEnvelopeUrl(documentUrl);
      } else {
        // No renderable content returned — allow signing via button only
        setEnvelopeUrl('__ready__');
      }
    } catch (err) {
      setEnvelopeError(err.message || 'Failed to load signing document.');
    } finally {
      setLoadingEnvelope(false);
      setLoadingStep('');
    }
  };

  // Called when merchant clicks "I Have Reviewed — Submit Application"
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
        setSubmitError('Submission encountered errors. Our team has been notified — please contact support if this persists.');
      }
    } catch (err) {
      setSubmitError(err.message || 'Submission failed. Please contact support.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRosterChange = (valid, totalPct) => {
    setAllVerified(valid);
    setTotalOwnership(totalPct);
  };

  const documentReady = !!envelopeUrl;
  const showIframe = documentReady && envelopeUrl !== '__ready__';

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

          {/* Locked: signers not yet verified */}
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

          {/* Loading: fetching from Elavon */}
          {allVerified && !documentReady && !envelopeError && (
            <div className="border border-gray-200 rounded-xl flex flex-col items-center justify-center py-14 gap-3 bg-white">
              <Loader2 className="w-8 h-8 text-gray-400 animate-spin" />
              <p className="text-sm font-semibold text-gray-500">
                {loadingStep || (identityResolved ? 'Preparing your signing document...' : 'Completing identity verification handshake...')}
              </p>
              <p className="text-xs text-gray-400">This may take a few seconds</p>
            </div>
          )}

          {/* Error state */}
          {allVerified && envelopeError && (
            <div className="border border-red-200 bg-red-50 rounded-xl flex items-start gap-3 px-5 py-4">
              <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-red-800">Unable to Load Agreement</p>
                <p className="text-xs text-red-600 mt-1">{envelopeError}</p>
                <button onClick={fetchDocuments} className="mt-2 text-xs font-semibold text-red-700 underline">
                  Try again
                </button>
              </div>
            </div>
          )}

          {/* Document iframe */}
          {showIframe && (
            <div className="border border-gray-200 rounded-xl overflow-hidden shadow-sm">
              <div className="bg-gray-50 border-b border-gray-200 px-5 py-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-green-500" />
                  <span className="text-xs font-semibold text-gray-700">Merchant Processing Agreement — Ready to Review</span>
                </div>
                <span className="text-xs text-gray-400">Secured · {locations?.length ?? 0} location{(locations?.length ?? 0) !== 1 ? 's' : ''} included</span>
              </div>
              <iframe
                ref={iframeRef}
                src={envelopeUrl}
                title="Merchant Processing Agreement"
                className="w-full"
                style={{ height: 680, border: 'none', display: 'block' }}
              />
            </div>
          )}

          {/* No iframe but document is ready (Elavon returned no renderable content) */}
          {documentReady && envelopeUrl === '__ready__' && (
            <div className="border border-green-200 bg-green-50 rounded-xl flex items-start gap-3 px-5 py-4">
              <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-green-800">Agreement Ready</p>
                <p className="text-xs text-green-700 mt-1">
                  Your Merchant Processing Agreement has been compiled and is ready for electronic signature.
                  By clicking the button below you agree to the terms of the Merchant Processing Agreement,
                  Operating Guide, and all applicable addenda.
                </p>
              </div>
            </div>
          )}

          {/* Submit button — shown once document is ready */}
          {allVerified && documentReady && (
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
                  <><CheckCircle2 className="w-4 h-4" /> I Have Reviewed &amp; Agree — Submit Application</>
                )}
              </button>
              {showIframe && (
                <p className="text-center text-xs text-gray-400">
                  Review the agreement above, then click to electronically sign and submit
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
