import { useState, useEffect, useRef, useCallback } from 'react';
import { ArrowLeft, Lock, Loader2, CheckCircle2, AlertCircle, ShieldCheck, PenLine, ChevronRight, Users } from 'lucide-react';
import SignerRoster from '@/components/onboarding/SignerRoster';
import SigningErrorGuide from '@/components/onboarding/SigningErrorGuide';
import SignerDetailsModal from '@/components/onboarding/SignerDetailsModal';
import { invokePortalFunction } from '@/lib/merchantAuthFetch';
import { isRequiredSigner } from '@/lib/signerRules';

// How often to poll MSPWare for signing completion (ms) — ground truth / safety net
const POLL_INTERVAL_MS = 5000;
const BOLDSIGN_ORIGIN = 'https://app.boldsign.com';

function signerEmailKey(s) {
  return (s?.signerEmail || s?.email || '').toLowerCase().trim();
}

function findSignerLink(app, email) {
  if (!app || !email) return null;
  const key = email.toLowerCase().trim();
  return (app.signers || []).find(s => (s.email || '').toLowerCase().trim() === key) || null;
}

/**
 * Signer-outer / MID-inner coordinator for colocated multi-signer sessions.
 * Remote owners (identityStatus Sent) are excluded from the hot-seat queue and
 * complete via /verify?intent=sign; we wait for them in waiting_remote.
 */
