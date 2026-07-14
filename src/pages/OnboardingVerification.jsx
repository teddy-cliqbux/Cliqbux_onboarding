import { useState, useEffect, useRef, useCallback } from 'react';
import { ArrowLeft, Lock, Loader2, CheckCircle2, AlertCircle, ShieldCheck, PenLine, ChevronRight, Users } from 'lucide-react';
import SignerRoster from '@/components/onboarding/SignerRoster';
import SigningErrorGuide from '@/components/onboarding/SigningErrorGuide';
import SignerDetailsModal from '@/components/onboarding/SignerDetailsModal';
import { invokePortalFunction } from '@/lib/merchantAuthFetch';
import { isRequiredSigner } from '@/lib/signerRules';
import {
  isVerifiedOrHigher,
  isApplicationSigned,
  isInviteOutstanding,
} from '@/lib/signerLifecycle';
import { usePortalLock } from '@/lib/PortalLockContext';

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
 * Concurrent multi-signer coordinator.
 *
 * Each required owner (≥25% or primary) has their own BoldSign URL and can sign
 * from their own instance at the same time:
 *  - This portal session: pick any Verified owner and sign their MIDs (MID-inner).
 *  - Remote owners: /verify?intent=sign on their device (same links, parallel).
 *
 * We no longer serialize humans (signer-outer queue). Submit unlocks when every
 * required owner is locally `Signed` (poll + postMessage remain dual signals).
 */
