import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import {
  Plus, ArrowRight, Loader2, Store, Landmark, Trash2, CheckCircle2,
  MapPin, Building2, CreditCard, ChevronDown, ChevronRight, X,
  AlertTriangle, Check, GripVertical, ArrowLeft, Pencil, Info
} from 'lucide-react';
import { base44 } from '@/api/base44Client';

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

// ─── Helpers ──────────────────────────────────────────────────────────────────

const inputCls = 'w-full bg-[#111318] border border-white/20 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent';
const labelCls = 'block text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5';

function formatEIN(raw) {
  const d = (raw || '').replace(/\D/g, '');
  return d.length >= 9 ? `${d.slice(0, 2)}-${d.slice(2, 9)}` : raw || '';
}

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
      onParsed({ street, city, state, zip, display: `${street}, ${city}, ${state} ${zip}` });
    });
    return () => window.google?.maps?.event?.clearInstanceListeners(ac);
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

// ─── MID Card ────────────────────────────────────────────────────────────────

function MidCard({ mid, locationId, corporateId, dbaName, index, onUpdated, onDelete }) {
  const [editing, setEditing] = useState(!mid.mccCode); // auto-open if stub
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

  const pctSum = (parseInt(form.cardPresentPct) || 0) + (parseInt(form.internetPct) || 0) + (parseInt(form.motoPct) || 0);
  const canSave = form.mccCode && pctSum === 100;
  const isComplete = !!(mid.mccCode && mid.monthlyCardSales);

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      const res = await base44.functions.invoke('manageMerchantID', {
        action: 'update', locationId, corporateId, merchantIDId: mid.id,
        data: { ...form, merchantName: form.merchantName || dbaName },
      });
      const saved = res.data?.updatedMerchantID || res.data?.merchantID;
      if (saved) { onUpdated(saved); setEditing(false); }
    } catch (_) {}
    finally { setSaving(false); }
  };

  return (
    <Draggable draggableId={`mid-${mid.id}`} index={index}>
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.draggableProps}
          className={`rounded-xl border transition-all ${snapshot.isDragging ? 'border-blue-500/60 bg-[#1a2235] shadow-xl rotate-1' : isComplete ? 'border-blue-500/20 bg-blue-500/5' : 'border-white/10 bg-white/[0.02]'}`}
        >
          <div className="flex items-center gap-2 px-3 py-2.5">
            {/* Drag handle */}
            <span {...provided.dragHandleProps} className="text-gray-600 hover:text-gray-300 cursor-grab active:cursor-grabbing flex-shrink-0">
              <GripVertical className="w-3.5 h-3.5" />
            </span>
            <CreditCard className={`w-3.5 h-3.5 flex-shrink-0 ${isComplete ? 'text-blue-400' : 'text-gray-500'}`} />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-white truncate">{form.merchantName || dbaName}</p>
              {isComplete
                ? <p className="text-[10px] text-blue-400/70 font-mono">{mid.mccCode} · ${Number(mid.monthlyCardSales || 0).toLocaleString()}/mo</p>
                : <p className="text-[10px] text-amber-400/80">Needs MCC &amp; volume →</p>
              }
            </div>
            <StatusBadge status={mid.applicationStepStatus || 'In Review'} />
            <button onClick={() => setEditing(e => !e)} className="p-1 text-gray-500 hover:text-amber-400 transition-colors">
              <Pencil className="w-3 h-3" />
            </button>
            <button onClick={() => onDelete(mid)} className="p-1 text-gray-600 hover:text-red-400 transition-colors">
              <Trash2 className="w-3 h-3" />
            </button>
          </div>

          {editing && (
            <div className="border-t border-white/5 px-3 pb-3 pt-2 space-y-2">
              <div>
                <label className={labelCls}>MID Label</label>
                <input value={form.merchantName} onChange={e => setForm(p => ({ ...p, merchantName: e.target.value }))}
                  placeholder={`e.g. ${dbaName} – Bar`} className={inputCls} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className={labelCls}>MCC Code *</label>
                  <select value={form.mccCode} onChange={e => setForm(p => ({ ...p, mccCode: e.target.value }))}
                    className={inputCls} style={{ colorScheme: 'dark' }}>
                    <option value="">Select…</option>
                    {MCC_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Industry Type</label>
                  <select value={form.industryType} onChange={e => setForm(p => ({ ...p, industryType: e.target.value }))}
                    className={inputCls} style={{ colorScheme: 'dark' }}>
                    <option value="">Select…</option>
                    {INDUSTRY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Monthly Volume ($)</label>
                  <input type="number" value={form.monthlyCardSales} onChange={e => setForm(p => ({ ...p, monthlyCardSales: e.target.value }))}
                    placeholder="e.g. 8000" className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Avg Sale ($)</label>
                  <input type="number" value={form.avgSaleAmount} onChange={e => setForm(p => ({ ...p, avgSaleAmount: e.target.value }))}
                    placeholder="e.g. 45" className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Highest Ticket ($)</label>
                  <input type="number" value={form.highestTicketAmount} onChange={e => setForm(p => ({ ...p, highestTicketAmount: e.target.value }))}
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
                        onChange={e => setForm(p => ({ ...p, [k]: e.target.value }))} className={inputCls} />
                    </div>
                  ))}
                </div>
                {pctSum !== 100 && <p className="text-[11px] text-amber-400 mt-1">Total: {pctSum}% (must be 100%)</p>}
              </div>
              <div className="flex gap-2 pt-1">
                <button onClick={handleSave} disabled={saving || !canSave}
                  className="flex items-center gap-1.5 bg-amber-500 hover:bg-amber-400 disabled:bg-gray-600 disabled:text-gray-400 text-black font-bold text-xs px-3 py-2 rounded-lg transition-all">
                  {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                  {saving ? 'Saving…' : 'Save'}
                </button>
                <button onClick={() => setEditing(false)} className="text-xs text-gray-400 hover:text-white border border-white/10 px-3 py-2 rounded-lg transition-colors">Cancel</button>
              </div>
            </div>
          )}
        </div>
      )}
    </Draggable>
  );
}

