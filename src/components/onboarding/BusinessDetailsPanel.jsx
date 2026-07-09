import { useState, useEffect, useRef, useCallback } from 'react';
import { Building2, ChevronDown, ChevronRight, Check, Loader2, AlertCircle, Cloud } from 'lucide-react';
import { invokePortalFunction } from '@/lib/merchantAuthFetch';

const inputCls = 'w-full bg-[#111318] border border-white/20 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent';
const labelCls = 'block text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5';

const OWNERSHIP_TYPES = [
  { value: 'SOLE_PROPRIETOR', label: 'Sole Proprietor' },
  { value: 'LIMITED_COMPANY', label: 'LLC' },
  { value: 'CORPORATION', label: 'Corporation' },
  { value: 'GENERAL_PARTNERSHIP', label: 'General Partnership' },
  { value: 'LIMITED_PARTNERSHIP', label: 'Limited Partnership' },
  { value: 'NON_PROFIT', label: 'Non-Profit' },
];

const TAX_CLASS_TYPES = [
  { value: 'SOLE_PROP', label: 'Sole Proprietor / Disregarded Entity' },
  { value: 'LLC_CORPORATION', label: 'LLC taxed as C-Corp' },
  { value: 'LLC_PARTNERSHIP', label: 'LLC taxed as Partnership' },
  { value: 'CORPORATION', label: 'Corporation (C-Corp / S-Corp)' },
  { value: 'PARTNERSHIP', label: 'Partnership' },
];

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

function isComplete(profile) {
  return !!(
    profile.taxId &&
    profile.ownershipType &&
    profile.taxClassType &&
    profile.establishmentYear &&
    profile.titleType
  );
}

function deriveOwnership(establishmentYear) {
  if (!establishmentYear) return { years: '1', months: '0' };
  const now = new Date();
  const totalMonths = (now.getFullYear() - parseInt(establishmentYear, 10)) * 12 + now.getMonth();
  const years = Math.max(0, Math.floor(totalMonths / 12));
  const months = Math.max(0, totalMonths % 12);
  return { years: String(years), months: String(months) };
}

function canAutoSave(form) {
  return !!(form.legalName && form.taxId.length === 9 && form.ownershipType && form.taxClassType && form.titleType && form.establishmentYear);
}

