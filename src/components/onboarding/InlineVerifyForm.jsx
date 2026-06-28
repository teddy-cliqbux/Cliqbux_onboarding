import { useState, useRef, useEffect } from 'react';
import { ShieldCheck, CheckCircle2, Loader2, Eye, EyeOff, X } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { formatSSN, rawSSN, formatPhone, rawPhone } from '@/lib/textUtils';

const MONTHS = [
  { value: '01', label: 'Jan' }, { value: '02', label: 'Feb' }, { value: '03', label: 'Mar' },
  { value: '04', label: 'Apr' }, { value: '05', label: 'May' }, { value: '06', label: 'Jun' },
  { value: '07', label: 'Jul' }, { value: '08', label: 'Aug' }, { value: '09', label: 'Sep' },
  { value: '10', label: 'Oct' }, { value: '11', label: 'Nov' }, { value: '12', label: 'Dec' },
];
const DAYS = Array.from({ length: 31 }, (_, i) => String(i + 1).padStart(2, '0'));
const currentYear = new Date().getFullYear();
const YEARS = Array.from({ length: 80 }, (_, i) => String(currentYear - 18 - i));

const inputCls = 'w-full bg-[#111318] border border-white/20 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent';
const labelCls = 'block text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5';

function usePlacesAutocomplete(ref, onParsed) {
  useEffect(() => {
    if (!ref.current || !window.google?.maps?.places) return;
    const ac = new window.google.maps.places.Autocomplete(ref.current, {
      types: ['address'], componentRestrictions: { country: 'us' },
      fields: ['address_components'],
    });
    ac.addListener('place_changed', () => {
      const place = ac.getPlace();
      if (!place?.address_components) return;
      const get = (types) => (place.address_components.find(c => types.some(t => c.types.includes(t))) || {}).long_name || '';
      const getS = (types) => (place.address_components.find(c => types.some(t => c.types.includes(t))) || {}).short_name || '';
      const street = (get(['street_number']) ? `${get(['street_number'])} ` : '') + get(['route']);
      const city = get(['locality', 'sublocality']);
      const state = getS(['administrative_area_level_1']);
      const zip = get(['postal_code']);
      onParsed({ street, city, state, zip });
    });
    return () => window.google?.maps?.event?.clearInstanceListeners(ac);
  }, []);
}

