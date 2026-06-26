import { useState } from 'react';
import { ShieldCheck, CheckCircle, Loader2, Eye, EyeOff } from 'lucide-react';
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
const labelCls = 'text-xs font-semibold text-gray-600 block mb-1.5';

export default function InlineVerifyForm({ signer, onVerified, corporateId }) {
  const [expanded, setExpanded] = useState(false);
  const [showSsn, setShowSsn] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    dobMonth: signer.dobMonth || '',
    dobDay: signer.dobDay || '',
    dobYear: signer.dobYear || '',
    ssn: signer.ssn || '',
    homeStreet: signer.homeStreet || '',
    homeCity: signer.homeCity || '',
    homeState: signer.homeState || '',
    homeZip: signer.homeZip || '',
    corporatePhone: signer.corporatePhone || '',
  });

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const handleVerify = async (e) => {
    e && e.preventDefault();
    if (!form.dobMonth || !form.dobDay || !form.dobYear) { setError('Date of birth is required.'); return; }
    if (!form.ssn || form.ssn.replace(/\D/g, '').length !== 9) { setError('A valid 9-digit SSN is required.'); return; }
    if (!form.homeStreet || !form.homeCity || !form.homeState || !form.homeZip) { setError('Home address is required.'); return; }

    setSaving(true);
    setError('');
    try {
      const res = await base44.functions.invoke('manageSigner', {
        action: 'inlineVerify',
        corporateId,
        signerId: signer.id,
        signerData: { ...form, ssn: form.ssn.replace(/\D/g, '') }
      });
      if (res.data?.error) throw new Error(res.data.error);
      onVerified({ ...signer, ...res.data.signer, identityStatus: 'Verified' });
    } catch (err) {
      setError(err.message || 'Verification failed. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  if (signer.identityStatus === 'Verified') {
    return null;
  }

  if (!expanded) {
    return (
      <button
        onClick={() => setExpanded(true)}
        className="text-xs text-blue-600 hover:text-blue-800 border border-blue-200 bg-blue-50 hover:bg-blue-100 px-2.5 py-1.5 rounded-lg font-semibold transition-colors flex items-center gap-1"
      >
        <ShieldCheck className="w-3 h-3" /> Verify Now
      </button>
    );
  }

  return (
    <div className="border border-blue-200 bg-blue-50/50 rounded-lg p-4 max-w-sm space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-bold text-blue-700 uppercase tracking-widest">Complete Identity Verification</p>
        <button onClick={() => setExpanded(false)} className="text-xs text-gray-400 hover:text-gray-600 underline">Cancel</button>
      </div>

      {/* DOB */}
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

      {/* SSN */}
      <div>
        <label className={labelCls}>Social Security Number (SSN)</label>
        <div className="relative">
          <input
            type={showSsn ? 'text' : 'password'}
            maxLength={9}
            className={`${inputCls} pr-9`}
            value={form.ssn}
            onChange={e => set('ssn', e.target.value.replace(/\D/g, '').slice(0, 9))}
            placeholder="9 digits — encrypted"
          />
          <button
            type="button"
            onClick={() => setShowSsn(!showSsn)}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
          >
            {showSsn ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Home Address */}
      <div>
        <label className={labelCls}>Home Address</label>
        <input className={inputCls} value={form.homeStreet} onChange={e => set('homeStreet', e.target.value)} placeholder="123 Main St" />
      </div>
      <div className="grid grid-cols-3 gap-2">
        <input className={`${inputCls} col-span-1`} value={form.homeCity} onChange={e => set('homeCity', e.target.value)} placeholder="City" />
        <input className={inputCls} value={form.homeState} onChange={e => set('homeState', e.target.value)} placeholder="ST" maxLength={2} />
        <input className={inputCls} value={form.homeZip} onChange={e => set('homeZip', e.target.value)} placeholder="ZIP" />
      </div>

      {/* Phone */}
      <div>
        <label className={labelCls}>Phone Number</label>
        <input type="tel" className={inputCls} value={form.corporatePhone} onChange={e => set('corporatePhone', e.target.value)} placeholder="10-digit phone" />
      </div>

      {error && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}

      <button
        type="button"
        onClick={handleVerify}
        disabled={saving}
        className="w-full flex items-center justify-center gap-2 text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 py-2.5 rounded-lg transition-all"
      >
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
        {saving ? 'Verifying...' : 'Submit & Verify'}
      </button>
    </div>
  );
}