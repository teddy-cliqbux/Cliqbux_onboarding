import { useState, useRef, useEffect } from 'react';
import { ShieldCheck, CheckCircle2, Loader2, Eye, EyeOff, X, Upload, FileImage, Sparkles, AlertCircle, RotateCcw, ExternalLink } from 'lucide-react';
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
const ACCEPTED = 'image/jpeg,image/png,image/webp,application/pdf';

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

const emptyForm = () => ({
  dobMonth: '', dobDay: '', dobYear: '',
  ssn: '',
  homeStreet: '', homeCity: '', homeState: '', homeZip: '',
  corporatePhone: '',
  titleType: '',
});

export default function InlineVerifyForm({ signer, onVerified, corporateId, profileTitleType }) {
  // If the signer already has data filled in, pre-expand and skip the upload phase
  const alreadyHasDoc = !!(signer.idDocumentUrl);
  const alreadyHasData = !!(signer.dobYear && signer.ssn && signer.homeStreet);
  // Don't auto-expand if data is already complete — user must explicitly click to re-verify
  // Auto-expand only when doc is uploaded but form hasn't been submitted yet (partial state)
  const [expanded, setExpanded] = useState(alreadyHasDoc && !alreadyHasData);
  const [phase, setPhase] = useState(alreadyHasDoc ? 'fields' : 'upload'); // 'upload' | 'fields'
  const [showSsn, setShowSsn] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // ID upload state
  const [docUrl, setDocUrl] = useState(signer.idDocumentUrl || '');
  const [uploading, setUploading] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [extractError, setExtractError] = useState('');
  const fileInputRef = useRef(null);

  // Returning signer lookup
  const [priorData, setPriorData] = useState(null); // data from a previous verified application
  const [lookingUp, setLookingUp] = useState(false);

  // If titleType is already set on the signer or inherited from the corporate profile, skip asking again
  const inheritedTitle = signer.titleType || profileTitleType || '';

  const [form, setForm] = useState({
    ...emptyForm(),
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

  const [addressDisplay, setAddressDisplay] = useState(
    signer.homeStreet
      ? `${signer.homeStreet}${signer.homeCity ? ', ' + signer.homeCity : ''}${signer.homeState ? ', ' + signer.homeState : ''}${signer.homeZip ? ' ' + signer.homeZip : ''}`
      : ''
  );
  const [addressVerified, setAddressVerified] = useState(!!signer.homeStreet);

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const addrRef = useAddressAutocomplete(({ street, city, state, zip }) => {
    setForm(p => ({ ...p, homeStreet: street, homeCity: city, homeState: state, homeZip: zip }));
    setAddressDisplay(`${street}, ${city}, ${state} ${zip}`);
    setAddressVerified(true);
  });

  // On expand, look up prior verified data for this email
  useEffect(() => {
    if (!expanded || !signer.signerEmail) return;
    (async () => {
      setLookingUp(true);
      try {
        const res = await base44.functions.invoke('manageSigner', {
          action: 'lookupByEmail',
          corporateId,
          signerEmail: signer.signerEmail,
        });
        if (res.data?.found) {
          setPriorData(res.data.signerData);
        }
      } catch (err) {
        // Message only — never log signerData (contains SSN/DOB/address)
        console.error('[InlineVerifyForm.lookupByEmail]', err?.message || 'Unknown error');
      }
      finally { setLookingUp(false); }
    })();
  }, [expanded]);

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
    if (data.idDocumentUrl) setDocUrl(data.idDocumentUrl);
    setPhase('fields');
    setPriorData(null);
  };

  // Upload ID and extract data via AI
  const handleFileUpload = async (file) => {
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { setExtractError('File must be under 10 MB.'); return; }
    setUploading(true);
    setExtractError('');
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      setDocUrl(file_url);
      setUploading(false);
      // Now extract fields with AI
      setExtracting(true);
      const extracted = await base44.integrations.Core.InvokeLLM({
        prompt: `Extract the following fields from this government-issued ID document image. Return ONLY a JSON object with these exact keys: dobMonth (2-digit string, e.g. "04"), dobDay (2-digit string), dobYear (4-digit string), homeStreet (street number + street name), homeCity, homeState (2-letter abbreviation), homeZip (5-digit). If a field is not visible or unclear, return an empty string for it. Do not guess or hallucinate.`,
        file_urls: [file_url],
        response_json_schema: {
          type: 'object',
          properties: {
            dobMonth: { type: 'string' },
            dobDay: { type: 'string' },
            dobYear: { type: 'string' },
            homeStreet: { type: 'string' },
            homeCity: { type: 'string' },
            homeState: { type: 'string' },
            homeZip: { type: 'string' },
          }
        }
      });
      // Merge extracted fields into form (only where non-empty)
      setForm(p => ({
        ...p,
        dobMonth: extracted.dobMonth || p.dobMonth,
        dobDay: extracted.dobDay || p.dobDay,
        dobYear: extracted.dobYear || p.dobYear,
        homeStreet: extracted.homeStreet || p.homeStreet,
        homeCity: extracted.homeCity || p.homeCity,
        homeState: extracted.homeState || p.homeState,
        homeZip: extracted.homeZip || p.homeZip,
      }));
      if (extracted.homeStreet) {
        setAddressDisplay([extracted.homeStreet, extracted.homeCity, extracted.homeState, extracted.homeZip].filter(Boolean).join(', '));
        setAddressVerified(true);
      }
      setPhase('fields');
    } catch (err) {
      setExtractError('Could not read ID automatically. Please fill the fields manually below.');
      setPhase('fields');
    } finally {
      setExtracting(false);
      setUploading(false);
    }
  };

  const handleVerify = async () => {
    if (!form.dobMonth || !form.dobDay || !form.dobYear) { setError('Date of birth is required.'); return; }
    if (!form.ssn || rawSSN(form.ssn).length !== 9) { setError('A valid 9-digit SSN is required.'); return; }
    if (!form.homeStreet || !form.homeCity || !form.homeState || !form.homeZip) { setError('Home address is required.'); return; }
    if (!form.titleType) { setError('Please select your title / role.'); return; }

    setSaving(true);
    setError('');
    try {
      const res = await base44.functions.invoke('manageSigner', {
        action: 'inlineVerify',
        corporateId,
        signerId: signer.id,
        signerData: {
          ...form,
          ssn: rawSSN(form.ssn),
          corporatePhone: rawPhone(form.corporatePhone),
          idDocumentUrl: docUrl || '',
          titleType: form.titleType,
        }
      });
      if (res.data?.error) throw new Error(res.data.error);
      onVerified({ ...signer, ...res.data.signer, identityStatus: 'Verified' });
    } catch (err) {
      setError(err.message || 'Verification failed. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  // Don't show the verify form if already verified or data is complete
  if (signer.identityStatus === 'Verified') return null;

  // If signer has all required data AND was previously verified (may have been reset),
  // show a compact "re-verify" prompt instead of auto-expanding the full form
  const dataIsComplete = !!(signer.dobYear && signer.ssn && signer.homeStreet && signer.titleType);

  if (!expanded) {
    return (
      <button
        onClick={() => setExpanded(true)}
        className="text-xs text-amber-400 hover:text-amber-300 border border-amber-500/30 bg-amber-500/10 hover:bg-amber-500/15 px-3 py-1.5 rounded-lg font-semibold transition-colors flex items-center gap-1.5"
      >
        <ShieldCheck className="w-3.5 h-3.5" />
        {dataIsComplete ? 'Re-submit Verification' : 'Verify Now'}
      </button>
    );
  }

  return (
    <div className="bg-[#111318] border border-white/10 rounded-xl p-4 space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-bold text-amber-400 uppercase tracking-widest">Complete Identity Verification</p>
        <button onClick={() => setExpanded(false)} className="text-xs text-gray-500 hover:text-white transition-colors">Cancel</button>
      </div>

      {/* Returning signer banner */}
      {lookingUp && (
        <div className="flex items-center gap-2 text-xs text-gray-400">
          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Checking for existing verification…
        </div>
      )}
      {priorData && !lookingUp && (
        <div className="bg-blue-500/10 border border-blue-500/25 rounded-xl px-4 py-3 flex items-start gap-3">
          <Sparkles className="w-4 h-4 text-blue-400 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-xs font-bold text-blue-300 mb-0.5">Returning signer detected</p>
            <p className="text-[11px] text-blue-400/80">This email was previously verified on another application. Use your saved info to skip re-entry.</p>
          </div>
          <div className="flex flex-col gap-1.5 flex-shrink-0">
            <button onClick={() => applyPriorData(priorData)}
              className="text-xs font-bold text-blue-300 bg-blue-500/20 border border-blue-500/30 hover:bg-blue-500/30 px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap">
              Use Saved Info
            </button>
            <button onClick={() => setPriorData(null)}
              className="text-[11px] text-gray-500 hover:text-white text-center transition-colors">
              Start fresh
            </button>
          </div>
        </div>
      )}

      {/* ── PHASE 1: Upload ID ── */}
      {phase === 'upload' && !lookingUp && !priorData && (
        <div className="space-y-3">
          <div className="border border-dashed border-white/15 hover:border-amber-500/40 rounded-xl px-4 py-6 flex flex-col items-center justify-center gap-3 cursor-pointer transition-colors group"
            onClick={() => fileInputRef.current?.click()}
            onDragOver={e => e.preventDefault()}
            onDrop={e => { e.preventDefault(); handleFileUpload(e.dataTransfer.files?.[0]); }}>
            {uploading || extracting ? (
              <>
                <Loader2 className="w-6 h-6 text-amber-400 animate-spin" />
                <p className="text-sm font-semibold text-amber-300">
                  {uploading ? 'Uploading…' : 'Reading ID with AI…'}
                </p>
                <p className="text-xs text-gray-500">This takes a few seconds</p>
              </>
            ) : (
              <>
                <div className="w-12 h-12 rounded-xl bg-amber-500/10 flex items-center justify-center group-hover:bg-amber-500/20 transition-colors">
                  <FileImage className="w-6 h-6 text-amber-400" />
                </div>
                <div className="text-center">
                  <p className="text-sm font-bold text-white">Upload Your Government ID</p>
                  <p className="text-xs text-gray-400 mt-1">We'll read your details automatically — driver's license, passport, or state ID</p>
                  <p className="text-[10px] text-gray-600 mt-1">JPG, PNG, PDF · Max 10 MB</p>
                </div>
                <div className="flex items-center gap-2 bg-amber-500/10 border border-amber-500/25 text-amber-300 text-xs font-semibold px-4 py-2 rounded-lg">
                  <Upload className="w-3.5 h-3.5" /> Choose File or Drag Here
                </div>
              </>
            )}
            <input ref={fileInputRef} type="file" accept={ACCEPTED} className="hidden"
              onChange={e => handleFileUpload(e.target.files?.[0])} />
          </div>

          {extractError && (
            <div className="flex items-start gap-2 bg-amber-500/10 border border-amber-500/20 rounded-xl px-3 py-2.5">
              <AlertCircle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-amber-300">{extractError}</p>
            </div>
          )}

          {/* Skip / manual override */}
          <button onClick={() => setPhase('fields')}
            className="w-full text-center text-xs text-gray-500 hover:text-gray-300 py-2 transition-colors">
            I don't have my ID available right now — fill in manually instead →
          </button>
        </div>
      )}

      {/* ── PHASE 2: Review / Edit Fields ── */}
      {phase === 'fields' && (
        <div className="space-y-4">
          {/* Uploaded doc indicator */}
          {docUrl && (
            <div className="flex items-center gap-2 bg-green-500/10 border border-green-500/20 rounded-xl px-3 py-2">
              <CheckCircle2 className="w-3.5 h-3.5 text-green-400 flex-shrink-0" />
              <p className="text-xs text-green-300 flex-1">ID document uploaded — fields pre-filled below. Review and correct as needed.</p>
              <a href={docUrl} target="_blank" rel="noopener noreferrer" className="text-green-500/60 hover:text-green-400 transition-colors">
                <ExternalLink className="w-3 h-3" />
              </a>
              <button onClick={() => { setDocUrl(''); setPhase('upload'); setForm(emptyForm()); setAddressDisplay(''); setAddressVerified(false); }}
                className="text-gray-600 hover:text-red-400 transition-colors" title="Remove & re-upload">
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
          {!docUrl && (
            <div className="flex items-center justify-between">
              <p className="text-[10px] text-gray-500">No ID uploaded — entering manually</p>
              <button onClick={() => setPhase('upload')} className="text-[11px] text-amber-400 hover:text-amber-300 flex items-center gap-1 transition-colors">
                <Upload className="w-3 h-3" /> Upload ID instead
              </button>
            </div>
          )}

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
              <div className="flex items-center gap-2 bg-green-500/10 border border-green-500/20 rounded-xl px-3.5 py-2.5">
                <CheckCircle2 className="w-4 h-4 text-green-400 flex-shrink-0" />
                <span className="text-sm text-green-300 flex-1 truncate">{addressDisplay}</span>
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

          {error && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-sm text-red-300">{error}</div>
          )}

          <button type="button" onClick={handleVerify} disabled={saving}
            className="w-full flex items-center justify-center gap-2 text-sm font-bold text-black bg-amber-500 hover:bg-amber-400 disabled:bg-gray-600 disabled:text-gray-400 py-3 rounded-xl transition-all">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
            {saving ? 'Verifying...' : 'Submit & Verify'}
          </button>
        </div>
      )}
    </div>
  );
}