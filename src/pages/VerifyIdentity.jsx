import { useState, useEffect } from 'react';
import { CheckCircle, Loader2, AlertTriangle } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import CliqbuxLogo from '@/components/onboarding/CliqbuxLogo';

const MONTHS = [
  { value: '01', label: 'Jan' }, { value: '02', label: 'Feb' }, { value: '03', label: 'Mar' },
  { value: '04', label: 'Apr' }, { value: '05', label: 'May' }, { value: '06', label: 'Jun' },
  { value: '07', label: 'Jul' }, { value: '08', label: 'Aug' }, { value: '09', label: 'Sep' },
  { value: '10', label: 'Oct' }, { value: '11', label: 'Nov' }, { value: '12', label: 'Dec' },
];
const DAYS = Array.from({ length: 31 }, (_, i) => String(i + 1).padStart(2, '0'));
const currentYear = new Date().getFullYear();
const YEARS = Array.from({ length: 80 }, (_, i) => String(currentYear - 18 - i));

const inputCls = 'w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500';
const labelCls = 'text-xs font-semibold text-gray-600 block mb-1.5';

export default function VerifyIdentity() {
  const [token, setToken] = useState('');
  const [signerInfo, setSignerInfo] = useState(null);
  const [legalName, setLegalName] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    firstName: '', lastName: '', dobMonth: '', dobDay: '', dobYear: '',
    ssn: '', homeStreet: '', homeCity: '', homeState: '', homeZip: '', corporatePhone: ''
  });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const t = params.get('token');
    if (!t) { setError('No verification token found. Please use the link from your email.'); setLoading(false); return; }
    setToken(t);
    loadSigner(t);
  }, []);

  const loadSigner = async (t) => {
    setLoading(true);
    try {
      const res = await base44.functions.invoke('verifySignerToken', { action: 'get', token: t });
      if (res.data?.error) throw new Error(res.data.error);
      const s = res.data.signer;
      setSignerInfo(s);
      setLegalName(res.data.legalName || '');
      if (s.identityStatus === 'Verified') setDone(true);
      setForm(f => ({ ...f, firstName: s.firstName || '', lastName: s.lastName || '' }));
    } catch (err) {
      setError(err.message || 'Invalid or expired verification link.');
    } finally {
      setLoading(false);
    }
  };

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.dobMonth || !form.dobDay || !form.dobYear) { setError('Date of birth is required.'); return; }
    if (!form.ssn || form.ssn.replace(/\D/g,'').length !== 9) { setError('A valid 9-digit SSN is required.'); return; }
    if (!form.homeStreet || !form.homeCity || !form.homeState || !form.homeZip) { setError('Home address is required.'); return; }
    setSaving(true);
    setError('');
    try {
      const res = await base44.functions.invoke('verifySignerToken', {
        action: 'save',
        token,
        signerData: { ...form, ssn: form.ssn.replace(/\D/g,'') }
      });
      if (res.data?.error) throw new Error(res.data.error);
      setDone(true);
    } catch (err) {
      setError(err.message || 'Verification failed. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ background: '#111827', minHeight: '100vh', fontFamily: 'Inter, sans-serif', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '40px 16px' }}>
      {/* Brand */}
      <div className="mb-8">
        <CliqbuxLogo />
      </div>

      <div style={{ background: '#fff', borderRadius: 20, boxShadow: '0 25px 50px rgba(0,0,0,0.4)', width: '100%', maxWidth: 480, padding: 32 }}>
        {loading && (
          <div className="flex flex-col items-center gap-4 py-10">
            <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
            <p className="text-gray-500 text-sm">Loading your verification session...</p>
          </div>
        )}

        {!loading && error && !signerInfo && (
          <div className="flex flex-col items-center gap-4 py-6 text-center">
            <div className="w-14 h-14 rounded-full bg-red-50 flex items-center justify-center">
              <AlertTriangle className="w-7 h-7 text-red-500" />
            </div>
            <div>
              <p className="font-bold text-gray-900 mb-1">Verification Link Invalid</p>
              <p className="text-sm text-gray-500">{error}</p>
            </div>
          </div>
        )}

        {!loading && done && (
          <div className="flex flex-col items-center gap-4 py-8 text-center">
            <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center">
              <CheckCircle className="w-9 h-9 text-green-600" />
            </div>
            <div>
              <p className="font-bold text-gray-900 text-lg mb-1">Identity Verified!</p>
              <p className="text-sm text-gray-500">
                Thank you, {signerInfo?.firstName}. Your verification is complete and the merchant application has been updated.
              </p>
            </div>
            <p className="text-xs text-gray-400 mt-2">You may safely close this window.</p>
          </div>
        )}

        {!loading && !done && signerInfo && (
          <>
            <div className="mb-6">
              <p className="text-xs font-semibold text-blue-600 uppercase tracking-widest mb-1">Secure Identity Verification</p>
              <h2 className="text-xl font-bold text-gray-900">Hello, {signerInfo.firstName}</h2>
              {legalName && <p className="text-sm text-gray-500 mt-0.5">You've been added as a beneficial owner for <strong>{legalName}</strong>. Please complete verification below.</p>}
            </div>

            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>First Name</label>
                  <input className={inputCls} value={form.firstName} onChange={e => set('firstName', e.target.value)} />
                </div>
                <div>
                  <label className={labelCls}>Last Name</label>
                  <input className={inputCls} value={form.lastName} onChange={e => set('lastName', e.target.value)} />
                </div>
              </div>

              <div>
                <label className={labelCls}>Date of Birth</label>
                <div className="flex gap-2">
                  <select className="flex-1 text-sm border border-gray-200 rounded-lg px-2 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white" value={form.dobMonth} onChange={e => set('dobMonth', e.target.value)}>
                    <option value="">Month</option>
                    {MONTHS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                  </select>
                  <select className="w-20 text-sm border border-gray-200 rounded-lg px-2 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white" value={form.dobDay} onChange={e => set('dobDay', e.target.value)}>
                    <option value="">Day</option>
                    {DAYS.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                  <select className="w-24 text-sm border border-gray-200 rounded-lg px-2 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white" value={form.dobYear} onChange={e => set('dobYear', e.target.value)}>
                    <option value="">Year</option>
                    {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label className={labelCls}>Social Security Number (SSN)</label>
                <input type="password" maxLength={9} className={inputCls} value={form.ssn} onChange={e => set('ssn', e.target.value.replace(/\D/g,'').slice(0,9))} placeholder="9 digits — encrypted" />
                {form.ssn.length > 0 && form.ssn.length < 9 && <p className="text-xs text-gray-400 mt-1">{form.ssn.length}/9 digits</p>}
              </div>

              <div>
                <label className={labelCls}>Home Address</label>
                <input className={inputCls} value={form.homeStreet} onChange={e => set('homeStreet', e.target.value)} placeholder="123 Main St" />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <input className={`${inputCls} col-span-1`} value={form.homeCity} onChange={e => set('homeCity', e.target.value)} placeholder="City" />
                <input className={inputCls} value={form.homeState} onChange={e => set('homeState', e.target.value)} placeholder="ST" maxLength={2} />
                <input className={inputCls} value={form.homeZip} onChange={e => set('homeZip', e.target.value)} placeholder="ZIP" />
              </div>

              <div>
                <label className={labelCls}>Phone Number</label>
                <input type="tel" className={inputCls} value={form.corporatePhone} onChange={e => set('corporatePhone', e.target.value)} placeholder="10-digit phone" />
              </div>

              {error && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}

              <button
                type="submit"
                disabled={saving}
                className="w-full flex items-center justify-center gap-2 text-sm font-bold text-white bg-gray-900 hover:bg-gray-800 disabled:bg-gray-400 py-3 rounded-xl transition-all mt-1"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                {saving ? 'Submitting...' : 'Submit Verification'}
              </button>
            </form>
          </>
        )}
      </div>

      <p className="text-gray-600 text-xs mt-6">
        Secured by <span className="text-amber-500 font-semibold">Cliqbux</span> · onboarding.cliqbux.com
      </p>
    </div>
  );
}