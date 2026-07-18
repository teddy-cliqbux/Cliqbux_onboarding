import { useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X, UserPlus, Send, Loader2, ShieldCheck, Mail, CheckCircle2 } from 'lucide-react';
import { invokePortalFunction } from '@/lib/merchantAuthFetch';

const MONTHS = [
  { value: '01', label: 'Jan' }, { value: '02', label: 'Feb' }, { value: '03', label: 'Mar' },
  { value: '04', label: 'Apr' }, { value: '05', label: 'May' }, { value: '06', label: 'Jun' },
  { value: '07', label: 'Jul' }, { value: '08', label: 'Aug' }, { value: '09', label: 'Sep' },
  { value: '10', label: 'Oct' }, { value: '11', label: 'Nov' }, { value: '12', label: 'Dec' },
];
const DAYS = Array.from({ length: 31 }, (_, i) => String(i + 1).padStart(2, '0'));
const currentYear = new Date().getFullYear();
const YEARS = Array.from({ length: 80 }, (_, i) => String(currentYear - 18 - i));

const inputCls = 'w-full bg-cb-bg border border-cb-border rounded-cb px-3 py-2.5 text-cb-body text-white placeholder:text-gray-500 transition-colors hover:border-cb-border-strong focus:outline-none focus:ring-2 focus:ring-cb-accent focus:border-transparent';
const selectCls = `${inputCls}`;
const labelCls = 'block text-cb-caption uppercase text-gray-500 mb-1.5';

function useAddressAutocomplete(onParsed) {
  const acRef = useRef(null);
  const callbackRef = (el) => {
    if (!el || acRef.current) return;
    if (!window.google?.maps?.places) return;
    const ac = new window.google.maps.places.Autocomplete(el, {
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
    acRef.current = ac;
  };
  return callbackRef;
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

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const addrRef = useAddressAutocomplete(({ street, city, state, zip }) => {
    setForm(p => ({ ...p, homeStreet: street, homeCity: city, homeState: state, homeZip: zip }));
    setAddressDisplay(`${street}, ${city}, ${state} ${zip}`);
    setAddressVerified(true);
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.firstName || !form.lastName || !form.signerEmail || form.ownershipPercentage === '') {
      setError('First name, last name, email, and ownership % are required (0% OK for Control Person or Portal Admin).');
      return;
    }
    const pct = Number(form.ownershipPercentage);
    if (Number.isNaN(pct) || pct < 0 || pct > 100) {
      setError('Ownership % must be between 0 and 100.');
      return;
    }
    if (mode === 'now' && pct >= 25 && (!form.dobMonth || !form.dobDay || !form.dobYear || !form.ssn || !form.homeStreet)) {
      setError('Please complete all identity fields for Beneficial Owners.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const res = await invokePortalFunction('manageSigner', {
        action: 'create',
        corporateId,
        sendInvite: mode === 'invite',
        signerData: {
          ...form,
          legalName,
          ownershipPercentage: pct,
          isPrimarySigner: form.isPrimarySigner === true,
          isAuthorizedSigner: form.isPrimarySigner === true,
          isBeneficialOwner: pct >= 25,
          isPortalAdmin: pct === 0 && form.isPrimarySigner !== true,
        }
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
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm px-4"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-cb-surface-raised border border-cb-border rounded-cb shadow-cb-overlay w-full max-w-lg max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-start justify-between px-6 py-5 border-b border-cb-border">
          <div className="flex items-center gap-3">
            <UserPlus className="w-4 h-4 text-cb-accent flex-shrink-0" />
            <div>
              <h3 className="font-display text-cb-title text-white">Add Another Owner or Signer</h3>
              <p className="text-cb-caption normal-case tracking-normal font-normal text-gray-500 mt-0.5">For someone other than yourself — all data is encrypted and used only for underwriting</p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white p-1.5 rounded-cb transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-6 py-5">
          {/* Mode toggle — segmented control */}
          <div className="flex rounded-cb bg-cb-bg border border-cb-border p-1 mb-6 gap-1">
            <button
              type="button"
              onClick={() => setMode('now')}
              className={`flex-1 flex items-center justify-center gap-2 text-cb-body font-medium py-2.5 rounded-cb transition-colors ${mode === 'now' ? 'bg-cb-accent-muted text-cb-accent' : 'text-gray-400 hover:text-white'}`}
            >
              <ShieldCheck className="w-3.5 h-3.5" /> Verify Now
            </button>
            <button
              type="button"
              onClick={() => setMode('invite')}
              className={`flex-1 flex items-center justify-center gap-2 text-cb-body font-medium py-2.5 rounded-cb transition-colors ${mode === 'invite' ? 'bg-cb-accent-muted text-cb-accent' : 'text-gray-400 hover:text-white'}`}
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
                <div className="border-t border-cb-border pt-4">
                  <p className="text-cb-caption uppercase text-gray-500 mb-4">Identity Details</p>
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
                    <div className="flex items-center gap-2.5 bg-cb-bg border border-cb-border rounded-cb px-3 py-2.5">
                      <CheckCircle2 className="w-4 h-4 text-cb-success flex-shrink-0" />
                      <span className="text-cb-body text-gray-300 flex-1 truncate">{addressDisplay}</span>
                      <button type="button" onClick={() => { setAddressVerified(false); setAddressDisplay(''); setForm(p => ({ ...p, homeStreet: '', homeCity: '', homeState: '', homeZip: '' })); }}
                        className="text-gray-500 hover:text-white">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ) : (
                    <input
                      ref={addrRef}
                      key="addr-input"
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
              <div className="bg-cb-bg border border-cb-border border-l-2 border-l-cb-accent rounded-cb px-4 py-3 flex items-start gap-3">
                <Mail className="w-4 h-4 text-cb-accent flex-shrink-0 mt-0.5" />
                <p className="text-cb-body text-gray-400">
                  A secure, tokenized verification link will be emailed to <strong className="text-white font-medium">{form.signerEmail || 'this signer'}</strong>. They will complete their own identity verification independently.
                </p>
              </div>
            )}

            {error && (
              <div className="bg-cb-bg border border-cb-border border-l-2 border-l-cb-danger rounded-cb px-4 py-3 text-cb-body text-cb-danger">{error}</div>
            )}

            <div className="flex gap-3 pt-1">
              <button
                type="submit"
                disabled={saving}
                className="flex-1 flex items-center justify-center gap-2 text-cb-body font-semibold text-cb-bg bg-cb-accent hover:opacity-90 disabled:bg-cb-surface disabled:text-gray-600 px-5 py-3 rounded-cb transition-all"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : mode === 'invite' ? <Send className="w-4 h-4" /> : <ShieldCheck className="w-4 h-4" />}
                {saving ? 'Saving...' : mode === 'invite' ? 'Send KYC Invite' : 'Add & Verify Signer'}
              </button>
              <button type="button" onClick={onClose} className="px-4 py-3 text-cb-body font-medium text-gray-400 border border-cb-border hover:text-white hover:border-cb-border-strong rounded-cb transition-colors">
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
