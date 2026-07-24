import { useState, useEffect, useRef, useCallback } from 'react';
import { ArrowLeft, Lock, Loader2, CheckCircle2, AlertCircle, ShieldCheck, PenLine, ChevronRight, Users } from 'lucide-react';
import SignerRoster from '@/components/onboarding/SignerRoster';
import KycActivityStrip from '@/components/onboarding/KycActivityStrip';
import SigningErrorGuide from '@/components/onboarding/SigningErrorGuide';
import SignerDetailsModal from '@/components/onboarding/SignerDetailsModal';
import { invokePortalFunction, merchantTokenHasImp } from '@/lib/merchantAuthFetch';
import { isEffectivelyRequiredSigner, needsKyc, isKycComplete } from '@/lib/signerRules';
import {
  isVerifiedOrHigher,
  isApplicationSigned,
  isInviteOutstanding,
} from '@/lib/signerLifecycle';
import { usePortalLock } from '@/lib/PortalLockContext';
import { applyPortalLockFromSigningResponse, isPortalFormsLocked } from '@/lib/portalLock';
import {
  rememberSigningFixStep,
  clearSigningFixStep,
  resolveSigningFixStep,
} from '@/lib/signingErrorRouting';
import { SigningLoadWait, SigningIframeOverlay } from '@/components/onboarding/SigningLoadWait';
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
 * Application Signing — last onboarding step.
 * BoldSign / submit only. People & KYC is a separate earlier step.
 * Hard gate: all AML KYC must be verified before packages are staged.
 */