export default function BusinessDetailsPanel({ profile, onSaved }) {
  const complete = isComplete(profile);
  const [expanded, setExpanded] = useState(!complete);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState(null);
  const [error, setError] = useState('');
  const saveTimerRef = useRef(null);
  const latestFormRef = useRef(null);

  const profileToForm = (p) => ({
    legalName: p.legalName || '',
    taxId: (p.taxId || '').replace(/\D/g, ''),
    ownershipType: p.ownershipType || '',
    taxClassType: p.taxClassType || '',
    titleType: p.titleType || '',
    establishmentYear: p.establishmentYear || '',
  });

  const [form, setForm] = useState(() => profileToForm(profile));

  // Re-sync form if parent passes an updated profile (e.g. after page switch)
  useEffect(() => {
    setForm(profileToForm(profile));
  }, [profile.corporateId, profile.taxId, profile.ownershipType, profile.taxClassType, profile.titleType, profile.establishmentYear]);

  const doSave = useCallback(async (f) => {
    if (!canAutoSave(f)) return;
    setSaving(true);
    setError('');
    try {
      const { years, months } = deriveOwnership(f.establishmentYear);
      const res = await invokePortalFunction('updateMerchantProfile', {
        corporateId: profile.corporateId,
        legalName: f.legalName,
        taxId: f.taxId,
        ownershipType: f.ownershipType,
        taxClassType: f.taxClassType,
        titleType: f.titleType,
        establishmentYear: f.establishmentYear,
        currentOwnershipYears: years,
        currentOwnershipMonths: months,
      });
      if (res.data?.error) throw new Error(res.data.error);
      setSavedAt(Date.now());
      onSaved({ ...profile, ...f });
    } catch (err) {
      setError(err.message || 'Failed to save.');
    } finally {
      setSaving(false);
    }
  }, [profile, onSaved]);

  const set = (k, v) => {
    setForm(prev => {
      const next = { ...prev, [k]: v };
      latestFormRef.current = next;
      // Debounce: clear existing timer, set new one
      clearTimeout(saveTimerRef.current);
      if (canAutoSave(next)) {
        saveTimerRef.current = setTimeout(() => doSave(latestFormRef.current), 600);
      }
      return next;
    });
  };

  // Cleanup timer on unmount — also flush save if dirty
  useEffect(() => {
    return () => {
      clearTimeout(saveTimerRef.current);
      if (latestFormRef.current && canAutoSave(latestFormRef.current)) {
        doSave(latestFormRef.current);
      }
    };
  }, [doSave]);

  return (
    <div className={`rounded-2xl border transition-all ${complete ? 'border-green-500/25 bg-[#1c2128]' : 'border-amber-500/30 bg-[#1c2128]'}`}>
      {/* Header */}
      <button
        className="w-full flex items-center gap-3 px-5 py-4 text-left"
        onClick={() => setExpanded(e => !e)}
      >
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${complete ? 'bg-green-500/15' : 'bg-amber-500/15'}`}>
          <Building2 className={`w-4 h-4 ${complete ? 'text-green-400' : 'text-amber-400'}`} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-white">Business & Legal Information</p>
          <p className="text-[11px] text-gray-400 mt-0.5">
            {complete
              ? `${profile.legalName || form.legalName} · EIN ${form.taxId.slice(0,2)}-${form.taxId.slice(2)} · ${form.ownershipType.replace(/_/g, ' ')}`
              : 'Required — EIN, entity type, title, year established'}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {saving && <Loader2 className="w-3.5 h-3.5 text-amber-400 animate-spin" />}
          {!saving && savedAt && <Cloud className="w-3.5 h-3.5 text-green-400" title="Saved" />}
          {!complete && <span className="text-[10px] font-bold text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-full">Required</span>}
          {complete && !saving && <Check className="w-4 h-4 text-green-400" />}
          {expanded ? <ChevronDown className="w-4 h-4 text-gray-500" /> : <ChevronRight className="w-4 h-4 text-gray-500" />}
        </div>
      </button>

      {expanded && (
        <div className="border-t border-white/5 px-5 pb-5 pt-4 space-y-4">
          {/* Legal name + EIN */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Legal Business Name *</label>
              <input value={form.legalName} onChange={e => set('legalName', e.target.value)}
                placeholder="e.g. Cliqbux LLC" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Federal EIN *</label>
              <input
                value={form.taxId}
                onChange={e => set('taxId', e.target.value.replace(/\D/g, '').slice(0, 9))}
                placeholder="9 digits" className={`${inputCls} font-mono ${form.taxId.length > 0 && form.taxId.length !== 9 ? 'border-amber-500/50' : ''}`}
              />
              {form.taxId.length > 0 && form.taxId.length !== 9 && (
                <p className="text-[10px] text-amber-400 mt-1">{form.taxId.length}/9 digits</p>
              )}
              {form.taxId.length === 9 && (
                <p className="text-[10px] text-green-400 mt-1 flex items-center gap-1"><Check className="w-3 h-3" /> Valid EIN</p>
              )}
            </div>
          </div>

          {/* Entity type + tax class */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Business Entity Type *</label>
              <select value={form.ownershipType} onChange={e => set('ownershipType', e.target.value)}
                className={inputCls} style={{ colorScheme: 'dark' }}>
                <option value="">Select…</option>
                {OWNERSHIP_TYPES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>IRS Tax Classification *</label>
              <select value={form.taxClassType} onChange={e => set('taxClassType', e.target.value)}
                className={inputCls} style={{ colorScheme: 'dark' }}>
                <option value="">Select…</option>
                {TAX_CLASS_TYPES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
          </div>

          {/* Principal title */}
          <div>
            <label className={labelCls}>Principal / Signer Title *</label>
            <select value={form.titleType} onChange={e => set('titleType', e.target.value)}
              className={inputCls} style={{ colorScheme: 'dark' }}>
              <option value="">Select…</option>
              {TITLE_TYPES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <p className="text-[10px] text-gray-500 mt-1">Title of the primary signer/beneficial owner</p>
          </div>

          {/* Year established */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Year Business Established *</label>
              <input type="number" value={form.establishmentYear}
                onChange={e => set('establishmentYear', e.target.value)}
                placeholder="e.g. 2018" min="1900" max={new Date().getFullYear()} className={inputCls} />
              {form.establishmentYear && (() => { const { years, months } = deriveOwnership(form.establishmentYear); return <p className="text-[10px] text-gray-500 mt-1">{years} yr{years !== '1' ? 's' : ''}{months !== '0' ? ` ${months} mo` : ''} under current ownership</p>; })()}
            </div>
          </div>

          {/* Auto-save status */}
          <div className="flex items-center gap-2 h-5">
            {saving && <><Loader2 className="w-3 h-3 text-amber-400 animate-spin" /><span className="text-[11px] text-amber-400">Saving…</span></>}
            {!saving && savedAt && <><Cloud className="w-3 h-3 text-green-400" /><span className="text-[11px] text-green-400">Saved automatically</span></>}
            {!saving && !savedAt && canAutoSave(form) && <span className="text-[11px] text-gray-600">Changes will be saved automatically</span>}
            {!saving && !canAutoSave(form) && form.taxId.length > 0 && <span className="text-[11px] text-gray-600">Fill all required fields to save</span>}
          </div>

          {error && (
            <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
              <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-300">{error}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}