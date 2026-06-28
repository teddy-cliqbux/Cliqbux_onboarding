import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, UserPlus, Send, Loader2, ShieldCheck, Mail, CheckCircle2 } from 'lucide-react';
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

const inputCls = 'w-full bg-[#111318] border border-white/20 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent';
const selectCls = `${inputCls}`;
const labelCls = 'block text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5';

function usePlacesAutocomplete(ref, onParsed) {
  useEffect(() => {
    if (!ref.current || !window.google?.maps?.places) return;
    const ac = new window.google.maps.places.Autocomplete(ref.current, {
      types: ['address'], componentRestrictions: { country: 'us' },
      fields: ['address_components', 'formatted_address'],
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

export default function SignerModal({ corporateId, legalName, isPrimary = false, onSaved, onClose }) {
  const [mode, setMode] = useState('now'); // 'now' | 'invite'
  const [form, setForm] = useState({
    firstName: '', lastName: '', signerEmail: '',
    ownershipPercentage: '', isPrimarySigner: isPrimary,
    dobMonth: '', dobDay: '', dobYear: '', ssn: '',
    homeStreet: '', homeCity: '', homeState: '', homeZip: '',
    corporatePhone: '',
  });
  const [addressDisplay, setAddressDisplay] = useState('');
  const [addressVerified, setAddressVerified] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const addrRef = useRef(null);

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  usePlacesAutocomplete(addrRef, ({ street, city, state, zip }) => {
    setForm(p => ({ ...p, homeStreet: street, homeCity: city, homeState: state, homeZip: zip }));
    setAddressDisplay(`${street}, ${city}, ${state} ${zip}`);
    setAddressVerified(true);
  });

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
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 px-4"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-[#1c2128] border border-white/10 rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-500/15 flex items-center justify-center flex-shrink-0">
              <UserPlus className="w-4 h-4 text-blue-400" />
            </div>
            <div>
              <h3 className="font-bold text-white text-base">Add Beneficial Owner / Signer</h3>
              <p className="text-xs text-gray-500 mt-0.5">All data is encrypted and used only for underwriting</p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white p-1.5 rounded-lg transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-6 py-5">
          {/* Mode toggle */}
          <div className="flex rounded-xl bg-white/5 border border-white/10 p-1 mb-6 gap-1">
            <button
              type="button"
              onClick={() => setMode('now')}
              className={`flex-1 flex items-center justify-center gap-2 text-xs font-semibold py-2.5 rounded-lg transition-all ${mode === 'now' ? 'bg-amber-500 text-black shadow' : 'text-gray-400 hover:text-white'}`}
            >
              <ShieldCheck className="w-3.5 h-3.5" /> Verify Now
            </button>
            <button
              type="button"
              onClick={() => setMode('invite')}
              className={`flex-1 flex items-center justify-center gap-2 text-xs font-semibold py-2.5 rounded-lg transition-all ${mode === 'invite' ? 'bg-amber-500 text-black shadow' : 'text-gray-400 hover:text-white'}`}
            >
              <Mail className="w-3.5 h-3.5" /> Send Email Invite
            </button>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            {/* Basic info */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>First Name *</label>
                <input className={inputCls} value={form.firstName} onChange={e => set('firstName', e.target.value)} placeholder="Jane" />
              </div>
              <div>
                <label className={labelCls}>Last Name *</label>
                <input className={inputCls} value={form.lastName} onChange={e => set('lastName', e.target.value)} placeholder="Smith" />
              </div>
            </div>
            <div>
              <label className={labelCls}>Email Address *</label>
              <input type="email" className={inputCls} value={form.signerEmail} onChange={e => set('signerEmail', e.target.value)} placeholder="jane@company.com" />
            </div>
            <div>
              <label className={labelCls}>Ownership Percentage (%) *</label>
              <input type="number" min={1} max={100} className={inputCls} value={form.ownershipPercentage} onChange={e => set('ownershipPercentage', e.target.value)} placeholder="e.g. 25" />
            </div>

            {/* Self-verification fields */}
            {mode === 'now' && (
              <>
                <div className="border-t border-white/8 pt-4">
                  <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-4">Identity Details</p>
                </div>
                <div>
                  <label className={labelCls}>Date of Birth *</label>
                  <div className="flex gap-2">
                    <select className={selectCls} value={form.dobMonth} onChange={e => set('dobMonth', e.target.value)} style={{ colorScheme: 'dark' }}>
                      <option value="">Month</option>
                      {MONTHS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                    </select>
                    <select className={`${selectCls} w-24`} value={form.dobDay} onChange={e => set('dobDay', e.target.value)} style={{ colorScheme: 'dark' }}>
                      <option value="">Day</option>
                      {DAYS.map(d => <option key={d} value={d}>{d}</option>)}
                    </select>
                    <select className={`${selectCls} w-28`} value={form.dobYear} onChange={e => set('dobYear', e.target.value)} style={{ colorScheme: 'dark' }}>
                      <option value="">Year</option>
                      {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
                    </select>
                  </div>
                </div>
                <div>
                  <label className={labelCls}>Social Security Number (SSN) *</label>
                  <input type="password" maxLength={9} className={`${inputCls} font-mono tracking-widest`} value={form.ssn} onChange={e => set('ssn', e.target.value.replace(/\D/g, '').slice(0, 9))} placeholder="9 digits — secured" />
                </div>
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
                <div>
                  <label className={labelCls}>Phone Number</label>
                  <input type="tel" className={inputCls} value={form.corporatePhone} onChange={e => set('corporatePhone', e.target.value.replace(/\D/g, '').slice(0, 10))} placeholder="10-digit phone" />
                </div>
              </>
            )}

            {/* Invite mode notice */}
            {mode === 'invite' && (
              <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl px-4 py-3 flex items-start gap-3">
                <Mail className="w-4 h-4 text-blue-400 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-blue-300">
                  A secure, tokenized verification link will be emailed to <strong className="text-white">{form.signerEmail || 'this signer'}</strong>. They will complete their own identity verification independently.
                </p>
              </div>
            )}

            {error && (
              <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-sm text-red-300">{error}</div>
            )}

            <div className="flex gap-3 pt-1">
              <button
                type="submit"
                disabled={saving}
                className="flex-1 flex items-center justify-center gap-2 text-sm font-bold text-black bg-amber-500 hover:bg-amber-400 disabled:bg-gray-600 disabled:text-gray-400 px-5 py-3 rounded-xl transition-all"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : mode === 'invite' ? <Send className="w-4 h-4" /> : <ShieldCheck className="w-4 h-4" />}
                {saving ? 'Saving...' : mode === 'invite' ? 'Send KYC Invite' : 'Add & Verify Signer'}
              </button>
              <button type="button" onClick={onClose} className="px-4 py-3 text-sm font-medium text-gray-400 border border-white/15 hover:text-white hover:border-white/30 rounded-xl transition-colors">
                Cancel
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}