export default function OnboardingSigning({ profile, locations, initialSignersVerified, onSignersVerified, onBack, onComplete, onNavigate }) {
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
  const [prepareReport, setPrepareReport]   = useState(null); // { allReady, mids }
  const [preparing, setPreparing]           = useState(false);
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
  const [iframeReady, setIframeReady] = useState(false);
  const autoFinishRef = useRef(false);
  const applicationsRef = useRef(applications);
  const requiredSignersRef = useRef([]);
  const selectedSignerRef = useRef(null);

  const requiredSigners = rosterSigners.filter((s) => isEffectivelyRequiredSigner(s, rosterSigners));
  // Anyone verified+ can use the on-device iframe; invited/opened = remote parallel lane
  const localSigners = requiredSigners.filter(s => isVerifiedOrHigher(s.identityStatus));
  const remotesOutstanding = requiredSigners.filter(s => isInviteOutstanding(s.identityStatus));
  const allRequiredSigned = requiredSigners.length > 0 &&
    requiredSigners.every(s => isApplicationSigned(s.identityStatus));

  const isAgentPreview = merchantTokenHasImp()
    || (profile?.corporateId && typeof sessionStorage !== 'undefined'
      && sessionStorage.getItem('portal_impersonating') === String(profile.corporateId));

  // Prefer primary as default selection
  const selectedSigner =
    localSigners.find(s => s.id === selectedSignerId)
    || localSigners.find(s => s.isPrimarySigner)
    || localSigners.find(s => !isApplicationSigned(s.identityStatus) && isVerifiedOrHigher(s.identityStatus))
    || localSigners[0]
    || null;

  applicationsRef.current = applications;
  requiredSignersRef.current = requiredSigners;
  selectedSignerRef.current = selectedSigner;

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

  // Reset iframe paint wait whenever the sticky BoldSign URL / signer+MID changes
  useEffect(() => {
    setIframeReady(false);
  }, [stickyFrameKey, iframeUrl]);

  const totalCount = applications.length;
  const packagesAllSigned = totalCount > 0 && applications.every(a => a.allSigned || a.error);
  const anyMissingLinks = applications.some(a =>
    (a.missingSignerEmails || []).length > 0
  );

  // Do NOT auto-create packages. Restore existing packages only when already locked
  // for signing (read-only statusOnly). Unlocked deals stay quiet until Prepare / Sign.
  const restoreAttemptedRef = useRef(false);

  useEffect(() => {
    if (restoreAttemptedRef.current) return;
    if (loadingSigning || applications.length > 0) return;
    const lock = String(profile?.portalLockStatus || '').toLowerCase();
    const shouldRestore = isPortalFormsLocked(profile)
      || ['signing', 'pending_signature', 'all_signed'].includes(lock);
    if (!shouldRestore) return;
    restoreAttemptedRef.current = true;
    fetchSigningState({ restoreOnly: true });
  }, [loadingSigning, applications.length, profile?.portalLockStatus, profile?.applicationStatus, profile?.corporateId]);

  // Stuck lock while waiting on remote KYC — unlock UI locally (never call signApplication to "heal").
  const kycHealAttemptedRef = useRef(false);
  useEffect(() => {
    if (kycHealAttemptedRef.current) return;
    if (allVerified || !profile?.corporateId) return;
    if (!isPortalFormsLocked(profile)) return;
    kycHealAttemptedRef.current = true;
    setPortalLockStatus('unlocked');
  }, [allVerified, profile?.portalLockStatus, profile?.applicationStatus, profile?.corporateId]);

  // When packages exist and are usable, enter signing phase
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
      const signer = selectedSignerRef.current;
      const required = requiredSignersRef.current;
      if (!signer) return;

      // Build next apps locally — setState is async; reading stale `applications`
      // would miss the MID we just marked signed (stuck on Verified forever).
      const nextApps = applicationsRef.current.map((app, i) => {
        if (i !== activeMidIndex) return app;
        const signers = (app.signers || []).map(s =>
          (s.email || '').toLowerCase() === signerEmailKey(signer)
            ? { ...s, signed: true, status: 'signed' }
            : s
        );
        const allSigned = signers.length > 0 && required.every(req => {
          const row = signers.find(s => (s.email || '').toLowerCase() === signerEmailKey(req));
          return !row || row.signed;
        });
        return { ...app, signers, allSigned: allSigned || app.allSigned };
      });
      setApplications(nextApps);
      applicationsRef.current = nextApps;

      let jump = activeMidIndex + 1;
      while (jump < nextApps.length && nextApps[jump]?.error) jump++;
      if (jump < nextApps.length) {
        setActiveMidIndex(jump);
        return;
      }

      const signable = nextApps.filter(a => !a.error);
      const reallyDone = signable.length > 0 && signable.every(app => {
        const row = findSignerLink(app, signer.signerEmail);
        return row?.signed === true || app.allSigned === true;
      });
      if (reallyDone) {
        await markSignerSignedLocally(signer);
        setPhase('complete');
      }

      const nextLocal = required
        .filter(s => isVerifiedOrHigher(s.identityStatus))
        .find(s =>
          s.id !== signer.id && !isApplicationSigned(s.identityStatus)
        );
      if (nextLocal) {
        setSelectedSignerId(nextLocal.id);
        setActiveMidIndex(0);
      }
    } finally {
      setTimeout(() => { advancingRef.current = false; }, 800);
    }
  };

  const prepareForm = async () => {
    if (!profile?.corporateId || preparing) return;
    // Merchants need KYC; agents may prepare anytime
    if (!allVerified && !isAgentPreview) {
      setSigningError('Finish identity verification for every Beneficial Owner and the Control Person before preparing the form.');
      return;
    }
    setPreparing(true);
    setSigningError('');
    try {
      const res = await invokePortalFunction('prepareMSPForms', { corporateId: profile.corporateId });
      const data = res.data;
      if (data?.error && !data?.mids) {
        setSigningError(data.error || 'Prepare form failed.');
        setPrepareReport(null);
        return;
      }
      setPrepareReport({
        allReady: !!data?.allReady,
        mids: data?.mids || [],
        message: data?.message || null,
      });
      if (!data?.allReady) {
        const gaps = (data?.mids || [])
          .filter((m) => !m.ready)
          .map((m) => `${m.dbaName || m.mspApplicationNo || m.midId}: ${m.percentComplete ?? '?'}% — ${(m.errors || []).slice(0, 3).join('; ') || 'incomplete'}`)
          .join(' | ');
        setSigningError(gaps || data?.error || 'Form is not 100% yet. Fix the listed fields and Prepare again.');
        rememberSigningFixStep(profile.corporateId, resolveSigningFixStep([], [gaps, data?.error].filter(Boolean)));
      } else {
        setSigningError('');
        clearSigningFixStep(profile.corporateId);
      }
    } catch (err) {
      setSigningError(err.message || 'Prepare form failed.');
      setPrepareReport(null);
    } finally {
      setPreparing(false);
    }
  };

  const fetchSigningState = async ({ restoreOnly = false } = {}) => {
    // Full Sign (packages) requires KYC. Restore/statusOnly can run when locked without re-KYC.
    if (!restoreOnly && !allVerified) {
      setSigningError('Finish identity verification for every Beneficial Owner and the Control Person before signing.');
      return;
    }
    setLoadingSigning(true);
    setSigningError('');
    if (!restoreOnly) stickySigningUrlsRef.current = {};
    try {
      const res = await invokePortalFunction('signApplication', {
        corporateId: profile.corporateId,
        ...(restoreOnly ? { statusOnly: true, restoreOnly: true } : {}),
      });
      const data = res.data;

      if (!data?.success) {
        const parts = [data?.hint, data?.error].filter(Boolean);
        if (!restoreOnly) {
          setSigningError(parts[0] || 'Unable to start signing.');
        }
        if (data?.code === 'KYC_INCOMPLETE' || data?.code === 'PREPARE_REQUIRED' || data?.code === 'FORMS_NOT_READY') {
          applyPortalLockFromSigningResponse(data || {}, setPortalLockStatus);
        } else if (!restoreOnly) {
          applyPortalLockFromSigningResponse(data || {}, setPortalLockStatus);
        }
        rememberSigningFixStep(
          profile.corporateId,
          resolveSigningFixStep([], [data?.hint, data?.error].filter(Boolean))
        );
        return;
      }

      const apps = (data.applications || []).map(a => ({
        ...a,
        corporateId: profile.corporateId,
        merchantIDName: a.merchantIDName || a.merchantName,
      }));
      setApplications(apps);
      if (!restoreOnly) {
        applyPortalLockFromSigningResponse(data, setPortalLockStatus);
      } else if (data?.hasUsableSigningPackage) {
        applyPortalLockFromSigningResponse(data, setPortalLockStatus);
      }

      const failed = apps.filter(a => a.error);
      const usable = apps.some(a =>
        !a.error && (a.signingUrl || (a.signers || []).some(s => s.signingUrl || s.signed))
      );
      if (usable && profile?.corporateId && typeof sessionStorage !== 'undefined') {
        sessionStorage.setItem(`signing_prepared_${profile.corporateId}`, '1');
      }
      if (failed.length > 0 && !usable) {
        rememberSigningFixStep(profile.corporateId, resolveSigningFixStep(failed));
        if (!restoreOnly) setPhase('roster');
      } else {
        clearSigningFixStep(profile.corporateId);
        if (usable) setPhase('signing');
      }
      setActiveMidIndex(0);
    } catch (err) {
      if (!restoreOnly) {
        setSigningError(err.message || 'Failed to start signing.');
        applyPortalLockFromSigningResponse({}, setPortalLockStatus);
      }
      rememberSigningFixStep(profile.corporateId, 'verify');
    } finally {
      setLoadingSigning(false);
    }
  };

  const pollSigningStatus = async () => {
    try {
      const res  = await invokePortalFunction('signApplication', {
        corporateId: profile.corporateId,
        statusOnly: true,
        restoreOnly: true,
      });
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
      }).catch(() => null))?.data?.signers?.filter((s) => isEffectivelyRequiredSigner(s, rosterSigners)) || requiredSigners;

      if (req.length > 0 && req.every(s => isApplicationSigned(s.identityStatus))) {
        setPhase('complete');
      }
      // Keep lock in sync with package usability (failed retries unlock).
      applyPortalLockFromSigningResponse(data, setPortalLockStatus);
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
  const formsReady = !!prepareReport?.allReady;
  const packagesLikelyExist = isPortalFormsLocked(profile)
    || ['signing', 'pending_signature', 'all_signed'].includes(String(profile?.portalLockStatus || '').toLowerCase())
    || (typeof sessionStorage !== 'undefined'
      && profile?.corporateId
      && sessionStorage.getItem(`signing_prepared_${profile.corporateId}`) === '1');
  const canSign = allVerified && formsReady && !packagesLikelyExist && applications.length === 0;

  // After BoldSign completes, merchants land in Merchant Center (agents stay to preview).
  useEffect(() => {
    if (!isComplete || isAgentPreview || autoFinishRef.current) return;
    if (!profile?.corporateId || typeof onComplete !== 'function') return;
    autoFinishRef.current = true;
    (async () => {
      for (const s of requiredSigners) {
        if (!isApplicationSigned(s.identityStatus)) {
          await markSignerSignedLocally(s);
        }
      }
      try {
        await invokePortalFunction('submitToMSP', { corporateId: profile.corporateId });
      } catch (err) {
        console.warn('[OnboardingVerification] auto submitToMSP', err?.message || err);
      }
      onComplete();
    })();
  }, [isComplete, isAgentPreview, profile?.corporateId, onComplete]);

  return (
    <div className="flex flex-col">
      <div className="px-8 pt-10 pb-8 border-b border-cb-border">
        <p className="text-cb-caption uppercase text-gray-500 mb-2">Step 4 of 4 — Sign &amp; Submit</p>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="font-display text-cb-display text-white mb-2">Sign Merchant Agreement</h2>
            <p className="text-cb-body-lg text-gray-400 max-w-xl">
              Once every Beneficial Owner and the Control Person have finished identity verification, the Control Person signs the Merchant Processing Agreement and submits for underwriting.
            </p>
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
        <KycActivityStrip signers={rosterSigners} />

        {!allVerified && (
          <div className="border border-cb-border rounded-cb bg-cb-surface-raised border-l-2 border-l-cb-accent px-5 py-5 flex flex-col gap-3">
            <p className="text-cb-body font-semibold text-white">Waiting on identity verification</p>
            <p className="text-cb-body text-gray-400">
              Signing documents are not prepared yet — that keeps Locations and Banking editable. Finish KYC on the People step or wait for remote owners. You can keep working elsewhere while you wait.
            </p>
            <ul className="space-y-1">
              {rosterSigners.filter((s) => needsKyc(s) && !isKycComplete(s)).map((s) => (
                <li key={s.id} className="text-cb-caption normal-case tracking-normal text-gray-500">
                  {s.firstName} {s.lastName}
                  {isInviteOutstanding(s.identityStatus) ? ' — invite sent' : ' — needs verify or invite'}
                </li>
              ))}
            </ul>
            <div className="flex flex-wrap gap-2 pt-1">
              <button
                type="button"
                onClick={() => onNavigate?.('people')}
                className="text-cb-body font-medium text-cb-bg bg-cb-accent hover:opacity-90 px-4 py-2 rounded-cb transition-opacity"
              >
                Open People &amp; KYC
              </button>
              <button
                type="button"
                onClick={() => onNavigate?.('locations')}
                className="text-cb-body font-medium text-gray-300 border border-cb-border hover:border-cb-border-strong px-4 py-2 rounded-cb transition-colors"
              >
                Go to Locations
              </button>
              <button
                type="button"
                onClick={() => onNavigate?.('banking')}
                className="text-cb-body font-medium text-gray-300 border border-cb-border hover:border-cb-border-strong px-4 py-2 rounded-cb transition-colors"
              >
                Go to Banking
              </button>
            </div>
          </div>
        )}

        <SignerRoster
          profile={profile}
          mode="signing"
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
              <p className="text-cb-caption normal-case tracking-normal font-normal text-gray-500">Powered by MSPWare — only the Control Person signs; beneficial owners provide KYC for AML</p>
            </div>
          </div>

          {!allVerified && !isAgentPreview && (
            <div className="border border-cb-border rounded-cb flex flex-col items-center justify-center py-10 gap-3 bg-cb-surface-raised px-5">
              <div className="w-12 h-12 rounded-full bg-cb-bg border border-cb-border flex items-center justify-center">
                <Lock className="w-6 h-6 text-gray-500" />
              </div>
              <p className="text-cb-body font-semibold text-gray-300">Signing not ready yet</p>
              <p className="text-cb-body text-gray-500 text-center max-w-sm">
                Prepare form unlocks after the roster shows Ready to sign. Use People &amp; KYC to invite remotes or verify on this device.
              </p>
            </div>
          )}

          {(allVerified || isAgentPreview) && (preparing || loadingSigning) && (
            <SigningLoadWait />
          )}

          {(allVerified || isAgentPreview) && !loadingSigning && !preparing && applications.length === 0 && (
            <div className="border border-cb-border rounded-cb bg-cb-surface-raised px-5 py-6 flex flex-col items-center gap-3 text-center">
              {isAgentPreview && (
                <p className="text-cb-caption normal-case tracking-normal text-cb-accent max-w-md">
                  {allVerified
                    ? 'Agent preview — Prepare form fills MSPWare (no packages). Sign creates BoldSign links and locks forms.'
                    : 'Agent tip: you can Prepare form before all KYC is done to see missing MSP fields. Sign still requires full KYC.'}
                </p>
              )}
              {packagesLikelyExist ? (
                <>
                  <p className="text-cb-body text-gray-300 max-w-md">
                    Signing packages already exist. Load them to continue or preview the live BoldSign links.
                  </p>
                  <button
                    type="button"
                    onClick={() => fetchSigningState({ restoreOnly: true })}
                    className="flex items-center gap-2 text-cb-body font-semibold text-cb-bg bg-cb-accent hover:opacity-90 px-5 py-2.5 rounded-cb transition-opacity"
                  >
                    <PenLine className="w-4 h-4" />
                    {isAgentPreview ? 'Load Signing Documents' : 'Resume Signing'}
                  </button>
                </>
              ) : (
                <>
                  <p className="text-cb-body text-gray-300 max-w-md">
                    {formsReady
                      ? 'MSPWare forms are 100% complete. Sign to create the BoldSign package and lock edits.'
                      : 'Prepare form fills MSPWare and lists any missing fields. Sign only appears when every MID is 100%.'}
                  </p>
                  {prepareReport?.mids?.length > 0 && (
                    <ul className="text-left w-full max-w-md space-y-1 text-cb-caption normal-case tracking-normal text-gray-500">
                      {prepareReport.mids.map((m) => (
                        <li key={m.midId || m.mspApplicationNo}>
                          <span className={m.ready ? 'text-cb-success' : 'text-cb-danger'}>
                            {m.ready ? '✓' : '•'}
                          </span>{' '}
                          {m.dbaName || m.mspApplicationNo}: {m.percentComplete ?? '?'}%
                          {!m.ready && m.errors?.length ? ` — ${m.errors[0]}` : ''}
                        </li>
                      ))}
                    </ul>
                  )}
                  <div className="flex flex-wrap items-center justify-center gap-2">
                    <button
                      type="button"
                      onClick={prepareForm}
                      disabled={preparing}
                      className="flex items-center gap-2 text-cb-body font-semibold text-cb-bg bg-cb-accent hover:opacity-90 px-5 py-2.5 rounded-cb transition-opacity disabled:opacity-50"
                    >
                      {preparing ? 'Preparing…' : 'Prepare form'}
                    </button>
                    {canSign && (
                      <button
                        type="button"
                        onClick={() => fetchSigningState()}
                        disabled={loadingSigning}
                        className="flex items-center gap-2 text-cb-body font-semibold text-white border border-cb-border hover:border-cb-accent px-5 py-2.5 rounded-cb transition-colors disabled:opacity-50"
                      >
                        <PenLine className="w-4 h-4" />
                        Sign agreement
                      </button>
                    )}
                  </div>
                </>
              )}
              {signingError && !preparing && applications.length === 0 && (
                <p className="text-cb-body text-cb-danger max-w-lg mt-1" role="alert">{signingError}</p>
              )}
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
                <p className="text-cb-body font-semibold text-white">Signing link needs a refresh</p>
                <p className="text-cb-body text-gray-400 mt-1">
                  The Control Person&apos;s BoldSign link may be stale. Refresh rebuilds the unsigned package
                  (only the Control Person signs — Beneficial Owners complete KYC only).
                </p>
                <button onClick={() => fetchSigningState()} className="mt-2 text-cb-body font-medium text-cb-accent hover:opacity-80">
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
                  The Control Person has signed. Click below to finish and open Merchant Center.
                </p>
              </div>
            </div>
          )}

          {showSigningChrome && !isComplete && activeApp && !activeApp.error && iframeUrl && selectedSigner && (
            <div className="border border-cb-border rounded-cb overflow-hidden">
              {isAgentPreview && (
                <div className="bg-cb-accent-muted border-b border-cb-border px-5 py-2.5">
                  <p className="text-cb-caption normal-case tracking-normal text-cb-accent">
                    Agent preview of the merchant&apos;s BoldSign link — same URL the merchant sees. Confirm it loads; avoid finishing the signature for them.
                  </p>
                </div>
              )}
              <div className="bg-cb-surface-raised border-b border-cb-border px-5 py-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-cb-accent" />
                  <span className="text-cb-body font-medium text-gray-200">
                    {activeApp.merchantIDName || activeApp.merchantName}
                    <span className="text-gray-500 font-normal"> — {selectedSigner.firstName} {selectedSigner.lastName}</span>
                  </span>
                </div>
              </div>
              <div className="relative" style={{ minHeight: 680 }}>
                <SigningIframeOverlay visible={!!iframeUrl && !iframeReady} />
                <iframe
                  key={stickyFrameKey || `${selectedSigner.id}-${activeApp.mspApplicationNo}`}
                  src={iframeUrl}
                  title={`Merchant Processing Agreement — ${activeApp.merchantIDName || activeApp.merchantName}`}
                  className="w-full"
                  style={{ height: 680, border: 'none', display: 'block' }}
                  allow="same-origin"
                  onLoad={() => setIframeReady(true)}
                />
              </div>
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
                <button onClick={() => fetchSigningState()} className="ml-2 text-cb-accent font-medium hover:opacity-80">Refresh documents</button>
              </p>
            </div>
          )}

          {allVerified && !loadingSigning && applications.filter(a => a.error).map(app => (
            <SigningErrorGuide
              key={app.mspApplicationNo}
              app={app}
              onNavigate={(step) => {
                if (step === 'verify' || step === 'people') {
                  if (step === 'people') onNavigate?.('people');
                  else window.scrollTo({ top: 0, behavior: 'smooth' });
                } else {
                  onNavigate(step);
                }
              }}
              onRetry={() => fetchSigningState()}
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
            // Do not auto-stage packages after KYC — merchant clicks Prepare / Retry when ready
          }}
          onClose={() => setKycSigner(null)}
        />
      )}
    </div>
  );
}
