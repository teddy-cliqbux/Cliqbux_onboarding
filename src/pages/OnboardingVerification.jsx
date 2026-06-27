import { useState, useEffect, useRef } from 'react';
import { ArrowLeft, Lock, Loader2, CheckCircle2, AlertCircle, ShieldCheck, PenLine } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import SignerRoster from '@/components/onboarding/SignerRoster';

// How often to poll MSPWare for signing completion (ms)
const POLL_INTERVAL_MS = 5000;

export default function OnboardingVerification({ profile, locations, onBack, onComplete }) {
  const [allVerified, setAllVerified] = useState(false);

  // Signing state
  const [loadingSigning, setLoadingSigning]   = useState(false);
  const [signingUrl, setSigningUrl]           = useState(null);   // iframe src
  const [signingError, setSigningError]       = useState('');
  const [allSigned, setAllSigned]             = useState(false);
  const [signers, setSigners]                 = useState([]);
  const [mspApplicationNo, setMspApplicationNo] = useState(null);
  const pollRef = useRef(null);

  // Submit state
  const [submitting, setSubmitting]   = useState(false);
  const [submitError, setSubmitError] = useState('');

  // Kick off signing fetch once signers are verified
  useEffect(() => {
    if (allVerified && !signingUrl && !loadingSigning) {
      fetchSigningUrl();
    }
  }, [allVerified]);

  // Poll for signing completion while iframe is showing
  useEffect(() => {
    if (signingUrl && !allSigned) {
      pollRef.current = setInterval(pollSigningStatus, POLL_INTERVAL_MS);
    }
    return () => clearInterval(pollRef.current);
  }, [signingUrl, allSigned]);

  const fetchSigningUrl = async () => {
    setLoadingSigning(true);
    setSigningError('');
    try {
      const res = await base44.functions.invoke('signApplication', {
        corporateId: profile.corporateId,
      });
      const data = res.data;

      if (!data?.success) {
        // Form may not be complete yet — give a clear message
        const hint = data?.hint || data?.error || 'Unable to prepare signing document.';
        setSigningError(hint);
        return;
      }

      setMspApplicationNo(data.mspApplicationNo);
      setSigners(data.signers || []);
      setAllSigned(data.allSigned || false);

      if (data.allSigned) {
        // Already signed — skip iframe, go straight to submit
        return;
      }

      if (data.primarySigningUrl) {
        setSigningUrl(data.primarySigningUrl);
      } else {
        // Package created but no URL yet — shouldn't happen, but handle gracefully
        setSigningError('Signing document prepared but URL could not be retrieved. Please refresh.');
      }
    } catch (err) {
      setSigningError(err.message || 'Failed to prepare signing document.');
    } finally {
      setLoadingSigning(false);
    }
  };

  const pollSigningStatus = async () => {
    if (!mspApplicationNo) return;
    try {
      const res = await base44.functions.invoke('signApplication', {
        corporateId: profile.corporateId,
        mspApplicationNo,
      });
      const data = res.data;
      if (data?.signers) setSigners(data.signers);
      if (data?.allSigned) {
        setAllSigned(true);
        clearInterval(pollRef.current);
      }
    } catch (_) {
      // silent — polling failure shouldn't block the UI
    }
  };

  const handleSubmit = async () => {
    if (submitting) return;
    setSubmitting(true);
    setSubmitError('');
    try {
      const res = await base44.functions.invoke('submitToMSP', {
        corporateId: profile.corporateId,
      });
      const data = res.data;
      if (data?.allSubmitted || data?.success) {
        onComplete();
      } else {
        setSubmitError('Submission encountered errors. Please contact support if this persists.');
      }
    } catch (err) {
      setSubmitError(err.message || 'Submission failed. Please contact support.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRosterChange = (valid) => {
    setAllVerified(valid);
  };

  return (
    <div className="flex flex-col">
      {/* Header */}
      <div className="px-8 pt-8 pb-6 border-b border-white/10">
        <div className="inline-flex items-center gap-2 bg-purple-500/15 text-purple-300 text-xs font-semibold px-3 py-1.5 rounded-full mb-3">
          <span className="w-1.5 h-1.5 rounded-full bg-purple-400" />
          STEP 3 OF 3 — IDENTITY &amp; SIGNING
        </div>
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold text-white mb-1.5">Principal &amp; Corporate Verification</h2>
            <p className="text-gray-400 text-sm">Verify all beneficial owners, then review and sign your Merchant Processing Agreement.</p>
          </div>
          <button
            onClick={onBack}
            className="flex-shrink-0 flex items-center gap-2 text-sm font-medium text-gray-400 border border-white/15 hover:border-white/30 hover:bg-white/5 px-4 py-2 rounded-xl transition-all"
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
            <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${allVerified ? 'bg-purple-500/15' : 'bg-white/10'}`}>
              <PenLine className={`w-4 h-4 ${allVerified ? 'text-purple-400' : 'text-gray-500'}`} />
            </div>
            <div>
              <p className="text-sm font-semibold text-white">Review &amp; Sign Merchant Processing Agreement</p>
              <p className="text-xs text-gray-400">Powered by MSPWare — your agreement is generated directly from your application data</p>
            </div>
          </div>

          {/* Locked until signers verified */}
          {!allVerified && (
            <div className="border-2 border-dashed border-white/10 rounded-xl flex flex-col items-center justify-center py-14 gap-3 bg-white/5">
              <div className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center">
                <Lock className="w-6 h-6 text-gray-500" />
              </div>
              <p className="text-sm font-semibold text-gray-400">Signing Locked</p>
              <p className="text-xs text-gray-500 text-center max-w-xs">
                All beneficial owners with ≥25% ownership must be verified or have a pending invitation before proceeding.
              </p>
            </div>
          )}

          {/* Loading signing document */}
          {allVerified && loadingSigning && (
            <div className="border border-white/10 rounded-xl flex flex-col items-center justify-center py-14 gap-3 bg-white/5">
              <Loader2 className="w-8 h-8 text-gray-400 animate-spin" />
              <p className="text-sm font-semibold text-gray-500">Preparing your signing document…</p>
              <p className="text-xs text-gray-400">This may take a few seconds</p>
            </div>
          )}

          {/* Error */}
          {allVerified && !loadingSigning && signingError && (
            <div className="border border-red-500/30 bg-red-500/10 rounded-xl flex items-start gap-3 px-5 py-4">
              <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-red-300">Unable to Load Signing Document</p>
                <p className="text-xs text-red-400 mt-1">{signingError}</p>
                <button
                  onClick={fetchSigningUrl}
                  className="mt-2 text-xs font-semibold text-red-400 underline hover:text-red-300"
                >
                  Try again
                </button>
              </div>
            </div>
          )}

          {/* Already signed — skip iframe */}
          {allVerified && allSigned && !loadingSigning && (
            <div className="border border-green-500/30 bg-green-500/10 rounded-xl flex items-start gap-3 px-5 py-4">
              <CheckCircle2 className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-green-300">Agreement Signed</p>
                <p className="text-xs text-green-400 mt-1">
                  All required signatures are complete. Click below to submit your application for processing.
                </p>
              </div>
            </div>
          )}

          {/* Signing iframe */}
          {allVerified && signingUrl && !allSigned && !loadingSigning && (
            <div className="border border-white/10 rounded-xl overflow-hidden shadow-lg">
              <div className="bg-white/[0.05] border-b border-white/10 px-5 py-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-purple-400 animate-pulse" />
                  <span className="text-xs font-semibold text-gray-200">Merchant Processing Agreement — Ready to Sign</span>
                </div>
                <div className="flex items-center gap-3">
                  {signers.length > 0 && (
                    <span className="text-xs text-gray-500">
                      {signers.filter(s => s.signed).length}/{signers.length} signed
                    </span>
                  )}
                  <span className="text-xs text-gray-500">{locations?.length ?? 0} location{(locations?.length ?? 0) !== 1 ? 's' : ''}</span>
                </div>
              </div>
              <iframe
                src={signingUrl}
                title="Merchant Processing Agreement"
                className="w-full"
                style={{ height: 680, border: 'none', display: 'block' }}
                allow="same-origin"
              />
              <div className="bg-white/[0.03] border-t border-white/10 px-5 py-3">
                <p className="text-xs text-gray-500 text-center">
                  Scroll through the full agreement, then click the signature fields to sign.
                  This page will update automatically when signing is complete.
                </p>
              </div>
            </div>
          )}

          {/* Submit button — only after signing */}
          {allVerified && allSigned && (
            <div className="flex flex-col gap-2">
              {submitError && (
                <div className="flex items-start gap-3 bg-red-500/10 border border-red-500/30 rounded-xl px-5 py-4">
                  <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-red-300">{submitError}</p>
                </div>
              )}
              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="w-full flex items-center justify-center gap-2 text-sm font-bold text-white bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 disabled:from-gray-600 disabled:to-gray-600 disabled:text-gray-400 py-3.5 rounded-xl transition-all shadow-lg shadow-green-900/30"
              >
                {submitting ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Submitting application…</>
                ) : (
                  <><ShieldCheck className="w-4 h-4" /> Submit Application for Processing</>
                )}
              </button>
              <p className="text-center text-xs text-gray-500">
                Your signed application will be submitted to Elavon for underwriting review
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
