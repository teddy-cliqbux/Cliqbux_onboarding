import { useState, useEffect, useRef } from 'react';
import { ArrowLeft, Lock, Loader2, CheckCircle2, AlertCircle, ShieldCheck, PenLine, ChevronRight } from 'lucide-react';
import SignerRoster from '@/components/onboarding/SignerRoster';
import SigningErrorGuide from '@/components/onboarding/SigningErrorGuide';
import { invokePortalFunction } from '@/lib/merchantAuthFetch';

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

  // Notify HubSpot the moment the Merchant Processing Agreement is fully executed
  // (all merchantMIDs signed) — independent of flow type (sales vs self-serve) and
  // independent of the later "Submit Application" action, which pushes its own
  // separate 'application_submitted' milestone. Fixes 2026-07-07: this milestone
  // previously only fired from Step1Agreement.jsx's earlier "accept quote" screen,
  // which self-serve merchants never see — so agreement_signed (HubSpot's "Quote &
  // Agreement Executed" stage) never fired for self-serve deals at all.
  const agreementPushedRef = useRef(false);
  useEffect(() => {
    if (allSigned && profile?.corporateId && !agreementPushedRef.current) {
      agreementPushedRef.current = true;
      invokePortalFunction('pushStatusToHubspot', {
        corporateId: profile.corporateId,
        milestone: 'agreement_signed',
      }).catch(() => {
        // Non-fatal — HubSpot sync is best-effort
      });
    }
  }, [allSigned, profile?.corporateId]);

  const fetchSigningState = async () => {
    setLoadingSigning(true);
    setSigningError('');
    try {
      const res  = await invokePortalFunction('signApplication', { corporateId: profile.corporateId });
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
      const res  = await invokePortalFunction('signApplication', { corporateId: profile.corporateId });
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
    } catch (err) {
      // Polling failure shouldn't block the UI — message only, never raw err
      console.error('[OnboardingVerification.pollSigningStatus]', err?.message || 'Unknown error');
    }
  };

  const handleSubmit = async () => {
    if (submitting) return;
    setSubmitting(true);
    setSubmitError('');
    try {
      const res  = await invokePortalFunction('submitToMSP', { corporateId: profile.corporateId });
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
      <div className="px-8 pt-10 pb-8 border-b border-cb-border">
        <p className="text-cb-caption uppercase text-gray-500 mb-2">Step 4 of 4 — Identity &amp; Signing</p>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="font-display text-cb-display text-white mb-2">Principal &amp; Corporate Verification</h2>
            <p className="text-cb-body-lg text-gray-400 max-w-xl">Verify all beneficial owners, then review and sign your Merchant Processing Agreement.</p>
          </div>
          <button
            onClick={onBack}
            className="flex-shrink-0 flex items-center gap-2 text-cb-body text-gray-300 border border-cb-border hover:border-cb-border-strong hover:text-white px-4 py-2 rounded-cb transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </button>
        </div>
      </div>

      <div className="px-8 py-8 flex flex-col gap-8">
        {/* Signer Roster */}
        <SignerRoster profile={profile} onValidChange={handleVerifiedChange} />

        {/* E-Sign Section */}
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-2.5">
            <PenLine className={`w-4 h-4 ${allVerified ? 'text-cb-accent' : 'text-gray-500'}`} />
            <div>
              <p className="text-cb-body font-semibold text-white">Review &amp; Sign Merchant Processing Agreement</p>
              <p className="text-cb-caption normal-case tracking-normal font-normal text-gray-500">Powered by MSPWare — your agreement is generated directly from your application data</p>
            </div>
          </div>

          {/* Locked until signers verified */}
          {!allVerified && (
            <div className="border border-cb-border rounded-cb flex flex-col items-center justify-center py-14 gap-3 bg-cb-surface-raised">
              <div className="w-12 h-12 rounded-full bg-cb-bg border border-cb-border flex items-center justify-center">
                <Lock className="w-6 h-6 text-gray-500" />
              </div>
              <p className="text-cb-body font-semibold text-gray-300">Signing Locked</p>
              <p className="text-cb-body text-gray-500 text-center max-w-xs">
                All beneficial owners with ≥25% ownership must be verified or have a pending invitation before proceeding.
              </p>
            </div>
          )}

          {/* Loading */}
          {allVerified && loadingSigning && (
            <div className="border border-cb-border rounded-cb flex flex-col items-center justify-center py-14 gap-3 bg-cb-surface-raised">
              <Loader2 className="w-8 h-8 text-gray-400 animate-spin" />
              <p className="text-cb-body font-semibold text-gray-300">Preparing your signing documents…</p>
              <p className="text-cb-body text-gray-500">This may take a few seconds</p>
            </div>
          )}

          {/* Error fetching signing state */}
          {allVerified && !loadingSigning && signingError && (
            <div className="border border-cb-border border-l-2 border-l-cb-danger bg-cb-surface-raised rounded-cb flex items-start gap-3 px-5 py-4">
              <AlertCircle className="w-5 h-5 text-cb-danger flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-cb-body font-semibold text-white">Unable to Load Signing Documents</p>
                <p className="text-cb-body text-gray-400 mt-1">{signingError}</p>
                <button onClick={fetchSigningState} className="mt-2 text-cb-body font-medium text-cb-accent hover:opacity-80 transition-opacity">
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
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-cb text-cb-body font-medium transition-colors border ${
                      app.allSigned
                        ? 'border-cb-border bg-cb-surface-raised text-gray-300'
                        : i === activeIndex
                        ? 'border-cb-accent/50 bg-cb-accent-muted text-cb-accent'
                        : app.error
                        ? 'border-cb-border bg-cb-surface-raised text-cb-danger cursor-default'
                        : 'border-cb-border bg-cb-surface-raised text-gray-400 hover:border-cb-border-strong'
                    }`}
                  >
                    {app.allSigned
                      ? <CheckCircle2 className="w-3.5 h-3.5 text-cb-success" />
                      : app.error
                      ? <AlertCircle className="w-3.5 h-3.5" />
                      : <span className="w-4 h-4 rounded-full border border-current flex items-center justify-center text-[10px] leading-none">{i + 1}</span>
                    }
                    {app.merchantIDName}
                  </button>
                ))}
              </div>
              <p className="text-cb-body text-gray-500">
                {totalSigned} of {totalCount} agreement{totalCount !== 1 ? 's' : ''} signed
              </p>
            </div>
          )}

          {/* All signed banner */}
          {allVerified && allSigned && !loadingSigning && (
            <div className="border border-cb-border border-l-2 border-l-cb-success bg-cb-surface-raised rounded-cb flex items-start gap-3 px-5 py-4">
              <CheckCircle2 className="w-5 h-5 text-cb-success flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-cb-body font-semibold text-white">All Agreements Signed</p>
                <p className="text-cb-body text-gray-400 mt-1">
                  {totalCount} agreement{totalCount !== 1 ? 's' : ''} complete. Click below to submit your application for processing.
                </p>
              </div>
            </div>
          )}

          {/* Active signing iframe */}
          {allVerified && activeApp && !activeApp.allSigned && !activeApp.error && activeApp.signingUrl && !loadingSigning && (
            <div className="border border-cb-border rounded-cb overflow-hidden">
              <div className="bg-cb-surface-raised border-b border-cb-border px-5 py-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-cb-accent" />
                  <span className="text-cb-body font-medium text-gray-200">
                    {activeApp.merchantIDName}
                    {totalCount > 1 && (
                      <span className="text-gray-500 font-normal"> — Agreement {activeIndex + 1} of {totalCount}</span>
                    )}
                  </span>
                </div>
                {activeApp.signers?.length > 0 && (
                  <span className="text-cb-caption normal-case tracking-normal font-normal text-gray-500">
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
              <div className="bg-cb-surface-raised border-t border-cb-border px-5 py-3 flex items-center justify-between">
                <p className="text-cb-caption normal-case tracking-normal font-normal text-gray-500">
                  Scroll through the full agreement, then click the signature fields to sign.
                  This page updates automatically when signing is complete.
                </p>
                {totalCount > 1 && activeIndex < totalCount - 1 && (
                  <button
                    onClick={() => setActiveIndex(i => i + 1)}
                    className="flex-shrink-0 flex items-center gap-1 text-cb-body font-medium text-gray-400 hover:text-white transition-colors ml-4"
                  >
                    Next <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Error guides — one per errored app, always visible */}
          {allVerified && !loadingSigning && applications.filter(a => a.error).map(app => (
            <SigningErrorGuide
              key={app.mspApplicationNo}
              app={app}
              onNavigate={(step) => {
                if (step === 'verify') {
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                } else {
                  onNavigate(step);
                }
              }}
              onRetry={fetchSigningState}
            />
          ))}

          {/* Submit button — only after all signed */}
          {allVerified && allSigned && (
            <div className="flex flex-col gap-2">
              {submitError && (
                <div className="flex items-start gap-3 bg-cb-surface-raised border border-cb-border border-l-2 border-l-cb-danger rounded-cb px-5 py-4">
                  <AlertCircle className="w-4 h-4 text-cb-danger flex-shrink-0 mt-0.5" />
                  <p className="text-cb-body text-gray-300">{submitError}</p>
                </div>
              )}
              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="w-full flex items-center justify-center gap-2 text-cb-body-lg font-semibold text-cb-bg bg-cb-accent hover:opacity-90 disabled:bg-cb-surface-raised disabled:border disabled:border-cb-border disabled:text-gray-500 py-3.5 rounded-cb transition-colors"
              >
                {submitting ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Submitting application…</>
                ) : (
                  <><ShieldCheck className="w-4 h-4" /> Submit Application for Processing</>
                )}
              </button>
              <p className="text-center text-cb-body text-gray-500">
                Your signed application{totalCount > 1 ? 's' : ''} will be submitted to Elavon for underwriting review
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
