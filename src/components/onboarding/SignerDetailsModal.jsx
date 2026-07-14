import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X, ShieldCheck, CheckCircle2, Loader2, Eye, EyeOff, Sparkles, Save } from 'lucide-react';
import { formatSSN, rawSSN, formatPhone, rawPhone } from '@/lib/textUtils';
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

const TITLE_TYPES = [
  { value: 'CHIEF_EXECUTIVE_OFFICER', label: 'CEO' },
  { value: 'PRESIDENT', label: 'President' },
  { value: 'OWNER', label: 'Owner' },
  { value: 'PARTNER', label: 'Partner' },
  { value: 'MANAGER', label: 'Manager' },
  { value: 'DIRECTOR', label: 'Director' },
  { value: 'VICE_PRESIDENT', label: 'Vice President' },
  { value: 'SECRETARY', label: 'Secretary' },
  { value: 'TREASURER', label: 'Treasurer' },
];

const inputCls = 'w-full bg-cb-bg border border-cb-border rounded-cb px-3 py-2.5 text-cb-body text-white placeholder:text-gray-500 transition-colors hover:border-cb-border-strong focus:outline-none focus:ring-2 focus:ring-cb-accent focus:border-transparent';
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

// Single modal for everything about an existing signer: contact info (name /
// email / ownership %) AND identity verification (DOB / SSN / address / title /
// phone) when the signer is primary OR colocated (`allowInlineKyc`). Remote
// owners verify via their Verify & Sign email (/verify?intent=sign).
export default function SignerDetailsModal({ signer, corporateId, profile, onSaved, onClose, allowInlineKyc = false }) {
  const isPrimary = signer.isPrimarySigner === true;
  const showKyc = isPrimary || allowInlineKyc === true;
  const inheritedTitle = signer.titleType || profile?.titleType || '';

  const [form, setForm] = useState({
    firstName: signer.firstName || '',
    lastName: signer.lastName || '',
    signerEmail: signer.signerEmail || '',
    ownershipPercentage: signer.ownershipPercentage || '',
    dobMonth: signer.dobMonth || '',
    dobDay: signer.dobDay || '',
    dobYear: signer.dobYear || '',
    ssn: signer.ssn || '',
    homeStreet: signer.homeStreet || '',
    homeCity: signer.homeCity || '',
    homeState: signer.homeState || '',
    homeZip: signer.homeZip || '',
    corporatePhone: signer.corporatePhone || '',
    titleType: inheritedTitle,
  });
  const [showSsn, setShowSsn] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [addressDisplay, setAddressDisplay] = useState(
    signer.homeStreet
      ? `${signer.homeStreet}${signer.homeCity ? ', ' + signer.homeCity : ''}${signer.homeState ? ', ' + signer.homeState : ''}${signer.homeZip ? ' ' + signer.homeZip : ''}`
      : ''
  );
  const [addressVerified, setAddressVerified] = useState(!!signer.homeStreet);

  // Returning signer lookup — same email verified on another application
  const [priorData, setPriorData] = useState(null);
  const [lookingUp, setLookingUp] = useState(false);

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const addrRef = useAddressAutocomplete(({ street, city, state, zip }) => {
    setForm(p => ({ ...p, homeStreet: street, homeCity: city, homeState: state, homeZip: zip }));
    setAddressDisplay(`${street}, ${city}, ${state} ${zip}`);
    setAddressVerified(true);
  });

  useEffect(() => {
    // Only worth looking up when identity data is still missing
    if (!showKyc || !signer.signerEmail || (signer.dobYear && signer.ssn)) return;
    (async () => {
      setLookingUp(true);
      try {
        const res = await invokePortalFunction('manageSigner', {
          action: 'lookupByEmail',
          corporateId,
          signerEmail: signer.signerEmail,
        });
        if (res.data?.found) setPriorData(res.data.signerData);
      } catch (err) {
        // Message only — never log signerData (contains SSN/DOB/address)
        console.error('[SignerDetailsModal.lookupByEmail]', err?.message || 'Unknown error');
      } finally {
        setLookingUp(false);
      }
    })();
  }, []);

  const applyPriorData = (data) => {
    setForm(p => ({
      ...p,
      dobMonth: data.dobMonth || p.dobMonth,
      dobDay: data.dobDay || p.dobDay,
      dobYear: data.dobYear || p.dobYear,
      ssn: data.ssn || p.ssn,
      homeStreet: data.homeStreet || p.homeStreet,
      homeCity: data.homeCity || p.homeCity,
      homeState: data.homeState || p.homeState,
      homeZip: data.homeZip || p.homeZip,
      corporatePhone: data.corporatePhone || p.corporatePhone,
    }));
    if (data.homeStreet) {
      setAddressDisplay(`${data.homeStreet}${data.homeCity ? ', ' + data.homeCity : ''}${data.homeState ? ', ' + data.homeState : ''}${data.homeZip ? ' ' + data.homeZip : ''}`);
      setAddressVerified(true);
    }
    setPriorData(null);
  };

  const handleSave = async () => {
    if (!form.firstName.trim() || !form.lastName.trim() || !form.signerEmail.trim()) {
      setError('First name, last name, and email are required.'); return;
    }
    if (!form.ownershipPercentage || Number(form.ownershipPercentage) < 1) {
      setError('Ownership percentage is required.'); return;
    }
    if (showKyc) {
      if (!form.dobMonth || !form.dobDay || !form.dobYear) { setError('Date of birth is required.'); return; }
      if (!form.ssn || rawSSN(form.ssn).length !== 9) { setError('A valid 9-digit SSN is required.'); return; }
      if (!form.homeStreet || !form.homeCity || !form.homeState || !form.homeZip) { setError('Home address is required.'); return; }
      if (!form.titleType) { setError('Please select your title / role.'); return; }
    }

    setSaving(true);
    setError('');
    try {
      const signerData = {
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        signerEmail: form.signerEmail.trim(),
        ownershipPercentage: Number(form.ownershipPercentage) || 0,
      };
      if (showKyc) {
        Object.assign(signerData, {
          dobMonth: form.dobMonth,
          dobDay: form.dobDay,
          dobYear: form.dobYear,
          ssn: rawSSN(form.ssn),
          homeStreet: form.homeStreet,
          homeCity: form.homeCity,
          homeState: form.homeState,
          homeZip: form.homeZip,
          corporatePhone: rawPhone(form.corporatePhone),
          titleType: form.titleType,
          identityStatus: 'verified',
        });
      }
      const res = await invokePortalFunction('manageSigner', {
        action: 'update',
        corporateId,
        signerId: signer.id,
        signerData,
      });
      if (res.data?.error) throw new Error(res.data.error);
      // Keep the root session profile's name in sync for the primary signer
      if (isPrimary && profile) {
        await invokePortalFunction('updateMerchantProfile', {
          corporateId,
          firstName: signerData.firstName,
          lastName: signerData.lastName,
        });
        if (profile.firstName !== undefined) {
          Object.assign(profile, { firstName: signerData.firstName, lastName: signerData.lastName });
        }
      }
      onSaved({ ...signer, ...res.data.signer });
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to save. Please try again.');
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
            <ShieldCheck className="w-4 h-4 text-cb-accent flex-shrink-0" />
            <div>
              <h3 className="font-display text-cb-title text-white">
                {showKyc ? 'Your Details & Identity Verification' : 'Edit Signer'}
              </h3>
              <p className="text-cb-caption normal-case tracking-normal font-normal text-gray-500 mt-0.5">
                {showKyc
                  ? 'All data is encrypted and used only for underwriting'
                  : 'For remote owners, identity + signing is completed via their Verify & Sign email'}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white p-1.5 rounded-cb transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-6 py-5 flex flex-col gap-4">
          {/* Returning signer banner */}
          {lookingUp && (
            <div className="flex items-center gap-2 text-xs text-gray-400">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Checking for existing verification…
            </div>
          )}
          {priorData && !lookingUp && (
            <div className="bg-cb-bg border border-cb-border border-l-2 border-l-cb-accent rounded-cb px-4 py-3 flex items-start gap-3">
              <Sparkles className="w-4 h-4 text-cb-accent flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-cb-body font-medium text-white mb-0.5">Returning signer detected</p>
                <p className="text-cb-caption normal-case tracking-normal font-normal text-gray-400">This email was previously verified on another application. Use your saved info to skip re-entry.</p>
              </div>
              <div className="flex flex-col gap-1.5 flex-shrink-0">
                <button onClick={() => applyPriorData(priorData)}
                  className="text-cb-body font-semibold text-cb-bg bg-cb-accent hover:opacity-90 px-3 py-1.5 rounded-cb transition-opacity whitespace-nowrap">
                  Use Saved Info
                </button>
                <button onClick={() => setPriorData(null)}
                  className="text-cb-caption normal-case tracking-normal font-normal text-gray-500 hover:text-white text-center transition-colors">
                  Start fresh
                </button>
              </div>
            </div>
          )}

          {/* Contact & ownership */}
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
            <input type="number" min={1} max={100} className={inputCls} value={form.ownershipPercentage}
              onChange={e => set('ownershipPercentage', e.target.value)} placeholder="e.g. 25" />
          </div>

          {/* Identity verification — primary or colocated (allowInlineKyc) */}
          {showKyc && (
            <>
              <div className="border-t border-cb-border pt-4">
                <p className="text-cb-caption uppercase text-gray-500">Identity Verification</p>
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
                  <button type="button" onClick={() => setShowSsn(!showSsn)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300">
                    {showSsn ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Home Address */}
              <div>
                <label className={labelCls}>Home Address *</label>
                {addressVerified ? (
                  <div className="flex items-center gap-2.5 bg-cb-bg border border-cb-border rounded-cb px-3 py-2.5">
                    <CheckCircle2 className="w-4 h-4 text-cb-success flex-shrink-0" />
                    <span className="text-cb-body text-gray-300 flex-1 truncate">{addressDisplay}</span>
                    <button type="button" onClick={() => { setAddressVerified(false); setAddressDisplay(''); setForm(p => ({ ...p, homeStreet: '', homeCity: '', homeState: '', homeZip: '' })); }}
                      className="text-gray-500 hover:text-white"><X className="w-3.5 h-3.5" /></button>
                  </div>
                ) : (
                  <input ref={addrRef} type="text" key="addr-input" value={addressDisplay}
                    onChange={e => { setAddressDisplay(e.target.value); setAddressVerified(false); }}
                    onKeyDown={e => e.key === 'Enter' && e.preventDefault()}
                    placeholder="Start typing to search…" autoComplete="off" className={inputCls} />
                )}
              </div>

              {/* Title — hidden if already set via Business Details panel */}
              {!inheritedTitle && (
                <div>
                  <label className={labelCls}>Your Title / Role *</label>
                  <select className={inputCls} value={form.titleType} onChange={e => set('titleType', e.target.value)} style={{ colorScheme: 'dark' }}>
                    <option value="">Select…</option>
                    {TITLE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
              )}

              {/* Phone */}
              <div>
                <label className={labelCls}>Phone Number</label>
                <input type="tel" className={inputCls} value={formatPhone(form.corporatePhone)}
                  onChange={e => set('corporatePhone', e.target.value.replace(/\D/g, '').slice(0, 10))}
                  placeholder="(555) 555-5555" />
              </div>
            </>
          )}

          {error && (
            <div className="bg-cb-bg border border-cb-border border-l-2 border-l-cb-danger rounded-cb px-4 py-3 text-cb-body text-cb-danger">{error}</div>
          )}

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={handleSave} disabled={saving}
              className="flex-1 flex items-center justify-center gap-2 text-cb-body font-semibold text-cb-bg bg-cb-accent hover:opacity-90 disabled:bg-cb-surface disabled:text-gray-600 px-5 py-3 rounded-cb transition-all">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : (showKyc ? <ShieldCheck className="w-4 h-4" /> : <Save className="w-4 h-4" />)}
              {saving ? 'Saving...' : (showKyc ? 'Save & Verify' : 'Save')}
            </button>
            <button type="button" onClick={onClose} className="px-4 py-3 text-cb-body font-medium text-gray-400 border border-cb-border hover:text-white hover:border-cb-border-strong rounded-cb transition-colors">
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
