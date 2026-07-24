import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus, ArrowRight, Loader2, Trash2,
  ChevronDown, ChevronRight, X,
  AlertTriangle, Check, ArrowLeft, Pencil, GripVertical, Cloud, Mail, Lock, Info
} from 'lucide-react';
import { isLocked as getMidLocked, isImported as getMidImported } from '@/utils/statusUtils';
import { usePortalLock } from '@/lib/PortalLockContext';
import { FORMS_LOCKED_MESSAGE, isFormsLockedError, PORTAL_LOCK_SIGNING } from '@/lib/portalLock';
import { UnlockModifyControls } from '@/components/onboarding/FormsLockedBanner';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { invokePortalFunction, merchantTokenHasImp } from '@/lib/merchantAuthFetch';
import {
  MCC_OPTIONS,
  mccOptionLabel,
  mccDisplayLabel,
  mccToIndustry,
} from '@/lib/mccCatalog';
import {
  requiresLiquorCompliance,
  isAlcoholSalesPercentageSet,
  isHighRiskTavern,
  liquorComplianceBannerText,
} from '@/lib/liquorCompliance';
import { usePlacesAddressRef } from '@/lib/usePlacesAddressRef';
import { composeStreet, composeFullAddress } from '@/lib/addressLine';
import {
  normalizeBusinessWebsite,
  businessWebsiteError,
} from '@/lib/businessWebsite';

// Motion communicates expand/collapse — keep it transform/opacity-friendly.
// Height uses a short ease (not a spring): springs on height:"auto" look like
// the card is being squeezed. Do not put `layout` on these same cards — it
// fights the accordion and makes collapse look like a weird size morph.
const ACCORDION_EASE = { duration: 0.2, ease: [0.32, 0.72, 0, 1] };
const accordionProps = {
  initial: { height: 0, opacity: 0 },
  animate: { height: 'auto', opacity: 1 },
  exit: { height: 0, opacity: 0 },
  transition: ACCORDION_EASE,
};

/** Agent impersonation (Applications View) — full verify chrome stays on. */
function isAgentSession(corporateId) {
  if (merchantTokenHasImp()) return true;
  if (corporateId && sessionStorage.getItem('portal_impersonating') === String(corporateId)) return true;
  return false;
}

function verifyQuietStorageKey(corporateId) {
  return `cb_locations_verify_quiet_${corporateId}`;
}

function multiCoachStorageKey(corporateId) {
  return `cb_locations_multi_coach_dismissed_${corporateId}`;
}

// ─── Constants ────────────────────────────────────────────────────────────────
// MCC list: src/lib/mccCatalog.js (Elavon eBoarding + letter variants; 5999 omitted).

// 2026-07-10: MOTO (MS) removed — MSPWare PUT /form rejected industry_type MS live.
const INDUSTRY_OPTIONS = [
  { value: 'RE', label: 'Retail (RE)' },
  { value: 'RS', label: 'Restaurant (RS)' },
  { value: 'SP', label: 'Supermarket (SP)' },
  { value: 'HT', label: 'Lodging / Hotel (HT)' },
];

const inputCls = 'w-full bg-cb-bg border border-cb-border rounded-cb px-3 py-2.5 text-cb-body text-white placeholder:text-gray-500 transition-colors hover:border-cb-border-strong focus:outline-none focus:ring-2 focus:ring-cb-accent focus:border-transparent';
const labelCls = 'block text-cb-caption uppercase text-gray-500 mb-1.5';

/** Card-channel split options — estimate to nearest 10% (no free-typed steppers). */
const PCT_10_OPTIONS = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
function snapPct10(value, fallback) {
  if (value == null || value === '') return String(fallback);
  const n = Math.round(Number(value) / 10) * 10;
  if (!Number.isFinite(n)) return String(fallback);
  return String(Math.min(100, Math.max(0, n)));
}

// Sentinel: never persist as MCC — { mccCode: '', mccHelpRequested: true }.
const MCC_HELP_VALUE = '__HELP__';
const MCC_HELP_LABEL = 'My business isn\'t listed — Cliqbux will help';

