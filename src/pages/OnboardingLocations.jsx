import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import {
  Plus, ArrowRight, Loader2, Store, Trash2, CheckCircle2,
  MapPin, Building2, CreditCard, ChevronDown, ChevronRight, X,
  AlertTriangle, Check, ArrowLeft, Pencil, GripVertical, Cloud, Mail, Lock

} from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { isLocked as getMidLocked, isImported as getMidImported } from '@/utils/statusUtils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

// ─── Constants ────────────────────────────────────────────────────────────────

const MCC_OPTIONS = [
  { value: '5812', label: '5812 — Restaurant / Eating Place' },
  { value: '5814', label: '5814 — Fast Food' },
  { value: '5813', label: '5813 — Bar / Drinking Place' },
  { value: '5411', label: '5411 — Grocery / Supermarket' },
  { value: '5999', label: '5999 — Specialty Retail' },
  { value: '7230', label: '7230 — Beauty / Barber Shop' },
  { value: '5651', label: '5651 — Clothing Store' },
  { value: '5734', label: '5734 — Computer / Software' },
  { value: '5311', label: '5311 — Department Store' },
  { value: '7221', label: '7221 — Photography Studio' },
  { value: '5932', label: '5932 — Used Merchandise' },
  { value: '4900', label: '4900 — Utilities' },
  { value: '5211', label: '5211 — Building Materials' },
];

const INDUSTRY_OPTIONS = [
  { value: 'RE', label: 'Retail (RE)' },
  { value: 'RS', label: 'Restaurant (RS)' },
  { value: 'SP', label: 'Supermarket (SP)' },
  { value: 'HT', label: 'Lodging / Hotel (HT)' },
  { value: 'MS', label: 'MOTO (MS)' },
  { value: 'ARU', label: 'ARU' },
];

const inputCls = 'w-full bg-[#111318] border border-white/20 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent';
const labelCls = 'block text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5';

function formatEIN(raw) {
  const d = (raw || '').replace(/\D/g, '');
  return d.length >= 9 ? `${d.slice(0, 2)}-${d.slice(2, 9)}` : raw || '';
}