export default function InlineVerifyForm({ signer, onVerified, corporateId }) {
  const [expanded, setExpanded] = useState(false);
  const [showSsn, setShowSsn] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [addressDisplay, setAddressDisplay] = useState(
    signer.homeStreet
      ? `${signer.homeStreet}${signer.homeCity ? ', ' + signer.homeCity : ''}${signer.homeState ? ', ' + signer.homeState : ''}${signer.homeZip ? ' ' + signer.homeZip : ''}`
      : ''
  );
  const [addressVerified, setAddressVerified] = useState(!!signer.homeStreet);

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

  const addrRef = useRef(null);
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  usePlacesAutocomplete(addrRef, ({ street, city, state, zip }) => {
    setForm(p => ({ ...p, homeStreet: street, homeCity: city, homeState: state, homeZip: zip }));
    setAddressDisplay(`${street}, ${city}, ${state} ${zip}`);
    setAddressVerified(true);
  });

  const handleVerify = async (e) => {
    e && e.preventDefault();
    if (!form.dobMonth || !form.dobDay || !form.dobYear) { setError('Date of birth is required.'); return; }
    if (!form.ssn || rawSSN(form.ssn).length !== 9) { setError('A valid 9-digit SSN is required.'); return; }
    if (!form.homeStreet || !form.homeCity || !form.homeState || !form.homeZip) { setError('Home address is required.'); return; }

    setSaving(true);
    setError('');
    try {
      const res = await base44.functions.invoke('manageSigner', {
        action: 'inlineVerify',
        corporateId,
        signerId: signer.id,
        signerData: { ...form, ssn: rawSSN(form.ssn), corporatePhone: rawPhone(form.corporatePhone) }
      });
      if (res.data?.error) throw new Error(res.data.error);
      onVerified({ ...signer, ...res.data.signer, identityStatus: 'Verified' });
    } catch (err) {
      setError(err.message || 'Verification failed. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  if (signer.identityStatus === 'Verified') return null;

  if (!expanded) {
    return (
      <button
        onClick={() => setExpanded(true)}
        className="text-xs text-amber-400 hover:text-amber-300 border border-amber-500/30 bg-amber-500/10 hover:bg-amber-500/15 px-3 py-1.5 rounded-lg font-semibold transition-colors flex items-center gap-1.5"
      >
        <ShieldCheck className="w-3.5 h-3.5" /> Verify Now
      </button>
    );
  }

  return (
    <div className="bg-[#111318] border border-white/10 rounded-xl p-4 space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-bold text-amber-400 uppercase tracking-widest">Complete Identity Verification</p>
        <button onClick={() => setExpanded(false)} className="text-xs text-gray-500 hover:text-white transition-colors">Cancel</button>
      </div>

      {/* DOB */}
      <div>
        <label className={labelCls}>Date of Birth *</label>
        <div className="flex gap-2">
          <select className={inputCls} value={form.dobMonth} onChange={e => set('dobMonth', e.target.value)} style={{ colorScheme: 'dark' }}>
            <option value="">Month</option>
            {MONTHS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
          <select className={`${inputCls} w-24`} value={form.dobDay} onChange={e => set('dobDay', e.target.value)} style={{ colorScheme: 'dark' }}>
            <option value="">Day</option>
            {DAYS.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
          <select className={`${inputCls} w-28`} value={form.dobYear} onChange={e => set('dobYear', e.target.value)} style={{ colorScheme: 'dark' }}>
            <option value="">Year</option>
            {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
      </div>

      {/* SSN */}
      <div>
        <label className={labelCls}>Social Security Number (SSN) *</label>
        <div className="relative">
          <input
            type={showSsn ? 'text' : 'password'}
            maxLength={showSsn ? 11 : 9}
            className={`${inputCls} pr-10 font-mono tracking-[0.2em]`}
            value={showSsn ? formatSSN(form.ssn || '') : (form.ssn || '')}
            onChange={e => set('ssn', e.target.value.replace(/\D/g, '').slice(0, 9))}
            placeholder="XXX-XX-XXXX"
          />
          <button
            type="button"
            onClick={() => setShowSsn(!showSsn)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
          >
            {showSsn ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Home Address — Google verified */}
      <div>
        <label className={labelCls}>Home Address *</label>
        {addressVerified ? (
          <div className="flex items-center gap-2 bg-green-500/10 border border-green-500/20 rounded-xl px-3.5 py-2.5">
            <CheckCircle2 className="w-4 h-4 text-green-400 flex-shrink-0" />
            <span className="text-sm text-green-300 flex-1 truncate">{addressDisplay}</span>
            <button type="button" onClick={() => { setAddressVerified(false); setAddressDisplay(''); setForm(p => ({ ...p, homeStreet: '', homeCity: '', homeState: '', homeZip: '' })); }}
              className="text-gray-500 hover:text-white">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : (
          <input
            ref={addrRef}
            type="text"
            value={addressDisplay}
            onChange={e => { setAddressDisplay(e.target.value); setAddressVerified(false); }}
            onKeyDown={e => e.key === 'Enter' && e.preventDefault()}
            placeholder="Start typing to search…"
            autoComplete="off"
            className={inputCls}
          />
        )}
      </div>

      {/* Phone */}
      <div>
        <label className={labelCls}>Phone Number</label>
        <input type="tel" className={inputCls} value={formatPhone(form.corporatePhone)} onChange={e => set('corporatePhone', e.target.value.replace(/\D/g, '').slice(0, 10))} placeholder="(555) 555-5555" />
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-sm text-red-300">{error}</div>
      )}

      <button
        type="button"
        onClick={handleVerify}
        disabled={saving}
        className="w-full flex items-center justify-center gap-2 text-sm font-bold text-black bg-amber-500 hover:bg-amber-400 disabled:bg-gray-600 disabled:text-gray-400 py-3 rounded-xl transition-all"
      >
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
        {saving ? 'Verifying...' : 'Submit & Verify'}
      </button>
    </div>
  );
}