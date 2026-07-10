import { useState, useEffect } from 'react';
import { UserPlus, CheckCircle2, AlertCircle, Clock, Mail, Trash2, Send, Loader2, Users, Pencil, ShieldCheck } from 'lucide-react';
import SignerModal from './SignerModal';
import SignerDetailsModal from './SignerDetailsModal';
import { invokePortalFunction } from '@/lib/merchantAuthFetch';

function StatusBadge({ status }) {
  const map = {
    'Verified':            'bg-green-500/15 text-green-300 border-green-500/30',
    'Sent':                'bg-blue-500/15 text-blue-300 border-blue-500/30',
    'Pending Invitation':  'bg-white/[0.06] text-gray-400 border-white/10',
    'Action Required':     'bg-red-500/15 text-red-300 border-red-500/30',
  };
  const icons = {
    'Verified':           <CheckCircle2 className="w-3 h-3" />,
    'Sent':               <Mail className="w-3 h-3" />,
    'Pending Invitation': <Clock className="w-3 h-3" />,
    'Action Required':    <AlertCircle className="w-3 h-3" />,
  };
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full border whitespace-nowrap ${map[status] || map['Pending Invitation']}`}>
      {icons[status]} {status}
    </span>
  );
}

export default function SignerRoster({ profile, onValidChange }) {
  const [signers, setSigners] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [resendingId, setResendingId] = useState(null);

  useEffect(() => {
    loadSigners();
  }, []);

  const loadSigners = async () => {
    if (!profile?.corporateId) { setLoading(false); return; }
    setLoading(true);
    try {
      const res = await invokePortalFunction('manageSigner', { action: 'list', corporateId: profile.corporateId });
      let list = res.data?.signers || [];
      // Auto-seed primary signer from Step 1 profile when roster is empty
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
            // Map personal details from Step 1 if already entered
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
      setSigners(list);
    } catch (err) {
      // Message only — never log signerData (contains SSN/DOB/address)
      console.error('[SignerRoster.loadSigners]', err?.message || 'Unknown error');
      setSigners([]);
    } finally {
      setLoading(false);
    }
  };

  // Notify parent of validity whenever signers change
  // Elavon rule: only owners with >= 25% stake require identity verification
  // Invited (Sent) signers unblock submission — Elavon routes doc access via email
  useEffect(() => {
    const totalPct = signers.reduce((sum, s) => sum + (Number(s.ownershipPercentage) || 0), 0);
    const requiredSigners = signers.filter(s => (Number(s.ownershipPercentage) || 0) >= 25);
    const allRequiredCleared = requiredSigners.length > 0 &&
      requiredSigners.every(s => s.identityStatus === 'Verified' || s.identityStatus === 'Sent');
    const valid = signers.length > 0 && (requiredSigners.length === 0 || allRequiredCleared);
    onValidChange(valid, totalPct, signers.length);
  }, [signers]);

  const handleSignerSaved = (newSigner) => {
    setSigners(prev => [...prev, newSigner]);
  };

  const handleDelete = async (signerId) => {
    if (!confirm('Remove this signer?')) return;
    await invokePortalFunction('manageSigner', { action: 'delete', corporateId: profile.corporateId, signerId });
    setSigners(prev => prev.filter(s => s.id !== signerId));
  };

  const handleResendInvite = async (signer) => {
    setResendingId(signer.id);
    try {
      const res = await invokePortalFunction('manageSigner', {
        action: 'sendInvite',
        corporateId: profile.corporateId,
        signerId: signer.id
      });
      if (res.data?.signer) {
        setSigners(prev => prev.map(s => s.id === signer.id ? { ...s, identityStatus: 'Sent' } : s));
      }
    } catch (err) {
      console.error('[SignerRoster.handleResendInvite]', err?.message || 'Unknown error');
    }
    setResendingId(null);
  };

  // Which signer's details/verification modal is open (single modal for both
  // contact edits and identity verification — see SignerDetailsModal)
  const [detailSigner, setDetailSigner] = useState(null);

  const totalPct = signers.reduce((sum, s) => sum + (Number(s.ownershipPercentage) || 0), 0);
  const requiredSigners = signers.filter(s => (Number(s.ownershipPercentage) || 0) >= 25);
  const allRequiredCleared = requiredSigners.length > 0 &&
    requiredSigners.every(s => s.identityStatus === 'Verified' || s.identityStatus === 'Sent');

  // Reworked 2026-07-07: the single-signer-present case is by far the most common
  // (one owner filling out and signing the application themselves), but the roster
  // framing below ("Beneficial Owners & Signers" + a big "+ Add" button) reads like
  // a list-management tool, not a "verify yourself" step. Testers were clicking
  // "+ Add Beneficial Owner / Signer" instead of the small "Verify Now" pill on
  // their own row. When there's exactly one (primary, unverified) signer, swap in
  // simpler, single-purpose copy and a full-width verify button that can't be
  // missed (opens SignerDetailsModal).
  const isSoleSigner = signers.length === 1 && signers[0]?.isPrimarySigner === true;
  const soleSignerVerified = isSoleSigner && signers[0]?.identityStatus === 'Verified';

  return (
    <div className="border border-white/10 rounded-xl overflow-hidden">
      {/* Panel header */}
      <div className="bg-white/[0.05] border-b border-white/10 px-5 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-blue-500/15 flex items-center justify-center">
            <Users className="w-4 h-4 text-blue-400" />
          </div>
          <div>
            <p className="text-sm font-semibold text-white">
              {isSoleSigner ? (soleSignerVerified ? 'Your Identity' : 'Verify Your Identity') : 'Beneficial Owners & Signers'}
            </p>
            <p className="text-xs text-gray-400 mt-0.5">
              {isSoleSigner
                ? (soleSignerVerified
                    ? "You're verified as the sole owner and signer on this application."
                    : "You're completing this application yourself as the sole owner — confirm a few details below to continue.")
                : 'Owners with ≥25% stake must verify or receive an invitation'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {signers.length > 0 && (
            <span className="text-xs font-semibold px-2.5 py-1 rounded-full border bg-white/10 text-gray-300 border-white/10">
              {totalPct}% ownership
            </span>
          )}
          {allRequiredCleared ? (
            <span className="text-xs font-semibold text-green-300 bg-green-500/15 border border-green-500/30 px-2.5 py-1 rounded-full flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3" /> Ready to Submit
            </span>
          ) : requiredSigners.length > 0 ? (
            <span className="text-xs font-semibold text-orange-300 bg-orange-500/15 border border-orange-500/30 px-2.5 py-1 rounded-full">
              Verification Needed
            </span>
          ) : null}
        </div>
      </div>

      {/* Roster rows */}
      <div className="divide-y divide-white/10">
        {loading ? (
          <div className="flex items-center justify-center py-10 gap-2 text-gray-500 text-sm">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading signers...
          </div>
        ) : signers.length === 0 ? (
          <div className="py-10 text-center text-gray-500 text-sm">
            No signers added yet — add the primary beneficial owner below.
          </div>
        ) : (
          signers.map(signer => {
            const isPrimary = signer.isPrimarySigner === true;
            const needsInvite = signer.identityStatus === 'Pending Invitation' || signer.identityStatus === 'Sent';
            const inviteBtnLabel = signer.identityStatus === 'Sent' ? 'Resend' : 'Send Invite';

            return (
              <div key={signer.id} className="px-5 py-3.5">
                {/* Row main */}
                <div className="flex items-center gap-4">
                  {/* Avatar */}
                  <div className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center flex-shrink-0 text-sm font-bold text-gray-400">
                    {signer.firstName?.[0]}{signer.lastName?.[0]}
                  </div>
                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-semibold text-white">{signer.firstName} {signer.lastName}</p>
                      {isPrimary && (
                        <span className="text-xs bg-blue-500/20 text-blue-300 px-1.5 py-0.5 rounded font-semibold">Primary</span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 truncate">{signer.signerEmail} · {signer.ownershipPercentage}% ownership</p>
                  </div>
                  {/* Status badge — hidden for unverified primary (verifies via the modal instead) */}
                  {!(isPrimary && signer.identityStatus === 'Pending Invitation') && (
                    <StatusBadge status={signer.identityStatus} />
                  )}
                  {/* Actions */}
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    {!isPrimary && needsInvite && (
                      <button
                        onClick={() => handleResendInvite(signer)}
                        disabled={resendingId === signer.id}
                        className="text-xs text-blue-300 hover:text-blue-200 border border-blue-500/30 bg-blue-500/15 hover:bg-blue-500/25 px-2.5 py-1.5 rounded-lg font-semibold transition-colors flex items-center gap-1 disabled:opacity-50"
                        title="Send verification invite"
                      >
                        {resendingId === signer.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
                        {inviteBtnLabel}
                      </button>
                    )}
                    {/* One modal for everything — contact info + identity verification */}
                    <button onClick={() => setDetailSigner(signer)}
                      className="text-xs text-gray-300 hover:text-white font-semibold px-2.5 py-1.5 rounded-lg flex items-center gap-1.5 transition-colors whitespace-nowrap"
                      title="Edit details">
                      <Pencil className="w-3.5 h-3.5" /> Edit
                    </button>
                    <button
                      onClick={() => handleDelete(signer.id)}
                      className="text-gray-300 hover:text-red-500 p-1.5 rounded-lg transition-colors"
                      title="Remove signer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                {/* Unverified primary: full-width verify CTA — kept prominent so it
                    can't be missed in favor of "+ Add Another Owner" (2026-07-07 lesson) */}
                {isPrimary && signer.identityStatus !== 'Verified' && (
                  <button onClick={() => setDetailSigner(signer)}
                    className="mt-3 w-full flex items-center justify-center gap-2 text-sm font-bold text-black bg-amber-500 hover:bg-amber-400 py-3 rounded-xl transition-all">
                    <ShieldCheck className="w-4 h-4" /> Complete Identity Verification
                  </button>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Add another owner — deliberately de-emphasized while the sole signer hasn't
          verified yet, so it doesn't visually compete with the verify action above
          and get mistaken for "verify myself". Restored to a normal-weight button
          once verified or once there's already more than one signer. 2026-07-07. */}
      <div className="px-5 py-4 border-t border-white/10">
        {isSoleSigner && !soleSignerVerified ? (
          <button
            onClick={() => setShowModal(true)}
            className="w-full flex items-center justify-center gap-1.5 text-xs font-medium text-gray-500 hover:text-gray-300 py-1.5 transition-colors"
          >
            <UserPlus className="w-3.5 h-3.5" />
            Have a different owner with 25%+ stake? Add them instead
          </button>
        ) : (
          <>
            {isSoleSigner && (
              <p className="text-[11px] text-gray-500 mb-2 text-center">
                Only use this if there's another owner with 25%+ stake — not for yourself.
              </p>
            )}
            <button
              onClick={() => setShowModal(true)}
              className="w-full flex items-center justify-center gap-2 text-sm font-semibold text-gray-400 border border-dashed border-white/10 hover:border-white/30 hover:bg-white/[0.04] rounded-xl py-2.5 transition-all"
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
          onSaved={(updated) => setSigners(prev => prev.map(s => s.id === updated.id ? { ...s, ...updated } : s))}
          onClose={() => setDetailSigner(null)}
        />
      )}
    </div>
  );
}
