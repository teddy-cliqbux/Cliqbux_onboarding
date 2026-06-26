import { useState, useRef, useEffect, useCallback } from 'react';
import { CheckCircle2, ChevronDown, ChevronUp, ShieldCheck, AlertTriangle, Loader2 } from 'lucide-react';
import { base44 } from '@/api/base44Client';

const MONTHS = [
  { value: '01', label: 'JAN' }, { value: '02', label: 'FEB' }, { value: '03', label: 'MAR' },
  { value: '04', label: 'APR' }, { value: '05', label: 'MAY' }, { value: '06', label: 'JUN' },
  { value: '07', label: 'JUL' }, { value: '08', label: 'AUG' }, { value: '09', label: 'SEP' },
  { value: '10', label: 'OCT' }, { value: '11', label: 'NOV' }, { value: '12', label: 'DEC' },
];
const DAYS = Array.from({ length: 31 }, (_, i) => String(i + 1).padStart(2, '0'));
const currentYear = new Date().getFullYear();
const YEARS = Array.from({ length: 80 }, (_, i) => String(currentYear - 18 - i));

function isProfileComplete(p) {
  return !!(p.firstName && p.lastName && p.dobMonth && p.dobDay && p.dobYear && p.ssn && p.homeStreet && p.homeCity && p.homeState && p.homeZip);
}

function validateForm(f) {
  const errors = {};
  if (!f.dobMonth) errors.dobMonth = 'Required';
  if (!f.dobDay) errors.dobDay = 'Required';
  if (!f.dobYear) errors.dobYear = 'Required';
  if (!f.ssn || !/^\d{9}$/.test(f.ssn.replace(/\D/g, ''))) errors.ssn = '9 digits required';
  if (!f.homeStreet) errors.homeStreet = 'Required';
  if (!f.homeCity) errors.homeCity = 'Required';
  if (!f.homeState) errors.homeState = 'Required';
  if (!f.homeZip) errors.homeZip = 'Required';
  if (!f.corporatePhone || !/^\d{10}$/.test(f.corporatePhone.replace(/\D/g, ''))) errors.corporatePhone = '10 digits required';
  if (!f.ownershipPercentage || isNaN(f.ownershipPercentage)) errors.ownershipPercentage = 'Required';
  return errors;
}

export function isUnderwritingValid(profile, formData, preVerified) {
  if (preVerified) {
    // Still need phone + ownership even if IDV was done
    const phone = formData.corporatePhone || profile.corporatePhone || '';
    const pct = formData.ownershipPercentage ?? profile.ownershipPercentage ?? '';
    return /^\d{10}$/.test(phone.replace(/\D/g, '')) && !isNaN(Number(pct)) && String(pct).length > 0;
  }
  const errors = validateForm(formData);
  return Object.keys(errors).length === 0;
}