function parsePlaceResult(place, onParsed) {
  if (!place?.address_components) return;
  const get = (types) => (place.address_components.find(c => types.some(t => c.types.includes(t))) || {}).long_name || '';
  const getS = (types) => (place.address_components.find(c => types.some(t => c.types.includes(t))) || {}).short_name || '';
  const street = (get(['street_number']) ? `${get(['street_number'])} ` : '') + get(['route']);
  const city = get(['locality', 'sublocality']);
  const state = getS(['administrative_area_level_1']);
  const zip = get(['postal_code']);
  onParsed({ street, city, state, zip, display: `${street}, ${city}, ${state} ${zip}` });
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
  const map = {
    'Active':            'bg-green-500/15 text-green-400 border-green-500/30',
    'Active (Existing)': 'bg-green-500/15 text-green-400 border-green-500/30',
    'Pending MID':       'bg-amber-500/15 text-amber-400 border-amber-500/30',
    'Ready to Submit':   'bg-blue-500/15 text-blue-400 border-blue-500/30',
    'In Review':         'bg-white/5 text-gray-400 border-white/10',
    'Error':             'bg-red-500/15 text-red-400 border-red-500/30',
  };
  return (
    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${map[status] || map['In Review']}`}>
      {status || 'In Review'}
    </span>
  );
}

// ─── MID Card (draggable) ─────────────────────────────────────────────────────

function MidCard({ mid, locationId, corporateId, dbaName, index, onUpdated, onDelete }) {
  const locked = getMidLocked(mid);
  const imported = getMidImported(mid);
  const [editing, setEditing] = useState(!mid.mccCode && !locked);
  const [form, setForm] = useState({
    merchantName: mid.merchantName || mid.dbaName || dbaName || '',
    mccCode: mid.mccCode || '',
    industryType: mid.industryType || '',
    monthlyCardSales: mid.monthlyCardSales || '',
    avgSaleAmount: mid.avgSaleAmount || '',
    highestTicketAmount: mid.highestTicketAmount || '',
    cardPresentPct: mid.cardPresentPct != null ? String(mid.cardPresentPct) : '100',
    internetPct: mid.internetPct != null ? String(mid.internetPct) : '0',
    motoPct: mid.motoPct != null ? String(mid.motoPct) : '0',
  });
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState(null);

  const pctSum = (parseInt(form.cardPresentPct) || 0) + (parseInt(form.internetPct) || 0) + (parseInt(form.motoPct) || 0);
  const canSave = form.mccCode && pctSum === 100;
  // isComplete reads from form state (not stale mid prop) so the header updates immediately after save
  const isComplete = !!(form.mccCode && form.monthlyCardSales);

  const doSave = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      const res = await base44.functions.invoke('manageMerchantID', {
        action: 'update', locationId, corporateId, merchantIDId: mid.id,
        data: { ...form, merchantName: form.merchantName || dbaName },
      });
      const saved = res.data?.updatedMerchantID || res.data?.merchantID;
      if (saved) { onUpdated(saved); setSavedAt(Date.now()); }
    } catch (err) {
      console.error('[MidCard.doSave]', err);
    }
    finally { setSaving(false); }
  };

  const setField = (k, v) => setForm(prev => ({ ...prev, [k]: v }));

  return (
    <Draggable draggableId={`mid-${mid.id}`} index={index}>
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.draggableProps}
          className={`rounded-xl border transition-all ${snapshot.isDragging ? 'border-blue-500/60 bg-[#1a2235] shadow-xl' : locked ? 'border-white/5 bg-white/[0.01] opacity-70' : isComplete ? 'border-blue-500/20 bg-blue-500/5' : 'border-white/10 bg-white/[0.02]'}`}
        >
          <div className="flex items-center gap-2 px-3 py-2.5">
            <span {...provided.dragHandleProps} className={`text-gray-600 flex-shrink-0 ${locked ? 'cursor-not-allowed' : 'hover:text-gray-400 cursor-grab active:cursor-grabbing'}`}>
              <GripVertical className="w-3.5 h-3.5" />
            </span>
            <CreditCard className={`w-3.5 h-3.5 flex-shrink-0 ${locked ? 'text-gray-600' : isComplete ? 'text-blue-400' : 'text-gray-500'}`} />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-white truncate">{form.merchantName || dbaName}</p>
              {isComplete
                ? <p className="text-[10px] text-blue-400/70 font-mono">{mid.mccCode} · ${Number(mid.monthlyCardSales || 0).toLocaleString()}/mo</p>
                : <p className="text-[10px] text-amber-400/80">Needs MCC &amp; volume →</p>
              }
            </div>
            <div className="flex items-center gap-1.5 flex-shrink-0">
              {imported && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-gray-500/10 text-gray-400 border border-gray-500/20">Imported</span>}
              {!imported && !locked && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-purple-500/10 text-purple-400 border border-purple-500/20">New</span>}
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
                <button onClick={() => setEditing(e => !e)} className="p-1 text-gray-500 hover:text-amber-400 transition-colors">
                  <Pencil className="w-3 h-3" />
                </button>
                <button onClick={() => onDelete(mid)} className="p-1 text-gray-600 hover:text-red-400 transition-colors">
                  <Trash2 className="w-3 h-3" />
                </button>
              </>
            )}
          </div>

          {editing && !locked && (
            <div className="border-t border-white/5 px-3 pb-3 pt-2 space-y-2">
              <div>
                <label className={labelCls}>MID Label</label>
                <input value={form.merchantName} onChange={e => setField('merchantName', e.target.value)}
                  placeholder={`e.g. ${dbaName} – Bar`} className={inputCls} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className={labelCls}>MCC Code *</label>
                  <select value={form.mccCode} onChange={e => setField('mccCode', e.target.value)}
                    className={inputCls} style={{ colorScheme: 'dark' }}>
                    <option value="">Select…</option>
                    {MCC_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Industry Type</label>
                  <select value={form.industryType} onChange={e => setField('industryType', e.target.value)}
                    className={inputCls} style={{ colorScheme: 'dark' }}>
                    <option value="">Select…</option>
                    {INDUSTRY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Monthly Volume ($)</label>
                  <input type="number" value={form.monthlyCardSales} onChange={e => setField('monthlyCardSales', e.target.value)}
                    placeholder="e.g. 8000" className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Avg Sale ($)</label>
                  <input type="number" value={form.avgSaleAmount} onChange={e => setField('avgSaleAmount', e.target.value)}
                    placeholder="e.g. 45" className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Highest Ticket ($)</label>
                  <input type="number" value={form.highestTicketAmount} onChange={e => setField('highestTicketAmount', e.target.value)}
                    placeholder="e.g. 200" className={inputCls} />
                </div>
              </div>
              <div>
                <label className={labelCls}>Card Split (must total 100%)</label>
                <div className="grid grid-cols-3 gap-2">
                  {[['cardPresentPct', 'In-Person'], ['internetPct', 'Online'], ['motoPct', 'MOTO']].map(([k, lbl]) => (
                    <div key={k}>
                      <span className="text-[10px] text-gray-500 mb-1 block">{lbl}</span>
                      <input type="number" min="0" max="100" value={form[k]}
                        onChange={e => setField(k, e.target.value)} className={inputCls} />
                    </div>
                  ))}
                </div>
                {pctSum !== 100 && <p className="text-[11px] text-amber-400 mt-1">Total: {pctSum}% (must be 100%)</p>}
              </div>
              {/* Save button + collapse */}
              <div className="flex items-center justify-between pt-1">
                <div className="flex items-center gap-2">
                  <button
                    onClick={async () => { await doSave(); setEditing(false); }}
                    disabled={saving || !canSave}
                    className="flex items-center gap-1.5 bg-amber-500/20 border border-amber-500/30 text-amber-300 hover:bg-amber-500/30 disabled:opacity-40 disabled:cursor-not-allowed text-xs font-bold px-4 py-1.5 rounded-lg transition-all"
                  >
                    {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : savedAt ? <Cloud className="w-3 h-3" /> : null}
                    {saving ? 'Saving…' : savedAt ? 'Saved' : 'Save'}
                  </button>
                  {!canSave && <span className="text-[11px] text-gray-600">Fill MCC &amp; card split to save</span>}
                </div>
                <button onClick={() => setEditing(false)} className="text-xs text-gray-500 hover:text-white transition-colors">Cancel</button>
              </div>
            </div>
          )}
        </div>
      )}
    </Draggable>
  );
}

// ─── Location Card (nested inside Entity, draggable) ──────────────────────────

function LocationCard({ location, corporateId, merchantIDs, onDelete, onMerchantIDAdded, onMerchantIDUpdated, onMerchantIDDeleted, index, showValidation }) {
  const locMids = merchantIDs.filter(c => c.locationId === location.id);
  const [expanded, setExpanded] = useState(locMids.length === 0 || locMids.some(m => !m.mccCode));
  const [addingMid, setAddingMid] = useState(false);
  const [addMidName, setAddMidName] = useState('');
  const [addMidSaving, setAddMidSaving] = useState(false);
  const allMidsComplete = locMids.length > 0 && locMids.every(m => m.mccCode && m.monthlyCardSales);
  const locationError = showValidation && !allMidsComplete;

  // Auto-expand when validation fires and this location is incomplete
  useEffect(() => {
    if (locationError) setExpanded(true);
  }, [locationError]);

  const handleAddMid = async () => {
    setAddMidSaving(true);
    try {
      const res = await base44.functions.invoke('manageMerchantID', {
        action: 'add', locationId: location.id, corporateId,
        data: { merchantName: addMidName || location.dbaName, mccCode: '' },
      });
      const saved = res.data?.merchantID;
      if (saved) { onMerchantIDAdded(saved); setAddingMid(false); setAddMidName(''); }
    } catch (err) {
      console.error('[LocationCard.handleAddMid]', err);
    }
    finally { setAddMidSaving(false); }
  };

  return (
    <Draggable draggableId={`loc-${location.id}`} index={index}>
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.draggableProps}
          className={`rounded-2xl border transition-all ${snapshot.isDragging ? 'border-amber-500/70 shadow-2xl' : allMidsComplete ? 'border-green-500/25 bg-[#161b23]' : locationError ? 'border-red-500/40 bg-[#161b23]' : 'border-white/10 bg-[#161b23] hover:border-white/20'}`}
        >
          {/* Location header */}
          <div className="flex items-center gap-2.5 px-4 py-3">
            <span {...provided.dragHandleProps} className="text-gray-600 hover:text-gray-300 cursor-grab active:cursor-grabbing flex-shrink-0">
              <GripVertical className="w-4 h-4" />
            </span>
            <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${allMidsComplete ? 'bg-green-500/15' : 'bg-amber-500/10'}`}>
              <Store className={`w-3.5 h-3.5 ${allMidsComplete ? 'text-green-400' : 'text-amber-400'}`} />
            </div>
            <div className="flex-1 min-w-0 cursor-pointer" onClick={() => setExpanded(e => !e)}>
              <div className="flex items-center gap-2">
                <p className="text-sm font-bold text-white truncate">{location.dbaName}</p>
                {locationError && <span className="text-[9px] font-bold text-red-400 bg-red-500/10 border border-red-500/20 px-1.5 py-0.5 rounded-full whitespace-nowrap">Needs info</span>}
              </div>
              <p className="text-[11px] text-gray-400 truncate flex items-center gap-1">
                <MapPin className="w-3 h-3 flex-shrink-0" />{location.businessAddress}
              </p>
            </div>
            <div className="flex items-center gap-1.5 flex-shrink-0">
              {allMidsComplete && <CheckCircle2 className="w-3.5 h-3.5 text-green-400" />}
              <span className="text-[10px] font-semibold text-gray-500 bg-white/5 rounded-full px-2 py-0.5">
                {locMids.length} MID{locMids.length !== 1 ? 's' : ''}
              </span>
              <button onClick={e => { e.stopPropagation(); onDelete(location); }}
                className="p-1.5 text-gray-600 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
              <button onClick={() => setExpanded(e => !e)} className="p-1.5 text-gray-500 hover:text-white transition-colors">
                {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* MIDs — nested droppable */}
          {expanded && (
            <div className="border-t border-white/5 px-4 pb-3 pt-2">
              <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-2">
                Merchant Applications (MIDs)
              </p>
              <Droppable droppableId={`mids-${location.id}`} type="MID">
                {(drop, dropSnap) => (
                  <div
                    ref={drop.innerRef}
                    {...drop.droppableProps}
                    className={`space-y-1.5 min-h-[32px] rounded-xl transition-colors ${dropSnap.isDraggingOver ? 'bg-blue-500/5 ring-1 ring-blue-500/20' : ''}`}
                  >
                    {locMids.map((mid, idx) => (
                      <MidCard
                        key={mid.id}
                        mid={mid}
                        index={idx}
                        locationId={location.id}
                        corporateId={corporateId}
                        dbaName={location.dbaName}
                        onUpdated={onMerchantIDUpdated}
                        onDelete={getMidLocked(mid) ? () => {} : onMerchantIDDeleted}
                      />
                    ))}
                    {drop.placeholder}
                  </div>
                )}
              </Droppable>

              {addingMid ? (
                <div className="mt-2 flex gap-2 items-center">
                  <input value={addMidName} onChange={e => setAddMidName(e.target.value)}
                    placeholder={`e.g. ${location.dbaName} – Bar`}
                    className={`${inputCls} text-xs py-2`} autoFocus
                    onKeyDown={e => { if (e.key === 'Enter') handleAddMid(); if (e.key === 'Escape') setAddingMid(false); }} />
                  <button onClick={handleAddMid} disabled={addMidSaving}
                    className="flex-shrink-0 flex items-center gap-1 bg-blue-500/20 border border-blue-500/30 text-blue-300 text-xs font-semibold px-3 py-2 rounded-lg hover:bg-blue-500/30 disabled:opacity-50">
                    {addMidSaving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />} Add
                  </button>
                  <button onClick={() => setAddingMid(false)} className="p-2 text-gray-500 hover:text-white flex-shrink-0"><X className="w-3 h-3" /></button>
                </div>
              ) : (
                <button onClick={() => setAddingMid(true)}
                  className="mt-2 w-full flex items-center justify-center gap-1.5 border border-dashed border-white/10 hover:border-blue-500/30 hover:text-blue-400 rounded-lg py-2 text-xs font-semibold text-gray-600 transition-all">
                  <Plus className="w-3 h-3" /> Add MID (same address, different Merchant ID)
                </button>
              )}
            </div>
          )}
        </div>
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

function EntityDetailsPanel({ entity, corporateId, onUpdated }) {
  const [ownershipType, setOwnershipType] = useState(entity.ownershipType || '');
  const [taxClassType, setTaxClassType]   = useState(entity.taxClassType  || '');
  const [estYear, setEstYear]             = useState(entity.establishmentYear || '');
  // Federal EIN — added 2026-07-07. Entities can now be auto-seeded (from the
  // Company Name collected at signup) with no EIN at all, since self-serve
  // signup never asks for one. This panel is where that EIN gets filled in
  // later, using the same required-field gating pattern as the fields below.
  const [federalEIN, setFederalEIN]       = useState(entity.federalEIN || '');
  const einDigits = federalEIN.replace(/\D/g, '');
  const [saved, setSaved] = useState(!!(entity.ownershipType && entity.taxClassType && entity.establishmentYear && entity.federalEIN));
  const [expanded, setExpanded] = useState(!saved);

  // Re-sync when parent reloads entity data (e.g. after navigating away and back)
  useEffect(() => {
    setOwnershipType(entity.ownershipType || '');
    setTaxClassType(entity.taxClassType || '');
    setEstYear(entity.establishmentYear || '');
    setFederalEIN(entity.federalEIN || '');
    const complete = !!(entity.ownershipType && entity.taxClassType && entity.establishmentYear && entity.federalEIN);
    setSaved(complete);
    setExpanded(!complete);
  }, [entity.entityId, entity.ownershipType, entity.taxClassType, entity.establishmentYear, entity.federalEIN]);

  const [saving, setSaving]     = useState(false);
  const [saveError, setSaveError] = useState(null);

  const isComplete = saved || !!(ownershipType && taxClassType && estYear && einDigits.length === 9 && entity.ownershipType);

  const handleSave = async () => {
    if (!ownershipType || !taxClassType || !estYear || einDigits.length !== 9) return;
    setSaving(true);
    setSaveError(null);
    try {
      const res = await base44.functions.invoke('manageLegalEntity', {
        action: 'edit', corporateId, entityId: entity.entityId,
        ownershipType, taxClassType, establishmentYear: estYear, federalEIN: einDigits,
      });
      if (res.data?.error) throw new Error(res.data.error);
      const { years, months } = deriveOwnership(estYear);
      await base44.functions.invoke('updateMerchantProfile', {
        corporateId, ownershipType, taxClassType, establishmentYear: estYear,
        currentOwnershipYears: years, currentOwnershipMonths: months,
      });
      setSaved(true);
      // Only notify parent once on explicit save — no feedback loop
      onUpdated({ ...entity, ownershipType, taxClassType, establishmentYear: estYear, federalEIN: einDigits });
    } catch (err) {
      setSaveError(err?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const canSave = !!(ownershipType && taxClassType && estYear && einDigits.length === 9);
  const showComplete = saved && canSave;

  return (
    <div className="border-t border-white/5 px-4 py-2">
      <button
        onClick={() => setExpanded(e => !e)}
        className="flex items-center gap-2 text-[11px] font-semibold w-full text-left py-1 transition-colors"
      >
        <Building2 className={`w-3 h-3 flex-shrink-0 ${showComplete ? 'text-green-400' : 'text-amber-400'}`} />
        <span className={`flex-1 ${showComplete ? 'text-gray-400' : 'text-amber-400'}`}>
          {showComplete
            ? <><span className="text-gray-300">{OWNERSHIP_TYPES.find(o => o.value === ownershipType)?.label || ownershipType}</span><span className="text-gray-600 font-normal ml-1.5">· Est. {estYear}</span></>
            : 'Business details required →'}
        </span>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {!showComplete && <span className="text-[10px] font-bold text-amber-400 bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.5 rounded-full">Required</span>}
          {showComplete && <Check className="w-3 h-3 text-green-400" />}
          {expanded ? <ChevronDown className="w-3 h-3 text-gray-500" /> : <ChevronRight className="w-3 h-3 text-gray-500" />}
        </div>
      </button>

      {expanded && (
        <div className="mt-2 mb-2 space-y-2">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
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
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div>
              <label className={labelCls}>Year Established *</label>
              <input type="number" value={estYear}
                onChange={e => setEstYear(e.target.value)}
                placeholder="e.g. 2018" min="1900" max={new Date().getFullYear()} className={inputCls} />
              {estYear && (() => {
                const { years, months } = deriveOwnership(estYear);
                return <p className="text-[10px] text-gray-500 mt-1">{years} yr{years !== '1' ? 's' : ''}{months !== '0' ? ` ${months} mo` : ''} in operation</p>;
              })()}
            </div>
            <div>
              <label className={labelCls}>Federal EIN *</label>
              <input value={federalEIN} onChange={e => setFederalEIN(e.target.value.replace(/\D/g, '').slice(0, 9))}
                placeholder="9 digits" className={`${inputCls} font-mono`} />
              {federalEIN.length > 0 && einDigits.length !== 9 && <p className="text-[10px] text-amber-400 mt-1">{einDigits.length}/9 digits</p>}
            </div>
          </div>
          <div className="flex items-center gap-3 pt-1">
            <button
              onClick={handleSave}
              disabled={!canSave || saving}
              className="flex items-center gap-1.5 bg-amber-500/20 border border-amber-500/30 text-amber-300 hover:bg-amber-500/30 disabled:opacity-40 disabled:cursor-not-allowed text-xs font-bold px-4 py-2 rounded-lg transition-all"
            >
              {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : saved ? <Check className="w-3 h-3" /> : null}
              {saving ? 'Saving…' : saved ? 'Saved' : 'Save Details'}
            </button>
            {!canSave && <p className="text-[10px] text-gray-600">Fill all fields to save</p>}
            {saveError && <p className="text-[10px] text-red-400">⚠ {saveError}</p>}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Entity Mailing Address Panel ────────────────────────────────────────────

function EntityMailingAddress({ entity, corporateId, onUpdated }) {
  const hasMailingAddress = !!(entity.mailingStreet && entity.mailingCity && entity.mailingState);
  const [expanded, setExpanded] = useState(false);
  const [addressDisplay, setAddressDisplay] = useState(
    hasMailingAddress ? `${entity.mailingStreet}, ${entity.mailingCity}, ${entity.mailingState} ${entity.mailingZip || ''}`.trim() : ''
  );
  const [parsedAddress, setParsedAddress] = useState(hasMailingAddress ? {
    street: entity.mailingStreet, city: entity.mailingCity,
    state: entity.mailingState, zip: entity.mailingZip || '',
  } : null);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState(null);
  const pendingSaveRef = useRef(false);

  const addrRef = usePlacesCallbackRef((parsed) => {
    setAddressDisplay(parsed.display);
    setParsedAddress(parsed);
    pendingSaveRef.current = true;
  });

  const entityIdRef = useRef(entity.entityId);
  const onUpdatedRef = useRef(onUpdated);
  entityIdRef.current = entity.entityId;
  onUpdatedRef.current = onUpdated;

  const handleSave = useCallback(async (addr) => {
    setSaving(true);
    try {
      await base44.functions.invoke('manageLegalEntity', {
        action: 'edit', corporateId, entityId: entityIdRef.current,
        mailingStreet: addr.street, mailingCity: addr.city,
        mailingState: addr.state, mailingZip: addr.zip,
      });
      setSavedAt(Date.now());
    } catch (err) {
      console.error('[EntityMailingAddress.handleSave]', err);
    }
    finally { setSaving(false); }
  }, [corporateId]);

  // Auto-save when address is selected from autocomplete — only fires once per selection
  useEffect(() => {
    if (parsedAddress && pendingSaveRef.current) {
      pendingSaveRef.current = false;
      handleSave(parsedAddress);
    }
  }, [parsedAddress, handleSave]);

  const handleClear = async () => {
    setAddressDisplay(''); setParsedAddress(null); setSavedAt(null);
    try {
      await base44.functions.invoke('manageLegalEntity', {
        action: 'edit', corporateId, entityId: entity.entityId,
        mailingStreet: '', mailingCity: '', mailingState: '', mailingZip: '',
      });
      onUpdated({ ...entity, mailingStreet: '', mailingCity: '', mailingState: '', mailingZip: '' });
    } catch (err) {
      console.error('[EntityMailingAddress.handleClear]', err);
    }
  };

  return (
    <div className="border-t border-white/5 px-4 py-2">
      <button
        onClick={() => setExpanded(e => !e)}
        className="flex items-center gap-2 text-[11px] font-semibold text-gray-500 hover:text-gray-300 transition-colors w-full text-left py-1"
      >
        <Mail className="w-3 h-3 flex-shrink-0" />
        <span className="flex-1">
          {hasMailingAddress ? (
            <><span className="text-blue-400">Mailing Address</span><span className="font-normal text-gray-600 ml-1.5">{entity.mailingStreet}, {entity.mailingCity}, {entity.mailingState}</span></>
          ) : 'Add Mailing Address (optional)'}
        </span>
        {expanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
      </button>

      {expanded && (
        <div className="mt-2 mb-1 space-y-2">
          <p className="text-[10px] text-gray-500">Applies to all MIDs under <span className="text-gray-400">{entity.legalBusinessName}</span>. If set, overrides the location address for the legal/mailing address on MSPWare applications.</p>
          {parsedAddress ? (
            <div className="flex items-center gap-2 bg-blue-500/10 border border-blue-500/20 rounded-xl px-3.5 py-2.5">
              <Mail className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" />
              <span className="text-sm text-blue-300 flex-1 truncate">{addressDisplay}</span>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                {saving && <Loader2 className="w-3 h-3 text-blue-400 animate-spin" />}
                {!saving && savedAt && <Cloud className="w-3 h-3 text-green-400" title="Saved" />}
              </div>
              <button type="button" onClick={handleClear} className="text-gray-500 hover:text-white ml-1">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <input
              ref={addrRef}
              type="text"
              value={addressDisplay}
              onChange={e => { setAddressDisplay(e.target.value); setParsedAddress(null); }}
              onKeyDown={e => e.key === 'Enter' && e.preventDefault()}
              placeholder="Start typing mailing address…"
              autoComplete="off"
              className={inputCls}
            />
          )}
        </div>
      )}
    </div>
  );
}

// ─── Entity Section (top-level group) ────────────────────────────────────────

function EntitySection({ entity, locations, corporateId, merchantIDs, onDeleteLocation, onMerchantIDAdded, onMerchantIDUpdated, onMerchantIDDeleted, onAddLocation, isOnly, onEntityUpdated, onDeleteEntity, showValidation }) {
  const entityLocs = locations.filter(l => l.entityId === entity.entityId);
  const entityMids = merchantIDs.filter(m => entityLocs.some(l => l.id === m.locationId));
  const allComplete = entityLocs.length > 0 && entityLocs.every(l =>
    merchantIDs.some(m => m.locationId === l.id && m.mccCode && m.monthlyCardSales)
  );
  const entityDetailsComplete = !!(entity.ownershipType && entity.taxClassType && entity.establishmentYear);
  const highlightError = showValidation && !allComplete;

  return (
    <div className={`rounded-2xl border overflow-hidden ${allComplete ? 'border-green-500/20' : highlightError ? 'border-red-500/40' : 'border-white/10'} bg-[#1c2128]`}>
      {/* Entity header bar */}
      <div className="flex items-center gap-3 px-5 py-3 bg-white/[0.03] border-b border-white/8">
        <div className="w-7 h-7 rounded-lg bg-amber-500/15 flex items-center justify-center flex-shrink-0">
          <Building2 className="w-3.5 h-3.5 text-amber-400" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-bold text-amber-300 uppercase tracking-wider truncate">{entity.legalBusinessName}</p>
          {entity.federalEIN && (
            <p className="text-[10px] text-gray-500 font-mono">EIN {formatEIN(entity.federalEIN)}</p>
          )}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="text-[10px] text-gray-500">{entityLocs.length} location{entityLocs.length !== 1 ? 's' : ''} · {entityMids.length} MID{entityMids.length !== 1 ? 's' : ''}</span>
          {allComplete && entityLocs.length > 0 && <CheckCircle2 className="w-3.5 h-3.5 text-green-400" />}
          {!isOnly && (
            <button onClick={() => onDeleteEntity(entity)} title="Delete legal entity"
              className="p-1.5 text-gray-600 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Business details panel */}
      <EntityDetailsPanel entity={entity} corporateId={corporateId} onUpdated={onEntityUpdated} />

      {/* Mailing address panel */}
      <EntityMailingAddress entity={entity} corporateId={corporateId} onUpdated={onEntityUpdated} />

      {/* Locations droppable */}
      <Droppable droppableId={entity.entityId} type="LOCATION">
        {(drop, dropSnap) => (
          <div
            ref={drop.innerRef}
            {...drop.droppableProps}
            className={`p-3 space-y-2 min-h-[48px] transition-colors ${dropSnap.isDraggingOver ? 'bg-amber-500/5' : ''}`}
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
                showValidation={showValidation}
              />
            ))}
            {drop.placeholder}
            {entityLocs.length === 0 && !dropSnap.isDraggingOver && (
              <p className="text-center text-xs text-gray-600 py-2">No locations yet — add one below or drag here</p>
            )}
          </div>
        )}
      </Droppable>

      {/* Add location to this entity */}
      <div className="px-3 pb-3">
        <button onClick={() => onAddLocation(entity.entityId)}
          className="w-full flex items-center justify-center gap-1.5 border border-dashed border-white/10 hover:border-amber-500/30 hover:text-amber-400 rounded-xl py-2.5 text-xs font-semibold text-gray-600 transition-all">
          <Plus className="w-3 h-3" /> Add Location{isOnly ? '' : ` to ${entity.legalBusinessName}`}
        </button>
      </div>
    </div>
  );
}

// ─── Add Entity Modal ─────────────────────────────────────────────────────────

function AddEntityModal({ corporateId, onSaved, onClose }) {
  const [name, setName] = useState('');
  const [ein, setEin] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const einDigits = ein.replace(/\D/g, '');
  const canSave = name.trim() && einDigits.length === 9;

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true); setError('');
    try {
      const res = await base44.functions.invoke('manageLegalEntity', {
        action: 'add', corporateId,
        legalBusinessName: name.trim(), federalEIN: einDigits,
      });
      if (res.data?.error) throw new Error(res.data.error);
      // Function returns updated entities array — extract the last one (newly created)
      const newEntities = res.data?.entities || [];
      onSaved(newEntities[newEntities.length - 1]);
    } catch (err) { setError(err.message || 'Failed to create entity.'); }
    finally { setSaving(false); }
  };

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 px-4" onClick={onClose}>
      <div className="bg-[#1c2128] border border-white/10 rounded-2xl shadow-2xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-purple-500/15 flex items-center justify-center">
              <Building2 className="w-4 h-4 text-purple-400" />
            </div>
            <div>
              <h3 className="font-bold text-white text-sm">Add Legal Entity</h3>
              <p className="text-[10px] text-gray-500">New EIN / separate legal business</p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white p-1.5 rounded-lg"><X className="w-4 h-4" /></button>
        </div>
        <div className="space-y-3">
          <div>
            <label className={labelCls}>Legal Business Name *</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Northside LLC" className={inputCls} autoFocus />
          </div>
          <div>
            <label className={labelCls}>Federal EIN *</label>
            <input value={ein} onChange={e => setEin(e.target.value.replace(/\D/g, '').slice(0, 9))}
              placeholder="9 digits" className={`${inputCls} font-mono`} />
            {ein.length > 0 && einDigits.length !== 9 && <p className="text-[10px] text-amber-400 mt-1">{einDigits.length}/9 digits</p>}
            {einDigits.length === 9 && <p className="text-[10px] text-green-400 mt-1 flex items-center gap-1"><Check className="w-3 h-3" /> Valid EIN</p>}
          </div>
          {error && <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-sm text-red-300">{error}</div>}
          <div className="flex gap-3 pt-1">
            <button onClick={handleSave} disabled={saving || !canSave}
              className="flex-1 flex items-center justify-center gap-2 bg-purple-600 hover:bg-purple-500 disabled:bg-gray-700 disabled:text-gray-500 text-white font-bold text-sm py-2.5 rounded-xl transition-all">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              {saving ? 'Creating…' : 'Create Entity'}
            </button>
            <button onClick={onClose} className="px-4 border border-white/15 text-gray-300 font-semibold text-sm py-2.5 rounded-xl hover:text-white">Cancel</button>
          </div>
        </div>
      </div>
    </div>, document.body
  );
}

// ─── Add Location Form ────────────────────────────────────────────────────────

function AddLocationForm({ corporateId, profile, entities, defaultEntityId, isFirstLocation, onSaved, onCancel, onEntityAdded }) {
  // Prefill the very first location's DBA name from the Company Name entered at
  // signup — most self-serve merchants are a single storefront, so re-typing the
  // same name here was pure friction. Only applies to the first location; later
  // locations (additional storefronts) start blank as before. 2026-07-07.
  const [dbaName, setDbaName] = useState(isFirstLocation ? (profile.legalName || '') : '');
  const [addressDisplay, setAddressDisplay] = useState('');
  const [parsedAddress, setParsedAddress] = useState(null);
  const [unverifiedWarning, setUnverifiedWarning] = useState(false);
  const [selectedEntityId, setSelectedEntityId] = useState(defaultEntityId || entities[0]?.entityId || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const addrRef = usePlacesCallbackRef((parsed) => { setAddressDisplay(parsed.display); setParsedAddress(parsed); setUnverifiedWarning(false); });
  // Add Entity inline — entity is created server-side inside addSelfServeLocation
  const [showAddEntity, setShowAddEntity] = useState(false);
  const [newEntityName, setNewEntityName] = useState('');
  const [newEntityEIN, setNewEntityEIN] = useState('');
  const newEntityEinDigits = newEntityEIN.replace(/\D/g, '');

  const doSave = async (addr) => {
    setSaving(true); setError('');
    try {
      // Validate street number if we have a parsed address
      if (addr && !addr.street.match(/^\d/)) {
        setError('Address must include a street number (e.g. "123 Main St"). Please select a more specific address.');
        setSaving(false);
        return;
      }
      const businessAddress = addr ? `${addr.street}, ${addr.city}, ${addr.state} ${addr.zip}` : addressDisplay.trim();
      const locRes = await base44.functions.invoke('addSelfServeLocation', {
        corporateId, dbaName: dbaName.trim(),
        businessAddress, businessStreet: addr?.street || '', businessCity: addr?.city || '',
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

  return (
    <div className="bg-[#1c2128] border border-amber-500/30 rounded-2xl p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-amber-500/15 flex items-center justify-center"><Plus className="w-4 h-4 text-amber-400" /></div>
          <h3 className="text-sm font-bold text-white">New Location</h3>
        </div>
        <button onClick={onCancel} className="text-gray-500 hover:text-white p-1.5 rounded-lg"><X className="w-4 h-4" /></button>
      </div>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Store / DBA Name *</label>
            <input value={dbaName} onChange={e => setDbaName(e.target.value)} placeholder="e.g. Main Street Cafe" className={inputCls} autoFocus />
          </div>
          <div>
            <label className={labelCls}>Physical Address *</label>
            {parsedAddress ? (
              <div className="flex items-center gap-2 bg-green-500/10 border border-green-500/20 rounded-xl px-3.5 py-2.5">
                <CheckCircle2 className="w-4 h-4 text-green-400 flex-shrink-0" />
                <span className="text-sm text-green-300 flex-1 truncate">{addressDisplay}</span>
                <button type="button" onClick={() => { setAddressDisplay(''); setParsedAddress(null); }}><X className="w-3.5 h-3.5 text-gray-500 hover:text-white" /></button>
              </div>
            ) : (
              <>
                <input ref={addrRef} type="text" value={addressDisplay}
                  onChange={e => { setAddressDisplay(e.target.value); setParsedAddress(null); setUnverifiedWarning(false); }}
                  onKeyDown={e => e.key === 'Enter' && e.preventDefault()}
                  placeholder="Start typing to search…" autoComplete="off" className={inputCls} />
                {unverifiedWarning && (
                  <div className="mt-2 bg-amber-500/10 border border-amber-500/20 rounded-xl p-3">
                    <p className="text-[11px] text-amber-300 font-semibold mb-2">Address not verified — delays may occur.</p>
                    <div className="flex gap-2">
                      <button type="button" onClick={() => doSave(null)} disabled={saving}
                        className="text-xs text-amber-300 border border-amber-500/30 rounded-lg px-3 py-1.5 hover:bg-amber-500/10">
                        {saving ? 'Saving…' : 'Continue Anyway'}
                      </button>
                      <button type="button" onClick={() => setUnverifiedWarning(false)} className="text-xs text-gray-400 hover:text-white">← Fix</button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* Entity selector — always shown so user can also add a new entity */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className={labelCls + ' mb-0'}>Legal Entity</label>
            <button type="button" onClick={() => setShowAddEntity(e => !e)}
              className="text-[11px] text-purple-400 hover:text-purple-300 flex items-center gap-1 transition-colors">
              <Plus className="w-3 h-3" /> New Legal Entity
            </button>
          </div>
          {showAddEntity ? (
            <div className="bg-[#111318] border border-purple-500/30 rounded-xl p-3 space-y-2">
              <p className="text-[10px] font-bold text-purple-300 uppercase tracking-wider">New Legal Entity</p>
              <input value={newEntityName} onChange={e => setNewEntityName(e.target.value)}
                placeholder="Legal Business Name" className={inputCls} autoFocus />
              <input value={newEntityEIN} onChange={e => setNewEntityEIN(e.target.value.replace(/\D/g,'').slice(0,9))}
                placeholder="Federal EIN (9 digits)" className={`${inputCls} font-mono`} />
              {newEntityEIN.length > 0 && newEntityEinDigits.length !== 9 && (
                <p className="text-[10px] text-amber-400">{newEntityEinDigits.length}/9 digits</p>
              )}
              <p className="text-[10px] text-gray-500">This entity will be created when you submit the location below.</p>
              <button type="button" onClick={() => { setShowAddEntity(false); setNewEntityName(''); setNewEntityEIN(''); }}
                className="text-xs text-gray-500 hover:text-white border border-white/10 px-3 py-2 rounded-lg transition-colors">Cancel</button>
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

        {error && <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-sm text-red-300">{error}</div>}
        <div className="flex gap-3 pt-1">
          <button type="submit" disabled={saving}
            className="flex items-center gap-2 bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 disabled:from-gray-600 disabled:to-gray-600 disabled:text-gray-400 text-black font-bold text-sm px-5 py-3 rounded-xl transition-all">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            {saving ? 'Adding…' : 'Add Location'}
          </button>
          <button type="button" onClick={onCancel} className="text-sm text-gray-400 hover:text-white border border-white/10 px-5 py-3 rounded-xl transition-colors">Cancel</button>
        </div>
      </form>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function OnboardingLocations({ profile, onContinue, onBack }) {
  const [currentProfile, setCurrentProfile] = useState(profile);
  const [entities, setEntities] = useState([]);
  const [locations, setLocations] = useState([]);
  const [merchantIDs, setMerchantIDs] = useState([]);
  const [loading, setLoading] = useState(true);
  // addFormEntityId: null = hidden, string = show form pre-targeted to that entity
  const [addFormEntityId, setAddFormEntityId] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [deleteMidConfirm, setDeleteMidConfirm] = useState(null);
  const [deleteEntityConfirm, setDeleteEntityConfirm] = useState(null);
  const [showBackConfirm, setShowBackConfirm] = useState(false);

  useEffect(() => { loadAll(); }, []);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [entRes, locRes, conRes] = await Promise.all([
        base44.functions.invoke('manageLegalEntity', { action: 'list', corporateId: profile.corporateId }),
        base44.functions.invoke('listLocations', { corporateId: profile.corporateId }),
        base44.functions.invoke('manageMerchantID', { action: 'list', corporateId: profile.corporateId }),
      ]);
      const loadedEntities = (entRes.data?.entities || []).map(e => ({
        ...e,
        mailingStreet: e.mailingStreet || '',
        mailingCity: e.mailingCity || '',
        mailingState: e.mailingState || '',
        mailingZip: e.mailingZip || '',
        ownershipType: e.ownershipType || '',
        taxClassType: e.taxClassType || '',
        establishmentYear: e.establishmentYear || '',
      }));
      const loadedLocations = (locRes.data?.locations || []).map(l => ({
        id: l.id || l.locationId, entityId: l.entityId || '',
        dbaName: l.dbaName, businessAddress: l.businessAddress,
        applicationStepStatus: l.applicationStepStatus || 'In Review', elavonMID: l.elavonMID,
      }));

      const enrichedEntities = loadedEntities;

      // If no entities exist yet, auto-seed one from the corporate profile so locations have somewhere to live
      let finalEntities = enrichedEntities;
      if (finalEntities.length === 0) {
        try {
          const seedRes = await base44.functions.invoke('manageLegalEntity', {
            action: 'add', corporateId: profile.corporateId,
            legalBusinessName: profile.legalName || 'Primary Entity',
            federalEIN: (profile.taxId || '').replace(/\D/g, ''),
          });
          if (seedRes.data?.entities?.length) finalEntities = seedRes.data.entities.map(e => ({ ...e, mailingStreet: e.mailingStreet || '', mailingCity: e.mailingCity || '', mailingState: e.mailingState || '', mailingZip: e.mailingZip || '', ownershipType: e.ownershipType || '', taxClassType: e.taxClassType || '', establishmentYear: e.establishmentYear || '' }));
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
    }
    finally { setLoading(false); }
  };

  const handleLocationSaved = async ({ entityId }) => {
    setAddFormEntityId(null);
    await loadAll();
  };

  const handleEntityAdded = (entity) => {
    if (entity) setEntities(prev => [...prev, entity]);
  };

  const handleEntityUpdated = (updated) => {
    setEntities(prev => prev.map(e => e.entityId === updated.entityId ? { ...e, ...updated } : e));
  };

  const handleDeleteLocation = async (loc) => {
    setDeleteConfirm(null);
    const idToDelete = loc.id || loc.locationId;
    if (!idToDelete) { alert('Cannot delete: location has no ID.'); return; }
    try {
      const res = await base44.functions.invoke('removeSelfServeLocation', { locationId: idToDelete });
      if (res.data?.error) throw new Error(res.data.error);
      setLocations(prev => prev.filter(l => (l.id || l.locationId) !== idToDelete));
      setMerchantIDs(prev => prev.filter(c => c.locationId !== idToDelete));
    } catch (err) {
      console.error('[handleDeleteLocation]', err);
      alert('Failed to delete location: ' + (err.message || 'Unknown error'));
    }
  };

  const handleDeleteMid = async (mid) => {
    setDeleteMidConfirm(null);
    try {
      const res = await base44.functions.invoke('manageMerchantID', { action: 'delete', corporateId: profile.corporateId, merchantIDId: mid.id });
      if (res.data?.error) throw new Error(res.data.error);
      setMerchantIDs(prev => prev.filter(c => c.id !== mid.id));
    } catch (err) {
      console.error('[handleDeleteMid]', err);
      alert('Failed to delete MID: ' + (err.message || 'Unknown error'));
    }
  };

  const handleDeleteEntity = async (entity) => {
    setDeleteEntityConfirm(null);
    try {
      const res = await base44.functions.invoke('manageLegalEntity', { action: 'delete', corporateId: profile.corporateId, entityId: entity.entityId });
      if (res.data?.error) throw new Error(res.data.error);
      setEntities(prev => prev.filter(e => e.entityId !== entity.entityId));
      // Reassign orphaned locations to first remaining entity
      setLocations(prev => prev.map(l => l.entityId === entity.entityId ? { ...l, entityId: entities.find(e => e.entityId !== entity.entityId)?.entityId || '' } : l));
    } catch (err) {
      console.error('[handleDeleteEntity]', err);
      alert('Failed to delete entity: ' + (err.message || 'Unknown error'));
    }
  };

  const onDragEnd = async ({ type, source, destination, draggableId }) => {
    if (!destination) return;
    if (source.droppableId === destination.droppableId && source.index === destination.index) return;

    if (type === 'LOCATION') {
      const locId = draggableId.replace('loc-', '');
      const targetEntityId = destination.droppableId;
      setLocations(prev => prev.map(l => l.id === locId ? { ...l, entityId: targetEntityId } : l));
      try {
        await base44.functions.invoke('batchUpdateStatus', { corporateId: profile.corporateId, action: 'moveToEntity', locationIds: [locId], targetEntityId });
      } catch (err) {
        console.error('[onDragEnd] moveToEntity failed', err);
        await loadAll();
      }
    } else if (type === 'MID') {
      const midId = draggableId.replace('mid-', '');
      const targetLocId = destination.droppableId.replace('mids-', '');
      setMerchantIDs(prev => prev.map(c => c.id === midId ? { ...c, locationId: targetLocId } : c));
      try {
        await base44.functions.invoke('manageMerchantID', { action: 'update', corporateId: profile.corporateId, merchantIDId: midId, locationId: targetLocId, data: { locationId: targetLocId } });
      } catch (err) {
        console.error('[onDragEnd] MID move failed', err);
        await loadAll();
      }
    }
  };

  const [showValidation, setShowValidation] = useState(false);

  const businessComplete = entities.length > 0 && entities.every(e =>
    e.ownershipType && e.taxClassType && e.establishmentYear && e.federalEIN
  );

  const totalMids = merchantIDs.length;
  const completeMids = merchantIDs.filter(c => c.mccCode && c.monthlyCardSales).length;

  const allMidsComplete = businessComplete && locations.length > 0 && locations.every(l =>
    merchantIDs.some(c => c.locationId === l.id && c.mccCode && c.monthlyCardSales)
  );

  // Build a list of specific validation issues for user feedback
  const validationIssues = [];
  if (!businessComplete) {
    entities.forEach(e => {
      const missing = [];
      if (!e.ownershipType) missing.push('Business Entity Type');
      if (!e.taxClassType) missing.push('IRS Tax Classification');
      if (!e.establishmentYear) missing.push('Year Established');
      if (!e.federalEIN) missing.push('Federal EIN');
      if (missing.length) validationIssues.push(`${e.legalBusinessName || 'Legal Entity'}: missing ${missing.join(', ')}`);
    });
  }
  if (locations.length === 0) {
    validationIssues.push('At least one location is required');
  } else {
    locations.forEach(l => {
      const mid = merchantIDs.find(c => c.locationId === l.id && c.mccCode && c.monthlyCardSales);
      if (!mid) validationIssues.push(`${l.dbaName}: MCC code and monthly volume are required`);
    });
  }

  if (loading) return (
    <div className="flex flex-col items-center justify-center py-24 gap-3">
      <Loader2 className="w-8 h-8 text-gray-500 animate-spin" />
      <p className="text-sm text-gray-500">Loading…</p>
    </div>
  );

  return (
    <div className="flex flex-col">
      {/* Header */}
      <div className="px-8 pt-8 pb-6 border-b border-white/10">
        <div className="inline-flex items-center gap-2 bg-blue-500/10 border border-blue-500/20 text-blue-300 text-xs font-semibold px-3 py-1.5 rounded-full mb-3">
          <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
          STEP 2 OF 4 — LOCATIONS &amp; MIDS
        </div>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold text-white mb-1.5">Locations &amp; Processing Setup</h2>
            <p className="text-gray-400 text-sm">Add locations under each legal entity, then fill in each MID's processing details.</p>
          </div>
          <button onClick={() => setShowBackConfirm(true)}
            className="flex-shrink-0 flex items-center gap-2 text-sm font-medium text-gray-300 border border-white/15 hover:border-white/30 hover:bg-white/5 px-4 py-2 rounded-xl transition-all">
            <ArrowLeft className="w-4 h-4" /> Back
          </button>
        </div>
      </div>

      {/* Stats bar */}
      {locations.length > 0 && (
        <div className="px-8 py-4 border-b border-white/5 flex flex-wrap gap-x-8 gap-y-2 items-center">
          <div><p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Locations</p><p className="text-lg font-bold text-white">{locations.length}</p></div>
          <div><p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">MIDs</p><p className="text-lg font-bold text-white">{totalMids}</p></div>
          <div>
            <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">MIDs Complete</p>
            <p className={`text-lg font-bold ${completeMids === totalMids && totalMids > 0 ? 'text-green-400' : 'text-amber-400'}`}>{completeMids}/{totalMids}</p>
          </div>
          {entities.length > 1 && <div><p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Legal Entities</p><p className="text-lg font-bold text-purple-400">{entities.length}</p></div>}
        </div>
      )}

      {/* Hierarchy: Entity → Locations → MIDs */}
      <div className="px-8 py-6 space-y-4">
        {/* Toolbar */}
        <div className="flex items-center justify-between">
          <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
            {entities.length > 1 ? `${entities.length} Legal Entities` : 'Org Structure'}
          </p>
        </div>

        <DragDropContext onDragEnd={onDragEnd}>
          <div className="space-y-4">
            {entities.map(entity => (
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
                onAddLocation={entityId => setAddFormEntityId(entityId)}
                isOnly={entities.length === 1}
                onEntityUpdated={handleEntityUpdated}
                onDeleteEntity={e => setDeleteEntityConfirm(e)}
                showValidation={showValidation}
              />
            ))}
          </div>
        </DragDropContext>

        {/* Add Location Form — shown below when triggered */}
        {addFormEntityId !== null && (
          <AddLocationForm
            corporateId={profile.corporateId}
            profile={profile}
            entities={entities}
            defaultEntityId={addFormEntityId}
            isFirstLocation={locations.length === 0}
            onSaved={handleLocationSaved}
            onCancel={() => setAddFormEntityId(null)}
            onEntityAdded={handleEntityAdded}
          />
        )}
      </div>

      {/* Footer */}
      <div className="px-8 pt-2 pb-8 border-t border-white/10 space-y-3">
        {/* Validation error banner — shown only after user attempts to continue */}
        {showValidation && !allMidsComplete && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-bold text-red-300 mb-2">Please fix the following before continuing:</p>
                <ul className="space-y-1">
                  {validationIssues.map((issue, i) => (
                    <li key={i} className="text-xs text-red-400 flex items-start gap-1.5">
                      <span className="mt-0.5 w-1 h-1 rounded-full bg-red-400 flex-shrink-0" />
                      {issue}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        )}
        <button
          onClick={() => {
            if (!allMidsComplete) { setShowValidation(true); return; }
            onContinue({ locations, legalEntities: entities, profile: currentProfile });
          }}
          className={`w-full flex items-center justify-center gap-3 font-bold py-4 px-6 rounded-xl text-base transition-all shadow-lg ${
            allMidsComplete
              ? 'bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 text-black shadow-amber-900/20'
              : showValidation
              ? 'bg-red-500/20 border border-red-500/40 text-red-300 hover:bg-red-500/25'
              : 'bg-gray-700 text-gray-500'
          }`}
        >
          Continue to Banking <ArrowRight className="w-5 h-5" />
        </button>
        {!showValidation && !allMidsComplete && (
          <p className="text-center text-xs text-gray-600">
            {!businessComplete
              ? 'Complete business details for each entity to continue.'
              : locations.length === 0
              ? 'Add at least one location to continue.'
              : `${totalMids - completeMids} MID${totalMids - completeMids !== 1 ? 's' : ''} still need MCC code and volume info.`}
          </p>
        )}
      </div>

      {/* Delete location confirm */}
      {deleteConfirm && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 px-4" onClick={() => setDeleteConfirm(null)}>
          <div className="bg-[#1c2128] border border-white/10 rounded-2xl shadow-2xl w-full max-w-sm p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-500/15 flex items-center justify-center flex-shrink-0"><AlertTriangle className="w-5 h-5 text-red-400" /></div>
              <div>
                <h3 className="font-bold text-white">Remove Location?</h3>
                <p className="text-xs text-gray-400 mt-0.5">"{deleteConfirm.dbaName}" and all its MIDs will be deleted.</p>
              </div>
            </div>
            <div className="flex gap-3">
              <button onClick={() => handleDeleteLocation(deleteConfirm)} className="flex-1 bg-red-500 hover:bg-red-400 text-white font-bold text-sm py-2.5 rounded-xl transition-all">Remove</button>
              <button onClick={() => setDeleteConfirm(null)} className="flex-1 border border-white/15 text-gray-300 font-semibold text-sm py-2.5 rounded-xl">Keep</button>
            </div>
          </div>
        </div>, document.body
      )}

      {/* Delete MID confirm */}
      {deleteMidConfirm && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 px-4" onClick={() => setDeleteMidConfirm(null)}>
          <div className="bg-[#1c2128] border border-white/10 rounded-2xl shadow-2xl w-full max-w-sm p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-500/15 flex items-center justify-center flex-shrink-0"><AlertTriangle className="w-5 h-5 text-red-400" /></div>
              <div>
                <h3 className="font-bold text-white">Remove MID?</h3>
                <p className="text-xs text-gray-400 mt-0.5">"{deleteMidConfirm.merchantName || deleteMidConfirm.dbaName}" will be permanently deleted.</p>
              </div>
            </div>
            <div className="flex gap-3">
              <button onClick={() => handleDeleteMid(deleteMidConfirm)} className="flex-1 bg-red-500 hover:bg-red-400 text-white font-bold text-sm py-2.5 rounded-xl transition-all">Remove</button>
              <button onClick={() => setDeleteMidConfirm(null)} className="flex-1 border border-white/15 text-gray-300 font-semibold text-sm py-2.5 rounded-xl">Keep</button>
            </div>
          </div>
        </div>, document.body
      )}

      {/* Delete entity confirm */}
      {deleteEntityConfirm && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 px-4" onClick={() => setDeleteEntityConfirm(null)}>
          <div className="bg-[#1c2128] border border-white/10 rounded-2xl shadow-2xl w-full max-w-sm p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-500/15 flex items-center justify-center flex-shrink-0"><AlertTriangle className="w-5 h-5 text-red-400" /></div>
              <div>
                <h3 className="font-bold text-white">Remove Legal Entity?</h3>
                <p className="text-xs text-gray-400 mt-0.5">"{deleteEntityConfirm.legalBusinessName}" will be removed. Its locations will become unassigned.</p>
              </div>
            </div>
            <div className="flex gap-3">
              <button onClick={() => handleDeleteEntity(deleteEntityConfirm)} className="flex-1 bg-red-500 hover:bg-red-400 text-white font-bold text-sm py-2.5 rounded-xl transition-all">Remove</button>
              <button onClick={() => setDeleteEntityConfirm(null)} className="flex-1 border border-white/15 text-gray-300 font-semibold text-sm py-2.5 rounded-xl">Keep</button>
            </div>
          </div>
        </div>, document.body
      )}

      {/* Back confirm */}
      {showBackConfirm && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 px-4" onClick={() => setShowBackConfirm(false)}>
          <div className="bg-[#1c2128] border border-white/10 rounded-2xl shadow-2xl w-full max-w-sm p-6" onClick={e => e.stopPropagation()}>
            <h3 className="font-bold text-white mb-2">Go Back?</h3>
            <p className="text-sm text-gray-400 mb-5">Your locations and MIDs are saved.</p>
            <div className="flex gap-3">
              <button onClick={() => { setShowBackConfirm(false); onBack(); }} className="flex-1 bg-white/10 hover:bg-white/15 text-white font-bold text-sm py-2.5 rounded-xl">Go Back</button>
              <button onClick={() => setShowBackConfirm(false)} className="flex-1 border border-white/15 text-gray-300 font-semibold text-sm py-2.5 rounded-xl">Stay</button>
            </div>
          </div>
        </div>, document.body
      )}
    </div>
  );
}