export default function OnboardingVerification({ profile, locations, initialSignersVerified, onSignersVerified, onBack, onComplete, onNavigate }) {
  const { setPortalLockStatus } = usePortalLock();
  const [allVerified, setAllVerified] = useState(initialSignersVerified || false);
  const [rosterSigners, setRosterSigners] = useState([]);

  const handleVerifiedChange = (v) => {
    setAllVerified(v);
    if (onSignersVerified) onSignersVerified(v);
  };

  const handleSignersChange = (list) => {
    setRosterSigners(Array.isArray(list) ? list : []);
  };

  const [loadingSigning, setLoadingSigning] = useState(false);
  const [signingError, setSigningError]     = useState('');
  const [applications, setApplications]     = useState([]);
  const pollRef = useRef(null);
  // Sticky BoldSign URLs per signer+MID — poll refreshes often return a new link
  // token; if we swap iframe src/key, the frame remounts and wipes in-progress signing.
  const stickySigningUrlsRef = useRef({});

  // Which Verified owner is using the iframe on THIS device (others can sign elsewhere concurrently)
  const [selectedSignerId, setSelectedSignerId] = useState(null);
  const [activeMidIndex, setActiveMidIndex]     = useState(0);
  const [phase, setPhase] = useState('roster'); // roster | signing | complete
  const [kycSigner, setKycSigner] = useState(null);
  const advancingRef = useRef(false);

  const [submitting, setSubmitting]   = useState(false);
  const [submitError, setSubmitError] = useState('');

  const requiredSigners = rosterSigners.filter(isRequiredSigner);
  // Anyone verified+ can use the on-device iframe; invited/opened = remote parallel lane
  const localSigners = requiredSigners.filter(s => isVerifiedOrHigher(s.identityStatus));
  const remotesOutstanding = requiredSigners.filter(s => isInviteOutstanding(s.identityStatus));
  const allRequiredSigned = requiredSigners.length > 0 &&
    requiredSigners.every(s => isApplicationSigned(s.identityStatus));

  // Prefer primary as default selection
  const selectedSigner =
    localSigners.find(s => s.id === selectedSignerId)
    || localSigners.find(s => s.isPrimarySigner)
    || localSigners.find(s => !isApplicationSigned(s.identityStatus) && isVerifiedOrHigher(s.identityStatus))
    || localSigners[0]
    || null;

  const activeApp = applications[activeMidIndex] || null;
  const activeLink = selectedSigner
    ? findSignerLink(activeApp, selectedSigner.signerEmail)
    : null;
  const rawIframeUrl = activeLink?.signingUrl
    || (selectedSigner && profile?.signerEmail &&
        signerEmailKey(selectedSigner) === (profile.signerEmail || '').toLowerCase()
          ? activeApp?.signingUrl
          : null);
  // Hold the first good URL for this signer+MID so 5s polls don't remount BoldSign
  const stickyFrameKey = selectedSigner && activeApp?.mspApplicationNo != null
    ? `${selectedSigner.id}:${activeApp.mspApplicationNo}`
    : null;
  if (stickyFrameKey && rawIframeUrl && !stickySigningUrlsRef.current[stickyFrameKey]) {
    stickySigningUrlsRef.current[stickyFrameKey] = rawIframeUrl;
  }
  const iframeUrl = (stickyFrameKey && stickySigningUrlsRef.current[stickyFrameKey]) || rawIframeUrl || null;

  const totalCount = applications.length;
  const packagesAllSigned = totalCount > 0 && applications.every(a => a.allSigned || a.error);
  const anyMissingLinks = applications.some(a =>
    (a.missingSignerEmails || []).length > 0
  );

  // ── Kick off package prep once roster unlocks ─────────────────────────────
  useEffect(() => {
    const hasOnlyErrors = applications.length > 0 && applications.every(a => a.error);
    if (allVerified && (applications.length === 0 || hasOnlyErrors) && !loadingSigning) {
      fetchSigningState();
    }
  }, [allVerified]);

  // When a co-owner becomes Verified after packages loaded, rebuild so their links appear
  const prevLocalCountRef = useRef(0);
  useEffect(() => {
    const count = localSigners.length;
    if (allVerified && applications.length > 0 && count > prevLocalCountRef.current && prevLocalCountRef.current > 0) {
      fetchSigningState();
    }
    prevLocalCountRef.current = count;
  }, [localSigners.length, allVerified]);

  useEffect(() => {
    if (!allVerified || loadingSigning || applications.length === 0) return;
    if (applications.every(a => a.error)) return;

    if (allRequiredSigned || packagesAllSigned) {
      setPhase('complete');
      return;
    }
    setPhase('signing');
    if (!selectedSignerId && selectedSigner) {
      setSelectedSignerId(selectedSigner.id);
    }
  }, [allVerified, loadingSigning, applications, rosterSigners, allRequiredSigned, packagesAllSigned]);

  useEffect(() => {
    if (phase !== 'signing' && phase !== 'complete') {
      clearInterval(pollRef.current);
      return;
    }
    if (phase === 'complete') {
      clearInterval(pollRef.current);
      return;
    }
    pollRef.current = setInterval(pollSigningStatus, POLL_INTERVAL_MS);
    return () => clearInterval(pollRef.current);
  }, [phase, selectedSignerId, activeMidIndex]);

  useEffect(() => {
    if (phase !== 'signing') return;
    const onMessage = (event) => {
      if (event.origin !== BOLDSIGN_ORIGIN) return;
      const action = event.data?.action || event.data?.type;
      if (action !== 'onDocumentSigned') return;
      handleSelectedMidComplete('postMessage');
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [phase, selectedSignerId, activeMidIndex, applications]);

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
    if (!signer?.id || isApplicationSigned(signer.identityStatus)) return signer;
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

  /** After the selected on-device signer finishes one MID — advance MID only (not the next human). */
  const handleSelectedMidComplete = async () => {
    if (advancingRef.current) return;
    advancingRef.current = true;
    try {
      const signer = selectedSigner;
      if (!signer) return;

      setApplications(prev => prev.map((app, i) => {
        if (i !== activeMidIndex) return app;
        const signers = (app.signers || []).map(s =>
          (s.email || '').toLowerCase() === signerEmailKey(signer)
            ? { ...s, signed: true, status: 'signed' }
            : s
        );
        const allSigned = signers.length > 0 && requiredSigners.every(req => {
          const row = signers.find(s => (s.email || '').toLowerCase() === signerEmailKey(req));
          return !row || row.signed;
        });
        return { ...app, signers, allSigned };
      }));

      let jump = activeMidIndex + 1;
      while (jump < applications.length && applications[jump]?.error) jump++;
      if (jump < applications.length) {
        setActiveMidIndex(jump);
        return;
      }

      // Finished the on-device queue — only persist "application signed" if every
      // non-error MID actually has this signer marked signed (not merely skipped errors).
      const signable = applications.filter(a => !a.error);
      const reallyDone = signable.length > 0 && signable.every(app => {
        const row = findSignerLink(app, signer.signerEmail);
        return row?.signed === true;
      });
      if (reallyDone) {
        await markSignerSignedLocally(signer);
      }

      // Pick next unsigned local signer for convenience (others may already be signing remotely)
      const nextLocal = localSigners.find(s =>
        s.id !== signer.id && isVerifiedOrHigher(s.identityStatus) && !isApplicationSigned(s.identityStatus)
      );
      if (nextLocal) {
        setSelectedSignerId(nextLocal.id);
        setActiveMidIndex(0);
      }
    } finally {
      setTimeout(() => { advancingRef.current = false; }, 800);
    }
  };

  const fetchSigningState = async () => {
    setLoadingSigning(true);
    setSigningError('');
    stickySigningUrlsRef.current = {};
    try {
      const res  = await invokePortalFunction('signApplication', { corporateId: profile.corporateId });
      const data = res.data;

      if (!data?.success) {
        const parts = [data?.hint, data?.error].filter(Boolean);
        // Prefer hint (detailed draft failure) over generic error
        setSigningError(parts[0] || 'Unable to prepare signing documents.');
        return;
      }

      setApplications((data.applications || []).map(a => ({
        ...a,
        corporateId: profile.corporateId,
        merchantIDName: a.merchantIDName || a.merchantName,
      })));
      if (data.portalLockStatus && setPortalLockStatus) {
        setPortalLockStatus(data.portalLockStatus);
      }
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

      const incoming = data.applications.map(a => ({
        ...a,
        corporateId: profile.corporateId,
        merchantIDName: a.merchantIDName || a.merchantName,
      }));

      // Merge poll results but KEEP existing signing URLs while unsigned.
      // BoldSign link endpoints often return a new token each call; swapping
      // iframe src remounts the frame and wipes signature progress (~every 5s).
      setApplications(prev => incoming.map((app) => {
        const prevApp = prev.find(
          p => String(p.mspApplicationNo) === String(app.mspApplicationNo)
        );
        const mergedSigners = (app.signers || []).map((s) => {
          const prevS = (prevApp?.signers || []).find(
            ps => (ps.email || '').toLowerCase().trim() === (s.email || '').toLowerCase().trim()
          );
          const keepUrl = !s.signed && prevS?.signingUrl;
          return {
            ...s,
            signingUrl: keepUrl ? prevS.signingUrl : (s.signingUrl || prevS?.signingUrl || null),
          };
        });
        return {
          ...app,
          signers: mergedSigners,
          signingUrl: (!app.allSigned && prevApp?.signingUrl)
            ? prevApp.signingUrl
            : (app.signingUrl || prevApp?.signingUrl || null),
        };
      }));

      const apps = incoming; // use fresh signed flags for completion checks below

      // Refresh roster so remote markSigned shows up
      try {
        const listRes = await invokePortalFunction('manageSigner', {
          action: 'list',
          corporateId: profile.corporateId,
        });
        if (listRes.data?.signers) setRosterSigners(listRes.data.signers);
      } catch { /* non-fatal */ }

      // Only mark application signed when THIS signer's BoldSign rows are actually
      // signed. Never treat app.error / missing package as completion — that was
      // falsely promoting Verified owners to "application signed".
      for (const s of requiredSigners) {
        if (isApplicationSigned(s.identityStatus)) continue;
        const email = signerEmailKey(s);
        if (!email) continue;
        const signableApps = apps.filter(app => !app.error);
        if (signableApps.length === 0) continue;
        const allDone = signableApps.every(app => {
          const link = findSignerLink(app, email);
          return link?.signed === true;
        });
        if (allDone) await markSignerSignedLocally(s);
      }

      if (selectedSigner) {
        const link = findSignerLink(apps[activeMidIndex], selectedSigner.signerEmail);
        if (link?.signed) {
          await handleSelectedMidComplete();
        }
      }

      const req = (await invokePortalFunction('manageSigner', {
        action: 'list',
        corporateId: profile.corporateId,
      }).catch(() => null))?.data?.signers?.filter(isRequiredSigner) || requiredSigners;

      if (req.length > 0 && req.every(s => isApplicationSigned(s.identityStatus))) {
        setPhase('complete');
      }
      // Do NOT blanket-mark all signers when apps have errors or package prep failed.
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

  const selectSignerForDevice = (signer) => {
    if (!signer || isInviteOutstanding(signer.identityStatus)) return;
    if (!isVerifiedOrHigher(signer.identityStatus)) {
      setKycSigner(signer);
      return;
    }
    setSelectedSignerId(signer.id);
    setActiveMidIndex(0);
    setPhase('signing');
  };

  const showSigningChrome = allVerified && !loadingSigning && applications.length > 0 && !applications.every(a => a.error);
  const isComplete = phase === 'complete' || allRequiredSigned || packagesAllSigned;

  return (
    <div className="flex flex-col">
      <div className="px-8 pt-10 pb-8 border-b border-cb-border">
        <p className="text-cb-caption uppercase text-gray-500 mb-2">Step 4 of 4 — Identity &amp; Signing</p>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="font-display text-cb-display text-white mb-2">Principal &amp; Corporate Verification</h2>
            <p className="text-cb-body-lg text-gray-400 max-w-xl">Verify all beneficial owners, then review and sign your Merchant Processing Agreement. Each owner can sign from their own device at the same time.</p>
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
          onSignHere={selectSignerForDevice}
          selectedSignerId={selectedSigner?.id}
        />

        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-2.5">
            <PenLine className={`w-4 h-4 ${allVerified ? 'text-cb-accent' : 'text-gray-500'}`} />
            <div>
              <p className="text-cb-body font-semibold text-white">Review &amp; Sign Merchant Processing Agreement</p>
              <p className="text-cb-caption normal-case tracking-normal font-normal text-gray-500">Powered by MSPWare — each owner gets their own signing link; sign concurrently from separate devices</p>
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

          {/* Concurrent signer picker — who is using THIS device's iframe */}
          {showSigningChrome && !isComplete && localSigners.length > 0 && (
            <div className="border border-cb-border bg-cb-surface-raised rounded-cb px-5 py-3 flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-cb-accent" />
                <p className="text-cb-body text-gray-300">
                  Signing on this device as
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {localSigners.map(s => {
                  const done = isApplicationSigned(s.identityStatus);
                  const active = selectedSigner?.id === s.id;
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => selectSignerForDevice(s)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-cb text-cb-body font-medium border transition-colors ${
                        done
                          ? 'border-cb-border bg-cb-bg text-gray-400'
                          : active
                          ? 'border-cb-accent/50 bg-cb-accent-muted text-cb-accent'
                          : 'border-cb-border text-gray-300 hover:border-cb-border-strong'
                      }`}
                    >
                      {done ? <CheckCircle2 className="w-3.5 h-3.5 text-cb-success" /> : null}
                      {s.firstName} {s.lastName}
                      {s.isPrimarySigner ? ' (Primary)' : ''}
                    </button>
                  );
                })}
              </div>
              {remotesOutstanding.length > 0 && (
                <p className="text-cb-caption normal-case tracking-normal font-normal text-gray-500">
                  Remote: {remotesOutstanding.map(s => `${s.firstName} ${s.lastName}`).join(', ')} — signing via their email link in parallel.
                </p>
              )}
            </div>
          )}

          {showSigningChrome && anyMissingLinks && !isComplete && (
            <div className="border border-cb-border border-l-2 border-l-cb-accent bg-cb-surface-raised rounded-cb px-5 py-4 flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-cb-accent flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-cb-body font-semibold text-white">Some signer links need a refresh</p>
                <p className="text-cb-body text-gray-400 mt-1">
                  A co-owner may have been added after documents were prepared. Refresh rebuilds unsigned packages so every owner gets their own link.
                </p>
                <button onClick={fetchSigningState} className="mt-2 text-cb-body font-medium text-cb-accent hover:opacity-80">
                  Refresh signing documents
                </button>
              </div>
            </div>
          )}

          {showSigningChrome && (phase === 'signing' || isComplete) && (
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2 flex-wrap">
                {applications.map((app, i) => {
                  const link = selectedSigner ? findSignerLink(app, selectedSigner.signerEmail) : null;
                  const midDone = link?.signed || app.allSigned;
                  return (
                    <button
                      key={app.mspApplicationNo}
                      onClick={() => !app.error && !isComplete && setActiveMidIndex(i)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-cb text-cb-body font-medium transition-colors border ${
                        midDone
                          ? 'border-cb-border bg-cb-surface-raised text-gray-300'
                          : i === activeMidIndex && !isComplete
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
              {selectedSigner && totalCount > 1 && !isComplete && (
                <p className="text-cb-caption normal-case tracking-normal font-normal text-gray-500">
                  {selectedSigner.firstName}&apos;s agreements — {Math.min(activeMidIndex + 1, totalCount)} of {totalCount}
                </p>
              )}
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

          {showSigningChrome && !isComplete && activeApp && !activeApp.error && iframeUrl && selectedSigner && (
            <div className="border border-cb-border rounded-cb overflow-hidden">
              <div className="bg-cb-surface-raised border-b border-cb-border px-5 py-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-cb-accent" />
                  <span className="text-cb-body font-medium text-gray-200">
                    {activeApp.merchantIDName || activeApp.merchantName}
                    <span className="text-gray-500 font-normal"> — {selectedSigner.firstName} {selectedSigner.lastName}</span>
                  </span>
                </div>
              </div>
              <iframe
                key={stickyFrameKey || `${selectedSigner.id}-${activeApp.mspApplicationNo}`}
                src={iframeUrl}
                title={`Merchant Processing Agreement — ${activeApp.merchantIDName || activeApp.merchantName}`}
                className="w-full"
                style={{ height: 680, border: 'none', display: 'block' }}
                allow="same-origin"
              />
              <div className="bg-cb-surface-raised border-t border-cb-border px-5 py-3 flex items-center justify-between">
                <p className="text-cb-caption normal-case tracking-normal font-normal text-gray-500">
                  Other owners can sign on their own devices at the same time. Switch who is signing above anytime.
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

          {showSigningChrome && !isComplete && selectedSigner && activeApp && !activeApp.error && !iframeUrl && !activeLink?.signed && (
            <div className="border border-cb-border border-l-2 border-l-cb-accent bg-cb-surface-raised rounded-cb px-5 py-4">
              <p className="text-cb-body text-gray-300">
                Signing link for {selectedSigner.firstName} isn&apos;t ready yet.
                <button onClick={fetchSigningState} className="ml-2 text-cb-accent font-medium hover:opacity-80">Refresh documents</button>
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
            setSelectedSignerId(updated.id);
            fetchSigningState();
          }}
          onClose={() => setKycSigner(null)}
        />
      )}
    </div>
  );
}
