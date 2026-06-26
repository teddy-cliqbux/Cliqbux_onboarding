import { useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { X, Loader2, Building2, CheckCircle2, AlertCircle } from 'lucide-react';
import { base44 } from '@/api/base44Client';

const LABEL = { fontSize: '11px', fontWeight: 600, color: '#6B7280', display: 'block', marginBottom: '5px', textTransform: 'uppercase', letterSpacing: '0.04em' };
const INPUT = { width: '100%', border: '1px solid #E5E7EB', borderRadius: '8px', padding: '9px 12px', fontSize: '13px', outline: 'none', boxSizing: 'border-box', fontFamily: 'Inter, sans-serif', color: '#111827' };

const EIN_EXAMPLES = ['12-3456789', '99-9999999'];

export default function AddEntityModal({ corporateId, onAdded, onClose }) {
  const [legalName, setLegalName] = useState('');
  const [einRaw, setEinRaw] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [verified, setVerified] = useState(null); // null | { valid: true/false, formatted:..., errors:... }
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleEINInput = (value) => {
    const digits = value.replace(/\D/g, '').slice(0, 9);
    const formatted = digits.length > 2 ? `${digits.slice(0, 2)}-${digits.slice(2)}` : digits;
    setEinRaw(formatted);
    setVerified(null);
  };

  const handleVerify = useCallback(async () => {
    const digits = einRaw.replace(/\D/g, '');
    if (digits.length !== 9) return;
    setVerifying(true);
    setVerified(null);
    try {
      const res = await base44.functions.invoke('verifyEIN', { corporateId, federalEIN: digits });
      setVerified(res.data);
    } catch {
      setVerified({ valid: false, errors: ['Validation service unavailable'] });
    } finally {
      setVerifying(false);
    }
  }, [einRaw, corporateId]);

  const digits = einRaw.replace(/\D/g, '');
  const canVerify = digits.length === 9 && !verifying;
  const verifiedAndValid = verified && verified.valid;
  const canSave = legalName.trim().length > 1 && digits.length === 9 && verifiedAndValid;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!canSave) return;
    setSaving(true);
    setError('');
    try {
      const res = await base44.functions.invoke('manageLegalEntity', {
        corporateId,
        action: 'add',
        legalBusinessName: legalName.trim(),
        federalEIN: digits
      });
      onAdded(res.data?.entities || []);
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to add entity.');
    } finally {
      setSaving(false);
    }
  };

  const modal = (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.45)', padding: '0 16px' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{ background: '#fff', borderRadius: '16px', boxShadow: '0 25px 50px rgba(0,0,0,0.3)', width: '100%', maxWidth: '440px', padding: '28px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: '#EFF6FF', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Building2 size={16} color="#2563EB" />
            </div>
            <div>
              <h3 style={{ fontWeight: 700, color: '#111827', fontSize: '15px', margin: 0 }}>Add Corporate Entity / EIN</h3>
              <p style={{ fontSize: '12px', color: '#9CA3AF', margin: 0, marginTop: 2 }}>Each EIN boards as its own processing account</p>
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9CA3AF', padding: 4, borderRadius: 6 }}>
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
          {/* Legal Business Name */}
          <div>
            <label style={LABEL}>Legal Business Name</label>
            <input
              type="text"
              value={legalName}
              onChange={(e) => setLegalName(e.target.value)}
              placeholder="e.g. Cliqbux Holdings LLC"
              autoFocus
              style={INPUT}
            />
          </div>

          {/* EIN */}
          <div>
            <label style={LABEL}>Federal EIN</label>
            <input
              type="text"
              value={einRaw}
              onChange={(e) => handleEINInput(e.target.value)}
              placeholder="12-3456789"
              maxLength={10}
              style={{ ...INPUT, fontFamily: 'ui-monospace, monospace', letterSpacing: '0.05em', borderColor: verified?.valid ? '#BBF7D0' : verified?.valid === false ? '#FCA5A5' : INPUT.borderColor }}
              autoComplete="off"
            />

            {/* Auto-verify once 9 digits entered */}
            {canVerify && (
              <div style={{ marginTop: '8px' }}>
                <button
                  type="button"
                  onClick={handleVerify}
                  disabled={verifying}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: 600,
                    color: '#2563EB', background: '#EFF6FF', border: '1px solid #93C5FD', borderRadius: '7px',
                    padding: '8px 14px', cursor: verifying ? 'not-allowed' : 'pointer', fontFamily: 'Inter, sans-serif'
                  }}
                >
                  {verifying ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />}
                  {verifying ? 'Verifying...' : 'Verify EIN'}
                </button>
              </div>
            )}

            {/* Result */}
            {verifying && <p style={{ fontSize: '11px', color: '#6B7280', marginTop: '6px' }}>Validating EIN format...</p>}
            {verified && verified.valid && (
              <div style={{ marginTop: '8px', background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: '8px', padding: '10px 14px' }}>
                <span style={{ fontSize: '12px', fontWeight: 700, color: '#16A34A', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <CheckCircle2 size={14} /> Verified: {verified.formatted}
                </span>
                <p style={{ fontSize: '11px', color: '#4B5563', margin: '3px 0 0' }}>{verified.message}</p>
              </div>
            )}
            {verified && !verified.valid && (
              <div style={{ marginTop: '8px', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '8px', padding: '10px 14px' }}>
                <span style={{ fontSize: '12px', fontWeight: 700, color: '#DC2626', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <AlertCircle size={14} /> Validation Failed
                </span>
                {(verified.errors || []).map((e, i) => <p key={i} style={{ fontSize: '11px', color: '#B91C1C', margin: '2px 0 0' }}>{e}</p>)}
              </div>
            )}
          </div>

          {error && (
            <p style={{ fontSize: '12px', color: '#DC2626', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '8px', padding: '8px 12px', margin: 0 }}>
              {error}
            </p>
          )}

          {/* Submit */}
          <div style={{ display: 'flex', gap: '10px', paddingTop: '2px' }}>
            <button
              type="submit"
              disabled={!canSave || saving}
              style={{
                flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                background: saving || !canSave ? '#D1D5DB' : '#111827', color: '#fff', fontWeight: 600,
                padding: '11px 20px', borderRadius: '9px', fontSize: '13px', border: 'none', cursor: saving || !canSave ? 'not-allowed' : 'pointer',
                fontFamily: 'Inter, sans-serif',
              }}
            >
              {saving ? <Loader2 size={15} className="animate-spin" /> : <Building2 size={15} />}
              {saving ? 'Adding...' : 'Add Entity'}
            </button>
            <button type="button" onClick={onClose} style={{ padding: '11px 16px', fontSize: '13px', fontWeight: 500, color: '#6B7280', border: '1px solid #E5E7EB', borderRadius: '9px', background: '#fff', cursor: 'pointer', fontFamily: 'Inter, sans-serif' }}>
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}