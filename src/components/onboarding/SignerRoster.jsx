import { useState, useEffect } from 'react';
import { UserPlus, CheckCircle2, AlertCircle, Clock, Mail, Trash2, Send, Loader2, ShieldCheck, Users } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import SignerModal from './SignerModal';

function StatusBadge({ status }) {
  const map = {
    'Verified':            'bg-green-50 text-green-700 border-green-200',
    'Sent':                'bg-blue-50 text-blue-700 border-blue-200',
    'Pending Invitation':  'bg-gray-50 text-gray-500 border-gray-200',
    'Action Required':     'bg-red-50 text-red-600 border-red-200',
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
    setLoading(true);
    try {
      const res = await base44.functions.invoke('manageSigner', { action: 'list', corporateId: profile.corporateId });
      setSigners(res.data?.signers || []);
    } catch (_) {
      setSigners([]);
    } finally {
      setLoading(false);
    }
  };

  // Notify parent of validity whenever signers change
  useEffect(() => {
    const totalPct = signers.reduce((sum, s) => sum + (Number(s.ownershipPercentage) || 0), 0);
    const allVerified = signers.length > 0 && signers.every(s => s.identityStatus === 'Verified');
    const valid = allVerified && totalPct <= 100;
    onValidChange(valid, totalPct, signers.length);
  }, [signers]);

  const handleSignerSaved = (newSigner) => {
    setSigners(prev => [...prev, newSigner]);
  };

  const handleDelete = async (signerId) => {
    if (!confirm('Remove this signer?')) return;
    await base44.functions.invoke('manageSigner', { action: 'delete', corporateId: profile.corporateId, signerId });
    setSigners(prev => prev.filter(s => s.id !== signerId));
  };

  const handleResendInvite = async (signer) => {
    setResendingId(signer.id);
    try {
      const res = await base44.functions.invoke('manageSigner', {
        action: 'sendInvite',
        corporateId: profile.corporateId,
        signerId: signer.id
      });
      if (res.data?.signer) {
        setSigners(prev => prev.map(s => s.id === signer.id ? { ...s, identityStatus: 'Sent' } : s));
      }
    } catch (_) {}
    setResendingId(null);
  };

  const totalPct = signers.reduce((sum, s) => sum + (Number(s.ownershipPercentage) || 0), 0);
  const overLimit = totalPct > 100;
  const allVerified = signers.length > 0 && signers.every(s => s.identityStatus === 'Verified');

  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden">
      {/* Panel header */}
      <div className="bg-gray-50 border-b border-gray-200 px-5 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-blue-100 flex items-center justify-center">
            <Users className="w-4 h-4 text-blue-600" />
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-900">Beneficial Owners & Signers</p>
            <p className="text-xs text-gray-500 mt-0.5">All owners with ≥25% stake must be verified</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {signers.length > 0 && (
            <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${overLimit ? 'bg-red-50 text-red-600 border-red-200' : 'bg-gray-100 text-gray-600 border-gray-200'}`}>
              {totalPct}% ownership
            </span>
          )}
          {allVerified && !overLimit ? (
            <span className="text-xs font-semibold text-green-700 bg-green-50 border border-green-200 px-2.5 py-1 rounded-full flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3" /> All Verified
            </span>
          ) : signers.length > 0 ? (
            <span className="text-xs font-semibold text-orange-600 bg-orange-50 border border-orange-200 px-2.5 py-1 rounded-full">
              Action Required
            </span>
          ) : null}
        </div>
      </div>

      {/* Roster rows */}
      <div className="divide-y divide-gray-100">
        {loading ? (
          <div className="flex items-center justify-center py-10 gap-2 text-gray-400 text-sm">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading signers...
          </div>
        ) : signers.length === 0 ? (
          <div className="py-10 text-center text-gray-400 text-sm">
            No signers added yet — add the primary beneficial owner below.
          </div>
        ) : (
          signers.map(signer => (
            <div key={signer.id} className="px-5 py-3.5 flex items-center gap-4">
              {/* Avatar */}
              <div className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0 text-sm font-bold text-gray-500">
                {signer.firstName?.[0]}{signer.lastName?.[0]}
              </div>
              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-semibold text-gray-900">{signer.firstName} {signer.lastName}</p>
                  {signer.isPrimarySigner && (
                    <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-semibold">Primary</span>
                  )}
                </div>
                <p className="text-xs text-gray-400 truncate">{signer.signerEmail} · {signer.ownershipPercentage}% ownership</p>
              </div>
              {/* Status */}
              <StatusBadge status={signer.identityStatus} />
              {/* Actions */}
              <div className="flex items-center gap-1.5 flex-shrink-0">
                {(signer.identityStatus === 'Pending Invitation' || signer.identityStatus === 'Sent') && (
                  <button
                    onClick={() => handleResendInvite(signer)}
                    disabled={resendingId === signer.id}
                    className="text-xs text-blue-600 hover:text-blue-800 border border-blue-200 bg-blue-50 hover:bg-blue-100 px-2.5 py-1.5 rounded-lg font-semibold transition-colors flex items-center gap-1 disabled:opacity-50"
                    title="Resend invite"
                  >
                    {resendingId === signer.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
                    {signer.identityStatus === 'Sent' ? 'Resend' : 'Send Invite'}
                  </button>
                )}
                {!signer.isPrimarySigner && (
                  <button
                    onClick={() => handleDelete(signer.id)}
                    className="text-gray-300 hover:text-red-500 p-1.5 rounded-lg transition-colors"
                    title="Remove signer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Add button */}
      <div className="px-5 py-4 border-t border-gray-100">
        {overLimit && (
          <p className="text-xs text-red-600 font-medium mb-3 flex items-center gap-1.5">
            <AlertCircle className="w-3.5 h-3.5" />
            Total ownership exceeds 100%. Please review percentages before submitting.
          </p>
        )}
        <button
          onClick={() => setShowModal(true)}
          className="w-full flex items-center justify-center gap-2 text-sm font-semibold text-gray-700 border border-dashed border-gray-300 hover:border-gray-400 hover:bg-gray-50 rounded-xl py-2.5 transition-all"
        >
          <UserPlus className="w-4 h-4" />
          + Add Beneficial Owner / Signer
        </button>
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
    </div>
  );
}