/** Searchable Business Category picker — plain labels, MCC in parentheses. */
function BusinessCategorySelect({ mccCode, mccHelpRequested, onPick }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const rootRef = useRef(null);
  const inputRef = useRef(null);

  const selectedText = mccHelpRequested && !mccCode
    ? MCC_HELP_LABEL
    : (mccCode ? mccDisplayLabel(mccCode) : '');

  const q = query.trim().toLowerCase();
  const filtered = !q
    ? MCC_OPTIONS
    : MCC_OPTIONS.filter(o =>
        o.label.toLowerCase().includes(q)
        || o.value.includes(q)
        || (o.keywords || '').includes(q)
        || mccOptionLabel(o).toLowerCase().includes(q)
      );

  const groups = [];
  for (const opt of filtered) {
    const g = groups.find(x => x.name === opt.group);
    if (g) g.items.push(opt);
    else groups.push({ name: opt.group, items: [opt] });
  }

  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  useEffect(() => {
    if (open) {
      setQuery('');
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  const pick = (value) => {
    onPick(value);
    setOpen(false);
    setQuery('');
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        aria-haspopup="listbox"
        className={`${inputCls} flex items-center justify-between gap-2 text-left`}
      >
        <span className={selectedText ? 'text-white truncate' : 'text-gray-500 truncate'}>
          {selectedText || 'Search or select…'}
        </span>
        {open ? <ChevronDown className="w-4 h-4 text-gray-500 flex-shrink-0" /> : <ChevronRight className="w-4 h-4 text-gray-500 flex-shrink-0" />}
      </button>

      {open && (
        <div
          className="absolute z-30 mt-1.5 w-full rounded-cb border border-cb-border bg-cb-surface-raised shadow-cb-overlay overflow-hidden"
          role="listbox"
        >
          <div className="p-2 border-b border-cb-border">
            <input
              ref={inputRef}
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Escape') setOpen(false);
                if (e.key === 'Enter' && filtered.length === 1) {
                  e.preventDefault();
                  pick(filtered[0].value);
                }
              }}
              placeholder="Type to search (e.g. coffee, fast food)…"
              className={`${inputCls} py-2`}
            />
          </div>
          <div className="max-h-64 overflow-y-auto py-1">
            {groups.map(g => (
              <div key={g.name}>
                <p className="px-3 pt-2 pb-1 text-cb-caption uppercase text-gray-600">{g.name}</p>
                {g.items.map(o => (
                  <button
                    key={o.value}
                    type="button"
                    role="option"
                    aria-selected={mccCode === o.value}
                    onClick={() => pick(o.value)}
                    className={`w-full text-left px-3 py-2.5 text-cb-body transition-colors ${
                      mccCode === o.value && !mccHelpRequested
                        ? 'bg-cb-accent-muted text-white'
                        : 'text-gray-300 hover:bg-cb-bg hover:text-white'
                    }`}
                  >
                    {mccOptionLabel(o)}
                  </button>
                ))}
              </div>
            ))}
            {filtered.length === 0 && (
              <p className="px-3 py-2 text-cb-caption normal-case tracking-normal font-normal text-gray-500">
                No listed category matches that search — try another word, or Cliqbux will help.
              </p>
            )}
            <button
              type="button"
              role="option"
              aria-selected={!!(mccHelpRequested && !mccCode)}
              onClick={() => pick(MCC_HELP_VALUE)}
              className={`w-full text-left px-3 py-2.5 text-cb-body border-t border-cb-border transition-colors ${
                mccHelpRequested && !mccCode
                  ? 'bg-cb-accent-muted text-white'
                  : 'text-gray-400 hover:bg-cb-bg hover:text-white'
              }`}
            >
              {MCC_HELP_LABEL}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Single source of truth for "is this processing account complete?" —
 *  used by the card header, location/entity rollups, the page counters, and
 *  the Continue gate so they can never disagree. Mirrors the backend
 *  readiness check in getMerchantData (all three sales figures are required
 *  by the MSPWare form). A category-help request counts as complete here
 *  (the merchant did their part; an agent sets the real MCC before signing). */
function isMidComplete(mid, businessState) {
  if (!(mid.mccCode || mid.mccHelpRequested)) return false;
  if (!(Number(mid.monthlyCardSales) > 0)) return false;
  if (!(Number(mid.avgSaleAmount) > 0)) return false;
  if (!(Number(mid.highestTicketAmount) > 0)) return false;
  if (requiresLiquorCompliance(businessState, mid.mccCode) && !isAlcoholSalesPercentageSet(mid.alcoholSalesPercentage)) {
    return false;
  }
  const online = Number(mid.internetPct) || 0;
  if (online > 0 && businessWebsiteError(mid.businessWebsite, { required: true })) {
    return false;
  }
  return true;
}

function formatEIN(raw) {
  const d = (raw || '').replace(/\D/g, '');
  return d.length >= 9 ? `${d.slice(0, 2)}-${d.slice(2, 9)}` : raw || '';
}

function parsePlaceResult(place, onParsed) {
  if (!place?.address_components) return;
  const get = (types) => (place.address_components.find(c => types.some(t => c.types.includes(t))) || {}).long_name || '';
  const getS = (types) => (place.address_components.find(c => types.some(t => c.types.includes(t))) || {}).short_name || '';
  const street = (get(['street_number']) ? `${get(['street_number'])} ` : '') + get(['route']);
  const street2 = get(['subpremise']);
  const city = get(['locality', 'sublocality']);
  const state = getS(['administrative_area_level_1']);
  const zip = get(['postal_code']);
  const streetLine = street2 ? `${street}, ${street2}` : street;
  onParsed({ street, street2, city, state, zip, display: `${streetLine}, ${city}, ${state} ${zip}` });
}

// Returns a callback ref — attaches a fresh Autocomplete every time the input mounts
function usePlacesCallbackRef(onParsed) {
  const onParsedRef = useRef(onParsed);
  onParsedRef.current = onParsed;

  return useCallback((node) => {
    if (!node || !window.google?.maps?.places) return;
    const ac = new window.google.maps.places.Autocomplete(node, {
      types: ['address'], componentRestrictions: { country: 'us' },
      fields: ['address_components', 'formatted_address'],
    });
    ac.addListener('place_changed', () => parsePlaceResult(ac.getPlace(), onParsedRef.current));
  }, []);
}

function StatusBadge({ status }) {
  // Status reads as a small colored dot + plain caption — no tinted pills.
  const dot = {
    'Active':            'bg-cb-success',
    'Active (Existing)': 'bg-cb-success',
    'Pending MID':       'bg-cb-accent',
    'Ready to Submit':   'bg-cb-success',
    'In Review':         'bg-cb-border-strong',
    'Error':             'bg-cb-danger',
  };
  // Merchant-facing labels for the backend applicationStepStatus enum —
  // never show processor terms like "MID" in merchant chrome (critique 2026-07-15).
  const label = {
    'Active':            'Active',
    'Active (Existing)': 'Active',
    'Pending MID':       'Awaiting approval',
    'Ready to Submit':   'Ready',
    'In Review':         'In Review',
    'Error':             'Needs attention',
  };
  return (
    <span className="inline-flex items-center gap-1.5 text-cb-caption text-gray-400 whitespace-nowrap">
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${dot[status] || dot['In Review']}`} />
      {label[status] || status || 'In Review'}
    </span>
  );
}

// ─── MID Card (draggable) ─────────────────────────────────────────────────────
// combined=true: flat fields for the 1-location × 1-account case — no nested
// card chrome, no duplicate DBA title, no drag/move/delete. Same save path.

function MidCard({ mid, locationId, corporateId, dbaName, businessState, index, onUpdated, onDelete, moveTargets = [], onMove, combined = false, onApplicantSave }) {
  const { formsLocked } = usePortalLock();
  const locked = getMidLocked(mid) || formsLocked;
  const imported = getMidImported(mid);
  // Nested list: summary only until Edit. Combined 1×1 still auto-opens when incomplete.
  const [editing, setEditing] = useState(
    combined ? (!mid.mccCode && !mid.mccHelpRequested && !locked) : false
  );
  const [form, setForm] = useState({
    merchantName: mid.merchantName || mid.dbaName || dbaName || '',
    mccCode: mid.mccCode || '',
    mccHelpRequested: !!mid.mccHelpRequested,
    industryType: mid.industryType || '',
    monthlyCardSales: mid.monthlyCardSales || '',
    avgSaleAmount: mid.avgSaleAmount || '',
    highestTicketAmount: mid.highestTicketAmount || '',
    cardPresentPct: snapPct10(mid.cardPresentPct, 100),
    internetPct: snapPct10(mid.internetPct, 0),
    motoPct: snapPct10(mid.motoPct, 0),
    businessWebsite: mid.businessWebsite || '',
    alcoholSalesPercentage: mid.alcoholSalesPercentage != null && mid.alcoholSalesPercentage !== ''
      ? String(mid.alcoholSalesPercentage)
      : '',
  });
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState(null);
  const [saveError, setSaveError] = useState('');
  // Industry auto-derives from the business category; the manual override
  // lives behind Advanced so the default editor stays a short form.
  const [showAdvanced, setShowAdvanced] = useState(false);
  // Mobile alternative to drag-and-drop (grips are hidden below sm).
  const [showMoveMenu, setShowMoveMenu] = useState(false);

  const pctSum = (parseInt(form.cardPresentPct) || 0) + (parseInt(form.internetPct) || 0) + (parseInt(form.motoPct) || 0);
  const onlinePct = parseInt(form.internetPct) || 0;
  const websiteErr = onlinePct > 0
    ? businessWebsiteError(form.businessWebsite, { required: true })
    : (String(form.businessWebsite || '').trim()
      ? businessWebsiteError(form.businessWebsite, { required: false })
      : null);
  const websiteOk = !websiteErr;
  const needsLiquorCompliance = requiresLiquorCompliance(businessState, form.mccCode);
  const alcoholOk = !needsLiquorCompliance || isAlcoholSalesPercentageSet(form.alcoholSalesPercentage);
  const categoryOk = !!(form.mccCode || form.mccHelpRequested);
  // Cross-field sales rules (mirrors MSPWare's own validation so the backend
  // never has to silently cap what the merchant typed): typical < monthly,
  // largest > typical, largest < monthly. Only checked once both sides are entered.
  const monthlyNum = Number(form.monthlyCardSales) || 0;
  const typicalNum = Number(form.avgSaleAmount) || 0;
  const largestNum = Number(form.highestTicketAmount) || 0;
  let salesIssue = '';
  if (monthlyNum > 0 && typicalNum > 0 && typicalNum >= monthlyNum) {
    salesIssue = 'Your typical sale should be smaller than your total monthly card sales.';
  } else if (typicalNum > 0 && largestNum > 0 && largestNum <= typicalNum) {
    salesIssue = 'Your largest expected sale should be bigger than your typical sale.';
  } else if (monthlyNum > 0 && largestNum > 0 && largestNum >= monthlyNum) {
    salesIssue = 'Your largest single sale should be smaller than your total monthly card sales.';
  }
  // Save and "complete" now demand the same things — a Save that immediately
  // shows "needs sales info" read as a broken save (critique 2026-07-15). The
  // required set mirrors getMerchantData's readiness check: all three sales
  // figures are needed to build a valid application.
  const salesOk = monthlyNum > 0 && typicalNum > 0 && largestNum > 0 && !salesIssue;
  const canSave = categoryOk && salesOk && pctSum === 100 && alcoholOk && websiteOk;
  // isComplete reads from form state (not stale mid prop) so the header updates immediately after save
  const isComplete = !!(categoryOk && salesOk && alcoholOk && websiteOk);

  const doSave = async () => {
    if (!canSave) return;
    setSaving(true);
    setSaveError('');
    try {
      const payload = {
        ...form,
        // Combined 1×1 panel: store name is the account name — avoid a second label.
        merchantName: combined ? (dbaName || form.merchantName) : (form.merchantName || dbaName),
        businessWebsite: String(form.businessWebsite || '').trim()
          ? normalizeBusinessWebsite(form.businessWebsite)
          : '',
      };
      if (needsLiquorCompliance) {
        payload.alcoholSalesPercentage = Number(form.alcoholSalesPercentage);
      }
      const res = await invokePortalFunction('manageMerchantID', {
        action: 'update', locationId, corporateId, merchantIDId: mid.id,
        data: payload,
      });
      if (res.data?.error) throw new Error(res.data.error);
      const saved = res.data?.updatedMerchantID || res.data?.merchantID;
      if (saved) {
        onUpdated(saved);
        setSavedAt(Date.now());
        onApplicantSave?.();
        return true;
      }
      throw new Error('Save did not complete — please try again.');
    } catch (err) {
      console.error('[MidCard.doSave]', err);
      setSaveError(err?.message || 'Save failed — please try again.');
      return false;
    }
    finally { setSaving(false); }
  };

  const setField = (k, v) => setForm(prev => ({ ...prev, [k]: v }));

  const salesSummary = isComplete
    ? `${mid.mccHelpRequested && !mid.mccCode ? 'Category: Cliqbux will confirm' : (mccDisplayLabel(mid.mccCode) || mid.mccCode)} · $${Number(mid.monthlyCardSales || 0).toLocaleString()}/mo`
    : null;

  const editFormInner = (
            <div className={`${combined ? 'px-4 pb-4 pt-1' : 'border-t border-cb-border px-4 pb-4 pt-3'} space-y-4`}>
              <div className="space-y-3">
                {!combined && (
                <div>
                  <label className={labelCls}>Account Name</label>
                  <input value={form.merchantName} onChange={e => setField('merchantName', e.target.value)}
                    placeholder={`e.g. ${dbaName} – Bar`} className={inputCls} />
                </div>
                )}
                <div>
                  <label className={labelCls}>Business Category *</label>
                  <BusinessCategorySelect
                    mccCode={form.mccCode}
                    mccHelpRequested={form.mccHelpRequested}
                    onPick={(v) => {
                      if (v === MCC_HELP_VALUE) {
                        setForm(f => ({ ...f, mccCode: '', mccHelpRequested: true }));
                        return;
                      }
                      setForm(f => ({ ...f, mccCode: v, mccHelpRequested: false, industryType: v ? mccToIndustry(v) : f.industryType }));
                    }}
                  />
                  {form.mccHelpRequested && !form.mccCode && (
                    <p className="text-cb-caption normal-case tracking-normal font-normal text-gray-500 mt-1.5">
                      No problem — finish the rest of this form and continue. A Cliqbux specialist will confirm the right category with you before anything is signed.
                    </p>
                  )}
                </div>
              </div>

              <div>
                <label className={labelCls}>Card Sales Estimates</label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <span className="text-cb-caption normal-case tracking-normal font-normal text-gray-500 mb-1 block">Monthly card sales ($) *</span>
                    <input type="number" value={form.monthlyCardSales} onChange={e => setField('monthlyCardSales', e.target.value)}
                      placeholder="e.g. 8000" className={inputCls} />
                  </div>
                  <div>
                    <span className="text-cb-caption normal-case tracking-normal font-normal text-gray-500 mb-1 block">Typical sale ($) *</span>
                    <input type="number" value={form.avgSaleAmount} onChange={e => setField('avgSaleAmount', e.target.value)}
                      placeholder="e.g. 45" className={inputCls} />
                  </div>
                  <div>
                    <span className="text-cb-caption normal-case tracking-normal font-normal text-gray-500 mb-1 block">Largest expected sale ($) *</span>
                    <input type="number" value={form.highestTicketAmount} onChange={e => setField('highestTicketAmount', e.target.value)}
                      placeholder="e.g. 200" className={inputCls} />
                  </div>
                </div>
                {salesIssue && (
                  <p className="text-cb-caption normal-case tracking-normal font-normal text-cb-accent mt-1.5">{salesIssue}</p>
                )}
              </div>

              <div>
                <label className={labelCls}>What percentage of your card sales come from each channel?</label>
                <p className="text-cb-caption normal-case tracking-normal font-normal text-gray-500 mb-2">
                  Estimate to the nearest 10%. The three channels must add up to 100%.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {[['cardPresentPct', 'In-person'], ['internetPct', 'Online'], ['motoPct', 'Phone / mail']].map(([k, lbl]) => (
                    <div key={k}>
                      <span className="text-cb-caption normal-case tracking-normal font-normal text-gray-500 mb-1 block">{lbl}</span>
                      <select
                        value={form[k]}
                        onChange={e => setField(k, e.target.value)}
                        className={inputCls}
                        style={{ colorScheme: 'dark' }}
                      >
                        {PCT_10_OPTIONS.map(n => (
                          <option key={n} value={String(n)}>{n}%</option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
                {pctSum !== 100 && <p className="text-cb-caption normal-case tracking-normal font-normal text-cb-accent mt-1.5">Total: {pctSum}% (must be 100%)</p>}
              </div>

              <div>
                <button type="button" onClick={() => setShowAdvanced(a => !a)}
                  className="flex items-center gap-1 text-cb-caption normal-case tracking-normal text-gray-500 hover:text-white transition-colors">
                  {showAdvanced ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />} Advanced
                </button>
                {showAdvanced && (
                  <div className="mt-2">
                    <label className={labelCls}>Industry Type</label>
                    <select value={form.industryType} onChange={e => setField('industryType', e.target.value)}
                      className={inputCls} style={{ colorScheme: 'dark' }}>
                      <option value="">Select…</option>
                      {INDUSTRY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                    <p className="text-cb-caption normal-case tracking-normal font-normal text-gray-500 mt-1.5">
                      Set automatically from your business category — change only if Cliqbux asked you to.
                    </p>
                  </div>
                )}
              </div>

              {onlinePct > 0 && (
                <div>
                  <label className={labelCls}>Business homepage URL *</label>
                  <input
                    type="url"
                    value={form.businessWebsite}
                    onChange={e => setField('businessWebsite', e.target.value)}
                    placeholder="https://www.example.com"
                    className={`${inputCls}${websiteErr ? ' border-cb-danger' : ''}`}
                  />
                  <p className="text-cb-caption normal-case tracking-normal font-normal text-gray-500 mt-1.5">
                    Required when any sales happen online — the underwriting team reviews your website.
                  </p>
                  {websiteErr && (
                    <p className="text-cb-caption normal-case tracking-normal font-normal text-cb-danger mt-1" role="alert">
                      {websiteErr}
                    </p>
                  )}
                </div>
              )}

              {needsLiquorCompliance && (
                <div className="space-y-3 rounded-cb border border-cb-border border-l-cb-accent bg-cb-bg p-3">
                  <p className="text-cb-caption normal-case tracking-normal font-normal text-gray-300 leading-relaxed">
                    {liquorComplianceBannerText(businessState)}
                  </p>
                  <div>
                    <label className={labelCls}>Alcohol Sales Percentage (0–100%) *</label>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={form.alcoholSalesPercentage}
                      onChange={e => setField('alcoholSalesPercentage', e.target.value)}
                      placeholder="e.g. 35"
                      className={inputCls}
                    />
                    {isHighRiskTavern(form.alcoholSalesPercentage) && (
                      <p className="text-cb-caption normal-case tracking-normal font-normal text-cb-accent mt-1.5">
                        Note: Alcohol sales exceeding 50% classifies this business as a High-Risk Tavern. Stricter processing limits and reserve requirements may apply.
                      </p>
                    )}
                  </div>
                  <p className="text-cb-caption normal-case tracking-normal font-normal text-gray-500">
                    After you sign, you&apos;ll upload your state-issued liquor license in post-signing setup. Cliqbux will attach it to your application — it does not block submitting now.
                  </p>
                </div>
              )}

              {saveError && (
                <p className="text-cb-body text-cb-danger" role="alert">{saveError}</p>
              )}
              <div className="flex items-center justify-between pt-2">
                <div className="flex items-center gap-3">
                  <button
                    onClick={async () => { const ok = await doSave(); if (ok) setEditing(false); }}
                    disabled={saving || !canSave}
                    className="flex items-center gap-1.5 bg-cb-accent hover:opacity-90 disabled:bg-cb-surface-raised disabled:text-gray-600 disabled:cursor-not-allowed disabled:opacity-100 text-cb-bg text-cb-body font-semibold px-4 py-2 rounded-cb transition-all"
                  >
                    {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : savedAt ? <Cloud className="w-3 h-3" /> : null}
                    {saving ? 'Saving…' : savedAt ? 'Saved' : 'Save'}
                  </button>
                  {!canSave && (
                    <span className="text-cb-caption normal-case tracking-normal font-normal text-gray-600">
                      {salesIssue
                        ? 'Fix the sales amounts above to save'
                        : `Still need: ${[
                            !categoryOk && 'business category',
                            !(monthlyNum > 0) && 'monthly card sales',
                            !(typicalNum > 0) && 'typical sale',
                            !(largestNum > 0) && 'largest expected sale',
                            pctSum !== 100 && 'card split totaling 100%',
                            !alcoholOk && 'alcohol sales %',
                            !websiteOk && (websiteErr || 'business website'),
                          ].filter(Boolean).join(', ')}`}
                    </span>
                  )}
                </div>
                {!combined || isComplete ? (
                  <button onClick={() => setEditing(false)} className="text-cb-body text-gray-500 hover:text-white transition-colors">Cancel</button>
                ) : null}
              </div>
            </div>
  );

  // ── Combined 1×1: flat fields under the store header (no nested card) ──
  if (combined) {
    return (
      <div className={locked ? 'opacity-60' : ''}>
        <AnimatePresence initial={false} mode="wait">
          {isComplete && !editing ? (
            <motion.div
              key="mid-summary"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="flex items-center gap-3 px-4 py-3 border-t border-cb-border"
            >
              <div className="flex-1 min-w-0">
                <p className="text-cb-caption uppercase text-gray-500 mb-0.5">Card processing</p>
                <p className="text-cb-body text-gray-300">{salesSummary}</p>
              </div>
              {imported && <span className="text-cb-caption text-gray-500">Imported</span>}
              {locked && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="p-1 text-gray-500 cursor-default"><Lock className="w-3 h-3" /></span>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="text-xs max-w-[200px] text-center">
                      Application in progress — changes require support assistance.
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
              {!locked && (
                <button onClick={() => setEditing(true)} aria-label="Edit processing details"
                  className="p-2 text-gray-500 hover:text-white transition-colors">
                  <Pencil className="w-3.5 h-3.5" />
                </button>
              )}
            </motion.div>
          ) : (
            <motion.div
              key="mid-edit"
              {...accordionProps}
              className="overflow-hidden border-t border-cb-border"
            >
              <div className="pt-3">
                <p className="text-cb-caption uppercase text-gray-500 px-4 mb-2">Card processing</p>
                {!locked ? editFormInner : (
                  <p className="text-cb-caption text-gray-500 px-4 pb-4">Processing details are locked while the application is in progress.</p>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  // ── Nested (multi-account / multi-location) card ──
  return (
    <Draggable draggableId={`mid-${mid.id}`} index={index}>
      {(provided, snapshot) => (
        <motion.div
          ref={provided.innerRef}
          {...provided.draggableProps}
          className={`rounded-cb border transition-colors ${snapshot.isDragging ? 'border-cb-border-strong bg-cb-surface-raised shadow-cb-overlay' : locked ? 'border-cb-border bg-transparent opacity-60' : 'border-cb-border bg-transparent hover:border-cb-border-strong'}`}
        >
          <div className="flex items-center gap-2.5 px-3 py-2.5">
            <span {...provided.dragHandleProps} className={`hidden sm:block text-gray-600 flex-shrink-0 ${locked ? 'cursor-not-allowed' : 'hover:text-gray-400 cursor-grab active:cursor-grabbing'}`}>
              <GripVertical className="w-3.5 h-3.5" />
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-cb-body font-medium text-white truncate">{form.merchantName || dbaName}</p>
              {isComplete
                ? <p className="text-cb-caption normal-case tracking-normal text-gray-500">{salesSummary}</p>
                : <p className="text-cb-caption normal-case tracking-normal text-cb-accent font-normal">Needs category &amp; sales info</p>
              }
            </div>
            <div className="flex items-center gap-2.5 flex-shrink-0">
              {imported && <span className="text-cb-caption text-gray-500">Imported</span>}
              <StatusBadge status={mid.applicationStepStatus || 'In Review'} />
              {locked && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="p-1 text-gray-500 cursor-default"><Lock className="w-3 h-3" /></span>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="text-xs max-w-[200px] text-center">
                      Application in progress — changes require support assistance.
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
            </div>
            {!locked && (
              <>
                {moveTargets.length > 0 && (
                  <button onClick={() => setShowMoveMenu(m => !m)}
                    className="sm:hidden p-3 -m-1 text-cb-caption normal-case tracking-normal text-gray-500 hover:text-white transition-colors">
                    Move
                  </button>
                )}
                <button onClick={() => setEditing(e => !e)} aria-label="Edit processing account"
                  className="p-3 -m-1 sm:p-2 sm:m-0 text-gray-500 hover:text-white transition-colors">
                  <Pencil className="w-3 h-3" />
                </button>
                <button onClick={() => onDelete(mid)} aria-label="Remove processing account"
                  className="p-3 -m-1 sm:p-2 sm:m-0 text-gray-600 hover:text-cb-danger transition-colors">
                  <Trash2 className="w-3 h-3" />
                </button>
              </>
            )}
          </div>

          {showMoveMenu && !locked && moveTargets.length > 0 && (
            <div className="sm:hidden border-t border-cb-border px-3 py-2.5 space-y-1.5">
              <p className="text-cb-caption uppercase text-gray-500">Move to</p>
              {moveTargets.map(t => (
                <button key={t.id} onClick={() => { setShowMoveMenu(false); onMove?.(mid.id, t.id); }}
                  className="w-full text-left text-cb-body text-gray-300 hover:text-white py-2.5 px-3 rounded-cb border border-cb-border transition-colors">
                  {t.label}
                </button>
              ))}
            </div>
          )}

          <AnimatePresence initial={false}>
          {editing && !locked && (
            <motion.div
              key="mid-edit"
              {...accordionProps}
              className="overflow-hidden"
            >
              {editFormInner}
            </motion.div>
          )}
          </AnimatePresence>
        </motion.div>
      )}
    </Draggable>
  );
}

// ─── Location Card (nested inside Entity, draggable) ──────────────────────────

function LocationCard({ location, corporateId, merchantIDs, onDelete, onMerchantIDAdded, onMerchantIDUpdated, onMerchantIDDeleted, onLocationUpdated, index, showValidation, allLocations = [], entityMoveTargets = [], onMoveLocation, onMoveMid, simpleMode = false, onApplicantSave }) {
  const { formsLocked } = usePortalLock();
  // Oldest-first so the first-created MID (usually same name as the location) leads the list.
  const locMids = merchantIDs
    .filter(c => c.locationId === location.id)
    .slice()
    .sort((a, b) => {
      const ta = new Date(a.created_date || a.createdAt || 0).getTime();
      const tb = new Date(b.created_date || b.createdAt || 0).getTime();
      if (ta !== tb) return ta - tb;
      return String(a.id).localeCompare(String(b.id));
    });
  // Mobile alternative to drag-and-drop (grips are hidden below sm).
  const [showMoveMenu, setShowMoveMenu] = useState(false);
  const midMoveTargets = allLocations
    .filter(l => l.id !== location.id)
    .map(l => ({ id: l.id, label: l.dbaName || l.businessAddress || 'Location' }));
  // Quick inline edit for the (often prefilled) name + address — 2026-07-10
  const [editingLoc, setEditingLoc] = useState(false);
  const [locForm, setLocForm] = useState({ dbaName: '', street: '', street2: '', city: '', state: '', zip: '' });
  const [locSaving, setLocSaving] = useState(false);
  const [locEditError, setLocEditError] = useState('');
  // Google Places verification — selecting a suggestion fills + verifies the
  // address; manual typing un-verifies it (soft check, save still allowed)
  const [locVerified, setLocVerified] = useState(false);
  const editPlacesRef = usePlacesCallbackRef(({ street, street2, city, state, zip }) => {
    setLocForm(f => ({ ...f, street, street2: street2 || '', city, state, zip }));
    setLocVerified(true);
  });
  const startLocEdit = () => {
    // Fallback: records touched before the persistence fix may have only the
    // composed businessAddress string — parse it so the form doesn't open with
    // blanks that would then be saved over whatever the record still has.
    const flat = (location.businessAddress || '').match(/^(.+?),\s*(.+?),?\s+([A-Za-z]{2})\s+(\d{5}(?:-\d{4})?)$/);
    setLocForm({
      dbaName: location.dbaName || '',
      street: location.businessStreet || flat?.[1]?.trim() || (location.businessAddress || '').split(',')[0]?.trim() || '',
      street2: location.businessStreet2 || '',
      city: location.businessCity || flat?.[2]?.trim() || '',
      state: location.businessState || flat?.[3]?.toUpperCase() || '',
      zip: location.businessZip || flat?.[4]?.trim() || '',
    });
    setLocEditError('');
    setLocVerified(false);
    setEditingLoc(true);
  };
  const saveLocEdit = async () => {
    if (!locForm.dbaName.trim()) { setLocEditError('Location name is required'); return; }
    if (!/^\s*\d/.test(locForm.street)) { setLocEditError('Street address must include a street number (e.g. "123 Main St")'); return; }
    if (!locForm.city.trim()) { setLocEditError('City is required'); return; }
    if (!/^[A-Za-z]{2}$/.test(locForm.state.trim())) { setLocEditError('State must be a 2-letter code (e.g. CA)'); return; }
    if (!/^\d{5}(-\d{4})?$/.test(locForm.zip.trim())) { setLocEditError('ZIP must be 5 digits'); return; }
    setLocSaving(true); setLocEditError('');
    try {
      const res = await invokePortalFunction('updateLocationDetails', {
        locationId: location.id,
        dbaName: locForm.dbaName.trim(),
        businessStreet: locForm.street.trim(),
        businessStreet2: locForm.street2.trim(),
        businessCity: locForm.city.trim(),
        businessState: locForm.state.trim(),
        businessZip: locForm.zip.trim(),
      });
      if (res.data?.error) throw new Error(res.data.error);
      onLocationUpdated?.({ id: location.id, ...res.data.location });
      setEditingLoc(false);
      onApplicantSave?.();
    } catch (err) { setLocEditError(err.message || 'Save failed'); }
    finally { setLocSaving(false); }
  };
  const [addingMid, setAddingMid] = useState(false);
  const [addMidName, setAddMidName] = useState('');
  const [addMidSaving, setAddMidSaving] = useState(false);
  const [addMidError, setAddMidError] = useState('');
  const allMidsComplete = locMids.length > 0 && locMids.every(m => isMidComplete(m, location.businessState));
  const locationError = showValidation && !allMidsComplete;
  const locNeedsLiquorDocs = locMids.some(m => requiresLiquorCompliance(location.businessState, m.mccCode));

  const handleAddMid = async () => {
    setAddMidSaving(true);
    setAddMidError('');
    try {
      const res = await invokePortalFunction('manageMerchantID', {
        action: 'add', locationId: location.id, corporateId,
        data: { merchantName: addMidName || location.dbaName, mccCode: '' },
      });
      if (res.data?.error) throw new Error(res.data.error);
      const saved = res.data?.merchantID;
      if (saved) { onMerchantIDAdded(saved); setAddingMid(false); setAddMidName(''); onApplicantSave?.(); return; }
      throw new Error('Could not add the account — please try again.');
    } catch (err) {
      console.error('[LocationCard.handleAddMid]', err);
      setAddMidError(err?.message || 'Could not add the account — please try again.');
    }
    finally { setAddMidSaving(false); }
  };

  const locEditPanel = editingLoc ? (
            <div className="mx-4 mb-4 bg-cb-bg border border-cb-border rounded-cb p-4 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <input value={locForm.dbaName} onChange={e => setLocForm(f => ({ ...f, dbaName: e.target.value }))} placeholder="Location name" autoFocus className={inputCls} />
                <input ref={editPlacesRef} value={locForm.street}
                  onChange={e => { setLocForm(f => ({ ...f, street: e.target.value })); setLocVerified(false); }}
                  placeholder="Start typing your address…" className={inputCls} />
                <input value={locForm.street2} onChange={e => setLocForm(f => ({ ...f, street2: e.target.value }))}
                  placeholder="Apt / Suite / Unit (optional)" className={inputCls} />
                <input value={locForm.city} onChange={e => setLocForm(f => ({ ...f, city: e.target.value }))} placeholder="City" className={inputCls} />
                <div className="grid grid-cols-2 gap-3">
                  <input value={locForm.state} onChange={e => setLocForm(f => ({ ...f, state: e.target.value }))} placeholder="State" maxLength={2} className={inputCls} />
                  <input value={locForm.zip} onChange={e => setLocForm(f => ({ ...f, zip: e.target.value }))} placeholder="ZIP" className={inputCls} />
                </div>
              </div>
              {locVerified ? (
                <p className="text-cb-caption normal-case tracking-normal font-normal text-cb-success flex items-center gap-1"><Check className="w-3 h-3" /> Address verified via Google Maps</p>
              ) : (
                <p className="text-cb-caption normal-case tracking-normal font-normal text-gray-500">Tip: pick your address from the suggestions to verify it via Google Maps.</p>
              )}
              {locEditError && <p className="text-cb-body text-cb-danger">{locEditError}</p>}
              <div className="flex items-center gap-3">
                <button onClick={saveLocEdit} disabled={locSaving}
                  className="text-cb-body font-semibold bg-cb-accent hover:opacity-90 disabled:opacity-50 text-cb-bg px-4 py-2 rounded-cb transition-colors">
                  {locSaving ? 'Saving…' : 'Save Changes'}
                </button>
                <button onClick={() => setEditingLoc(false)} className="text-cb-body text-gray-400 hover:text-white px-2 py-2">Cancel</button>
              </div>
            </div>
  ) : null;

  const addMidControls = addingMid ? (
                  <div className="mt-2 space-y-2 px-4 pb-3">
                    <div className="flex gap-3 items-center">
                      <input value={addMidName} onChange={e => setAddMidName(e.target.value)}
                        placeholder={`e.g. ${location.dbaName} – Bar`}
                        className={`${inputCls} py-2`} autoFocus
                        onKeyDown={e => { if (e.key === 'Enter') handleAddMid(); if (e.key === 'Escape') setAddingMid(false); }} />
                      <button onClick={handleAddMid} disabled={addMidSaving}
                        className="flex-shrink-0 flex items-center gap-1 bg-cb-accent hover:opacity-90 text-cb-bg text-cb-body font-semibold px-3 py-2 rounded-cb disabled:opacity-50 transition-colors">
                        {addMidSaving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />} Add
                      </button>
                      <button onClick={() => setAddingMid(false)} className="p-2 text-gray-500 hover:text-white flex-shrink-0"><X className="w-3 h-3" /></button>
                    </div>
                    {addMidError && <p className="text-cb-body text-cb-danger" role="alert">{addMidError}</p>}
                  </div>
                ) : (
                  <button onClick={() => setAddingMid(true)}
                    className="w-full flex items-center gap-1.5 px-4 py-3 text-cb-caption text-gray-500 hover:text-white transition-colors text-left border-t border-cb-border">
                    <Plus className="w-3 h-3" /> Add another processing account (e.g. a bar inside this location)
                  </button>
                );

  // ── Combined panel: 1 location × 1 processing account ──
  // One store card — name, address, and processing fields. No nested "same name" MID box.
  if (simpleMode && locMids.length === 1) {
    const mid = locMids[0];
    return (
      <Draggable draggableId={`loc-${location.id}`} index={index}>
        {(provided, snapshot) => (
          <motion.div
            ref={provided.innerRef}
            {...provided.draggableProps}
            className={`rounded-cb border transition-colors ${snapshot.isDragging ? 'border-cb-border-strong bg-cb-surface-raised shadow-cb-overlay' : locationError ? 'border-cb-danger bg-cb-surface-raised' : 'border-cb-border bg-cb-surface-raised hover:border-cb-border-strong'}`}
          >
            <div className="flex items-center gap-3 px-4 py-3">
              {/* DnD requires a handle; hide it in 1×1 — nothing to reorder */}
              <span {...provided.dragHandleProps} className="sr-only">Reorder</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-cb-body font-semibold text-white truncate">{location.dbaName}</p>
                  {locationError && (
                    <span className="inline-flex items-center gap-1.5 text-cb-caption text-cb-danger whitespace-nowrap">
                      <span className="w-1.5 h-1.5 rounded-full bg-cb-danger flex-shrink-0" />Needs info
                    </span>
                  )}
                </div>
                <p className="text-cb-body text-gray-500 truncate">{location.businessAddress}</p>
              </div>
              <div className="flex items-center gap-2.5 flex-shrink-0">
                {allMidsComplete && <Check className="w-3.5 h-3.5 text-cb-success" />}
                <StatusBadge status={mid.applicationStepStatus || 'In Review'} />
                <button
                  onClick={() => { if (!formsLocked) startLocEdit(); }}
                  title={formsLocked ? FORMS_LOCKED_MESSAGE : 'Edit store name / address'}
                  disabled={formsLocked}
                  className="p-2 text-gray-600 hover:text-white rounded-cb transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => { if (!formsLocked) onDelete(location); }}
                  disabled={formsLocked}
                  aria-label="Remove location"
                  className="p-2 text-gray-600 hover:text-cb-danger rounded-cb transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {locEditPanel}

            {locNeedsLiquorDocs && (
              <p className="text-cb-caption normal-case tracking-normal font-normal text-gray-500 px-4 pb-2">
                Bar/Tavern in {location.businessState}: alcohol sales % is required now. Liquor license upload comes after signing.
              </p>
            )}

            <MidCard
              combined
              mid={mid}
              index={0}
              locationId={location.id}
              corporateId={corporateId}
              dbaName={location.dbaName}
              businessState={location.businessState || ''}
              onUpdated={onMerchantIDUpdated}
              onDelete={onMerchantIDDeleted}
              onApplicantSave={onApplicantSave}
            />

            {!formsLocked && addMidControls}
          </motion.div>
        )}
      </Draggable>
    );
  }

  return (
    <Draggable draggableId={`loc-${location.id}`} index={index}>
      {(provided, snapshot) => (
        <motion.div
          ref={provided.innerRef}
          {...provided.draggableProps}
          className={`rounded-cb border transition-colors ${snapshot.isDragging ? 'border-cb-border-strong bg-cb-surface-raised shadow-cb-overlay' : locationError ? 'border-cb-danger bg-cb-surface-raised' : 'border-cb-border bg-cb-surface-raised hover:border-cb-border-strong'}`}
        >
          {/* Location header */}
          <div className="flex items-center gap-3 px-4 py-3">
            <span {...provided.dragHandleProps} className="hidden sm:block text-gray-600 hover:text-gray-300 cursor-grab active:cursor-grabbing flex-shrink-0">
              <GripVertical className="w-4 h-4" />
            </span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-cb-body font-semibold text-white truncate">{location.dbaName}</p>
                {locationError && (
                  <span className="inline-flex items-center gap-1.5 text-cb-caption text-cb-danger whitespace-nowrap">
                    <span className="w-1.5 h-1.5 rounded-full bg-cb-danger flex-shrink-0" />Needs info
                  </span>
                )}
              </div>
              <p className="text-cb-body text-gray-500 truncate">{location.businessAddress}</p>
            </div>
            <div className="flex items-center gap-2.5 flex-shrink-0">
              {allMidsComplete && <Check className="w-3.5 h-3.5 text-cb-success" />}
              {!simpleMode && (
              <span className="hidden sm:inline text-cb-caption text-gray-500">
                {locMids.length} account{locMids.length !== 1 ? 's' : ''}
              </span>
              )}
              {!formsLocked && entityMoveTargets.length > 0 && (
                <button
                  onClick={e => { e.stopPropagation(); setShowMoveMenu(m => !m); }}
                  className="sm:hidden p-3 -m-1 text-cb-caption normal-case tracking-normal text-gray-500 hover:text-white transition-colors"
                >
                  Move
                </button>
              )}
              <button
                onClick={e => { e.stopPropagation(); if (!formsLocked) startLocEdit(); }}
                title={formsLocked ? FORMS_LOCKED_MESSAGE : 'Edit location name / address'}
                disabled={formsLocked}
                className="p-3 -m-1 sm:p-2 sm:m-0 text-gray-600 hover:text-white rounded-cb transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Pencil className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={e => { e.stopPropagation(); if (!formsLocked) onDelete(location); }}
                disabled={formsLocked}
                aria-label="Remove location"
                className="p-3 -m-1 sm:p-2 sm:m-0 text-gray-600 hover:text-cb-danger rounded-cb transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Mobile "Move to…" — drag handles are hidden below sm */}
          {showMoveMenu && !formsLocked && entityMoveTargets.length > 0 && (
            <div className="sm:hidden border-t border-cb-border px-4 py-2.5 space-y-1.5">
              <p className="text-cb-caption uppercase text-gray-500">Move to legal entity</p>
              {entityMoveTargets.map(t => (
                <button key={t.id} onClick={() => { setShowMoveMenu(false); onMoveLocation?.(location.id, t.id); }}
                  className="w-full text-left text-cb-body text-gray-300 hover:text-white py-2.5 px-3 rounded-cb border border-cb-border transition-colors">
                  {t.label}
                </button>
              ))}
            </div>
          )}

          {locEditPanel}

          {/* MIDs — always visible; indented off a hairline rail when 2+ accounts */}
          <div className="border-t border-cb-border px-4 pb-4 pt-3">
              {/* The org-chart chrome (caption + rail) only appears once there is
                  actually a hierarchy to show — single-account locations stay flat. */}
              {locMids.length > 1 && (
                <p className="text-cb-caption uppercase text-gray-500 mb-2">
                  Processing Accounts
                </p>
              )}
              <div className={locMids.length > 1 ? 'ml-1.5 pl-4 border-l border-cb-border' : ''}>
                <Droppable droppableId={`mids-${location.id}`} type="MID">
                  {(drop, dropSnap) => (
                    <div
                      ref={drop.innerRef}
                      {...drop.droppableProps}
                      className={`space-y-2 min-h-[32px] rounded-cb transition-colors ${dropSnap.isDraggingOver ? 'bg-cb-accent-muted' : ''}`}
                    >
                      {locNeedsLiquorDocs && (
                        <p className="text-cb-caption normal-case tracking-normal font-normal text-gray-500 px-1">
                          Bar/Tavern in {location.businessState}: alcohol sales % is required now. Liquor license upload comes after signing.
                        </p>
                      )}
                      {locMids.map((mid, idx) => (
                        <MidCard
                          key={mid.id}
                          mid={mid}
                          index={idx}
                          locationId={location.id}
                          corporateId={corporateId}
                          dbaName={location.dbaName}
                          businessState={location.businessState || ''}
                          onUpdated={onMerchantIDUpdated}
                          onDelete={onMerchantIDDeleted}
                          moveTargets={midMoveTargets}
                          onMove={onMoveMid}
                          onApplicantSave={onApplicantSave}
                        />
                      ))}
                      {drop.placeholder}
                    </div>
                  )}
                </Droppable>

                {addingMid ? (
                  <div className="mt-2 space-y-2">
                    <div className="flex gap-3 items-center">
                      <input value={addMidName} onChange={e => setAddMidName(e.target.value)}
                        placeholder={`e.g. ${location.dbaName} – Bar`}
                        className={`${inputCls} py-2`} autoFocus
                        onKeyDown={e => { if (e.key === 'Enter') handleAddMid(); if (e.key === 'Escape') setAddingMid(false); }} />
                      <button onClick={handleAddMid} disabled={addMidSaving}
                        className="flex-shrink-0 flex items-center gap-1 bg-cb-accent hover:opacity-90 text-cb-bg text-cb-body font-semibold px-3 py-2 rounded-cb disabled:opacity-50 transition-colors">
                        {addMidSaving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />} Add
                      </button>
                      <button onClick={() => setAddingMid(false)} className="p-2 text-gray-500 hover:text-white flex-shrink-0"><X className="w-3 h-3" /></button>
                    </div>
                    {addMidError && <p className="text-cb-body text-cb-danger" role="alert">{addMidError}</p>}
                  </div>
                ) : (
                  <button onClick={() => setAddingMid(true)}
                    className="mt-1 w-full flex items-center gap-1.5 py-2 text-cb-caption text-gray-500 hover:text-white transition-colors text-left">
                    <Plus className="w-3 h-3" /> Add another processing account (e.g. a bar inside this location)
                  </button>
                )}
              </div>
            </div>
        </motion.div>
      )}
    </Draggable>
  );
}

// ─── Entity Details Panel (ownership type, tax class, year established) ──────

const OWNERSHIP_TYPES = [
  { value: 'SOLE_PROPRIETOR', label: 'Sole Proprietor' },
  { value: 'LIMITED_COMPANY', label: 'LLC' },
  { value: 'CORPORATION', label: 'Corporation' },
  { value: 'GENERAL_PARTNERSHIP', label: 'General Partnership' },
  { value: 'LIMITED_PARTNERSHIP', label: 'Limited Partnership' },
  { value: 'NON_PROFIT', label: 'Non-Profit' },
  // 2026-07-06: added to match MSPWare's real Ownership Type field. mapOwnershipType
  // already maps these to MSP codes SS / T, but those codes were never confirmed via
  // debugMSPFormRaw/live testing before now — verify before trusting for a real merchant.
  // MSPWare's dropdown also has Estate, Government (Federal/State/Local), Unincorporated
  // Association, and a 3-way C-Corp split (Closely Held/Private/Public) that we don't
  // offer yet — no confirmed wire codes for those, see docs/mspware-field-reference.md.
  { value: 'SUB_S_CORP', label: 'Sub S Corp' },
  { value: 'TRUST', label: 'Trust' },
];

const TAX_CLASS_TYPES = [
  { value: 'SOLE_PROP', label: 'Sole Proprietor / Disregarded Entity' },
  { value: 'LLC_CORPORATION', label: 'LLC taxed as C-Corp' },
  { value: 'LLC_PARTNERSHIP', label: 'LLC taxed as Partnership' },
  { value: 'CORPORATION', label: 'Corporation (C-Corp / S-Corp)' },
  { value: 'PARTNERSHIP', label: 'Partnership' },
];

// 2026-07-03: MSPWare's own "LLC Class" field only has 3 real options
// (Corporation / disregarded entity / Partnership) — showing the full generic
// TAX_CLASS_TYPES list (meant for other Business Entity Types) was confusing
// when the merchant had already chosen LLC. Values match mapLlcClass's expected
// keys exactly ('LLC' -> D, 'LLC_PARTNERSHIP' -> P, 'LLC_CORPORATION' -> C) —
// see submitToMSP/signApplication entry.ts.
const LLC_TAX_CLASS_TYPES = [
  { value: 'LLC_CORPORATION', label: 'Corporation' },
  { value: 'LLC', label: 'Disregarded Entity' },
  { value: 'LLC_PARTNERSHIP', label: 'Partnership' },
];

function deriveOwnership(year) {
  if (!year) return { years: '1', months: '0' };
  const now = new Date();
  const totalMonths = (now.getFullYear() - parseInt(year, 10)) * 12 + now.getMonth();
  const yrs = Math.max(0, Math.floor(totalMonths / 12));
  const mos = Math.max(0, totalMonths % 12);
  return { years: String(yrs), months: String(mos) };
}

/** Exact missing business-detail fields — used by the Continue banner (live form + saved entity). */
function entityMissingFields({ ownershipType, taxClassType, establishmentYear, federalEIN } = {}) {
  const missing = [];
  if (!ownershipType) missing.push('Business Entity Type');
  if (!taxClassType) missing.push('IRS Tax Classification');
  if (!establishmentYear) missing.push('Year Established');
  const ein = String(federalEIN || '').replace(/\D/g, '');
  if (ein.length !== 9) {
    missing.push(ein.length === 0 ? 'Federal EIN (9 digits)' : `Federal EIN (need 9 digits, ${ein.length} entered)`);
  }
  return missing;
}

function EntityDetailsPanel({ entity, corporateId, onUpdated, onDraftStatus, forceExpand, onApplicantSave, children, onSaveSuccess }) {
  const { formsLocked, unlocking, onRequestUnlock, canUnlock } = usePortalLock();
  const [legalName, setLegalName] = useState(entity.legalBusinessName || '');
  const [ownershipType, setOwnershipType] = useState(entity.ownershipType || '');
  const [taxClassType, setTaxClassType]   = useState(entity.taxClassType  || '');
  const [estYear, setEstYear]             = useState(entity.establishmentYear || '');
  // Federal EIN — added 2026-07-07. Entities can now be auto-seeded (from the
  // Company Name collected at signup) with no EIN at all, since self-serve
  // signup never asks for one. This panel is where that EIN gets filled in
  // later, using the same required-field gating pattern as the fields below.
  const [federalEIN, setFederalEIN]       = useState(entity.federalEIN || '');
  const einDigits = federalEIN.replace(/\D/g, '');
  const [saved, setSaved] = useState(entityMissingFields(entity).length === 0);

  // Re-sync when parent reloads entity data (e.g. after navigating away and back)
  useEffect(() => {
    setLegalName(entity.legalBusinessName || '');
    setOwnershipType(entity.ownershipType || '');
    setTaxClassType(entity.taxClassType || '');
    setEstYear(entity.establishmentYear || '');
    setFederalEIN(entity.federalEIN || '');
    setSaved(entityMissingFields(entity).length === 0);
  }, [entity.entityId, entity.legalBusinessName, entity.ownershipType, entity.taxClassType, entity.establishmentYear, entity.federalEIN]);

  // Report live form gaps to the parent Continue banner (avoids listing fields
  // the merchant already typed but hasn't saved yet).
  useEffect(() => {
    if (!onDraftStatus) return;
    const liveMissing = [
      ...(!String(legalName || '').trim() ? ['Legal business name'] : []),
      ...entityMissingFields({
        ownershipType, taxClassType, establishmentYear: estYear, federalEIN,
      }),
    ];
    const persistedMissing = [
      ...(!String(entity.legalBusinessName || '').trim() ? ['Legal business name'] : []),
      ...entityMissingFields({
        ownershipType: entity.ownershipType,
        taxClassType: entity.taxClassType,
        establishmentYear: entity.establishmentYear,
        federalEIN: entity.federalEIN,
      }),
    ];
    onDraftStatus({
      entityId: entity.entityId,
      name: legalName || entity.legalBusinessName || 'Legal Entity',
      missing: liveMissing,
      needsSave: liveMissing.length === 0 && persistedMissing.length > 0,
    });
  }, [
    legalName, ownershipType, taxClassType, estYear, federalEIN,
    entity.entityId, entity.legalBusinessName,
    entity.ownershipType, entity.taxClassType, entity.establishmentYear, entity.federalEIN,
    onDraftStatus,
  ]);

  const [saving, setSaving]     = useState(false);
  const [saveError, setSaveError] = useState(null);

  const liveMissing = [
    ...(!String(legalName || '').trim() ? ['Legal business name'] : []),
    ...entityMissingFields({
      ownershipType, taxClassType, establishmentYear: estYear, federalEIN,
    }),
  ];
  const canSave = liveMissing.length === 0;

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);
    setSaveError(null);
    try {
      const nameTrim = legalName.trim();
      const res = await invokePortalFunction('manageLegalEntity', {
        action: 'edit', corporateId, entityId: entity.entityId,
        legalBusinessName: nameTrim,
        ownershipType, taxClassType, establishmentYear: estYear, federalEIN: einDigits,
      });
      if (res.data?.error) throw new Error(res.data.error);
      const { years, months } = deriveOwnership(estYear);
      await invokePortalFunction('updateMerchantProfile', {
        corporateId, ownershipType, taxClassType, establishmentYear: estYear,
        currentOwnershipYears: years, currentOwnershipMonths: months,
      });
      setSaved(true);
      const updated = {
        ...entity,
        legalBusinessName: nameTrim,
        ownershipType,
        taxClassType,
        establishmentYear: estYear,
        federalEIN: einDigits,
      };
      // Only notify parent once on explicit save — no feedback loop
      onUpdated(updated);
      onApplicantSave?.();
      onSaveSuccess?.(updated);
    } catch (err) {
      setSaveError(err?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  // Parent mounts this only when legal edit is open — no chevron accordion.
  return (
    <div className="border-t border-cb-border px-5 py-4 space-y-4">
      <div>
        <label className={labelCls}>Legal business name *</label>
        <input
          value={legalName}
          onChange={e => setLegalName(e.target.value)}
          placeholder="Legal business name"
          className={inputCls}
        />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className={labelCls}>Business Entity Type *</label>
          <select value={ownershipType} onChange={e => setOwnershipType(e.target.value)}
            className={inputCls} style={{ colorScheme: 'dark' }}>
            <option value="">Select…</option>
            {OWNERSHIP_TYPES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        <div>
          <label className={labelCls}>IRS Tax Classification *</label>
          <select value={taxClassType} onChange={e => setTaxClassType(e.target.value)}
            className={inputCls} style={{ colorScheme: 'dark' }}>
            <option value="">Select…</option>
            {(ownershipType === 'LIMITED_COMPANY' ? LLC_TAX_CLASS_TYPES : TAX_CLASS_TYPES)
              .map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className={labelCls}>Year Established *</label>
          <input type="number" value={estYear}
            onChange={e => setEstYear(e.target.value)}
            placeholder="e.g. 2018" min="1900" max={new Date().getFullYear()} className={inputCls} />
          {estYear && (() => {
            const { years, months } = deriveOwnership(estYear);
            return <p className="text-cb-caption normal-case tracking-normal font-normal text-gray-500 mt-1.5">{years} yr{years !== '1' ? 's' : ''}{months !== '0' ? ` ${months} mo` : ''} in operation</p>;
          })()}
        </div>
        <div>
          <label className={labelCls}>Federal EIN *</label>
          <input
            value={federalEIN}
            onChange={e => setFederalEIN(e.target.value.replace(/\D/g, '').slice(0, 9))}
            placeholder="9 digits"
            className={`${inputCls} font-mono ${forceExpand && einDigits.length !== 9 ? 'border-cb-danger focus:ring-cb-danger' : ''}`}
          />
          {federalEIN.length > 0 && einDigits.length !== 9 && (
            <p className="text-cb-caption normal-case tracking-normal font-normal text-cb-accent mt-1.5">{einDigits.length}/9 digits</p>
          )}
          {forceExpand && einDigits.length === 0 && (
            <p className="text-cb-caption normal-case tracking-normal font-normal text-cb-danger mt-1.5">Required to continue — enter the 9-digit EIN, then Save Details</p>
          )}
        </div>
      </div>

      {children}

      <div className="flex items-center gap-3 pt-1">
        <button
          onClick={handleSave}
          disabled={!canSave || saving || formsLocked}
          className="flex items-center gap-1.5 bg-cb-accent hover:opacity-90 disabled:bg-cb-surface-raised disabled:text-gray-600 disabled:cursor-not-allowed text-cb-bg text-cb-body font-semibold px-4 py-2 rounded-cb transition-all"
        >
          {formsLocked ? <Lock className="w-3 h-3" /> : saving ? <Loader2 className="w-3 h-3 animate-spin" /> : saved ? <Check className="w-3 h-3" /> : null}
          {formsLocked ? 'Forms Locked' : saving ? 'Saving…' : saved ? 'Saved' : 'Save Details'}
        </button>
        {formsLocked
          ? (
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 flex-1 min-w-0">
              <p className="text-cb-caption normal-case tracking-normal font-normal text-gray-600">{FORMS_LOCKED_MESSAGE}</p>
              {canUnlock && (
                <UnlockModifyControls
                  onUnlock={onRequestUnlock}
                  unlocking={unlocking}
                  buttonClassName="flex-shrink-0 min-h-10 px-3 py-1.5 rounded-cb bg-cb-accent text-cb-bg text-cb-body font-semibold hover:opacity-90 disabled:opacity-50"
                />
              )}
            </div>
          )
          : !canSave && (
            <p className="text-cb-caption normal-case tracking-normal font-normal text-gray-600">
              Still need: {liveMissing.join(', ')}
            </p>
          )}
        {saveError && <p className="text-cb-caption normal-case tracking-normal font-normal text-cb-danger">⚠ {saveError}</p>}
      </div>
    </div>
  );
}

// ─── Entity Legal + Correspondence Addresses ─────────────────────────────────
// MSPWare ADDRESSES tab has two different concepts we used to conflate:
//   1) Legal Address (required when ≠ store/DBA) → mailingStreet* → legal_* on wire
//   2) Mailing Address (optional, correspondence only) → correspondence* → mailing_*

function entityLegalAddressComplete(entity) {
  const same = entity.legalAddressSameAsStore !== undefined
    ? Boolean(entity.legalAddressSameAsStore)
    : !(entity.mailingStreet && entity.mailingCity && entity.mailingState);
  if (same) return true;
  return !!(entity.mailingStreet && entity.mailingCity && entity.mailingState && entity.mailingZip);
}

/** Quiet collapsed caption under the entity header (ownership · year · legal address). */
function entityLegalSummaryCaption(entity) {
  const parts = [];
  const ownershipLabel = OWNERSHIP_TYPES.find(o => o.value === entity.ownershipType)?.label;
  if (ownershipLabel) parts.push(ownershipLabel);
  if (entity.establishmentYear) parts.push(`Est. ${entity.establishmentYear}`);
  const same = entity.legalAddressSameAsStore !== undefined
    ? Boolean(entity.legalAddressSameAsStore)
    : !(entity.mailingStreet && entity.mailingCity && entity.mailingState);
  if (same) parts.push('Legal address same as store');
  else if (entity.mailingStreet && entity.mailingCity) {
    parts.push(composeFullAddress({
      street: entity.mailingStreet,
      street2: entity.mailingStreet2,
      city: entity.mailingCity,
      state: entity.mailingState,
      zip: entity.mailingZip,
    }));
  }
  return parts.join(' · ');
}

function normalizeEntityRecord(e) {
  const mailingStreet = e.mailingStreet || '';
  const mailingCity = e.mailingCity || '';
  const mailingState = e.mailingState || '';
  const mailingZip = e.mailingZip || '';
  return {
    ...e,
    mailingStreet,
    mailingStreet2: e.mailingStreet2 || '',
    mailingCity,
    mailingState,
    mailingZip,
    legalAddressSameAsStore: e.legalAddressSameAsStore !== undefined
      ? Boolean(e.legalAddressSameAsStore)
      : !(mailingStreet && mailingCity && mailingState),
    correspondenceStreet: e.correspondenceStreet || '',
    correspondenceStreet2: e.correspondenceStreet2 || '',
    correspondenceCity: e.correspondenceCity || '',
    correspondenceState: e.correspondenceState || '',
    correspondenceZip: e.correspondenceZip || '',
    ownershipType: e.ownershipType || '',
    taxClassType: e.taxClassType || '',
    establishmentYear: e.establishmentYear || '',
  };
}

function EntityLegalAndMailingAddresses({ entity, corporateId, onUpdated, locationCount = 1, showValidation = false }) {
  const { formsLocked, unlocking, onRequestUnlock, canUnlock, setPortalLockStatus } = usePortalLock();
  const hasLegalOverride = !!(entity.mailingStreet && entity.mailingCity && entity.mailingState);
  const [sameAsStore, setSameAsStore] = useState(
    entity.legalAddressSameAsStore !== undefined
      ? Boolean(entity.legalAddressSameAsStore)
      : !hasLegalOverride
  );
  const [legalDisplay, setLegalDisplay] = useState(
    hasLegalOverride
      ? composeFullAddress({
        street: entity.mailingStreet, street2: entity.mailingStreet2,
        city: entity.mailingCity, state: entity.mailingState, zip: entity.mailingZip,
      })
      : ''
  );
  const [legalParsed, setLegalParsed] = useState(hasLegalOverride ? {
    street: entity.mailingStreet, street2: entity.mailingStreet2 || '',
    city: entity.mailingCity, state: entity.mailingState, zip: entity.mailingZip || '',
  } : null);
  const [legalStreet2, setLegalStreet2] = useState(entity.mailingStreet2 || '');
  const [mailExpanded, setMailExpanded] = useState(
    !!(entity.correspondenceStreet && entity.correspondenceCity && entity.correspondenceState)
  );
  const hasCorrespondence = !!(entity.correspondenceStreet && entity.correspondenceCity && entity.correspondenceState);
  const [mailDisplay, setMailDisplay] = useState(
    hasCorrespondence
      ? composeFullAddress({
        street: entity.correspondenceStreet, street2: entity.correspondenceStreet2,
        city: entity.correspondenceCity, state: entity.correspondenceState, zip: entity.correspondenceZip,
      })
      : ''
  );
  const [mailParsed, setMailParsed] = useState(hasCorrespondence ? {
    street: entity.correspondenceStreet, street2: entity.correspondenceStreet2 || '',
    city: entity.correspondenceCity, state: entity.correspondenceState, zip: entity.correspondenceZip || '',
  } : null);
  const [mailStreet2, setMailStreet2] = useState(entity.correspondenceStreet2 || '');

  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState(null);
  const [saveError, setSaveError] = useState('');
  const pendingLegalRef = useRef(false);
  const pendingMailRef = useRef(false);

  const legalRef = usePlacesCallbackRef((parsed) => {
    setLegalDisplay(parsed.display);
    setLegalParsed(parsed);
    setLegalStreet2(parsed.street2 || '');
    pendingLegalRef.current = true;
  });
  const mailRef = usePlacesCallbackRef((parsed) => {
    setMailDisplay(parsed.display);
    setMailParsed(parsed);
    setMailStreet2(parsed.street2 || '');
    pendingMailRef.current = true;
  });

  const entityIdRef = useRef(entity.entityId);
  const onUpdatedRef = useRef(onUpdated);
  entityIdRef.current = entity.entityId;
  onUpdatedRef.current = onUpdated;

  useEffect(() => {
    const has = !!(entity.mailingStreet && entity.mailingCity && entity.mailingState);
    setSameAsStore(
      entity.legalAddressSameAsStore !== undefined
        ? Boolean(entity.legalAddressSameAsStore)
        : !has
    );
    if (has) {
      setLegalDisplay(composeFullAddress({
        street: entity.mailingStreet, street2: entity.mailingStreet2,
        city: entity.mailingCity, state: entity.mailingState, zip: entity.mailingZip,
      }));
      setLegalParsed({
        street: entity.mailingStreet, street2: entity.mailingStreet2 || '',
        city: entity.mailingCity, state: entity.mailingState, zip: entity.mailingZip || '',
      });
      setLegalStreet2(entity.mailingStreet2 || '');
    }
  }, [entity.entityId, entity.mailingStreet, entity.mailingStreet2, entity.mailingCity, entity.mailingState, entity.mailingZip, entity.legalAddressSameAsStore]);

  useEffect(() => {
    const has = !!(entity.correspondenceStreet && entity.correspondenceCity && entity.correspondenceState);
    if (has) {
      setMailDisplay(composeFullAddress({
        street: entity.correspondenceStreet, street2: entity.correspondenceStreet2,
        city: entity.correspondenceCity, state: entity.correspondenceState, zip: entity.correspondenceZip,
      }));
      setMailParsed({
        street: entity.correspondenceStreet, street2: entity.correspondenceStreet2 || '',
        city: entity.correspondenceCity, state: entity.correspondenceState, zip: entity.correspondenceZip || '',
      });
      setMailStreet2(entity.correspondenceStreet2 || '');
    }
  }, [entity.entityId, entity.correspondenceStreet, entity.correspondenceStreet2, entity.correspondenceCity, entity.correspondenceState, entity.correspondenceZip]);

  const persist = useCallback(async (patch, nextEntity) => {
    if (formsLocked) {
      setSaveError(FORMS_LOCKED_MESSAGE);
      return false;
    }
    setSaving(true);
    setSaveError('');
    try {
      const res = await invokePortalFunction('manageLegalEntity', {
        action: 'edit', corporateId, entityId: entityIdRef.current,
        ...patch,
      });
      if (res.data?.error) {
        if (isFormsLockedError(res.data) || isFormsLockedError(res.data.error)) {
          setPortalLockStatus?.(PORTAL_LOCK_SIGNING);
          setSaveError(res.data.error || FORMS_LOCKED_MESSAGE);
          return false;
        }
        throw new Error(res.data.error);
      }
      setSavedAt(Date.now());
      if (nextEntity) onUpdatedRef.current?.(nextEntity);
      else if (res.data?.entities) {
        const updated = res.data.entities.find(e => e.entityId === entityIdRef.current);
        if (updated) onUpdatedRef.current?.(updated);
      }
      return true;
    } catch (err) {
      console.error('[EntityLegalAndMailingAddresses.persist]', err);
      if (isFormsLockedError(err)) {
        setPortalLockStatus?.(PORTAL_LOCK_SIGNING);
        setSaveError(err?.message || FORMS_LOCKED_MESSAGE);
        return false;
      }
      setSaveError(err?.message || 'Address didn\u2019t save — check your connection and try again.');
      return false;
    } finally {
      setSaving(false);
    }
  }, [corporateId, formsLocked, setPortalLockStatus]);

  const chooseSameAsStore = async (yes) => {
    if (formsLocked) {
      setSaveError(FORMS_LOCKED_MESSAGE);
      return;
    }
    setSameAsStore(yes);
    setSaveError('');
    if (yes) {
      setLegalDisplay('');
      setLegalParsed(null);
      await persist(
        { legalAddressSameAsStore: true, mailingStreet: '', mailingStreet2: '', mailingCity: '', mailingState: '', mailingZip: '' },
        { ...entity, legalAddressSameAsStore: true, mailingStreet: '', mailingStreet2: '', mailingCity: '', mailingState: '', mailingZip: '' }
      );
    } else {
      // Switching to "No" without an address yet — mark preference; Continue will require the fields.
      await persist(
        { legalAddressSameAsStore: false },
        { ...entity, legalAddressSameAsStore: false }
      );
    }
  };

  useEffect(() => {
    if (legalParsed && pendingLegalRef.current) {
      pendingLegalRef.current = false;
      persist(
        {
          legalAddressSameAsStore: false,
          mailingStreet: legalParsed.street,
          mailingStreet2: legalParsed.street2 || legalStreet2 || '',
          mailingCity: legalParsed.city,
          mailingState: legalParsed.state,
          mailingZip: legalParsed.zip,
        },
        {
          ...entity,
          legalAddressSameAsStore: false,
          mailingStreet: legalParsed.street,
          mailingStreet2: legalParsed.street2 || legalStreet2 || '',
          mailingCity: legalParsed.city,
          mailingState: legalParsed.state,
          mailingZip: legalParsed.zip,
        }
      );
    }
  }, [legalParsed, persist, entity]);

  useEffect(() => {
    if (mailParsed && pendingMailRef.current) {
      pendingMailRef.current = false;
      persist(
        {
          correspondenceStreet: mailParsed.street,
          correspondenceStreet2: mailParsed.street2 || mailStreet2 || '',
          correspondenceCity: mailParsed.city,
          correspondenceState: mailParsed.state,
          correspondenceZip: mailParsed.zip,
        },
        {
          ...entity,
          correspondenceStreet: mailParsed.street,
          correspondenceStreet2: mailParsed.street2 || mailStreet2 || '',
          correspondenceCity: mailParsed.city,
          correspondenceState: mailParsed.state,
          correspondenceZip: mailParsed.zip,
        }
      );
    }
  }, [mailParsed, persist, entity]);

  const clearCorrespondence = async () => {
    const prev = { display: mailDisplay, parsed: mailParsed };
    setMailDisplay(''); setMailParsed(null); setSavedAt(null); setSaveError('');
    const ok = await persist(
      { correspondenceStreet: '', correspondenceStreet2: '', correspondenceCity: '', correspondenceState: '', correspondenceZip: '' },
      { ...entity, correspondenceStreet: '', correspondenceStreet2: '', correspondenceCity: '', correspondenceState: '', correspondenceZip: '' }
    );
    if (!ok) {
      setMailDisplay(prev.display); setMailParsed(prev.parsed);
    }
  };

  const clearLegal = async () => {
    setLegalDisplay(''); setLegalParsed(null);
    await chooseSameAsStore(true);
  };

  const storeLabel = locationCount > 1 ? 'each store\u2019s address' : 'your store address';
  const legalMissing = !sameAsStore && !(legalParsed?.street && legalParsed?.city && legalParsed?.state && legalParsed?.zip);
  const showLegalError = showValidation && legalMissing;

  return (
    <div className="border-t border-cb-border pt-4 space-y-4">
      {/* Legal address */}
      <div className="space-y-2.5">
        <div className="flex items-start gap-2">
          <Mail className="w-3.5 h-3.5 text-gray-500 flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-cb-body text-gray-300 font-medium">
              Legal address
              {!sameAsStore && <span className="text-cb-accent ml-1">*</span>}
            </p>
            <p className="text-cb-caption normal-case tracking-normal font-normal text-gray-500 mt-0.5">
              Does the legal entity address match {storeLabel}? If not, we need the registered legal address for underwriting (MSPWare Legal Address).
            </p>
          </div>
          {saving && <Loader2 className="w-3.5 h-3.5 text-gray-400 animate-spin flex-shrink-0" />}
          {!saving && savedAt && <Cloud className="w-3.5 h-3.5 text-cb-success flex-shrink-0" title="Saved" />}
        </div>

        <div className="flex gap-1 bg-cb-bg border border-cb-border rounded-cb p-1 max-w-sm">
          {[
            { val: true, label: 'Yes — same as store' },
            { val: false, label: 'No — different' },
          ].map(opt => (
            <button
              key={String(opt.val)}
              type="button"
              disabled={formsLocked || saving}
              onClick={() => chooseSameAsStore(opt.val)}
              className={`flex-1 text-cb-caption font-medium px-2.5 py-1.5 rounded-cb transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                sameAsStore === opt.val ? 'bg-cb-accent-muted text-cb-accent' : 'text-gray-400 hover:text-white'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {(formsLocked || isFormsLockedError(saveError)) && (
          <div className="rounded-cb border border-cb-border border-l-2 border-l-cb-accent bg-cb-bg px-3 py-3 flex flex-col gap-3">
            <p className="text-cb-body text-gray-300">
              {saveError && isFormsLockedError(saveError) ? saveError : FORMS_LOCKED_MESSAGE}
            </p>
            {canUnlock && (
              <UnlockModifyControls
                onUnlock={onRequestUnlock}
                unlocking={unlocking}
              />
            )}
          </div>
        )}

        {saveError && !isFormsLockedError(saveError) && !formsLocked && (
          <p className="text-cb-caption normal-case tracking-normal font-normal text-cb-danger" role="alert">
            ⚠ {saveError}
          </p>
        )}

        {!sameAsStore && (
          <div className="space-y-2">
            {legalParsed ? (
              <div className={`flex items-center gap-2.5 bg-cb-bg border rounded-cb px-3 py-2.5 ${showLegalError ? 'border-cb-danger' : 'border-cb-border'}`}>
                <Mail className="w-3.5 h-3.5 text-gray-500 flex-shrink-0" />
                <span className="text-cb-body text-gray-300 flex-1 truncate">{legalDisplay}</span>
                <button type="button" onClick={clearLegal} className="p-2 -m-1 text-gray-500 hover:text-white">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <input
                ref={legalRef}
                type="text"
                value={legalDisplay}
                onChange={e => { setLegalDisplay(e.target.value); setLegalParsed(null); }}
                onKeyDown={e => e.key === 'Enter' && e.preventDefault()}
                placeholder="Start typing legal entity address…"
                autoComplete="off"
                className={`${inputCls} ${showLegalError ? 'border-cb-danger' : ''}`}
              />
            )}
            <input
              type="text"
              value={legalStreet2}
              onChange={e => setLegalStreet2(e.target.value)}
              onBlur={() => {
                if (!legalParsed?.street) return;
                const next2 = legalStreet2.trim();
                if (next2 === (entity.mailingStreet2 || '')) return;
                persist(
                  { mailingStreet2: next2 },
                  { ...entity, mailingStreet2: next2 }
                );
              }}
              placeholder="Apt / Suite / Unit (optional)"
              autoComplete="off"
              disabled={formsLocked}
              className={inputCls}
            />
            {showLegalError && (
              <p className="text-cb-caption normal-case tracking-normal font-normal text-cb-danger" role="alert">
                Legal address is required when it differs from the store.
              </p>
            )}
          </div>
        )}
      </div>

      {/* Optional correspondence mailing */}
      <div className="border-t border-cb-border pt-3">
        <button
          type="button"
          onClick={() => setMailExpanded(e => !e)}
          className="flex items-center gap-2.5 text-cb-body text-gray-500 hover:text-gray-300 transition-colors w-full text-left py-1"
        >
          <Mail className="w-3.5 h-3.5 flex-shrink-0" />
          <span className="flex-1">
            {hasCorrespondence || mailParsed ? (
              <><span className="text-gray-300 font-medium">Mailing address (correspondence)</span>
                {(mailDisplay || entity.correspondenceStreet) && (
                  <span className="text-gray-600 ml-1.5">{mailDisplay || `${entity.correspondenceStreet}, ${entity.correspondenceCity}`}</span>
                )}
              </>
            ) : 'Add mailing address for correspondence (optional)'}
          </span>
          {mailExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
        </button>

        <AnimatePresence initial={false}>
          {mailExpanded && (
            <motion.div key="entity-correspondence" {...accordionProps} className="overflow-hidden">
              <div className="mt-2 mb-1 space-y-2">
                <p className="text-cb-caption normal-case tracking-normal font-normal text-gray-500">
                  Optional. Use only if mail should go somewhere other than the store or legal address (MSPWare Mailing Address). Most merchants leave this blank.
                </p>
                {mailParsed ? (
                  <div className="flex items-center gap-2.5 bg-cb-bg border border-cb-border rounded-cb px-3 py-2.5">
                    <Mail className="w-3.5 h-3.5 text-gray-500 flex-shrink-0" />
                    <span className="text-cb-body text-gray-300 flex-1 truncate">{mailDisplay}</span>
                    <button type="button" onClick={clearCorrespondence} className="p-2 -m-1 text-gray-500 hover:text-white">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : (
                  <input
                    ref={mailRef}
                    type="text"
                    value={mailDisplay}
                    onChange={e => { setMailDisplay(e.target.value); setMailParsed(null); }}
                    onKeyDown={e => e.key === 'Enter' && e.preventDefault()}
                    placeholder="Start typing correspondence mailing address…"
                    autoComplete="off"
                    className={inputCls}
                  />
                )}
                <input
                  type="text"
                  value={mailStreet2}
                  onChange={e => setMailStreet2(e.target.value)}
                  onBlur={() => {
                    if (!mailParsed?.street) return;
                    const next2 = mailStreet2.trim();
                    if (next2 === (entity.correspondenceStreet2 || '')) return;
                    persist(
                      { correspondenceStreet2: next2 },
                      { ...entity, correspondenceStreet2: next2 }
                    );
                  }}
                  placeholder="Apt / Suite / Unit (optional)"
                  autoComplete="off"
                  disabled={formsLocked}
                  className={inputCls}
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {saveError && (
        <p className="text-cb-caption normal-case tracking-normal font-normal text-cb-danger" role="alert">
          {saveError}
        </p>
      )}
    </div>
  );
}

// ─── Entity Section (top-level group) ────────────────────────────────────────

function EntitySection({ entity, locations, corporateId, merchantIDs, onDeleteLocation, onMerchantIDAdded, onMerchantIDUpdated, onMerchantIDDeleted, onLocationUpdated, onAddLocation, isOnly, onEntityUpdated, onDeleteEntity, showValidation, onEntityDraftStatus, allEntities = [], onMoveLocation, onMoveMid, simpleMode = false, onApplicantSave, inlineAddForm = null }) {
  const entityLocs = locations.filter(l => l.entityId === entity.entityId);
  const entityMids = merchantIDs.filter(m => entityLocs.some(l => l.id === m.locationId));
  const entityMoveTargets = allEntities
    .filter(e => e.entityId !== entity.entityId)
    .map(e => ({ id: e.entityId, label: e.legalBusinessName || 'Legal Entity' }));
  const allComplete = entityLocs.length > 0 && entityLocs.every(l =>
    merchantIDs.some(m => m.locationId === l.id && isMidComplete(m, l.businessState))
  );
  const entityDetailsComplete = entityMissingFields(entity).length === 0
    && String(entity.legalBusinessName || '').trim()
    && entityLegalAddressComplete(entity);
  const highlightError = showValidation && (!allComplete || !entityDetailsComplete);

  // Pencil-owned legal edit panel — name + details + addresses in one expand.
  // Locations nest directly under the collapsed header (2026-07-21).
  const [legalEditOpen, setLegalEditOpen] = useState(!entityDetailsComplete);
  useEffect(() => {
    if (showValidation && !entityDetailsComplete) setLegalEditOpen(true);
  }, [showValidation, entityDetailsComplete]);

  const toggleLegalEdit = () => setLegalEditOpen(o => !o);

  const handleLegalSaveSuccess = (updated) => {
    if (
      entityMissingFields(updated).length === 0
      && String(updated.legalBusinessName || '').trim()
      && entityLegalAddressComplete(updated)
    ) {
      setLegalEditOpen(false);
    }
  };

  const summaryCaption = entityDetailsComplete ? entityLegalSummaryCaption(entity) : '';

  const entityHeaderInner = (
    <div className="flex-1 min-w-0 flex flex-col gap-0.5">
      <div className="flex items-baseline gap-2.5 flex-wrap min-w-0">
        <p className="font-display text-cb-title text-white truncate">{entity.legalBusinessName || 'Legal entity'}</p>
        {entity.federalEIN && (
          <p className="text-cb-caption text-gray-500 font-mono normal-case tracking-normal">EIN {formatEIN(entity.federalEIN)}</p>
        )}
      </div>
      {!legalEditOpen && summaryCaption && (
        <p className="text-cb-caption normal-case tracking-normal font-normal text-gray-500 truncate">{summaryCaption}</p>
      )}
    </div>
  );

  const entityHeaderActions = (
    <div className="flex items-center gap-2.5 flex-shrink-0">
      {!simpleMode && (
        <span className="hidden sm:inline text-cb-caption text-gray-500">{entityLocs.length} location{entityLocs.length !== 1 ? 's' : ''} · {entityMids.length} account{entityMids.length !== 1 ? 's' : ''}</span>
      )}
      {allComplete && entityLocs.length > 0 && <Check className="w-3.5 h-3.5 text-cb-success" />}
      <button
        type="button"
        onClick={toggleLegalEdit}
        title="Edit legal entity details"
        aria-label="Edit legal entity details"
        aria-expanded={legalEditOpen}
        className="p-2 text-gray-600 hover:text-white rounded-cb transition-colors"
      >
        <Pencil className="w-3.5 h-3.5" />
      </button>
      {!isOnly && (
        <button onClick={() => onDeleteEntity(entity)} title="Delete legal entity"
          className="p-2 text-gray-600 hover:text-cb-danger rounded-cb transition-colors">
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );

  const locationsBlock = (
    <>
      <Droppable droppableId={entity.entityId} type="LOCATION">
        {(drop, dropSnap) => (
          <div
            ref={drop.innerRef}
            {...drop.droppableProps}
            className={`py-4 pr-3 sm:pr-4 space-y-2 min-h-[48px] transition-colors ${simpleMode ? 'pl-3 sm:pl-4' : 'pl-3 sm:pl-4 ml-3 sm:ml-6 border-l border-cb-border'} ${dropSnap.isDraggingOver ? 'bg-cb-accent-muted' : ''}`}
          >
            {entityLocs.map((loc, idx) => (
              <LocationCard
                key={loc.id}
                location={loc}
                index={idx}
                corporateId={corporateId}
                merchantIDs={merchantIDs}
                onDelete={onDeleteLocation}
                onMerchantIDAdded={onMerchantIDAdded}
                onMerchantIDUpdated={onMerchantIDUpdated}
                onMerchantIDDeleted={onMerchantIDDeleted}
                onLocationUpdated={onLocationUpdated}
                showValidation={showValidation}
                allLocations={locations}
                entityMoveTargets={entityMoveTargets}
                onMoveLocation={onMoveLocation}
                onMoveMid={onMoveMid}
                simpleMode={simpleMode}
                onApplicantSave={onApplicantSave}
              />
            ))}
            {drop.placeholder}
            {entityLocs.length === 0 && !dropSnap.isDraggingOver && (
              <p className="text-cb-body text-gray-600 py-2">No locations yet — add one below or drag here</p>
            )}
          </div>
        )}
      </Droppable>
      <div className={`pl-3 sm:pl-4 pr-3 sm:pr-4 pb-4 ${simpleMode ? '' : 'ml-3 sm:ml-6 border-l border-cb-border'}`}>
        <button onClick={() => onAddLocation(entity.entityId)}
          className="w-full flex items-center gap-1.5 py-2 text-cb-caption text-gray-500 hover:text-white transition-colors text-left">
          <Plus className="w-3 h-3" /> Add Location{isOnly ? '' : ` to ${entity.legalBusinessName}`}
        </button>
      </div>
    </>
  );

  const legalEditPanel = (
    <AnimatePresence initial={false}>
      {legalEditOpen && (
        <motion.div key="legal-edit" {...accordionProps} className="overflow-hidden">
          <EntityDetailsPanel
            entity={entity}
            corporateId={corporateId}
            onUpdated={onEntityUpdated}
            onDraftStatus={onEntityDraftStatus}
            forceExpand={showValidation && !entityDetailsComplete}
            onApplicantSave={onApplicantSave}
            onSaveSuccess={handleLegalSaveSuccess}
          >
            <EntityLegalAndMailingAddresses
              entity={entity}
              corporateId={corporateId}
              onUpdated={onEntityUpdated}
              locationCount={entityLocs.length}
              showValidation={showValidation}
            />
          </EntityDetailsPanel>
        </motion.div>
      )}
    </AnimatePresence>
  );

  // ── 1×1 empty (self-serve, no HubSpot locations): one store card, not
  // legal-address + separate "New Location" chrome. Legal waits until a store exists.
  if (simpleMode && entityLocs.length === 0 && inlineAddForm) {
    return (
      <motion.div className="rounded-cb border border-cb-border overflow-hidden">
        <div className="px-5 pt-5 pb-1">
          <p className="text-cb-caption uppercase text-gray-500">Your store</p>
          <p className="text-cb-body text-gray-400 mt-1 max-w-xl">
            Name your storefront and pick its street address. We&apos;ll ask for legal business details after this is saved.
          </p>
        </div>
        <div className="px-5 pb-5 pt-4">
          {inlineAddForm}
        </div>
        <div className="border-t border-cb-border px-5 py-3.5 flex items-center gap-2.5">
          <span className="w-1.5 h-1.5 rounded-full bg-cb-border-strong flex-shrink-0" />
          <p className="text-cb-body text-gray-500 min-w-0">
            <span className="text-gray-400 font-medium">Legal entity</span>
            {entity.legalBusinessName ? (
              <span className="text-gray-500"> · {entity.legalBusinessName}</span>
            ) : null}
            <span className="text-gray-600"> — opens after you save your store</span>
          </p>
        </div>
      </motion.div>
    );
  }

  // ── 1×1: store first; legal entity row with pencil (not chevron) ──
  if (simpleMode) {
    return (
      <motion.div
        className={`rounded-cb border overflow-hidden ${highlightError ? 'border-cb-danger' : 'border-cb-border'}`}
      >
        <div className="px-5 pt-4 pb-0">
          <p className="text-cb-caption uppercase text-gray-500">Your store</p>
        </div>
        {locationsBlock}

        <div className="border-t border-cb-border">
          <div className="flex items-center gap-2.5 px-5 py-3.5">
            {entityDetailsComplete
              ? <Check className="w-3.5 h-3.5 flex-shrink-0 text-cb-success" />
              : <span className="w-1.5 h-1.5 rounded-full bg-cb-accent flex-shrink-0" />}
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline gap-2.5 flex-wrap min-w-0">
                <span className="text-white font-medium">Legal entity</span>
                {entity.legalBusinessName && (
                  <span className="text-gray-500 truncate">{entity.legalBusinessName}</span>
                )}
              </div>
              {!legalEditOpen && summaryCaption && (
                <p className="text-cb-caption normal-case tracking-normal font-normal text-gray-500 truncate mt-0.5">{summaryCaption}</p>
              )}
            </div>
            {!entityDetailsComplete && (
              <span className="text-cb-caption uppercase text-cb-accent flex-shrink-0">Required</span>
            )}
            <button
              type="button"
              onClick={toggleLegalEdit}
              title="Edit legal entity details"
              aria-label="Edit legal entity details"
              aria-expanded={legalEditOpen}
              className="p-2 text-gray-600 hover:text-white rounded-cb transition-colors flex-shrink-0"
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
          </div>
          {legalEditPanel}
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      className={`rounded-cb border overflow-hidden ${highlightError ? 'border-cb-danger' : 'border-cb-border'}`}
    >
      <div className="flex items-center gap-3 px-5 py-4 border-b border-cb-border">
        {entityHeaderInner}
        {entityHeaderActions}
      </div>
      {legalEditPanel}
      {locationsBlock}
    </motion.div>
  );
}

// ─── Add Location Form ────────────────────────────────────────────────────────
// (The old AddEntityModal component was deleted 2026-07-15 — it was never
// rendered. New entities are created inline in this form via addSelfServeLocation.)

function AddLocationForm({ corporateId, profile, entities, defaultEntityId, isFirstLocation, onSaved, onCancel, embedded = false }) {
  // Prefill the very first location's DBA name from the Company Name entered at
  // signup — most self-serve merchants are a single storefront, so re-typing the
  // same name here was pure friction. Only applies to the first location; later
  // locations (additional storefronts) start blank as before. 2026-07-07.
  const [dbaName, setDbaName] = useState(isFirstLocation ? (profile.legalName || '') : '');
  const [addressDisplay, setAddressDisplay] = useState('');
  const [parsedAddress, setParsedAddress] = useState(null);
  const [addressKey, setAddressKey] = useState(0);
  const [unverifiedWarning, setUnverifiedWarning] = useState(false);
  const [selectedEntityId, setSelectedEntityId] = useState(defaultEntityId || entities[0]?.entityId || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [street2, setStreet2] = useState('');
  const addrRef = usePlacesAddressRef(({ street, street2: s2, city, state, zip }) => {
    const display = composeFullAddress({ street, street2: s2, city, state, zip });
    setAddressDisplay(display);
    setParsedAddress({ street, street2: s2 || '', city, state, zip, display });
    setStreet2(s2 || '');
    setUnverifiedWarning(false);
  });
  // Add Entity inline — entity is created server-side inside addSelfServeLocation
  const [showAddEntity, setShowAddEntity] = useState(false);
  const [newEntityName, setNewEntityName] = useState('');
  const [newEntityEIN, setNewEntityEIN] = useState('');
  const newEntityEinDigits = newEntityEIN.replace(/\D/g, '');
  const hideEntityPicker = embedded && isFirstLocation && entities.length === 1 && !showAddEntity;

  const clearAddress = () => {
    setAddressDisplay('');
    setParsedAddress(null);
    setStreet2('');
    setUnverifiedWarning(false);
    setAddressKey((k) => k + 1);
  };

  const doSave = async (addr) => {
    setSaving(true); setError('');
    try {
      // Validate street number if we have a parsed address
      if (addr && !addr.street.match(/^\d/)) {
        setError('Address must include a street number (e.g. "123 Main St"). Please select a more specific address.');
        setSaving(false);
        return;
      }
      const line2 = (addr?.street2 ?? street2).trim();
      const businessAddress = addr
        ? composeFullAddress({ street: addr.street, street2: line2, city: addr.city, state: addr.state, zip: addr.zip })
        : addressDisplay.trim();
      const locRes = await invokePortalFunction('addSelfServeLocation', {
        corporateId, dbaName: dbaName.trim(),
        businessAddress, businessStreet: addr?.street || '', businessStreet2: line2,
        businessCity: addr?.city || '',
        businessState: addr?.state || '', businessZip: addr?.zip || '',
        entityId: showAddEntity ? undefined : (selectedEntityId || undefined),
        newEntityName: showAddEntity ? newEntityName.trim() : undefined,
        newEntityEIN: showAddEntity ? newEntityEinDigits : undefined,
      });
      if (locRes.data?.error) throw new Error(locRes.data.error);
      onSaved({ location: locRes.data.location, merchantID: locRes.data.merchantID, entityId: selectedEntityId });
    } catch (err) {
      console.error('[AddLocationForm.doSave]', err);
      setError(err.message || 'Failed to save.');
    }
    finally { setSaving(false); }
  };

  const handleSubmit = async (e) => {
    e.preventDefault(); setError('');
    if (!dbaName.trim()) { setError('Store name is required.'); return; }
    if (!addressDisplay.trim()) { setError('Address is required.'); return; }
    if (showAddEntity && (!newEntityName.trim() || newEntityEinDigits.length !== 9)) {
      setError('Legal business name and a valid 9-digit EIN are required for the new entity.');
      return;
    }
    if (!parsedAddress) { setUnverifiedWarning(true); return; }
    await doSave(parsedAddress);
  };

  const addressField = parsedAddress ? (
    <div className="flex items-center gap-2.5 bg-cb-bg border border-cb-border rounded-cb px-3 py-2.5">
      <Check className="w-4 h-4 text-cb-success flex-shrink-0" />
      <span className="text-cb-body text-gray-300 flex-1 truncate">{addressDisplay}</span>
      <button type="button" onClick={clearAddress}><X className="w-3.5 h-3.5 text-gray-500 hover:text-white" /></button>
    </div>
  ) : (
    <>
      <input
        ref={addrRef}
        key={`loc-addr-${addressKey}`}
        type="text"
        value={addressDisplay}
        onChange={e => { setAddressDisplay(e.target.value); setParsedAddress(null); setUnverifiedWarning(false); }}
        onKeyDown={e => e.key === 'Enter' && e.preventDefault()}
        placeholder="Start typing to search…"
        autoComplete="off"
        className={inputCls}
      />
      {unverifiedWarning && (
        <div className="mt-2 bg-cb-surface border border-cb-border border-l border-l-cb-accent rounded-cb p-3">
          <p className="text-cb-body font-medium text-white mb-2">Address not verified — delays may occur.</p>
          <div className="flex gap-3">
            <button type="button" onClick={() => doSave(null)} disabled={saving}
              className="text-cb-body text-gray-300 border border-cb-border rounded-cb px-3 py-1.5 hover:border-cb-border-strong hover:text-white transition-colors">
              {saving ? 'Saving…' : 'Continue Anyway'}
            </button>
            <button type="button" onClick={() => setUnverifiedWarning(false)} className="text-cb-body text-gray-400 hover:text-white">← Fix</button>
          </div>
        </div>
      )}
    </>
  );

  const entityBlock = hideEntityPicker ? null : (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <label className={labelCls + ' mb-0'}>Legal Entity</label>
        <button type="button" onClick={() => setShowAddEntity(e => !e)}
          className="text-cb-caption normal-case tracking-normal text-cb-accent hover:text-white flex items-center gap-1 transition-colors">
          <Plus className="w-3 h-3" /> New Legal Entity
        </button>
      </div>
      {showAddEntity ? (
        <div className="bg-cb-bg border border-cb-border rounded-cb p-4 space-y-3">
          <p className="text-cb-caption uppercase text-gray-500">New Legal Entity</p>
          <input value={newEntityName} onChange={e => setNewEntityName(e.target.value)}
            placeholder="Legal Business Name" className={inputCls} autoFocus />
          <input value={newEntityEIN} onChange={e => setNewEntityEIN(e.target.value.replace(/\D/g,'').slice(0,9))}
            placeholder="Federal EIN (9 digits)" className={`${inputCls} font-mono`} />
          {newEntityEIN.length > 0 && newEntityEinDigits.length !== 9 && (
            <p className="text-cb-caption normal-case tracking-normal font-normal text-cb-accent">{newEntityEinDigits.length}/9 digits</p>
          )}
          <p className="text-cb-caption normal-case tracking-normal font-normal text-gray-500">This entity will be created when you submit the location below.</p>
          <button type="button" onClick={() => { setShowAddEntity(false); setNewEntityName(''); setNewEntityEIN(''); }}
            className="text-cb-body text-gray-500 hover:text-white border border-cb-border px-3 py-2 rounded-cb transition-colors">Cancel</button>
        </div>
      ) : (
        <select value={selectedEntityId} onChange={e => setSelectedEntityId(e.target.value)}
          className={inputCls} style={{ colorScheme: 'dark' }}>
          {entities.map(e => (
            <option key={e.entityId} value={e.entityId}>
              {e.legalBusinessName}{e.federalEIN ? ` — ${formatEIN(e.federalEIN)}` : ''}
            </option>
          ))}
        </select>
      )}
    </div>
  );

  const formBody = (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className={embedded ? 'space-y-4' : 'grid grid-cols-1 sm:grid-cols-2 gap-3'}>
        <div>
          <label className={labelCls}>Store / DBA Name *</label>
          <input value={dbaName} onChange={e => setDbaName(e.target.value)} placeholder="e.g. Main Street Cafe" className={inputCls} autoFocus />
        </div>
        <div>
          <label className={labelCls}>Physical Address *</label>
          {addressField}
          <input
            type="text"
            value={street2}
            onChange={e => {
              const v = e.target.value;
              setStreet2(v);
              setParsedAddress(p => (p ? { ...p, street2: v } : p));
            }}
            placeholder="Apt / Suite / Unit (optional)"
            className={`${inputCls} mt-2`}
          />
        </div>
      </div>

      {entityBlock}

      {error && <div className="bg-cb-surface border border-cb-border border-l border-l-cb-danger rounded-cb px-4 py-3 text-cb-body text-cb-danger">{error}</div>}
      <div className="flex gap-3 pt-1">
        <button type="submit" disabled={saving}
          className="flex items-center gap-2 bg-cb-accent hover:opacity-90 disabled:bg-cb-surface disabled:text-gray-600 text-cb-bg font-semibold text-cb-body px-5 py-3 rounded-cb transition-all">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : (embedded ? null : <Plus className="w-4 h-4" />)}
          {saving ? 'Saving…' : (embedded && isFirstLocation ? 'Save store' : 'Add Location')}
        </button>
        {onCancel && !(embedded && isFirstLocation) && (
          <button type="button" onClick={onCancel} className="text-cb-body text-gray-400 hover:text-white border border-cb-border px-5 py-3 rounded-cb transition-colors">Cancel</button>
        )}
      </div>
    </form>
  );

  if (embedded) return formBody;

  return (
    <div className="bg-cb-surface-raised border border-cb-border rounded-cb p-6">
      <div className="flex items-center justify-between mb-5">
        <h3 className="text-cb-caption uppercase text-gray-500">New Location</h3>
        {onCancel && (
          <button onClick={onCancel} className="text-gray-500 hover:text-white p-1.5 rounded-cb"><X className="w-4 h-4" /></button>
        )}
      </div>
      {formBody}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function OnboardingLocations({ profile, onContinue, onBack }) {
  const corporateId = profile.corporateId;
  const agentSession = isAgentSession(corporateId);

  const [entities, setEntities] = useState([]);
  const [locations, setLocations] = useState([]);
  const [merchantIDs, setMerchantIDs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  // Inline surface for delete/move failures — replaces browser alert() (critique 2026-07-15)
  const [actionError, setActionError] = useState('');
  // addFormEntityId: null = hidden, string = show form pre-targeted to that entity
  const [addFormEntityId, setAddFormEntityId] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [deleteMidConfirm, setDeleteMidConfirm] = useState(null);
  const [deleteEntityConfirm, setDeleteEntityConfirm] = useState(null);
  const [showBackConfirm, setShowBackConfirm] = useState(false);

  // Verify banner: quiet after applicant's first successful save. Agents always
  // see the full gold left-rule (impersonation saves never set the quiet flag).
  const [verifyQuiet, setVerifyQuiet] = useState(() => {
    if (!corporateId || agentSession) return false;
    try { return localStorage.getItem(verifyQuietStorageKey(corporateId)) === '1'; }
    catch { return false; }
  });
  const [multiCoachDismissed, setMultiCoachDismissed] = useState(() => {
    if (!corporateId) return false;
    try { return localStorage.getItem(multiCoachStorageKey(corporateId)) === '1'; }
    catch { return false; }
  });

  const markApplicantSave = useCallback(() => {
    if (!corporateId || isAgentSession(corporateId)) return;
    try { localStorage.setItem(verifyQuietStorageKey(corporateId), '1'); } catch { /* ignore */ }
    setVerifyQuiet(true);
  }, [corporateId]);

  const dismissMultiCoach = useCallback(() => {
    if (corporateId) {
      try { localStorage.setItem(multiCoachStorageKey(corporateId), '1'); } catch { /* ignore */ }
    }
    setMultiCoachDismissed(true);
  }, [corporateId]);

  // Agents always get the full verify callout, even if the merchant already quieted it.
  const showFullVerify = agentSession || !verifyQuiet;
  const isMultiHierarchy = entities.length > 1 || locations.length > 1 || merchantIDs.length > 1;
  const showMultiCoach = isMultiHierarchy && !multiCoachDismissed;

  useEffect(() => { loadAll(); }, []);

  const loadAll = async () => {
    setLoading(true);
    setLoadError('');
    try {
      const [entRes, locRes, conRes] = await Promise.all([
        invokePortalFunction('manageLegalEntity', { action: 'list', corporateId: profile.corporateId }),
        invokePortalFunction('listLocations', { corporateId: profile.corporateId }),
        invokePortalFunction('manageMerchantID', { action: 'list', corporateId: profile.corporateId }),
      ]);
      const loadedEntities = (entRes.data?.entities || []).map(normalizeEntityRecord);
      // Keep the structured address fields — the inline location editor reads
      // them, and dropping them here made every post-refresh edit open with
      // blank City/State/ZIP (then save those blanks over the real values).
      const loadedLocations = (locRes.data?.locations || []).map(l => ({
        id: l.id || l.locationId, entityId: l.entityId || '',
        dbaName: l.dbaName, businessAddress: l.businessAddress,
        businessStreet: l.businessStreet || '',
        businessStreet2: l.businessStreet2 || '',
        businessCity: l.businessCity || '',
        businessState: l.businessState || '',
        businessZip: l.businessZip || '',
        applicationStepStatus: l.applicationStepStatus || 'In Review', elavonMID: l.elavonMID,
      }));

      const enrichedEntities = loadedEntities;

      // If no entities exist yet, auto-seed one from the corporate profile so locations have somewhere to live
      let finalEntities = enrichedEntities;
      if (finalEntities.length === 0) {
        try {
          const seedRes = await invokePortalFunction('manageLegalEntity', {
            action: 'add', corporateId: profile.corporateId,
            legalBusinessName: profile.legalName || 'Primary Entity',
            federalEIN: (profile.taxId || '').replace(/\D/g, ''),
          });
          if (seedRes.data?.entities?.length) finalEntities = seedRes.data.entities.map(normalizeEntityRecord);
        } catch (err) {
          console.error('[loadAll] failed to seed primary entity', err);
        }
      }

      // For locations missing entityId, assign to first entity
      const firstEntityId = finalEntities[0]?.entityId || '';
      const normalizedLocs = loadedLocations.map(l => ({
        ...l,
        entityId: l.entityId || firstEntityId,
      }));

      setEntities(finalEntities);
      setLocations(normalizedLocs);
      setMerchantIDs(conRes.data?.merchantIDs || []);
      if (normalizedLocs.length === 0) setAddFormEntityId(firstEntityId);
    } catch (err) {
      console.error('[loadAll]', err);
      setLoadError(err?.message || 'We could not load your locations. Check your connection and try again.');
    }
    finally { setLoading(false); }
  };

  const handleLocationSaved = async () => {
    setAddFormEntityId(null);
    markApplicantSave();
    await loadAll();
  };

  const handleEntityUpdated = (updated) => {
    setEntities(prev => prev.map(e => e.entityId === updated.entityId ? { ...e, ...updated } : e));
  };

  const handleLocationUpdated = (updated) => {
    setLocations(prev => prev.map(l => l.id === updated.id ? { ...l, ...updated } : l));
  };

  const handleDeleteLocation = async (loc) => {
    setDeleteConfirm(null);
    setActionError('');
    const idToDelete = loc.id || loc.locationId;
    if (!idToDelete) { setActionError('Cannot delete: this location has no ID. Refresh and try again.'); return; }
    try {
      const res = await invokePortalFunction('removeSelfServeLocation', { locationId: idToDelete });
      if (res.data?.error) throw new Error(res.data.error);
      setLocations(prev => prev.filter(l => (l.id || l.locationId) !== idToDelete));
      setMerchantIDs(prev => prev.filter(c => c.locationId !== idToDelete));
    } catch (err) {
      console.error('[handleDeleteLocation]', err);
      setActionError(`Could not remove "${loc.dbaName}": ${err.message || 'unknown error'}`);
    }
  };

  const handleDeleteMid = async (mid) => {
    setDeleteMidConfirm(null);
    setActionError('');
    try {
      const res = await invokePortalFunction('manageMerchantID', { action: 'delete', corporateId: profile.corporateId, merchantIDId: mid.id });
      if (res.data?.error) throw new Error(res.data.error);
      setMerchantIDs(prev => prev.filter(c => c.id !== mid.id));
    } catch (err) {
      console.error('[handleDeleteMid]', err);
      setActionError(`Could not remove the processing account: ${err.message || 'unknown error'}`);
    }
  };

  const handleDeleteEntity = async (entity) => {
    setDeleteEntityConfirm(null);
    setActionError('');
    try {
      const res = await invokePortalFunction('manageLegalEntity', { action: 'delete', corporateId: profile.corporateId, entityId: entity.entityId });
      if (res.data?.error) throw new Error(res.data.error);
      setEntities(prev => prev.filter(e => e.entityId !== entity.entityId));
      // Reassign orphaned locations to first remaining entity
      setLocations(prev => prev.map(l => l.entityId === entity.entityId ? { ...l, entityId: entities.find(e => e.entityId !== entity.entityId)?.entityId || '' } : l));
    } catch (err) {
      console.error('[handleDeleteEntity]', err);
      setActionError(`Could not remove "${entity.legalBusinessName}": ${err.message || 'unknown error'}`);
    }
  };

  // Shared by drag-and-drop AND the mobile "Move to…" menus. Failures are
  // surfaced in the actionError banner — a silent snap-back reads as a glitch.
  const moveLocationToEntity = async (locId, targetEntityId) => {
    const loc = locations.find(l => l.id === locId);
    setActionError('');
    setLocations(prev => prev.map(l => l.id === locId ? { ...l, entityId: targetEntityId } : l));
    try {
      const res = await invokePortalFunction('batchUpdateStatus', { corporateId: profile.corporateId, action: 'moveToEntity', locationIds: [locId], targetEntityId });
      if (res.data?.error) throw new Error(res.data.error);
    } catch (err) {
      console.error('[moveLocationToEntity]', err);
      setActionError(`Could not move "${loc?.dbaName || 'the location'}" — your layout was restored. ${err.message || 'Please try again.'}`);
      await loadAll();
    }
  };

  const moveMidToLocation = async (midId, targetLocId) => {
    const mid = merchantIDs.find(c => c.id === midId);
    setActionError('');
    setMerchantIDs(prev => prev.map(c => c.id === midId ? { ...c, locationId: targetLocId } : c));
    try {
      const res = await invokePortalFunction('manageMerchantID', { action: 'update', corporateId: profile.corporateId, merchantIDId: midId, locationId: targetLocId, data: { locationId: targetLocId } });
      if (res.data?.error) throw new Error(res.data.error);
    } catch (err) {
      console.error('[moveMidToLocation]', err);
      setActionError(`Could not move "${mid?.merchantName || mid?.dbaName || 'the processing account'}" — your layout was restored. ${err.message || 'Please try again.'}`);
      await loadAll();
    }
  };

  const onDragEnd = async ({ type, source, destination, draggableId }) => {
    if (!destination) return;
    if (source.droppableId === destination.droppableId && source.index === destination.index) return;

    if (type === 'LOCATION') {
      await moveLocationToEntity(draggableId.replace('loc-', ''), destination.droppableId);
    } else if (type === 'MID') {
      await moveMidToLocation(draggableId.replace('mid-', ''), destination.droppableId.replace('mids-', ''));
    }
  };

  const [showValidation, setShowValidation] = useState(false);
  // Live Business Details drafts — so the Continue banner lists only what's
  // still empty in the form (not every unsaved field as "missing").
  const [entityDrafts, setEntityDrafts] = useState({});
  const handleEntityDraftStatus = useCallback((status) => {
    if (!status?.entityId) return;
    setEntityDrafts((prev) => {
      const cur = prev[status.entityId];
      if (
        cur
        && cur.missing.join('|') === status.missing.join('|')
        && cur.needsSave === status.needsSave
        && cur.name === status.name
      ) return prev;
      return { ...prev, [status.entityId]: status };
    });
  }, []);

  const businessComplete = entities.length > 0 && entities.every((e) => {
    const draft = entityDrafts[e.entityId];
    if (draft) return draft.missing.length === 0 && !draft.needsSave && entityLegalAddressComplete(e);
    return entityMissingFields(e).length === 0
      && String(e.legalBusinessName || '').trim()
      && entityLegalAddressComplete(e);
  });
  // Fields are typed but Save Details hasn't been clicked — surface this near
  // Continue so a blocked Continue doesn't read as a broken page.
  const hasUnsavedEntityDetails = Object.values(entityDrafts).some(
    (d) => d.needsSave && d.missing.length === 0
  );

  const totalMids = merchantIDs.length;
  const completeMids = merchantIDs.filter(c =>
    isMidComplete(c, locations.find(l => l.id === c.locationId)?.businessState)
  ).length;

  const allMidsComplete = businessComplete && locations.length > 0 && locations.every(l =>
    merchantIDs.some(c => c.locationId === l.id && isMidComplete(c, l.businessState))
  );

  // Build a list of specific validation issues for user feedback
  const validationIssues = [];
  if (!businessComplete) {
    entities.forEach((e) => {
      const draft = entityDrafts[e.entityId];
      const name = draft?.name || e.legalBusinessName || 'Legal Entity';
      const missing = draft?.missing ?? entityMissingFields(e);
      if (missing.length) {
        validationIssues.push(`${name}: still need ${missing.join(', ')}`);
      } else if (draft?.needsSave) {
        validationIssues.push(`${name}: click Save Details to store your business details`);
      } else if (!entityLegalAddressComplete(e)) {
        validationIssues.push(`${name}: legal address is required when it differs from the store`);
      } else {
        validationIssues.push(`${name}: still need ${entityMissingFields(e).join(', ') || 'business details'}`);
      }
    });
  }
  // Legal address can fail even when business details are complete
  entities.forEach((e) => {
    if (entityMissingFields(e).length === 0 && !entityLegalAddressComplete(e)) {
      const already = validationIssues.some(v => v.includes(e.legalBusinessName || 'Legal Entity') && v.includes('legal address'));
      if (!already) {
        validationIssues.push(`${e.legalBusinessName || 'Legal Entity'}: legal address is required when it differs from the store`);
      }
    }
  });
  if (locations.length === 0) {
    validationIssues.push('At least one location is required');
  } else {
    locations.forEach(l => {
      const mid = merchantIDs.find(c => c.locationId === l.id && isMidComplete(c, l.businessState));
      if (!mid) {
        const barMid = merchantIDs.find(c => c.locationId === l.id && requiresLiquorCompliance(l.businessState, c.mccCode));
        if (barMid && !isAlcoholSalesPercentageSet(barMid.alcoholSalesPercentage)) {
          validationIssues.push(`${l.dbaName}: alcohol sales % is required for bars/taverns in ${l.businessState}`);
        } else {
          const locMids = merchantIDs.filter(c => c.locationId === l.id);
          if (locMids.length === 0) {
            validationIssues.push(`${l.dbaName}: add a processing account (business category + monthly card sales)`);
          } else {
            locMids.forEach((c) => {
              const gaps = [];
              if (!c.mccCode && !c.mccHelpRequested) gaps.push('business category');
              if (!(Number(c.monthlyCardSales) > 0)) gaps.push('monthly card sales');
              if (!(Number(c.avgSaleAmount) > 0)) gaps.push('typical sale');
              if (!(Number(c.highestTicketAmount) > 0)) gaps.push('largest expected sale');
              if (requiresLiquorCompliance(l.businessState, c.mccCode) && !isAlcoholSalesPercentageSet(c.alcoholSalesPercentage)) {
                gaps.push('alcohol sales %');
              }
              if (gaps.length) {
                validationIssues.push(`${c.merchantName || c.dbaName || l.dbaName}: still need ${gaps.join(', ')}`);
              }
            });
          }
        }
      }
    });
  }

  if (loading) return (
    <div className="px-4 sm:px-8 py-8 space-y-4" aria-busy="true" aria-label="Loading locations">
      <div className="skeleton h-6 w-40 !rounded-cb" />
      <div className="skeleton h-9 w-2/3 !rounded-cb" />
      <div className="skeleton h-4 w-1/2 !rounded-cb" />
      <div className="skeleton h-24 w-full !rounded-cb" />
      <div className="skeleton h-40 w-full !rounded-cb" />
      <div className="skeleton h-14 w-full !rounded-cb" />
    </div>
  );

  if (loadError) return (
    <div className="px-4 sm:px-8 py-12 flex flex-col items-center text-center gap-4">
      <div className="w-10 h-10 rounded-full bg-cb-surface border border-cb-border flex items-center justify-center">
        <AlertTriangle className="w-5 h-5 text-cb-danger" />
      </div>
      <div>
        <p className="text-cb-body-lg font-semibold text-white mb-1">Couldn&apos;t load your locations</p>
        <p className="text-cb-body text-gray-400 max-w-md">{loadError}</p>
      </div>
      <button onClick={loadAll}
        className="bg-cb-accent hover:opacity-90 text-cb-bg font-semibold text-cb-body px-5 py-2.5 rounded-cb transition-opacity">
        Try Again
      </button>
    </div>
  );

  return (
    <div className="flex flex-col">
      {/* Header */}
      <div className="px-4 sm:px-8 pt-10 pb-8 border-b border-cb-border">
        <p className="text-cb-caption uppercase text-gray-500 mb-2">Step 2 of 4 — Locations</p>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="font-display text-cb-display text-white mb-2">Your Business &amp; Locations</h2>
            <p className="text-cb-body-lg text-gray-400 max-w-xl">
              {entities.length === 1 && locations.length <= 1
                ? 'Confirm your store, how it takes cards, and your legal business details.'
                : 'Confirm your legal business details, add each location, and tell us how it takes cards.'}
            </p>
          </div>
          <button onClick={() => setShowBackConfirm(true)}
            className="flex-shrink-0 flex items-center gap-2 text-cb-body text-gray-300 border border-cb-border hover:border-cb-border-strong hover:text-white px-4 py-2 rounded-cb transition-colors">
            <ArrowLeft className="w-4 h-4" /> Back
          </button>
        </div>
      </div>

      {/* Summary — one quiet line, no chrome */}
      {locations.length > 0 && (
        <div className="px-4 sm:px-8 py-4 border-b border-cb-border">
          <p className="text-cb-body text-gray-500">
            <span className="text-white font-semibold">{locations.length}</span> location{locations.length !== 1 ? 's' : ''}
            <span className="mx-2 text-gray-700">·</span>
            <span className="text-white font-semibold">{totalMids}</span> processing account{totalMids !== 1 ? 's' : ''}
            <span className="mx-2 text-gray-700">·</span>
            <span className={`font-semibold ${completeMids === totalMids && totalMids > 0 ? 'text-cb-success' : 'text-white'}`}>{completeMids} of {totalMids}</span> complete
            {entities.length > 1 && (
              <>
                <span className="mx-2 text-gray-700">·</span>
                <span className="text-white font-semibold">{entities.length}</span> legal entities
              </>
            )}
          </p>
        </div>
      )}

      {/* Hierarchy: Entity → Locations → MIDs */}
      <div className="px-4 sm:px-8 py-8 space-y-6">
        {/* Prefill verification notice — only after a store exists. Empty
            self-serve first landing has nothing to "verify" yet. */}
        {locations.length > 0 && (showFullVerify ? (
          <div className="flex items-start gap-3 bg-cb-surface-raised border border-cb-border border-l border-l-cb-accent rounded-cb px-5 py-4">
            <Info className="w-4 h-4 text-cb-accent flex-shrink-0 mt-0.5" />
            <p className="text-cb-body text-gray-400 leading-relaxed">
              <span className="font-medium text-white">Please verify everything below before continuing.</span>{' '}
              Some details were prefilled by your Cliqbux representative and may be incomplete or out of date.
              Use the <Pencil className="w-3 h-3 inline -mt-0.5" /> edit icons to correct your legal entity name,
              EIN, or a location&apos;s name and address.
            </p>
          </div>
        ) : (
          <p className="text-cb-body text-gray-500">
            Tip: use the <Pencil className="w-3 h-3 inline -mt-0.5" /> edit icons if anything looks off.
          </p>
        ))}

        {/* One-time multi-store coach when hierarchy expands beyond 1×1 */}
        {showMultiCoach && (
          <div className="flex items-start gap-3 bg-cb-surface-raised border border-cb-border rounded-cb px-5 py-4">
            <Info className="w-4 h-4 text-gray-500 flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-cb-body text-white font-medium mb-1">You&apos;re now managing more than one store or account</p>
              <p className="text-cb-body text-gray-400 leading-relaxed">
                Each card sits under a <span className="text-gray-300">legal entity</span> (EIN), then a{' '}
                <span className="text-gray-300">location</span> (storefront), then a{' '}
                <span className="text-gray-300">processing account</span> (how that spot takes cards).
                Drag or use Move to reorganize — your hierarchy can grow with you.
              </p>
            </div>
            <button
              type="button"
              onClick={dismissMultiCoach}
              className="flex-shrink-0 text-cb-body text-gray-500 hover:text-white px-2 py-1 transition-colors"
            >
              Got it
            </button>
          </div>
        )}

        {/* Action error — inline, replaces browser alert() */}
        {actionError && (
          <div className="flex items-start justify-between gap-3 bg-cb-surface-raised border border-cb-border border-l-cb-danger rounded-cb px-5 py-4" role="alert">
            <p className="text-cb-body text-cb-danger">{actionError}</p>
            <button onClick={() => setActionError('')} className="p-1 text-gray-500 hover:text-white flex-shrink-0">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Toolbar — only meaningful with multiple entities */}
        {entities.length > 1 && (
          <div className="flex items-center justify-between">
            <p className="text-cb-caption uppercase text-gray-500">{entities.length} Legal Entities</p>
          </div>
        )}

        <DragDropContext onDragEnd={onDragEnd}>
          <div className="space-y-6">
            {entities.map(entity => {
              const emptyFirstStore = locations.length === 0
                && entities.length === 1
                && addFormEntityId === entity.entityId;
              return (
              <EntitySection
                key={entity.entityId}
                entity={entity}
                locations={locations}
                corporateId={profile.corporateId}
                merchantIDs={merchantIDs}
                onDeleteLocation={l => setDeleteConfirm(l)}
                onMerchantIDAdded={c => setMerchantIDs(prev => [...prev, c])}
                onMerchantIDUpdated={updated => setMerchantIDs(prev => prev.map(c => c.id === updated.id ? { ...c, ...updated } : c))}
                onMerchantIDDeleted={m => setDeleteMidConfirm(m)}
                onLocationUpdated={handleLocationUpdated}
                onAddLocation={entityId => setAddFormEntityId(entityId)}
                isOnly={entities.length === 1}
                onEntityUpdated={handleEntityUpdated}
                onDeleteEntity={e => setDeleteEntityConfirm(e)}
                showValidation={showValidation}
                onEntityDraftStatus={handleEntityDraftStatus}
                allEntities={entities}
                onMoveLocation={moveLocationToEntity}
                onMoveMid={moveMidToLocation}
                simpleMode={entities.length === 1 && locations.length <= 1}
                onApplicantSave={markApplicantSave}
                inlineAddForm={emptyFirstStore ? (
                  <AddLocationForm
                    corporateId={profile.corporateId}
                    profile={profile}
                    entities={entities}
                    defaultEntityId={entity.entityId}
                    isFirstLocation
                    embedded
                    onSaved={handleLocationSaved}
                    onCancel={null}
                  />
                ) : null}
              />
              );
            })}
          </div>
        </DragDropContext>

        {/* Add Location Form — additional locations only. First empty store is
            embedded in EntitySection ("Your store") so self-serve doesn't land
            on legal-address + separate New Location chrome. */}
        {addFormEntityId !== null && !(locations.length === 0 && entities.length === 1) && (
          <AddLocationForm
            corporateId={profile.corporateId}
            profile={profile}
            entities={entities}
            defaultEntityId={addFormEntityId}
            isFirstLocation={locations.length === 0}
            onSaved={handleLocationSaved}
            onCancel={() => setAddFormEntityId(null)}
          />
        )}
      </div>

      {/* Footer */}
      <div className="px-4 sm:px-8 pt-6 pb-10 border-t border-cb-border space-y-4">
        {/* Validation error banner — shown only after user attempts to continue */}
        {showValidation && !allMidsComplete && (
          <div className="bg-cb-surface-raised border border-cb-border border-l border-l-cb-danger rounded-cb px-5 py-4">
            <p className="text-cb-body font-medium text-cb-danger mb-2">Please fix the following before continuing:</p>
            <ul className="space-y-1.5">
              {validationIssues.map((issue, i) => (
                <li key={i} className="text-cb-body text-gray-400 flex items-start gap-2">
                  <span className="mt-2 w-1 h-1 rounded-full bg-gray-500 flex-shrink-0" />
                  {issue}
                </li>
              ))}
            </ul>
          </div>
        )}
        <button
          onClick={() => {
            if (!allMidsComplete) { setShowValidation(true); return; }
            onContinue({ locations, legalEntities: entities, profile });
          }}
          className={`w-full flex items-center justify-center gap-3 font-semibold py-4 px-6 rounded-cb text-cb-body-lg transition-colors ${
            allMidsComplete
              ? 'bg-cb-accent hover:opacity-90 text-cb-bg'
              : showValidation
              ? 'bg-cb-surface-raised border border-cb-danger text-cb-danger'
              : 'bg-cb-surface-raised border border-cb-border text-gray-500'
          }`}
        >
          Continue to Banking <ArrowRight className="w-5 h-5" />
        </button>
        {!showValidation && !allMidsComplete && (
          <p className="text-center text-cb-body text-gray-500">
            {hasUnsavedEntityDetails
              ? 'You have unsaved business details — click Save Details above to store them.'
              : locations.length === 0
              ? 'Add your store name and address above to continue.'
              : !businessComplete
              ? 'Complete business details for each entity to continue.'
              : `${totalMids - completeMids} processing account${totalMids - completeMids !== 1 ? 's' : ''} still need a business category and sales info.`}
          </p>
        )}
      </div>

      {/* Delete location confirm */}
      {deleteConfirm && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm px-4 animate-in fade-in-0 duration-200" onClick={() => setDeleteConfirm(null)}>
          <div className="bg-cb-surface-raised border border-cb-border rounded-cb shadow-cb-overlay w-full max-w-sm p-6 animate-in fade-in-0 zoom-in-95 slide-in-from-bottom-2 duration-200" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-cb-surface border border-cb-border flex items-center justify-center flex-shrink-0"><AlertTriangle className="w-5 h-5 text-cb-danger" /></div>
              <div>
                <h3 className="text-cb-body-lg font-semibold text-white">Remove Location?</h3>
                <p className="text-cb-body text-gray-400 mt-0.5">"{deleteConfirm.dbaName}" and all its processing accounts will be deleted.</p>
              </div>
            </div>
            <div className="flex gap-3">
              <button onClick={() => handleDeleteLocation(deleteConfirm)} className="flex-1 bg-cb-danger hover:opacity-90 text-white font-semibold text-cb-body py-2.5 rounded-cb transition-colors">Remove</button>
              <button onClick={() => setDeleteConfirm(null)} className="flex-1 border border-cb-border text-gray-300 hover:text-white hover:border-cb-border-strong font-medium text-cb-body py-2.5 rounded-cb transition-colors">Keep</button>
            </div>
          </div>
        </div>, document.body
      )}

      {/* Delete MID confirm */}
      {deleteMidConfirm && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm px-4 animate-in fade-in-0 duration-200" onClick={() => setDeleteMidConfirm(null)}>
          <div className="bg-cb-surface-raised border border-cb-border rounded-cb shadow-cb-overlay w-full max-w-sm p-6 animate-in fade-in-0 zoom-in-95 slide-in-from-bottom-2 duration-200" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-cb-surface border border-cb-border flex items-center justify-center flex-shrink-0"><AlertTriangle className="w-5 h-5 text-cb-danger" /></div>
              <div>
                <h3 className="text-cb-body-lg font-semibold text-white">Remove Processing Account?</h3>
                <p className="text-cb-body text-gray-400 mt-0.5">"{deleteMidConfirm.merchantName || deleteMidConfirm.dbaName}" will be permanently deleted.</p>
              </div>
            </div>
            <div className="flex gap-3">
              <button onClick={() => handleDeleteMid(deleteMidConfirm)} className="flex-1 bg-cb-danger hover:opacity-90 text-white font-semibold text-cb-body py-2.5 rounded-cb transition-colors">Remove</button>
              <button onClick={() => setDeleteMidConfirm(null)} className="flex-1 border border-cb-border text-gray-300 hover:text-white hover:border-cb-border-strong font-medium text-cb-body py-2.5 rounded-cb transition-colors">Keep</button>
            </div>
          </div>
        </div>, document.body
      )}

      {/* Delete entity confirm */}
      {deleteEntityConfirm && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm px-4 animate-in fade-in-0 duration-200" onClick={() => setDeleteEntityConfirm(null)}>
          <div className="bg-cb-surface-raised border border-cb-border rounded-cb shadow-cb-overlay w-full max-w-sm p-6 animate-in fade-in-0 zoom-in-95 slide-in-from-bottom-2 duration-200" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-cb-surface border border-cb-border flex items-center justify-center flex-shrink-0"><AlertTriangle className="w-5 h-5 text-cb-danger" /></div>
              <div>
                <h3 className="text-cb-body-lg font-semibold text-white">Remove Legal Entity?</h3>
                <p className="text-cb-body text-gray-400 mt-0.5">"{deleteEntityConfirm.legalBusinessName}" will be removed. Its locations will move to your remaining legal entity.</p>
              </div>
            </div>
            <div className="flex gap-3">
              <button onClick={() => handleDeleteEntity(deleteEntityConfirm)} className="flex-1 bg-cb-danger hover:opacity-90 text-white font-semibold text-cb-body py-2.5 rounded-cb transition-colors">Remove</button>
              <button onClick={() => setDeleteEntityConfirm(null)} className="flex-1 border border-cb-border text-gray-300 hover:text-white hover:border-cb-border-strong font-medium text-cb-body py-2.5 rounded-cb transition-colors">Keep</button>
            </div>
          </div>
        </div>, document.body
      )}

      {/* Back confirm */}
      {showBackConfirm && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm px-4 animate-in fade-in-0 duration-200" onClick={() => setShowBackConfirm(false)}>
          <div className="bg-cb-surface-raised border border-cb-border rounded-cb shadow-cb-overlay w-full max-w-sm p-6 animate-in fade-in-0 zoom-in-95 slide-in-from-bottom-2 duration-200" onClick={e => e.stopPropagation()}>
            <h3 className="font-display text-cb-title text-white mb-1">Go Back?</h3>
            <p className="text-cb-body text-gray-400 mb-5">Everything you saved here is kept.</p>
            <div className="flex gap-3">
              <button onClick={() => { setShowBackConfirm(false); onBack(); }} className="flex-1 bg-cb-surface border border-cb-border-strong hover:text-white text-gray-200 font-medium text-cb-body py-2.5 rounded-cb transition-colors">Go Back</button>
              <button onClick={() => setShowBackConfirm(false)} className="flex-1 border border-cb-border text-gray-300 hover:text-white hover:border-cb-border-strong font-medium text-cb-body py-2.5 rounded-cb transition-colors">Stay</button>
            </div>
          </div>
        </div>, document.body
      )}
    </div>
  );
}
