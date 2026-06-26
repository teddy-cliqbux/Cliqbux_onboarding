import { useState } from 'react';
import { createPortal } from 'react-dom';
import { X, UserPlus, Send, Loader2, ShieldCheck, Mail } from 'lucide-react';
import { base44 } from '@/api/base44Client';

const MONTHS = [
  { value: '01', label: 'Jan' }, { value: '02', label: 'Feb' }, { value: '03', label: 'Mar' },
  { value: '04', label: 'Apr' }, { value: '05', label: 'May' }, { value: '06', label: 'Jun' },
  { value: '07', label: 'Jul' }, { value: '08', label: 'Aug' }, { value: '09', label: 'Sep' },
  { value: '10', label: 'Oct' }, { value: '11', label: 'Nov' }, { value: '12', label: 'Dec' },
];
const DAYS = Array.from({ length: 31 }, (_, i) => String(i + 1).padStart(2, '0'));
const currentYear = new Date().getFullYear();
const YEARS = Array.from({ length: 80 }, (_, i) => String(currentYear - 18 - i));

const inputCls = 'w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500';
const labelCls = 'text-xs font-semibold text-gray-500 block mb-1';

export default function SignerModal({ corporateId, legalName, isPrimary = false, onSaved, onClose }) {
  const [mode, setMode] = useState('now'); // 'now' | 'invite'
  const [form, setForm] = useState({
    firstName: '', lastName: '', signerEmail: '',
    ownershipPercentage: '', isPrimarySigner: isPrimary,
    dobMonth: '', dobDay: '', dobYear: '', ssn: '',
    homeStreet: '', homeCity: '', homeState: '', homeZip: '',
    corporatePhone: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.firstName || !form.lastName || !form.signerEmail || !form.ownershipPercentage) {
      setError('First name, last name, email, and ownership % are required.');
      return;
    }
    if (mode === 'now' && (!form.dobMonth || !form.dobDay || !form.dobYear || !form.ssn || !form.homeStreet)) {
      setError('Please complete all identity fields.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const res = await base44.functions.invoke('manageSigner', {
        action: 'create',
        corporateId,
        sendInvite: mode === 'invite',
        signerData: { ...form, legalName }
      });
      if (res.data?.error) throw new Error(res.data.error);
      onSaved(res.data.signer);
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to save signer.');
    } finally {
      setSaving(false);
    }
  };

  const modal = (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 9998, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.45)', padding: '16px' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{ background: '#fff', borderRadius: 16, boxShadow: '0 25px 50px rgba(0,0,0,0.3)', width: '100%', maxWidth: 520, maxHeight: '90vh', overflowY: 'auto', padding: 28 }}>
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-50 flex items-center justify-center flex-shrink-0">
              <UserPlus size={16} className="text-blue-600" />
            </div>
            <div>
              <h3 className="font-bold text-gray-900 text-base">Add Beneficial Owner / Signer</h3>
              <p className="text-xs text-gray-400 mt-0.5">All data is encrypted and used only for underwriting</p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1 rounded-lg transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Mode toggle */}
        <div className="flex rounded-xl border border-gray-200 p-1 mb-6 gap-1">
          <button
            type="button"
            onClick={() => setMode('now')}
            className={`flex-1 flex items-center justify-center gap-2 text-sm font-semibold py-2 rounded-lg transition-all ${mode === 'now' ? 'bg-gray-900 text-white shadow' : 'text-gray-500 hover:text-gray-700'}`}
          >
            <ShieldCheck size={14} /> Complete Verification Now
          </button>
          <button
            type="button"
            onClick={() => setMode('invite')}
            className={`flex-1 flex items-center justify-center gap-2 text-sm font-semibold py-2 rounded-lg transition-all ${mode === 'invite' ? 'bg-gray-900 text-white shadow' : 'text-gray-500 hover:text-gray-700'}`}
          >
            <Mail size={14} /> Delegate via Email Invite
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {/* Basic info — always shown */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>First Name</label>
              <input className={inputCls} value={form.firstName} onChange={e => set('firstName', e.target.value)} placeholder="Jane" />
            </div>
            <div>
              <label className={labelCls}>Last Name</label>
              <input className={inputCls} value={form.lastName} onChange={e => set('lastName', e.target.value)} placeholder="Smith" />
            </div>
          </div>
          <div>
            <label className={labelCls}>Email Address</label>
            <input type="email" className={inputCls} value={form.signerEmail} onChange={e => set('signerEmail', e.target.value)} placeholder="jane@company.com" />
          </div>
          <div>
            <label className={labelCls}>Ownership Percentage (%)</label>
            <input type="number" min={1} max={100} className={inputCls} value={form.ownershipPercentage} onChange={e => set('ownershipPercentage', e.target.value)} placeholder="e.g. 25" />
          </div>

          {/* Self-verification fields */}
          {mode === 'now' && (
            <>
              <div className="border-t border-gray-100 pt-4">
                <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">Identity Details</p>
              </div>
              <div>
                <label className={labelCls}>Date of Birth</label>
                <div className="flex gap-2">
                  <select className="flex-1 text-sm border border-gray-200 rounded-lg px-2 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white" value={form.dobMonth} onChange={e => set('dobMonth', e.target.value)}>
                    <option value="">Month</option>
                    {MONTHS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                  </select>
                  <select className="w-20 text-sm border border-gray-200 rounded-lg px-2 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white" value={form.dobDay} onChange={e => set('dobDay', e.target.value)}>
                    <option value="">Day</option>
                    {DAYS.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                  <select className="w-24 text-sm border border-gray-200 rounded-lg px-2 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white" value={form.dobYear} onChange={e => set('dobYear', e.target.value)}>
                    <option value="">Year</option>
                    {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className={labelCls}>Social Security Number (SSN)</label>
                <input type="password" maxLength={9} className={inputCls} value={form.ssn} onChange={e => set('ssn', e.target.value.replace(/\D/g, '').slice(0, 9))} placeholder="9 digits — secured" />
              </div>
              <div>
                <label className={labelCls}>Home Address</label>
                <input className={inputCls} value={form.homeStreet} onChange={e => set('homeStreet', e.target.value)} placeholder="123 Main St" />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-1">
                  <input className={inputCls} value={form.homeCity} onChange={e => set('homeCity', e.target.value)} placeholder="City" />
                </div>
                <div>
                  <input className={inputCls} value={form.homeState} onChange={e => set('homeState', e.target.value)} placeholder="ST" maxLength={2} />
                </div>
                <div>
                  <input className={inputCls} value={form.homeZip} onChange={e => set('homeZip', e.target.value)} placeholder="ZIP" />
                </div>
              </div>
              <div>
                <label className={labelCls}>Phone Number</label>
                <input type="tel" className={inputCls} value={form.corporatePhone} onChange={e => set('corporatePhone', e.target.value)} placeholder="10-digit phone" />
              </div>
            </>
          )}

          {/* Invite mode notice */}
          {mode === 'invite' && (
            <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 flex items-start gap-3">
              <Mail size={15} className="text-blue-500 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-blue-700">
                A secure, tokenized verification link will be emailed to <strong>{form.signerEmail || 'this signer'}</strong>. They will complete their own identity verification independently.
              </p>
            </div>
          )}

          {error && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}

          <div className="flex gap-3 pt-1">
            <button
              type="submit"
              disabled={saving}
              className="flex-1 flex items-center justify-center gap-2 text-sm font-bold text-white bg-gray-900 hover:bg-gray-800 disabled:bg-gray-300 px-5 py-2.5 rounded-xl transition-all"
            >
              {saving ? <Loader2 size={15} className="animate-spin" /> : mode === 'invite' ? <Send size={15} /> : <ShieldCheck size={15} />}
              {saving ? 'Saving...' : mode === 'invite' ? 'Send Secure KYC Invite Link' : 'Add & Verify Signer'}
            </button>
            <button type="button" onClick={onClose} className="px-4 py-2.5 text-sm font-medium text-gray-500 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors">
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}