export default function UnderwritingPanel({ profile, onValidChange }) {
  const preVerified = isProfileComplete(profile);
  const [collapsed, setCollapsed] = useState(preVerified);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState('');
  const addressInputRef = useRef(null);
  const autocompleteRef = useRef(null);

  const profileToForm = (p) => ({
    dobMonth: p.dobMonth || '',
    dobDay: p.dobDay || '',
    dobYear: p.dobYear || '',
    ssn: '',
    homeStreet: p.homeStreet || '',
    homeCity: p.homeCity || '',
    homeState: p.homeState || '',
    homeZip: p.homeZip || '',
    corporatePhone: p.corporatePhone || '',
    ownershipPercentage: p.ownershipPercentage ?? 100,
  });

  const [form, setForm] = useState(() => profileToForm(profile));
  const [touched, setTouched] = useState({});

  // Re-populate form when profile fields come in from Plaid IDV
  const prevProfileRef = useRef(profile);
  useEffect(() => {
    const prev = prevProfileRef.current;
    const identityFields = ['firstName', 'lastName', 'dobMonth', 'dobDay', 'dobYear', 'homeStreet', 'homeCity', 'homeState', 'homeZip'];
    const changed = identityFields.some(f => profile[f] !== prev[f]);
    if (changed) {
      setForm(profileToForm(profile));
      setTouched({});
    }
    prevProfileRef.current = profile;
  }, [profile]);

  // Notify parent of validity whenever form changes
  useEffect(() => {
    onValidChange(isUnderwritingValid(profile, form, preVerified));
  }, [form, preVerified]);

  // Google Places for home address
  useEffect(() => {
    if (preVerified) return;
    if (!addressInputRef.current || !window.google?.maps?.places) return;
    autocompleteRef.current = new window.google.maps.places.Autocomplete(addressInputRef.current, {
      types: ['address'],
      componentRestrictions: { country: 'us' },
      fields: ['address_components', 'formatted_address'],
    });
    autocompleteRef.current.addListener('place_changed', () => {
      const place = autocompleteRef.current.getPlace();
      if (!place?.address_components) return;
      const get = (types) => (place.address_components.find(c => types.some(t => c.types.includes(t))) || {}).long_name || '';
      const getShort = (types) => (place.address_components.find(c => types.some(t => c.types.includes(t))) || {}).short_name || '';
      const streetNumber = get(['street_number']);
      const route = get(['route']);
      setForm(prev => ({
        ...prev,
        homeStreet: streetNumber ? `${streetNumber} ${route}` : route,
        homeCity: get(['locality', 'sublocality']),
        homeState: getShort(['administrative_area_level_1']),
        homeZip: get(['postal_code']),
      }));
    });
  }, [preVerified]);

  const set = (key, value) => {
    setForm(prev => ({ ...prev, [key]: value }));
    setTouched(prev => ({ ...prev, [key]: true }));
  };

  const errors = validateForm(form);
  const showError = (key) => touched[key] && errors[key];

  const handleSave = async () => {
    // Mark all touched
    const allTouched = Object.fromEntries(Object.keys(form).map(k => [k, true]));
    setTouched(allTouched);
    if (Object.keys(validateForm(form)).length > 0) return;

    setSaving(true);
    setSaveError('');
    try {
      await base44.functions.invoke('updateMerchantProfile', {
        corporateId: profile.corporateId,
        ...form,
        ssn: form.ssn.replace(/\D/g, ''),
        corporatePhone: form.corporatePhone.replace(/\D/g, ''),
        ownershipPercentage: Number(form.ownershipPercentage),
      });
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      setSaveError(err.message || 'Failed to save.');
    } finally {
      setSaving(false);
    }
  };

  const pct = Number(form.ownershipPercentage);
  const showOwnershipWarning = !isNaN(pct) && pct < 25 && pct > 0;

  const inputClass = (key) =>
    `w-full text-sm border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 ${showError(key) ? 'border-red-300 bg-red-50' : 'border-gray-200'}`;
  const selectClass = (key) =>
    `text-sm border rounded-lg px-2 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none bg-white ${showError(key) ? 'border-red-300 bg-red-50' : 'border-gray-200'}`;

  // — Collapsed verified summary —
  if (collapsed && preVerified) {
    return (
      <div
        className="border border-green-200 bg-green-50 rounded-xl px-5 py-4 flex items-center justify-between cursor-pointer hover:bg-green-100 transition-colors"
        onClick={() => setCollapsed(false)}
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
            <ShieldCheck className="w-4 h-4 text-green-600" />
          </div>
          <div>
            <p className="text-sm font-semibold text-green-800">✅ Personal & Corporate Details Verified</p>
            <p className="text-xs text-green-600 mt-0.5">
              Identity verified via Plaid — {profile.firstName} {profile.lastName} · {profile.homeCity}, {profile.homeState}
            </p>
          </div>
        </div>
        <ChevronDown className="w-4 h-4 text-green-500 flex-shrink-0" />
      </div>
    );
  }

  // — Phone + Ownership mini-form shown when Plaid IDV was done but these two fields still needed —
  if (preVerified && !collapsed) {
    return (
      <div className="border border-gray-200 rounded-xl overflow-hidden">
        <div
          className="bg-green-50 border-b border-green-100 px-5 py-4 flex items-center justify-between cursor-pointer"
          onClick={() => setCollapsed(true)}
        >
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-green-600" />
            <span className="text-sm font-semibold text-green-800">Personal & Corporate Details Verified</span>
          </div>
          <ChevronUp className="w-4 h-4 text-green-500" />
        </div>
        <div className="px-6 py-5 grid grid-cols-1 sm:grid-cols-2 gap-5">
          <FieldWrap label="Corporate Business Phone" error={showError('corporatePhone') ? errors.corporatePhone : null}>
            <input
              type="tel"
              value={form.corporatePhone}
              onChange={(e) => set('corporatePhone', e.target.value)}
              onBlur={() => setTouched(p => ({ ...p, corporatePhone: true }))}
              placeholder="10-digit phone number"
              className={inputClass('corporatePhone')}
            />
          </FieldWrap>
          <OwnershipField form={form} set={set} touched={touched} setTouched={setTouched} errors={errors} showOwnershipWarning={showOwnershipWarning} inputClass={inputClass} />
        </div>
      </div>
    );
  }

  // Compute whether the full form is currently valid (live, not just on submit)
  const formIsValid = Object.keys(errors).length === 0;

  // — Full expanded form —
  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden">
      {/* Panel header */}
      <div className="bg-gray-50 border-b border-gray-200 px-5 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-blue-100 flex items-center justify-center">
            <ShieldCheck className="w-4 h-4 text-blue-600" />
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-900">Principal & Corporate Verification</p>
            <p className="text-xs text-gray-500 mt-0.5">Required by Elavon for underwriting — please complete all fields</p>
          </div>
        </div>
        {formIsValid ? (
          <span className="text-xs font-semibold text-green-700 bg-green-50 border border-green-200 px-2.5 py-1 rounded-full flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3" /> Complete
          </span>
        ) : (
          <span className="text-xs font-semibold text-orange-600 bg-orange-50 border border-orange-200 px-2.5 py-1 rounded-full">Action Required</span>
        )}
      </div>

      <div className="px-6 py-5 grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-5">
        {/* Column A: KYC */}
        <div className="flex flex-col gap-5">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-widest -mb-2">Authorized Signer Info</p>

          {/* DOB */}
          <FieldWrap label="Date of Birth" error={(touched.dobMonth || touched.dobDay || touched.dobYear) && (errors.dobMonth || errors.dobDay || errors.dobYear) ? 'Complete all DOB fields' : null}>
            <div className="flex gap-2">
              <select value={form.dobMonth} onChange={(e) => set('dobMonth', e.target.value)} onBlur={() => setTouched(p => ({ ...p, dobMonth: true }))} className={`flex-1 ${selectClass('dobMonth')}`}>
                <option value="">Month</option>
                {MONTHS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
              <select value={form.dobDay} onChange={(e) => set('dobDay', e.target.value)} onBlur={() => setTouched(p => ({ ...p, dobDay: true }))} className={`w-20 ${selectClass('dobDay')}`}>
                <option value="">Day</option>
                {DAYS.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
              <select value={form.dobYear} onChange={(e) => set('dobYear', e.target.value)} onBlur={() => setTouched(p => ({ ...p, dobYear: true }))} className={`w-24 ${selectClass('dobYear')}`}>
                <option value="">Year</option>
                {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
          </FieldWrap>

          {/* SSN */}
          <FieldWrap label="Social Security Number (SSN)" error={showError('ssn') ? errors.ssn : null}>
            <input
              type="password"
              value={form.ssn}
              onChange={(e) => set('ssn', e.target.value.replace(/\D/g, '').slice(0, 9))}
              onBlur={() => setTouched(p => ({ ...p, ssn: true }))}
              placeholder="9 digits — secured"
              maxLength={9}
              className={inputClass('ssn')}
            />
            {form.ssn.length > 0 && form.ssn.length < 9 && (
              <p className="text-xs text-gray-400 mt-1">{form.ssn.length}/9 digits entered</p>
            )}
          </FieldWrap>

          {/* Home Address */}
          <FieldWrap label="Principal Home Address" error={showError('homeStreet') ? errors.homeStreet : null}>
            <input
              ref={addressInputRef}
              type="text"
              defaultValue={form.homeStreet}
              onChange={(e) => set('homeStreet', e.target.value)}
              onBlur={() => setTouched(p => ({ ...p, homeStreet: true }))}
              placeholder="Start typing residential address..."
              autoComplete="off"
              className={inputClass('homeStreet')}
            />
            {form.homeCity && (
              <p className="text-xs text-green-600 font-medium mt-1">
                {form.homeCity}, {form.homeState} {form.homeZip}
              </p>
            )}
          </FieldWrap>
        </div>

        {/* Column B: Corporate */}
        <div className="flex flex-col gap-5">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-widest -mb-2">Corporate / Operational Info</p>

          <FieldWrap label="Corporate Business Phone" error={showError('corporatePhone') ? errors.corporatePhone : null}>
            <input
              type="tel"
              value={form.corporatePhone}
              onChange={(e) => set('corporatePhone', e.target.value)}
              onBlur={() => setTouched(p => ({ ...p, corporatePhone: true }))}
              placeholder="10-digit phone number"
              className={inputClass('corporatePhone')}
            />
          </FieldWrap>

          <OwnershipField form={form} set={set} touched={touched} setTouched={setTouched} errors={errors} showOwnershipWarning={showOwnershipWarning} inputClass={inputClass} />
        </div>
      </div>

      {/* Save row */}
      <div className="px-6 pb-5 flex items-center gap-3">
        {saveError && <p className="text-xs text-red-600 flex-1">{saveError}</p>}
        <button
          onClick={handleSave}
          disabled={saving}
          className="ml-auto flex items-center gap-2 text-sm font-semibold text-white bg-gray-900 hover:bg-gray-800 disabled:opacity-50 px-5 py-2.5 rounded-xl transition-all"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
          {saveSuccess ? 'Saved!' : 'Save Details'}
        </button>
      </div>
    </div>
  );
}

function FieldWrap({ label, error, children }) {
  return (
    <div>
      <label className="text-xs font-semibold text-gray-600 block mb-1.5">{label}</label>
      {children}
      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
    </div>
  );
}

function OwnershipField({ form, set, touched, setTouched, errors, showOwnershipWarning, inputClass }) {
  return (
    <FieldWrap label="Ownership Percentage (%)" error={touched.ownershipPercentage && errors.ownershipPercentage ? errors.ownershipPercentage : null}>
      <input
        type="number"
        min={1}
        max={100}
        value={form.ownershipPercentage}
        onChange={(e) => set('ownershipPercentage', e.target.value)}
        onBlur={() => setTouched(p => ({ ...p, ownershipPercentage: true }))}
        className={inputClass('ownershipPercentage')}
      />
      {showOwnershipWarning && (
        <div className="mt-2 flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          <AlertTriangle className="w-3.5 h-3.5 text-amber-500 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-amber-700">
            <span className="font-semibold">Compliance Note:</span> Elavon underwriting may request secondary beneficial owner documentation for entities under 25% ownership.
          </p>
        </div>
      )}
    </FieldWrap>
  );
}