// ─── Location Card (org chart node) ──────────────────────────────────────────

function LocationOrgCard({ location, corporateId, merchantIDs, onDelete, onMerchantIDAdded, onMerchantIDUpdated, onMerchantIDDeleted, index }) {
  const locMids = merchantIDs.filter(c => c.locationId === location.id);
  const [expanded, setExpanded] = useState(locMids.length === 0 || locMids.some(m => !m.mccCode));
  const [addingMid, setAddingMid] = useState(false);
  const [addMidName, setAddMidName] = useState('');
  const [addMidSaving, setAddMidSaving] = useState(false);
  const allMidsComplete = locMids.length > 0 && locMids.every(m => m.mccCode && m.monthlyCardSales);

  const handleAddMid = async () => {
    setAddMidSaving(true);
    try {
      const res = await base44.functions.invoke('manageMerchantID', {
        action: 'add', locationId: location.id, corporateId,
        data: { merchantName: addMidName || location.dbaName, mccCode: '' },
      });
      const saved = res.data?.merchantID;
      if (saved) { onMerchantIDAdded(saved); setAddingMid(false); setAddMidName(''); }
    } catch (_) {}
    finally { setAddMidSaving(false); }
  };

  return (
    <Draggable draggableId={`loc-${location.id}`} index={index}>
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.draggableProps}
          className={`rounded-2xl border transition-all ${snapshot.isDragging ? 'border-amber-500/70 bg-[#1c2128] shadow-2xl -rotate-1' : allMidsComplete ? 'border-green-500/25 bg-[#1c2128]' : 'border-white/10 bg-[#1c2128] hover:border-white/20'}`}
        >
          {/* Location header */}
          <div className="flex items-center gap-2.5 px-4 py-3">
            <span {...provided.dragHandleProps} className="text-gray-600 hover:text-gray-300 cursor-grab active:cursor-grabbing flex-shrink-0">
              <GripVertical className="w-4 h-4" />
            </span>
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${allMidsComplete ? 'bg-green-500/15' : 'bg-amber-500/10'}`}>
              <Store className={`w-4 h-4 ${allMidsComplete ? 'text-green-400' : 'text-amber-400'}`} />
            </div>
            <div className="flex-1 min-w-0 cursor-pointer" onClick={() => setExpanded(e => !e)}>
              <p className="text-sm font-bold text-white truncate">{location.dbaName}</p>
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

          {/* MIDs list */}
          {expanded && (
            <div className="border-t border-white/5 px-4 pb-3 pt-2">
              <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-2">
                Merchant Applications (MIDs)
                <span className="ml-1 text-gray-600 normal-case">· drag to reorder</span>
              </p>
              <Droppable droppableId={`mids-${location.id}`} type="MID">
                {(dropProvided, dropSnapshot) => (
                  <div
                    ref={dropProvided.innerRef}
                    {...dropProvided.droppableProps}
                    className={`space-y-1.5 min-h-[32px] rounded-xl transition-colors ${dropSnapshot.isDraggingOver ? 'bg-blue-500/5 ring-1 ring-blue-500/30' : ''}`}
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
                        onDelete={onMerchantIDDeleted}
                      />
                    ))}
                    {dropProvided.placeholder}
                  </div>
                )}
              </Droppable>

              {/* Add MID */}
              {addingMid ? (
                <div className="mt-2 flex gap-2 items-center">
                  <input
                    value={addMidName}
                    onChange={e => setAddMidName(e.target.value)}
                    placeholder={`e.g. ${location.dbaName} – Bar`}
                    className={`${inputCls} text-xs py-2`}
                    autoFocus
                    onKeyDown={e => { if (e.key === 'Enter') handleAddMid(); if (e.key === 'Escape') setAddingMid(false); }}
                  />
                  <button onClick={handleAddMid} disabled={addMidSaving}
                    className="flex-shrink-0 flex items-center gap-1 bg-blue-500/20 border border-blue-500/30 text-blue-300 text-xs font-semibold px-3 py-2 rounded-lg hover:bg-blue-500/30 transition-colors disabled:opacity-50">
                    {addMidSaving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />} Add
                  </button>
                  <button onClick={() => setAddingMid(false)} className="flex-shrink-0 p-2 text-gray-500 hover:text-white"><X className="w-3 h-3" /></button>
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

// ─── Add Location Form ────────────────────────────────────────────────────────

function AddLocationForm({ corporateId, profile, entities, onSaved, onCancel }) {
  const hasEntities = entities.length > 0;
  const [dbaName, setDbaName] = useState('');
  const [addressDisplay, setAddressDisplay] = useState('');
  const [parsedAddress, setParsedAddress] = useState(null);
  const [unverifiedWarning, setUnverifiedWarning] = useState(false);
  const [entityChoice, setEntityChoice] = useState(hasEntities ? 'existing' : 'new');
  const [selectedEntityId, setSelectedEntityId] = useState(entities[0]?.entityId || '');
  const [newEntityName, setNewEntityName] = useState(!hasEntities ? (profile?.legalName || '') : '');
  const [newEntityEIN, setNewEntityEIN] = useState(() => {
    if (hasEntities) return '';
    return (profile?.taxId || '').replace(/\D/g, '').slice(0, 9);
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const addrRef = useRef(null);
  usePlacesAutocomplete(addrRef, (parsed) => { setAddressDisplay(parsed.display); setParsedAddress(parsed); setUnverifiedWarning(false); });

  const newEINDigits = newEntityEIN.replace(/\D/g, '');
  const newEntityValid = entityChoice !== 'new' || (newEntityName.trim().length > 0 && newEINDigits.length === 9);

  const doSave = async (addr) => {
    setSaving(true); setError('');
    try {
      let targetEntityId = entityChoice === 'existing' ? selectedEntityId : undefined;
      if (entityChoice === 'new') {
        const res = await base44.functions.invoke('manageLegalEntity', { action: 'add', corporateId, legalBusinessName: newEntityName.trim(), federalEIN: newEINDigits });
        if (res.data?.error) throw new Error(res.data.error);
        targetEntityId = res.data.entities[res.data.entities.length - 1]?.entityId;
      }
      const businessAddress = addr ? `${addr.street}, ${addr.city}, ${addr.state} ${addr.zip}` : addressDisplay.trim();
      const locRes = await base44.functions.invoke('addSelfServeLocation', {
        corporateId, entityId: targetEntityId, dbaName: dbaName.trim(),
        businessAddress, businessStreet: addr?.street || '', businessCity: addr?.city || '',
        businessState: addr?.state || '', businessZip: addr?.zip || '',
      });
      if (locRes.data?.error) throw new Error(locRes.data.error);
      onSaved({ location: locRes.data.location, merchantID: locRes.data.merchantID, reloadEntities: entityChoice === 'new' });
    } catch (err) { setError(err.message || 'Failed to save.'); }
    finally { setSaving(false); }
  };

  const handleSubmit = async (e) => {
    e.preventDefault(); setError('');
    if (!dbaName.trim()) { setError('Store name is required.'); return; }
    if (!addressDisplay.trim()) { setError('Address is required.'); return; }
    if (entityChoice === 'new' && !newEntityName.trim()) { setError('Legal business name is required.'); return; }
    if (entityChoice === 'new' && newEINDigits.length !== 9) { setError('A valid 9-digit EIN is required.'); return; }
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
        <button onClick={onCancel} className="text-gray-500 hover:text-white p-1.5 rounded-lg transition-colors"><X className="w-4 h-4" /></button>
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

        <div>
          <label className={labelCls}>Legal Entity *</label>
          {hasEntities && (
            <div className="flex gap-2 mb-3">
              <button type="button" onClick={() => setEntityChoice('existing')}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-semibold border transition-all ${entityChoice === 'existing' ? 'bg-amber-500/15 border-amber-500/40 text-amber-300' : 'bg-white/5 border-white/10 text-gray-400 hover:text-white'}`}>
                <Building2 className="w-3.5 h-3.5" /> Use Existing Entity
              </button>
              <button type="button" onClick={() => setEntityChoice('new')}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-semibold border transition-all ${entityChoice === 'new' ? 'bg-purple-500/15 border-purple-500/40 text-purple-300' : 'bg-white/5 border-white/10 text-gray-400 hover:text-white'}`}>
                <Plus className="w-3.5 h-3.5" /> New EIN / Entity
              </button>
            </div>
          )}
          {entityChoice === 'existing' && hasEntities && (
            <select value={selectedEntityId} onChange={e => setSelectedEntityId(e.target.value)} className={inputCls} style={{ colorScheme: 'dark' }}>
              {entities.map(e => <option key={e.entityId} value={e.entityId}>{e.legalBusinessName} {e.federalEIN ? `— ${formatEIN(e.federalEIN)}` : ''}</option>)}
            </select>
          )}
          {entityChoice === 'new' && (
            <div className="bg-white/[0.02] border border-purple-500/20 rounded-xl p-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Legal Business Name *</label>
                  <input value={newEntityName} onChange={e => setNewEntityName(e.target.value)} placeholder="e.g. Main St LLC" className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Federal EIN *</label>
                  <input value={newEntityEIN} onChange={e => setNewEntityEIN(e.target.value.replace(/\D/g, '').slice(0, 9))}
                    placeholder="9 digits" className={`${inputCls} ${newEntityEIN.length > 0 && newEINDigits.length !== 9 ? 'border-amber-500/50' : ''}`} />
                  {newEntityEIN.length > 0 && newEINDigits.length !== 9 && <p className="text-[10px] text-amber-400 mt-1">{newEINDigits.length}/9 digits</p>}
                  {newEINDigits.length === 9 && <p className="text-[10px] text-green-400 mt-1 flex items-center gap-1"><Check className="w-3 h-3" /> Valid EIN</p>}
                </div>
              </div>
            </div>
          )}
        </div>

        {error && <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-sm text-red-300">{error}</div>}
        <div className="flex gap-3 pt-1">
          <button type="submit" disabled={saving || !newEntityValid}
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
  const [entities, setEntities] = useState([]);
  const [locations, setLocations] = useState([]);
  const [merchantIDs, setMerchantIDs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [deleteMidConfirm, setDeleteMidConfirm] = useState(null);
  const [showBackConfirm, setShowBackConfirm] = useState(false);
  const [movingItem, setMovingItem] = useState(false);

  useEffect(() => { loadAll(); }, []);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [entRes, locRes, conRes] = await Promise.all([
        base44.functions.invoke('manageLegalEntity', { action: 'list', corporateId: profile.corporateId }),
        base44.functions.invoke('listLocations', { corporateId: profile.corporateId }),
        base44.functions.invoke('manageMerchantID', { action: 'list', corporateId: profile.corporateId }),
      ]);
      const loadedEntities = entRes.data?.entities || [];
      const loadedLocations = (locRes.data?.locations || []).map(l => ({
        id: l.id || l.locationId, entityId: l.entityId || '',
        dbaName: l.dbaName, businessAddress: l.businessAddress,
        applicationStepStatus: l.applicationStepStatus || 'In Review', elavonMID: l.elavonMID,
      }));
      setEntities(loadedEntities);
      setLocations(loadedLocations);
      setMerchantIDs(conRes.data?.merchantIDs || []);
      if (loadedLocations.length === 0) setShowAddForm(true);
    } catch (_) {}
    finally { setLoading(false); }
  };

  const handleLocationSaved = async ({ merchantID }) => {
    setShowAddForm(false);
    if (merchantID) setMerchantIDs(prev => [...prev, merchantID]);
    await loadAll();
  };

  const handleDeleteLocation = async (loc) => {
    setDeleteConfirm(null);
    try {
      await base44.functions.invoke('removeSelfServeLocation', { locationId: loc.id });
      const remaining = locations.filter(l => l.id !== loc.id && l.entityId === loc.entityId);
      setLocations(prev => prev.filter(l => l.id !== loc.id));
      setMerchantIDs(prev => prev.filter(c => c.locationId !== loc.id));
      if (remaining.length === 0 && loc.entityId) {
        try { await base44.functions.invoke('manageLegalEntity', { action: 'delete', corporateId: profile.corporateId, entityId: loc.entityId }); } catch (_) {}
        setEntities(prev => prev.filter(e => e.entityId !== loc.entityId));
      }
    } catch (_) {}
  };

  const handleDeleteMid = async (mid) => {
    setDeleteMidConfirm(null);
    try {
      await base44.functions.invoke('manageMerchantID', { action: 'delete', corporateId: profile.corporateId, merchantIDId: mid.id });
      setMerchantIDs(prev => prev.filter(c => c.id !== mid.id));
    } catch (_) {}
  };

  const handleMerchantIDUpdated = (updated) => {
    setMerchantIDs(prev => prev.map(c => c.id === updated.id ? { ...c, ...updated } : c));
  };

  // Drag and drop handler
  const onDragEnd = async ({ type, source, destination, draggableId }) => {
    if (!destination) return;
    if (source.droppableId === destination.droppableId && source.index === destination.index) return;

    if (type === 'LOCATION') {
      // Moving a location between entities (droppableId = entityId)
      const locId = draggableId.replace('loc-', '');
      const targetEntityId = destination.droppableId;
      if (!targetEntityId || targetEntityId === 'unassigned') return;

      // Optimistic update
      setLocations(prev => prev.map(l => l.id === locId ? { ...l, entityId: targetEntityId } : l));
      setMovingItem(true);
      try {
        await base44.functions.invoke('batchUpdateStatus', { corporateId: profile.corporateId, action: 'moveToEntity', locationIds: [locId], targetEntityId });
      } catch (_) {
        await loadAll(); // revert on error
      } finally { setMovingItem(false); }
    } else if (type === 'MID') {
      // Moving a MID between locations (droppableId = `mids-${locationId}`)
      const midId = draggableId.replace('mid-', '');
      const targetLocId = destination.droppableId.replace('mids-', '');
      const targetLoc = locations.find(l => l.id === targetLocId);
      if (!targetLoc) return;

      // Optimistic update
      setMerchantIDs(prev => prev.map(c => c.id === midId ? { ...c, locationId: targetLocId } : c));
      setMovingItem(true);
      try {
        await base44.functions.invoke('manageMerchantID', { action: 'update', corporateId: profile.corporateId, merchantIDId: midId, locationId: targetLocId, data: { locationId: targetLocId } });
      } catch (_) {
        await loadAll(); // revert on error
      } finally { setMovingItem(false); }
    }
  };

  // Group locations by entity
  const grouped = {};
  locations.forEach(l => {
    const key = l.entityId || 'unassigned';
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(l);
  });

  const allMidsComplete = locations.length > 0 && locations.every(l =>
    merchantIDs.some(c => c.locationId === l.id && c.mccCode && c.monthlyCardSales)
  );

  const totalMids = merchantIDs.length;
  const completeMids = merchantIDs.filter(c => c.mccCode && c.monthlyCardSales).length;

  if (loading) return (
    <div className="flex flex-col items-center justify-center py-24 gap-3">
      <Loader2 className="w-8 h-8 text-gray-500 animate-spin" />
      <p className="text-sm text-gray-500">Loading your org structure…</p>
    </div>
  );

  return (
    <div className="flex flex-col">
      {/* Header */}
      <div className="px-8 pt-8 pb-6 border-b border-white/10">
        <div className="inline-flex items-center gap-2 bg-blue-500/10 border border-blue-500/20 text-blue-300 text-xs font-semibold px-3 py-1.5 rounded-full mb-3">
          <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
          STEP 2 OF 3 — ORG STRUCTURE &amp; MIDS
        </div>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold text-white mb-1.5">Build Your Merchant Org Chart</h2>
            <p className="text-gray-400 text-sm">Add locations, assign them to legal entities, and fill out each MID's processing details. Drag to reorganize.</p>
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
          {entities.length > 1 && <div><p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Legal Entities</p><p className="text-lg font-bold text-amber-400">{entities.length}</p></div>}
          {movingItem && <div className="ml-auto flex items-center gap-2 text-xs text-gray-400"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Saving…</div>}
        </div>
      )}

      {/* Org chart */}
      <div className="px-8 py-6">
        {locations.length === 0 && !showAddForm && (
          <div className="text-center py-16 border border-dashed border-white/10 rounded-2xl">
            <Store className="w-12 h-12 text-gray-600 mx-auto mb-4" />
            <p className="text-sm font-semibold text-gray-400">No locations yet</p>
            <p className="text-xs text-gray-600 mt-1">Add your first storefront below.</p>
          </div>
        )}

        <DragDropContext onDragEnd={onDragEnd}>
          <div className="space-y-6">
            {entities.map(entity => {
              const entityLocs = grouped[entity.entityId] || [];
              return (
                <div key={entity.entityId} className="bg-white/[0.015] border border-white/8 rounded-2xl overflow-hidden">
                  {/* Entity header */}
                  <div className="flex items-center gap-3 px-5 py-3 bg-white/[0.02] border-b border-white/5">
                    <Building2 className="w-4 h-4 text-amber-400/70 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <span className="text-xs font-bold text-amber-300/90 uppercase tracking-wider">{entity.legalBusinessName}</span>
                      {entity.federalEIN && <span className="ml-2 text-[10px] text-gray-500 font-mono">{formatEIN(entity.federalEIN)}</span>}
                    </div>
                    <span className="text-[10px] text-gray-500">{entityLocs.length} location{entityLocs.length !== 1 ? 's' : ''}</span>
                  </div>

                  {/* Drop zone for locations */}
                  <Droppable droppableId={entity.entityId} type="LOCATION">
                    {(provided, snapshot) => (
                      <div
                        ref={provided.innerRef}
                        {...provided.droppableProps}
                        className={`p-3 space-y-2 min-h-[56px] transition-colors ${snapshot.isDraggingOver ? 'bg-amber-500/5' : ''}`}
                      >
                        {entityLocs.map((loc, idx) => (
                          <LocationOrgCard
                            key={loc.id}
                            location={loc}
                            index={idx}
                            corporateId={profile.corporateId}
                            merchantIDs={merchantIDs}
                            onDelete={l => setDeleteConfirm(l)}
                            onMerchantIDAdded={c => setMerchantIDs(prev => [...prev, c])}
                            onMerchantIDUpdated={handleMerchantIDUpdated}
                            onMerchantIDDeleted={m => setDeleteMidConfirm(m)}
                          />
                        ))}
                        {provided.placeholder}
                        {entityLocs.length === 0 && !snapshot.isDraggingOver && (
                          <p className="text-center text-xs text-gray-600 py-3">Drop a location here</p>
                        )}
                      </div>
                    )}
                  </Droppable>
                </div>
              );
            })}

            {/* Unassigned locations */}
            {(grouped['unassigned'] || []).length > 0 && (
              <div className="bg-white/[0.015] border border-dashed border-white/10 rounded-2xl overflow-hidden">
                <div className="px-5 py-3 border-b border-white/5">
                  <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">Unassigned Locations</span>
                </div>
                <Droppable droppableId="unassigned" type="LOCATION">
                  {(provided) => (
                    <div ref={provided.innerRef} {...provided.droppableProps} className="p-3 space-y-2 min-h-[56px]">
                      {(grouped['unassigned'] || []).map((loc, idx) => (
                        <LocationOrgCard key={loc.id} location={loc} index={idx} corporateId={profile.corporateId} merchantIDs={merchantIDs}
                          onDelete={l => setDeleteConfirm(l)} onMerchantIDAdded={c => setMerchantIDs(prev => [...prev, c])}
                          onMerchantIDUpdated={handleMerchantIDUpdated} onMerchantIDDeleted={m => setDeleteMidConfirm(m)} />
                      ))}
                      {provided.placeholder}
                    </div>
                  )}
                </Droppable>
              </div>
            )}
          </div>
        </DragDropContext>

        {/* Hint when multiple entities */}
        {entities.length > 1 && locations.length > 0 && (
          <div className="mt-4 flex items-center gap-2 bg-white/[0.02] border border-white/5 rounded-xl px-4 py-2.5">
            <Info className="w-3.5 h-3.5 text-gray-500 flex-shrink-0" />
            <p className="text-[11px] text-gray-500">Drag location cards between entity sections to reassign them. Drag MID cards between locations to move them.</p>
          </div>
        )}

        {/* Add Location Form */}
        {showAddForm && (
          <div className="mt-4">
            <AddLocationForm corporateId={profile.corporateId} profile={profile} entities={entities}
              onSaved={handleLocationSaved} onCancel={() => setShowAddForm(false)} />
          </div>
        )}

        {/* Add Location button */}
        {!showAddForm && (
          <button onClick={() => setShowAddForm(true)}
            className="mt-4 w-full flex items-center justify-center gap-2 border border-dashed border-white/15 hover:border-amber-500/40 hover:bg-amber-500/5 rounded-2xl py-4 text-sm font-semibold text-gray-500 hover:text-amber-400 transition-all">
            <Plus className="w-4 h-4" /> Add {locations.length > 0 ? 'Another' : 'a'} Location
          </button>
        )}
      </div>

      {/* Footer */}
      <div className="px-8 pt-2 pb-8 border-t border-white/10 space-y-3">
        <button onClick={() => onContinue({ locations, legalEntities: entities })}
          disabled={!allMidsComplete}
          className="w-full flex items-center justify-center gap-3 bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 disabled:from-gray-700 disabled:to-gray-700 disabled:text-gray-500 text-black font-bold py-4 px-6 rounded-xl text-base transition-all shadow-lg shadow-amber-900/20">
          Continue to Banking <ArrowRight className="w-5 h-5" />
        </button>
        {locations.length === 0 && <p className="text-center text-xs text-gray-600">Add at least one location to continue.</p>}
        {locations.length > 0 && !allMidsComplete && (
          <p className="text-center text-xs text-amber-600/80">
            {completeMids < totalMids
              ? `${totalMids - completeMids} MID${totalMids - completeMids > 1 ? 's' : ''} still need MCC code and volume info.`
              : 'Each location needs at least one MID with MCC and monthly volume filled in.'}
          </p>
        )}
      </div>

      {/* Delete location confirm */}
      {deleteConfirm && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 px-4" onClick={() => setDeleteConfirm(null)}>
          <div className="bg-[#1c2128] border border-white/10 rounded-2xl shadow-2xl w-full max-w-sm p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-500/15 flex items-center justify-center flex-shrink-0">
                <AlertTriangle className="w-5 h-5 text-red-400" />
              </div>
              <div>
                <h3 className="font-bold text-white">Remove Location?</h3>
                <p className="text-xs text-gray-400 mt-0.5">"{deleteConfirm.dbaName}" and all its MIDs will be deleted.</p>
              </div>
            </div>
            <div className="flex gap-3">
              <button onClick={() => handleDeleteLocation(deleteConfirm)} className="flex-1 bg-red-500 hover:bg-red-400 text-white font-bold text-sm py-2.5 rounded-xl transition-all">Remove</button>
              <button onClick={() => setDeleteConfirm(null)} className="flex-1 border border-white/15 text-gray-300 hover:text-white font-semibold text-sm py-2.5 rounded-xl transition-all">Keep</button>
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
              <button onClick={() => setDeleteMidConfirm(null)} className="flex-1 border border-white/15 text-gray-300 font-semibold text-sm py-2.5 rounded-xl transition-all">Keep</button>
            </div>
          </div>
        </div>, document.body
      )}

      {/* Back confirm */}
      {showBackConfirm && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 px-4" onClick={() => setShowBackConfirm(false)}>
          <div className="bg-[#1c2128] border border-white/10 rounded-2xl shadow-2xl w-full max-w-sm p-6" onClick={e => e.stopPropagation()}>
            <h3 className="font-bold text-white mb-2">Go Back?</h3>
            <p className="text-sm text-gray-400 mb-5">Your locations and MIDs are saved. You can return here anytime.</p>
            <div className="flex gap-3">
              <button onClick={() => { setShowBackConfirm(false); onBack(); }} className="flex-1 bg-white/10 hover:bg-white/15 text-white font-bold text-sm py-2.5 rounded-xl transition-all">Go Back</button>
              <button onClick={() => setShowBackConfirm(false)} className="flex-1 border border-white/15 text-gray-300 font-semibold text-sm py-2.5 rounded-xl transition-all">Stay</button>
            </div>
          </div>
        </div>, document.body
      )}
    </div>
  );
}