export default function OnboardingVerification({ profile, locations, initialSignersVerified, onSignersVerified, onBack, onComplete, onNavigate }) {
  const [allVerified, setAllVerified] = useState(initialSignersVerified || false);
  const [rosterSigners, setRosterSigners] = useState([]);

  const handleVerifiedChange = (v) => {
    setAllVerified(v);
    if (onSignersVerified) onSignersVerified(v);
  };

  const handleSignersChange = (list) => {
    setRosterSigners(Array.isArray(list) ? list : []);
  };

  // Signing packages from signApplication (one per MID)
  const [loadingSigning, setLoadingSigning] = useState(false);
  const [signingError, setSigningError]     = useState('');
  const [applications, setApplications]     = useState([]);
  const pollRef = useRef(null);

  // Coordinator pointers — signer-outer / MID-inner
  const [activeSignerIndex, setActiveSignerIndex] = useState(0);
  const [activeMidIndex, setActiveMidIndex]       = useState(0);
  // roster | signing | waiting_remote | complete
  const [phase, setPhase] = useState('roster');
  const [kycSigner, setKycSigner] = useState(null); // colocated owner needing inline KYC mid-loop
  const advancingRef = useRef(false); // debounce postMessage + poll double-fire

  // Submit state
  const [submitting, setSubmitting]   = useState(false);
  const [submitError, setSubmitError] = useState('');

  const requiredSigners = rosterSigners.filter(isRequiredSigner);
  // Colocated hot-seat queue: Verified (KYC done in person) — not remote Sent
  const colocatedQueue = requiredSigners.filter(s =>
    s.identityStatus === 'Verified' || s.identityStatus === 'Signed'
  );
  // Remotes still outstanding = Sent (invited, not yet Signed)
  const remotesOutstanding = requiredSigners.filter(s => s.identityStatus === 'Sent');
  const allRequiredSigned = requiredSigners.length > 0 &&
    requiredSigners.every(s => s.identityStatus === 'Signed');

  const activeSigner = colocatedQueue[activeSignerIndex] || null;
  const activeApp    = applications[activeMidIndex] || null;
  const activeLink   = activeSigner
    ? findSignerLink(activeApp, activeSigner.signerEmail)
    : null;
  const iframeUrl = activeLink?.signingUrl
    || (activeSigner && profile?.signerEmail &&
        signerEmailKey(activeSigner) === (profile.signerEmail || '').toLowerCase()
          ? activeApp?.signingUrl
          : null);

  const totalCount  = applications.length;
  const totalSigned = applications.filter(a => a.allSigned).length;
  const packagesAllSigned = totalCount > 0 && totalSigned === totalCount;

  // ── Kick off package prep once roster unlocks ─────────────────────────────
  useEffect(() => {
    const hasOnlyErrors = applications.length > 0 && applications.every(a => a.error);
    if (allVerified && (applications.length === 0 || hasOnlyErrors) && !loadingSigning) {
      fetchSigningState();
    }
  }, [allVerified]);

  // Enter signing / waiting / complete once packages are ready.
  // Do NOT reset activeMidIndex on every roster poll — only when entering signing fresh.
  const phaseInitializedRef = useRef(false);
  useEffect(() => {
    if (!allVerified || loadingSigning || applications.length === 0) return;
    if (applications.every(a => a.error)) return;

    if (allRequiredSigned || (packagesAllSigned && remotesOutstanding.length === 0)) {
      setPhase('complete');
      phaseInitializedRef.current = true;
      return;
    }

    const nextColocated = colocatedQueue.findIndex(s => s.identityStatus !== 'Signed');
    if (nextColocated >= 0) {
      if (!phaseInitializedRef.current || phase === 'roster' || phase === 'waiting_remote') {
        setActiveSignerIndex(nextColocated);
        setActiveMidIndex(0);
        setPhase('signing');
        phaseInitializedRef.current = true;
      } else if (phase === 'signing' && colocatedQueue[activeSignerIndex]?.identityStatus === 'Signed') {
        // Current signer finished via poll — advance pointer without wiping mid mid-flight
        setActiveSignerIndex(nextColocated);
        setActiveMidIndex(0);
      }
      return;
    }

    if (remotesOutstanding.length > 0) {
      setPhase('waiting_remote');
      phaseInitializedRef.current = true;
      return;
    }

    setPhase('complete');
    phaseInitializedRef.current = true;
  }, [allVerified, loadingSigning, applications, rosterSigners, phase, activeSignerIndex]);

  // ── Poll = ground truth ───────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== 'signing' && phase !== 'waiting_remote') {
      clearInterval(pollRef.current);
      return;
    }
    pollRef.current = setInterval(pollSigningStatus, POLL_INTERVAL_MS);
    return () => clearInterval(pollRef.current);
  }, [phase, activeSignerIndex, activeMidIndex, rosterSigners]);

  // ── BoldSign postMessage = snappy UI (poll remains safety net) ────────────
  useEffect(() => {
    if (phase !== 'signing') return;
    const onMessage = (event) => {
      if (event.origin !== BOLDSIGN_ORIGIN) return;
      const action = event.data?.action || event.data?.type;
      if (action !== 'onDocumentSigned') return;
      handleSignerMidComplete('postMessage');
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [phase, activeSignerIndex, activeMidIndex, applications, rosterSigners]);

  // HubSpot agreement_signed when fully done
  const agreementPushedRef = useRef(false);
  useEffect(() => {
    if (phase === 'complete' && profile?.corporateId && !agreementPushedRef.current) {
      agreementPushedRef.current = true;
      invokePortalFunction('pushStatusToHubspot', {
        corporateId: profile.corporateId,
        milestone: 'agreement_signed',
      }).catch(() => {});
    }
  }, [phase, profile?.corporateId]);

  const patchRosterSigner = useCallback((updated) => {
    setRosterSigners(prev => prev.map(s => s.id === updated.id ? { ...s, ...updated } : s));
  }, []);

  const markSignerSignedLocally = async (signer) => {
    if (!signer?.id || signer.identityStatus === 'Signed') return signer;
    try {
      const res = await invokePortalFunction('manageSigner', {
        action: 'markSigned',
        corporateId: profile.corporateId,
        signerId: signer.id,
      });
      if (res.data?.signer) {
        patchRosterSigner(res.data.signer);
        return res.data.signer;
      }
    } catch (err) {
      console.error('[OnboardingVerification.markSigned]', err?.message || 'Unknown error');
    }
    return signer;
  };

  /**
   * Advance after the current colocated signer finishes the current MID.
   * Signer-outer / MID-inner: more MIDs → next MID; else mark Signed → next signer
   * or waiting_remote / complete.
   */
  const handleSignerMidComplete = async (source) => {
    if (advancingRef.current) return;
    advancingRef.current = true;
    try {
      const signer = colocatedQueue[activeSignerIndex];
      if (!signer) return;

      // Optimistic: mark this MID's signer row signed in local applications state
      setApplications(prev => prev.map((app, i) => {
        if (i !== activeMidIndex) return app;
        const signers = (app.signers || []).map(s =>
          (s.email || '').toLowerCase() === signerEmailKey(signer)
            ? { ...s, signed: true, status: 'signed' }
            : s
        );
        const allSigned = signers.length > 0 && signers.every(s => s.signed);
        return { ...app, signers, allSigned };
      }));

      const nextMid = activeMidIndex + 1;
      if (nextMid < applications.length) {
        // Skip error apps
        let jump = nextMid;
        while (jump < applications.length && applications[jump]?.error) jump++;
        if (jump < applications.length) {
          setActiveMidIndex(jump);
          return;
        }
      }

      // All MIDs done for this signer → persist Signed, advance human
      await markSignerSignedLocally(signer);

      const nextSignerIdx = activeSignerIndex + 1;
      const remainingColocated = colocatedQueue.slice(nextSignerIdx).filter(s => s.identityStatus !== 'Signed');
      // Recompute remotes from latest roster after mark
      const stillRemote = requiredSigners.filter(s =>
        s.id !== signer.id && s.identityStatus === 'Sent'
      );

      if (remainingColocated.length > 0 || nextSignerIdx < colocatedQueue.length) {
        const nextIdx = colocatedQueue.findIndex((s, i) => i > activeSignerIndex && s.identityStatus !== 'Signed');
        if (nextIdx >= 0) {
          const next = colocatedQueue[nextIdx];
          // If next colocated somehow lost Verified, open KYC (defensive)
          if (next.identityStatus !== 'Verified' && next.identityStatus !== 'Signed') {
            setKycSigner(next);
          }
          setActiveSignerIndex(nextIdx);
          setActiveMidIndex(0);
          setPhase('signing');
          return;
        }
      }

      if (stillRemote.length > 0 || remotesOutstanding.filter(s => s.id !== signer.id).length > 0) {
        setPhase('waiting_remote');
        return;
      }

      setPhase('complete');
    } finally {
      // Allow poll to re-arm after a tick
      setTimeout(() => { advancingRef.current = false; }, 800);
    }
  };

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

      setApplications((data.applications || []).map(a => ({
        ...a,
        corporateId: profile.corporateId,
        merchantIDName: a.merchantIDName || a.merchantName,
      })));
      setActiveMidIndex(0);
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

      const apps = data.applications.map(a => ({
        ...a,
        corporateId: profile.corporateId,
        merchantIDName: a.merchantIDName || a.merchantName,
      }));
      setApplications(apps);

      // Sync local Signed flags from package ground truth (avoids MSPWare on admin lists)
      for (const s of requiredSigners) {
        if (s.identityStatus === 'Signed') continue;
        const email = signerEmailKey(s);
        if (!email) continue;
        const allDone = apps.length > 0 && apps.every(app => {
          if (app.error) return true; // don't block on errored apps
          const link = findSignerLink(app, email);
          return link?.signed === true;
        });
        if (allDone) {
          await markSignerSignedLocally(s);
        }
      }

      if (phase === 'signing' && activeSigner) {
        const link = findSignerLink(apps[activeMidIndex], activeSigner.signerEmail);
        if (link?.signed) {
          await handleSignerMidComplete('poll');
          return;
        }
      }

      if (phase === 'waiting_remote') {
        const refreshed = await invokePortalFunction('manageSigner', {
          action: 'list',
          corporateId: profile.corporateId,
        });
        const list = refreshed.data?.signers || [];
        setRosterSigners(list);
        const req = list.filter(isRequiredSigner);
        if (req.length > 0 && req.every(s => s.identityStatus === 'Signed')) {
          setPhase('complete');
        } else if (apps.length > 0 && apps.every(a => a.allSigned || a.error)) {
          // Package complete even if a local status lagged — mark remaining + complete
          for (const s of req) {
            if (s.identityStatus !== 'Signed') await markSignerSignedLocally(s);
          }
          setPhase('complete');
        }
      }
    } catch (err) {
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

  const showSigningChrome = allVerified && !loadingSigning && applications.length > 0 && !applications.every(a => a.error);
  const isComplete = phase === 'complete' || allRequiredSigned || (packagesAllSigned && remotesOutstanding.length === 0);

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
        <SignerRoster
          profile={profile}
          onValidChange={handleVerifiedChange}
          onSignersChange={handleSignersChange}
        />

        {/* E-Sign Section */}
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-2.5">
            <PenLine className={`w-4 h-4 ${allVerified ? 'text-cb-accent' : 'text-gray-500'}`} />
            <div>
              <p className="text-cb-body font-semibold text-white">Review &amp; Sign Merchant Processing Agreement</p>
              <p className="text-cb-caption normal-case tracking-normal font-normal text-gray-500">Powered by MSPWare — your agreement is generated directly from your application data</p>
            </div>
          </div>

          {!allVerified && (
            <div className="border border-cb-border rounded-cb flex flex-col items-center justify-center py-14 gap-3 bg-cb-surface-raised">
              <div className="w-12 h-12 rounded-full bg-cb-bg border border-cb-border flex items-center justify-center">
                <Lock className="w-6 h-6 text-gray-500" />
              </div>
              <p className="text-cb-body font-semibold text-gray-300">Signing Locked</p>
              <p className="text-cb-body text-gray-500 text-center max-w-sm">
                Owners with ≥25% ownership (and the primary signer) must verify in person or receive a Verify &amp; Sign invite before proceeding. Under-25% owners are listed but skipped.
              </p>
            </div>
          )}

          {allVerified && loadingSigning && (
            <div className="border border-cb-border rounded-cb bg-cb-surface-raised p-5 space-y-3" aria-busy="true" aria-label="Preparing signing documents">
              <div className="skeleton h-4 w-48 !rounded-cb" />
              <div className="skeleton h-3 w-64 !rounded-cb" />
              <div className="skeleton h-40 w-full !rounded-cb mt-2" />
            </div>
          )}

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

          {/* Hot-seat progress: which human + which MID */}
          {showSigningChrome && phase === 'signing' && activeSigner && (
            <div className="border border-cb-border bg-cb-surface-raised rounded-cb px-5 py-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-cb-accent" />
                <p className="text-cb-body text-gray-200">
                  <span className="font-semibold text-white">{activeSigner.firstName} {activeSigner.lastName}</span>
                  <span className="text-gray-500"> is signing</span>
                  {colocatedQueue.length > 1 && (
                    <span className="text-gray-500"> — signer {activeSignerIndex + 1} of {colocatedQueue.length}</span>
                  )}
                </p>
              </div>
              {totalCount > 1 && (
                <p className="text-cb-caption normal-case tracking-normal font-normal text-gray-500">
                  Agreement {Math.min(activeMidIndex + 1, totalCount)} of {totalCount}
                </p>
              )}
            </div>
          )}

          {/* MID pills for the active signer */}
          {showSigningChrome && (phase === 'signing' || isComplete) && (
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2 flex-wrap">
                {applications.map((app, i) => {
                  const link = activeSigner ? findSignerLink(app, activeSigner.signerEmail) : null;
                  const midDone = link?.signed || app.allSigned;
                  return (
                    <button
                      key={app.mspApplicationNo}
                      onClick={() => !app.error && phase === 'signing' && setActiveMidIndex(i)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-cb text-cb-body font-medium transition-colors border ${
                        midDone
                          ? 'border-cb-border bg-cb-surface-raised text-gray-300'
                          : i === activeMidIndex && phase === 'signing'
                          ? 'border-cb-accent/50 bg-cb-accent-muted text-cb-accent'
                          : app.error
                          ? 'border-cb-border bg-cb-surface-raised text-cb-danger cursor-default'
                          : 'border-cb-border bg-cb-surface-raised text-gray-400 hover:border-cb-border-strong'
                      }`}
                    >
                      {midDone
                        ? <CheckCircle2 className="w-3.5 h-3.5 text-cb-success" />
                        : app.error
                        ? <AlertCircle className="w-3.5 h-3.5" />
                        : <span className="w-4 h-4 rounded-full border border-current flex items-center justify-center text-[10px] leading-none">{i + 1}</span>
                      }
                      {app.merchantIDName || app.merchantName}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {showSigningChrome && phase === 'waiting_remote' && (
            <div className="border border-cb-border border-l-2 border-l-cb-accent bg-cb-surface-raised rounded-cb flex items-start gap-3 px-5 py-4">
              <Loader2 className="w-5 h-5 text-cb-accent flex-shrink-0 mt-0.5 animate-spin" />
              <div>
                <p className="text-cb-body font-semibold text-white">Waiting on remote signers</p>
                <p className="text-cb-body text-gray-400 mt-1">
                  In-person signing is done. Remote owners received a Verify &amp; Sign email — this page updates automatically when they finish.
                </p>
                <ul className="mt-2 space-y-1">
                  {remotesOutstanding.map(s => (
                    <li key={s.id} className="text-cb-caption normal-case tracking-normal text-gray-500">
                      {s.firstName} {s.lastName} · {s.signerEmail}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {showSigningChrome && isComplete && (
            <div className="border border-cb-border border-l-2 border-l-cb-success bg-cb-surface-raised rounded-cb flex items-start gap-3 px-5 py-4">
              <CheckCircle2 className="w-5 h-5 text-cb-success flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-cb-body font-semibold text-white">All Agreements Signed</p>
                <p className="text-cb-body text-gray-400 mt-1">
                  Every required owner (≥25% or primary) has signed. Click below to submit for processing.
                </p>
              </div>
            </div>
          )}

          {/* Active signing iframe — per active signer email, not always primary */}
          {showSigningChrome && phase === 'signing' && activeApp && !activeApp.error && iframeUrl && (
            <div className="border border-cb-border rounded-cb overflow-hidden">
              <div className="bg-cb-surface-raised border-b border-cb-border px-5 py-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-cb-accent" />
                  <span className="text-cb-body font-medium text-gray-200">
                    {activeApp.merchantIDName || activeApp.merchantName}
                    {activeSigner && (
                      <span className="text-gray-500 font-normal"> — {activeSigner.firstName} {activeSigner.lastName}</span>
                    )}
                  </span>
                </div>
              </div>
              <iframe
                key={`${activeSigner?.id}-${activeApp.mspApplicationNo}-${iframeUrl}`}
                src={iframeUrl}
                title={`Merchant Processing Agreement — ${activeApp.merchantIDName || activeApp.merchantName}`}
                className="w-full"
                style={{ height: 680, border: 'none', display: 'block' }}
                allow="same-origin"
              />
              <div className="bg-cb-surface-raised border-t border-cb-border px-5 py-3 flex items-center justify-between">
                <p className="text-cb-caption normal-case tracking-normal font-normal text-gray-500">
                  Scroll through the full agreement, then click the signature fields to sign.
                  This page updates automatically when signing is complete.
                </p>
                {totalCount > 1 && activeMidIndex < totalCount - 1 && (
                  <button
                    onClick={() => setActiveMidIndex(i => i + 1)}
                    className="flex-shrink-0 flex items-center gap-1 text-cb-body font-medium text-gray-400 hover:text-white transition-colors ml-4"
                  >
                    Next <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          )}

          {showSigningChrome && phase === 'signing' && activeApp && !activeApp.error && !iframeUrl && !activeLink?.signed && (
            <div className="border border-cb-border border-l-2 border-l-cb-accent bg-cb-surface-raised rounded-cb px-5 py-4">
              <p className="text-cb-body text-gray-300">
                Signing link for {activeSigner?.firstName} isn&apos;t ready yet.
                <button onClick={fetchSigningState} className="ml-2 text-cb-accent font-medium hover:opacity-80">Refresh</button>
              </p>
            </div>
          )}

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

          {showSigningChrome && isComplete && (
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

      {kycSigner && (
        <SignerDetailsModal
          signer={kycSigner}
          corporateId={profile.corporateId}
          profile={profile}
          allowInlineKyc
          onSaved={(updated) => {
            patchRosterSigner(updated);
            setKycSigner(null);
          }}
          onClose={() => setKycSigner(null)}
        />
      )}
    </div>
  );
}
