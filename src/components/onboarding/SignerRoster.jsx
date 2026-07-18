import { useState, useEffect } from 'react';
import { UserPlus, Trash2, Send, Loader2, Pencil, ShieldCheck, UserCheck } from 'lucide-react';
import SignerModal from './SignerModal';
import SignerDetailsModal from './SignerDetailsModal';
import { invokePortalFunction } from '@/lib/merchantAuthFetch';
import { isClearedForSigning, isControlPerson, isBeneficialOwner, isPortalAdmin, isKycComplete, effectiveControlPersons, resolveSoleControlCandidate, isEffectivelyRequiredSigner } from '@/lib/signerRules';
import {
  lifecycleLabel,
  normalizeSignerLifecycle,
  isVerifiedOrHigher,
  isApplicationSigned,
  isInviteOutstanding,
} from '@/lib/signerLifecycle';

function StatusBadge({ status }) {
  const n = normalizeSignerLifecycle(status);
  const dot = {
    verified: 'bg-cb-success',
    'application signed': 'bg-cb-success',
    invited: 'bg-cb-accent',
    opened: 'bg-sky-400',
    pending: 'bg-cb-border-strong',
    'signing failed': 'bg-cb-danger',
  };
  return (
    <span className="inline-flex items-center gap-1.5 text-cb-caption text-gray-400 whitespace-nowrap">
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${dot[n] || dot.pending}`} />
      {lifecycleLabel(status)}
    </span>
  );
}

export default function SignerRoster({ profile, onValidChange, onSignersChange, onSignHere, selectedSignerId }) {
  const [signers, setSigners] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [resendingId, setResendingId] = useState(null);
  const [detailSigner, setDetailSigner] = useState(null);
  const [detailAllowKyc, setDetailAllowKyc] = useState(false);

  useEffect(() => {
    loadSigners();
  }, []);

  const publish = (list) => {
    setSigners(list);
    if (onSignersChange) onSignersChange(list);
  };

  const loadSigners = async () => {
    if (!profile?.corporateId) { setLoading(false); return; }
    setLoading(true);
    try {
      const res = await invokePortalFunction('manageSigner', { action: 'list', corporateId: profile.corporateId });
      let list = res.data?.signers || [];
      if (list.length === 0 && profile.signerEmail && (profile.firstName || profile.lastName || profile.legalName)) {
        const signerRes = await invokePortalFunction('manageSigner', {
          action: 'create',
          corporateId: profile.corporateId,
          signerData: {
            firstName: profile.firstName || profile.legalName.split(' ')[0] || '',
            lastName: profile.lastName || profile.legalName.split(' ').slice(1).join(' ') || '',
            signerEmail: profile.signerEmail,
            ownershipPercentage: 100,
            isPrimarySigner: true,
            isAuthorizedSigner: true,
            isBeneficialOwner: true,
            isPortalAdmin: false,
            dobYear: profile.dobYear || '',
            dobMonth: profile.dobMonth || '',
            dobDay: profile.dobDay || '',
            ssn: profile.ssn || '',
            homeStreet: profile.homeStreet || '',
            homeCity: profile.homeCity || '',
            homeState: profile.homeState || '',
            homeZip: profile.homeZip || '',
            corporatePhone: profile.corporatePhone || '',
          },
          sendInvite: false,
        });
        if (signerRes.data?.signer) {
          list = [signerRes.data.signer];
        }
      }
      // Sole owner missing Control Person flag (shows BO only) — heal so signing unlocks
      // for merchant + agent preview. list action also heals server-side when possible.
      const sole = resolveSoleControlCandidate(list);
      if (sole?.id && res.data?.healedControlPersonId !== sole.id) {
        try {
          const healRes = await invokePortalFunction('manageSigner', {
            action: 'healControlPerson',
            corporateId: profile.corporateId,
            signerId: sole.id,
          });
          if (healRes.data?.signers) list = healRes.data.signers;
          else if (healRes.data?.signer) {
            list = list.map((s) => (s.id === sole.id ? { ...s, ...healRes.data.signer } : s));
          }
        } catch (healErr) {
          console.warn('[SignerRoster] control-person heal skipped:', healErr?.message || healErr);
        }
      }
      publish(list);
    } catch (err) {
      console.error('[SignerRoster.loadSigners]', err?.message || 'Unknown error');
      publish([]);
    } finally {
      setLoading(false);
    }
  };

  // Unlock when exactly one Control Person is cleared for signing, and every
  // Beneficial Owner / Control Person has KYC verified (or invite in flight for remote).
  useEffect(() => {
    const totalPct = signers.reduce((sum, s) => sum + (Number(s.ownershipPercentage) || 0), 0);
    const controls = effectiveControlPersons(signers);
    const controlOk = controls.length === 1 && controls.every(isClearedForSigning);
    const amlPeople = signers.filter((s) => isControlPerson(s) || isBeneficialOwner(s) || resolveSoleControlCandidate(signers)?.id === s.id);
    const kycOk = amlPeople.every((s) =>
      isKycComplete(s)
      || isInviteOutstanding(s.identityStatus)
      || normalizeSignerLifecycle(s.identityStatus) === 'opened'
      || normalizeSignerLifecycle(s.identityStatus) === 'invited'
    );
    const valid = signers.length > 0 && controlOk && kycOk;
    onValidChange(valid, totalPct, signers.length);
    if (onSignersChange) onSignersChange(signers);
  }, [signers]);

  const handleSignerSaved = (newSigner) => {
    publish([...signers, newSigner]);
  };

  const handleDelete = async (signerId) => {
    if (!confirm('Remove this signer?')) return;
    await invokePortalFunction('manageSigner', { action: 'delete', corporateId: profile.corporateId, signerId });
    publish(signers.filter(s => s.id !== signerId));
  };

  const handleSendSigningInvite = async (signer) => {
    setResendingId(signer.id);
    try {
      const res = await invokePortalFunction('manageSigner', {
        action: 'sendInvite',
        corporateId: profile.corporateId,
        signerId: signer.id,
      });
      if (res.data?.signer) {
        publish(signers.map(s => s.id === signer.id ? { ...s, ...res.data.signer } : s));
      }
    } catch (err) {
      console.error('[SignerRoster.handleSendSigningInvite]', err?.message || 'Unknown error');
    }
    setResendingId(null);
  };

  const openDetail = (signer, { allowKyc = false } = {}) => {
    setDetailAllowKyc(allowKyc);
    setDetailSigner(signer);
  };

  const totalPct = signers.reduce((sum, s) => sum + (Number(s.ownershipPercentage) || 0), 0);
  const controls = effectiveControlPersons(signers);
  const allRequiredCleared = controls.length > 0 && controls.every(isClearedForSigning);

  const isSoleSigner = signers.length === 1 && !isPortalAdmin(signers[0]);
  const soleSignerVerified = isSoleSigner && isVerifiedOrHigher(signers[0]?.identityStatus);

  return (
    <div className="border border-cb-border rounded-cb overflow-hidden">
      <div className="bg-cb-surface-raised border-b border-cb-border px-5 py-4 flex items-center justify-between gap-3">
        <div>
          <p className="text-cb-body font-semibold text-white">
            {isSoleSigner ? (soleSignerVerified ? 'Your Identity' : 'Verify Your Identity') : 'Owners, Signers & Admins'}
          </p>
          <p className="text-cb-caption normal-case tracking-normal font-normal text-gray-500 mt-0.5">
            {isSoleSigner
              ? (soleSignerVerified
                  ? "You're verified as the Control Person and Beneficial Owner on this application."
                  : "You're completing this application as the Control Person — confirm a few details below to continue.")
              : 'Control Person signs. Beneficial Owners (≥25%) need KYC for AML. Portal Admins (0%) skip the contract.'}
          </p>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          {signers.length > 0 && (
            <span className="text-cb-caption text-gray-400">
              {totalPct}% ownership
            </span>
          )}
          {allRequiredCleared ? (
            <span className="inline-flex items-center gap-1.5 text-cb-caption text-gray-400 whitespace-nowrap">
              <span className="w-1.5 h-1.5 rounded-full bg-cb-success flex-shrink-0" /> Ready to sign
            </span>
          ) : controls.length > 0 ? (
            <span className="inline-flex items-center gap-1.5 text-cb-caption text-cb-accent whitespace-nowrap">
              <span className="w-1.5 h-1.5 rounded-full bg-cb-accent flex-shrink-0" /> Verification needed
            </span>
          ) : null}
        </div>
      </div>

      <div className="divide-y divide-cb-border">
        {loading ? (
          <div className="flex items-center justify-center py-10 gap-2 text-gray-500 text-cb-body">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading signers...
          </div>
        ) : signers.length === 0 ? (
          <div className="py-10 text-center text-gray-500 text-cb-body">
            No signers added yet — add the primary beneficial owner below.
          </div>
        ) : (
          signers.map(signer => {
            const isPrimary = isControlPerson(signer) || resolveSoleControlCandidate(signers)?.id === signer.id;
            const required = isEffectivelyRequiredSigner(signer, signers);
            const bo = isBeneficialOwner(signer);
            const adminOnly = isPortalAdmin(signer);
            const catalogOnly = !required && !bo && !adminOnly;
            const needsRemoteInvite = (required || bo) && !isPrimary && (
              normalizeSignerLifecycle(signer.identityStatus) === 'pending'
              || isInviteOutstanding(signer.identityStatus)
            );
            // Any verified Control Person can open their concurrent signing session on this device
            const canSignHere = required && isVerifiedOrHigher(signer.identityStatus) && !isApplicationSigned(signer.identityStatus);
            const inviteBtnLabel = isInviteOutstanding(signer.identityStatus)
              ? 'Resend Invite'
              : (required ? 'Send Verify & Sign Invite' : 'Send Verify Invite');
            const isSelected = selectedSignerId && signer.id === selectedSignerId;

            return (
              <div key={signer.id} className={`px-5 py-4 ${catalogOnly ? 'opacity-70' : ''} ${isSelected ? 'bg-cb-accent-muted/30' : ''}`}>
                <div className="flex items-center gap-4">
                  <div className="w-9 h-9 rounded-full bg-cb-bg border border-cb-border flex items-center justify-center flex-shrink-0 text-cb-caption font-semibold text-gray-400">
                    {signer.firstName?.[0]}{signer.lastName?.[0]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-cb-body font-semibold text-white">{signer.firstName} {signer.lastName}</p>
                      {isPrimary && (
                        <span className="text-cb-caption normal-case tracking-normal text-gray-500 border border-cb-border px-1.5 py-0.5 rounded">Control Person</span>
                      )}
                      {bo && (
                        <span className="text-cb-caption normal-case tracking-normal text-gray-500 border border-cb-border px-1.5 py-0.5 rounded">Beneficial Owner</span>
                      )}
                      {adminOnly && (
                        <span className="text-cb-caption normal-case tracking-normal text-gray-500 border border-cb-border px-1.5 py-0.5 rounded">Portal Admin</span>
                      )}
                      {isSelected && (
                        <span className="text-cb-caption normal-case tracking-normal text-cb-accent border border-cb-accent/40 px-1.5 py-0.5 rounded">Signing here</span>
                      )}
                    </div>
                    <p className="text-cb-caption normal-case tracking-normal font-normal text-gray-500 truncate">{signer.signerEmail} · {signer.ownershipPercentage}% ownership</p>
                  </div>
                  {!(isPrimary && normalizeSignerLifecycle(signer.identityStatus) === 'pending') && (
                    <StatusBadge status={signer.identityStatus} />
                  )}
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {canSignHere && (
                      <button
                        onClick={() => onSignHere ? onSignHere(signer) : openDetail(signer, { allowKyc: true })}
                        className="text-cb-body text-cb-bg bg-cb-accent hover:opacity-90 px-2.5 py-1.5 rounded-cb font-medium transition-opacity flex items-center gap-1.5"
                        title="Open this owner's signing session on this device"
                      >
                        <UserCheck className="w-3 h-3" />
                        {isSelected ? 'Signing…' : 'Sign here'}
                      </button>
                    )}
                    {required && !isPrimary && normalizeSignerLifecycle(signer.identityStatus) === 'pending' && (
                      <button
                        onClick={() => openDetail(signer, { allowKyc: true })}
                        className="text-cb-body text-gray-300 hover:text-white border border-cb-border hover:border-cb-border-strong px-2.5 py-1.5 rounded-cb font-medium transition-colors flex items-center gap-1.5"
                        title="Verify on this device"
                      >
                        <UserCheck className="w-3 h-3" />
                        Verify here
                      </button>
                    )}
                    {needsRemoteInvite && (
                      <button
                        onClick={() => handleSendSigningInvite(signer)}
                        disabled={resendingId === signer.id}
                        className="text-cb-body text-gray-300 hover:text-white border border-cb-border hover:border-cb-border-strong px-2.5 py-1.5 rounded-cb font-medium transition-colors flex items-center gap-1.5 disabled:opacity-50"
                        title="Email a combined Verify & Sign link for their own device"
                      >
                        {resendingId === signer.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
                        {inviteBtnLabel}
                      </button>
                    )}
                    <button onClick={() => openDetail(signer, { allowKyc: isPrimary || normalizeSignerLifecycle(signer.identityStatus) === 'pending' })}
                      className="text-cb-body text-gray-400 hover:text-white font-medium px-2 py-1.5 rounded-cb flex items-center gap-1.5 transition-colors whitespace-nowrap"
                      title="Edit details">
                      <Pencil className="w-3.5 h-3.5" /> Edit
                    </button>
                    <button
                      onClick={() => handleDelete(signer.id)}
                      className="text-gray-500 hover:text-cb-danger p-1.5 rounded-cb transition-colors"
                      title="Remove signer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                {isPrimary && !isVerifiedOrHigher(signer.identityStatus) && (
                  <button onClick={() => openDetail(signer, { allowKyc: true })}
                    className="mt-4 w-full flex items-center justify-center gap-2 text-cb-body font-semibold text-cb-bg bg-cb-accent hover:opacity-90 py-3 rounded-cb transition-colors">
                    <ShieldCheck className="w-4 h-4" /> Complete Identity Verification
                  </button>
                )}
              </div>
            );
          })
        )}
      </div>

      <div className="px-5 py-4 border-t border-cb-border">
        {isSoleSigner && !soleSignerVerified ? (
          <button
            onClick={() => setShowModal(true)}
            className="w-full flex items-center justify-center gap-1.5 text-cb-body font-normal text-gray-500 hover:text-white py-1.5 transition-colors"
          >
            <UserPlus className="w-3.5 h-3.5" />
            Have a different owner with 25%+ stake? Add them instead
          </button>
        ) : (
          <>
            {isSoleSigner && (
              <p className="text-cb-caption normal-case tracking-normal font-normal text-gray-500 mb-2 text-center">
                Only use this if there&apos;s another owner with 25%+ stake — not for yourself.
              </p>
            )}
            <button
              onClick={() => setShowModal(true)}
              className="w-full flex items-center justify-center gap-2 text-cb-body font-medium text-gray-400 border border-cb-border hover:border-cb-border-strong hover:text-white rounded-cb py-2.5 transition-colors"
            >
              <UserPlus className="w-4 h-4" />
              + Add Another Owner
            </button>
          </>
        )}
      </div>

      {showModal && (
        <SignerModal
          corporateId={profile.corporateId}
          legalName={profile.legalName}
          isPrimary={signers.length === 0}
          onSaved={handleSignerSaved}
          onClose={() => setShowModal(false)}
        />
      )}

      {detailSigner && (
        <SignerDetailsModal
          signer={detailSigner}
          corporateId={profile.corporateId}
          profile={profile}
          allowInlineKyc={detailAllowKyc}
          onSaved={(updated) => publish(signers.map(s => s.id === updated.id ? { ...s, ...updated } : s))}
          onClose={() => { setDetailSigner(null); setDetailAllowKyc(false); }}
        />
      )}
    </div>
  );
}
