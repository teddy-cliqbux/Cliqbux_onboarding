import { useState, useEffect, useRef } from 'react';
import { ArrowLeft, Lock, Loader2, CheckCircle2, AlertCircle, ShieldCheck, PenLine, ChevronRight } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import SignerRoster from '@/components/onboarding/SignerRoster';
import SigningErrorGuide from '@/components/onboarding/SigningErrorGuide';

// How often to poll MSPWare for signing completion (ms)
const POLL_INTERVAL_MS = 5000;

export default function OnboardingVerification({ profile, locations, initialSignersVerified, onSignersVerified, onBack, onComplete, onNavigate }) {
  const [allVerified, setAllVerified] = useState(initialSignersVerified || false);

  const handleVerifiedChange = (v) => {
    setAllVerified(v);
    if (onSignersVerified) onSignersVerified(v);
  };

  // Signing state — array of applications returned by signApplication
  const [loadingSigning, setLoadingSigning] = useState(false);
  const [signingError, setSigningError]     = useState('');
  const [applications, setApplications]     = useState([]); // [{ mspApplicationNo, merchantIDName, signingUrl, signers, allSigned, error }]
  const [activeIndex, setActiveIndex]       = useState(0);  // which app is currently in the iframe
  const pollRef = useRef(null);

  // Submit state
  const [submitting, setSubmitting]   = useState(false);
  const [submitError, setSubmitError] = useState('');

  // Derived
  const totalCount  = applications.length;
  const totalSigned = applications.filter(a => a.allSigned).length;
  const allSigned   = totalCount > 0 && totalSigned === totalCount;
  const activeApp   = applications[activeIndex] || null;

  // Kick off signing fetch once signers are verified, or immediately on mount if already verified
  // Also re-fetch if all apps have errors (e.g. after returning from fixing Locations/MIDs)
  useEffect(() => {
    const hasOnlyErrors = applications.length > 0 && applications.every(a => a.error);
    if (allVerified && (applications.length === 0 || hasOnlyErrors) && !loadingSigning) {
      fetchSigningState();
    }
  }, [allVerified]);

  // Poll active application for signing completion
  useEffect(() => {
    if (activeApp && !activeApp.allSigned && !allSigned) {
      pollRef.current = setInterval(pollSigningStatus, POLL_INTERVAL_MS);
    }
    return () => clearInterval(pollRef.current);
  }, [activeIndex, allSigned]);

  const fetchSigningState = async () => {
    setLoadingSigning(true);
    setSigningError('');
    try {
      const res  = await base44.functions.invoke('signApplication', { corporateId: profile.corporateId });
      const data = res.data;

      if (!data?.success) {
        setSigningError(data?.hint || data?.error || 'Unable to prepare signing documents.');
        return;
      }

      // Attach corporateId to each app for error diagnostics
      setApplications((data.applications || []).map(a => ({ ...a, corporateId: profile.corporateId })));

      // Start at first unsigned application
      const firstUnsigned = (data.applications || []).findIndex(a => !a.allSigned);
      setActiveIndex(firstUnsigned >= 0 ? firstUnsigned : 0);
    } catch (err) {
      setSigningError(err.message || 'Failed to prepare signing documents.');
    } finally {
      setLoadingSigning(false);
    }
  };

  const pollSigningStatus = async () => {
    try {
      const res  = await base44.functions.invoke('signApplication', { corporateId: profile.corporateId });
      const data = res.data;
      if (!data?.applications) return;

      setApplications(data.applications.map(a => ({ ...a, corporateId: profile.corporateId })));

      // If the active app just got signed, auto-advance to next unsigned
      const current = data.applications[activeIndex];
      if (current?.allSigned) {
        clearInterval(pollRef.current);
        const nextUnsigned = data.applications.findIndex((a, i) => i > activeIndex && !a.allSigned);
        if (nextUnsigned >= 0) {
          setActiveIndex(nextUnsigned);
        }
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
      const res  = await base44.functions.invoke('submitToMSP', { corporateId: profile.corporateId });
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

  return (
    <div className="flex flex-col">
      {/* Header */}
      <div className="px-8 pt-8 pb-6 border-b border-white/10">
        <div className="inline-flex items-center gap-2 bg-purple-500/15 text-purple-300 text-xs font-semibold px-3 py-1.5 rounded-full mb-3">
          <span className="w-1.5 h-1.5 rounded-full bg-purple-400" />
          STEP 4 OF 4 — IDENTITY &amp; SIGNING
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
        <SignerRoster profile={profile} onValidChange={handleVerifiedChange} />

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

          {/* Loading */}
          {allVerified && loadingSigning && (
            <div className="border border-white/10 rounded-xl flex flex-col items-center justify-center py-14 gap-3 bg-white/5">
              <Loader2 className="w-8 h-8 text-gray-400 animate-spin" />
              <p className="text-sm font-semibold text-gray-500">Preparing your signing documents…</p>
              <p className="text-xs text-gray-400">This may take a few seconds</p>
            </div>
          )}

          {/* Error fetching signing state */}
          {allVerified && !loadingSigning && signingError && (
            <div className="border border-red-500/30 bg-red-500/10 rounded-xl flex items-start gap-3 px-5 py-4">
              <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-red-300">Unable to Load Signing Documents</p>
                <p className="text-xs text-red-400 mt-1">{signingError}</p>
                <button onClick={fetchSigningState} className="mt-2 text-xs font-semibold text-red-400 underline hover:text-red-300">
                  Try again
                </button>
              </div>
            </div>
          )}

          {/* Progress pills — shown once we have apps loaded */}
          {allVerified && !loadingSigning && totalCount > 0 && (
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2 flex-wrap">
                {applications.map((app, i) => (
                  <button
                    key={app.mspApplicationNo}
                    onClick={() => !app.error && setActiveIndex(i)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all border ${
                      app.allSigned
                        ? 'border-green-500/40 bg-green-500/10 text-green-300'
                        : i === activeIndex
                        ? 'border-purple-500/50 bg-purple-500/15 text-purple-200'
                        : app.error
                        ? 'border-red-500/30 bg-red-500/10 text-red-400 cursor-default'
                        : 'border-white/10 bg-white/5 text-gray-400 hover:border-white/25'
                    }`}
                  >
                    {app.allSigned
                      ? <CheckCircle2 className="w-3.5 h-3.5" />
                      : app.error
                      ? <AlertCircle className="w-3.5 h-3.5" />
                      : <span className="w-4 h-4 rounded-full border border-current flex items-center justify-center text-[10px] leading-none">{i + 1}</span>
                    }
                    {app.merchantIDName}
                  </button>
                ))}
              </div>
              <p className="text-xs text-gray-500">
                {totalSigned} of {totalCount} agreement{totalCount !== 1 ? 's' : ''} signed
              </p>
            </div>
          )}

          {/* All signed banner */}
          {allVerified && allSigned && !loadingSigning && (
            <div className="border border-green-500/30 bg-green-500/10 rounded-xl flex items-start gap-3 px-5 py-4">
              <CheckCircle2 className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-green-300">All Agreements Signed</p>
                <p className="text-xs text-green-400 mt-1">
                  {totalCount} agreement{totalCount !== 1 ? 's' : ''} complete. Click below to submit your application for processing.
                </p>
              </div>
            </div>
          )}

          {/* Active signing iframe */}
          {allVerified && activeApp && !activeApp.allSigned && !activeApp.error && activeApp.signingUrl && !loadingSigning && (
            <div className="border border-white/10 rounded-xl overflow-hidden shadow-lg">
              <div className="bg-white/[0.05] border-b border-white/10 px-5 py-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-purple-400 animate-pulse" />
                  <span className="text-xs font-semibold text-gray-200">
                    {activeApp.merchantIDName}
                    {totalCount > 1 && (
                      <span className="text-gray-500 font-normal"> — Agreement {activeIndex + 1} of {totalCount}</span>
                    )}
                  </span>
                </div>
                {activeApp.signers?.length > 0 && (
                  <span className="text-xs text-gray-500">
                    {activeApp.signers.filter(s => s.signed).length}/{activeApp.signers.length} signed
                  </span>
                )}
              </div>
              <iframe
                src={activeApp.signingUrl}
                title={`Merchant Processing Agreement — ${activeApp.merchantIDName}`}
                className="w-full"
                style={{ height: 680, border: 'none', display: 'block' }}
                allow="same-origin"
              />
              <div className="bg-white/[0.03] border-t border-white/10 px-5 py-3 flex items-center justify-between">
                <p className="text-xs text-gray-500">
                  Scroll through the full agreement, then click the signature fields to sign.
                  This page updates automatically when signing is complete.
                </p>
                {totalCount > 1 && activeIndex < totalCount - 1 && (
                  <button
                    onClick={() => setActiveIndex(i => i + 1)}
                    className="flex-shrink-0 flex items-center gap-1 text-xs font-semibold text-gray-400 hover:text-white transition-colors ml-4"
                  >
                    Next <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Error on a specific concept — guided fix */}
          {allVerified && activeApp?.error && !loadingSigning && (
            <SigningErrorGuide
              app={activeApp}
              onNavigate={(step) => {
                // 'verify' means fix is on THIS page (SSN/identity) — just scroll up, don't navigate away
                if (step === 'verify') {
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                } else {
                  onNavigate(step);
                }
              }}
              onRetry={fetchSigningState}
            />
          )}

          {/* Submit button — only after all signed */}
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
                Your signed application{totalCount > 1 ? 's' : ''} will be submitted to Elavon for underwriting review
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}