import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  Plus, ArrowRight, Loader2, Store, Landmark, Trash2, CheckCircle2, AlertCircle,
  MapPin, Building2, CreditCard, ChevronDown, ChevronRight, Pencil, X,
  AlertTriangle, Check, Banknote, GripVertical, Layers, ArrowLeft
} from 'lucide-react';
import { base44 } from '@/api/base44Client';

// ─── Constants ───────────────────────────────────────────────────────────────

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

// ─── Sub-components ───────────────────────────────────────────────────────────

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

function SectionHeader({ icon: Icon, title, color = 'amber' }) {
  const colors = { amber: 'text-amber-400', blue: 'text-blue-400', green: 'text-green-400', purple: 'text-purple-400' };
  return (
    <div className="flex items-center gap-2 mb-3">
      <Icon className={`w-4 h-4 ${colors[color]}`} />
      <h4 className="text-xs font-bold text-gray-300 uppercase tracking-wider">{title}</h4>
    </div>
  );
}

// Banking panel — handles Plaid + manual per-location
function BankingPanel({ location, corporateId, plaidAccounts, onAccountsConnected, bankDetails, savedEntityBankDetails, onBankSaved }) {
  const entityId = location.entityId || '';
  const entityAccounts = plaidAccounts[entityId] || [];
  // A sibling in the same entity already has manual bank details we can reuse
  const reuseManual = !bankDetails?.routingNumber && savedEntityBankDetails?.authMethod === 'Manual' ? savedEntityBankDetails : null;

  const [mode, setMode] = useState(() => {
    if (bankDetails?.authMethod === 'Manual') return 'manual';
    if (entityAccounts.length > 0) return 'plaid';
    return 'connect';
  });
  const [selectedId, setSelectedId] = useState(() => {
    if (bankDetails?.routingNumber && bankDetails?.authMethod !== 'Manual') return 'saved';
    return entityAccounts[0]?.accountId || '';
  });
  const [routing, setRouting] = useState(bankDetails?.authMethod === 'Manual' ? (bankDetails?.routingNumber || '') : '');
  const [account, setAccount] = useState(bankDetails?.authMethod === 'Manual' ? (bankDetails?.accountNumber || '') : '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(!!(bankDetails?.routingNumber));
  const [connecting, setConnecting] = useState(false);
  const [plaidError, setPlaidError] = useState('');

  useEffect(() => {
    if (entityAccounts.length > 0 && mode === 'connect') setMode('plaid');
  }, [entityAccounts.length]);

  const handlePlaidConnect = async () => {
    setConnecting(true); setPlaidError('');
    try {
      const tokenRes = await base44.functions.invoke('createPlaidLinkToken', { corporateId });
      const linkToken = tokenRes.data?.link_token;
      if (!linkToken) { setPlaidError('Could not initialize bank connection.'); setConnecting(false); return; }
      if (!window.Plaid) { setPlaidError('Plaid not available.'); setConnecting(false); return; }
      const handler = window.Plaid.create({
        token: linkToken,
        onSuccess: async (publicToken, metadata) => {
          try {
            const res = await base44.functions.invoke('exchangePlaidToken', { publicToken, accountId: metadata.account_id });
            const accounts = res.data?.accounts || [];
            onAccountsConnected(entityId, accounts);
            if (accounts[0]) {
              setSelectedId(accounts[0].accountId);
              setMode('plaid');
              await saveBank({ routingNumber: accounts[0].routingNumber, accountNumber: accounts[0].accountNumber, authMethod: 'Plaid', accountNumberMasked: `••••${accounts[0].mask || ''}` });
            }
          } catch (_) { setPlaidError('Failed to retrieve account from Plaid.'); }
          finally { setConnecting(false); }
        },
        onExit: () => setConnecting(false),
      });
      handler.open();
    } catch (_) { setPlaidError('Connection failed.'); setConnecting(false); }
  };

  const saveBank = async (details) => {
    setSaving(true);
    try {
      await base44.functions.invoke('saveLocationBankDetails', { locations: [{ id: location.id, bankDetails: details }] });
      setSaved(true);
      onBankSaved(location.id, details, entityId);
    } catch (_) {}
    finally { setSaving(false); }
  };

  const handlePlaidSelect = async (accountId) => {
    setSelectedId(accountId);
    const acct = entityAccounts.find(a => a.accountId === accountId);
    if (!acct) return;
    await saveBank({ routingNumber: acct.routingNumber, accountNumber: acct.accountNumber, authMethod: 'Plaid', accountNumberMasked: `••••${acct.mask || ''}` });
  };

  const handleManualSave = async () => {
    if (routing.length !== 9 || account.length < 4) return;
    await saveBank({ routingNumber: routing, accountNumber: account, authMethod: 'Manual', accountNumberMasked: `••••${account.slice(-4)}` });
  };

  if (saved && mode !== 'manual') {
    const acct = entityAccounts.find(a => a.accountId === selectedId);
    const displayAccount = bankDetails?.accountNumberMasked || (acct ? `••••${acct.mask || ''}` : '••••');
    return (
      <div className="flex items-center justify-between bg-green-500/10 border border-green-500/20 rounded-xl px-4 py-3">
        <div className="flex items-center gap-2.5">
          <CheckCircle2 className="w-4 h-4 text-green-400 flex-shrink-0" />
          <div>
            <p className="text-xs font-bold text-green-300">{bankDetails?.authMethod === 'Plaid' ? 'Bank Linked via Plaid' : 'Manual Bank Entry'}</p>
            <p className="text-[11px] text-green-400/70 font-mono">{displayAccount} · {bankDetails?.routingNumber?.slice(-4) ? `Routing ••••${bankDetails.routingNumber.slice(-4)}` : 'Routing set'}</p>
          </div>
        </div>
        <button onClick={() => { setSaved(false); setMode('connect'); }} className="text-[10px] text-gray-500 hover:text-white border border-white/10 rounded-lg px-2.5 py-1 transition-colors">Change</button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Reuse banner for Plaid-mode — show at the top when a sibling already linked Plaid */}
      {reuseManual && mode !== 'manual' && (
        <div className="flex items-center justify-between bg-blue-500/10 border border-blue-500/20 rounded-xl px-3.5 py-2.5">
          <div className="flex items-center gap-2">
            <Banknote className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" />
            <div>
              <p className="text-xs font-semibold text-blue-300">Another location uses this account</p>
              <p className="text-[11px] text-blue-400/70 font-mono">{reuseManual.accountNumberMasked} · Routing ••••{reuseManual.routingNumber?.slice(-4)}</p>
            </div>
          </div>
          <button
            onClick={() => saveBank(reuseManual)}
            disabled={saving}
            className="text-xs font-bold text-blue-300 border border-blue-500/30 rounded-lg px-2.5 py-1.5 hover:bg-blue-500/15 transition-colors disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Use Same'}
          </button>
        </div>
      )}
      {/* Mode toggle */}
      <div className="flex gap-2">
        <button
          onClick={() => setMode('connect')}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-semibold border transition-all ${mode === 'connect' || mode === 'plaid' ? 'bg-amber-500/15 border-amber-500/40 text-amber-300' : 'bg-white/5 border-white/10 text-gray-400 hover:text-white'}`}
        >
          <Landmark className="w-3.5 h-3.5" /> Plaid (Instant)
        </button>
        <button
          onClick={() => setMode('manual')}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-semibold border transition-all ${mode === 'manual' ? 'bg-blue-500/15 border-blue-500/40 text-blue-300' : 'bg-white/5 border-white/10 text-gray-400 hover:text-white'}`}
        >
          <Banknote className="w-3.5 h-3.5" /> Manual Entry
        </button>
      </div>

      {(mode === 'connect' || mode === 'plaid') && (
        <div className="space-y-2">
          {entityAccounts.length > 0 ? (
            <select
              value={selectedId}
              onChange={(e) => handlePlaidSelect(e.target.value)}
              className={inputCls}
              style={{ colorScheme: 'dark' }}
            >
              <option value="">Select account…</option>
              {entityAccounts.map(a => (
                <option key={a.accountId} value={a.accountId}>
                  {a.name} — ••••{a.mask || (a.accountNumber || '').slice(-4)}
                </option>
              ))}
            </select>
          ) : (
            <button
              onClick={handlePlaidConnect}
              disabled={connecting}
              className="w-full flex items-center justify-center gap-2 border border-dashed border-amber-500/40 hover:border-amber-400 hover:bg-amber-500/10 rounded-xl py-3 text-sm font-semibold text-amber-400 transition-all disabled:opacity-50"
            >
              {connecting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Landmark className="w-4 h-4" />}
              {connecting ? 'Connecting…' : 'Link Bank Account via Plaid'}
            </button>
          )}
          {plaidError && <p className="text-[11px] text-red-400">{plaidError}</p>}
        </div>
      )}

      {mode === 'manual' && (
        <div className="space-y-2">
          {/* Reuse banner — shown when a sibling location in the same entity already has manual details */}
          {reuseManual && !routing && (
            <div className="flex items-center justify-between bg-blue-500/10 border border-blue-500/20 rounded-xl px-3.5 py-2.5">
              <div className="flex items-center gap-2">
                <Banknote className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" />
                <div>
                  <p className="text-xs font-semibold text-blue-300">Another location uses this account</p>
                  <p className="text-[11px] text-blue-400/70 font-mono">{reuseManual.accountNumberMasked} · Routing ••••{reuseManual.routingNumber?.slice(-4)}</p>
                </div>
              </div>
              <button
                onClick={() => saveBank(reuseManual)}
                disabled={saving}
                className="text-xs font-bold text-blue-300 border border-blue-500/30 rounded-lg px-2.5 py-1.5 hover:bg-blue-500/15 transition-colors disabled:opacity-50"
              >
                {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Use Same'}
              </button>
            </div>
          )}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={labelCls}>Routing # (9 digits)</label>
              <input type="text" value={routing} maxLength={9}
                onChange={e => setRouting(e.target.value.replace(/\D/g, '').slice(0, 9))}
                placeholder="021000021" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Account #</label>
              <input type="text" value={account} maxLength={17}
                onChange={e => setAccount(e.target.value.replace(/\D/g, '').slice(0, 17))}
                placeholder="000123456789" className={inputCls} />
            </div>
          </div>
          <button
            onClick={handleManualSave}
            disabled={saving || routing.length !== 9 || account.length < 4}
            className="w-full flex items-center justify-center gap-2 bg-blue-500/20 hover:bg-blue-500/30 border border-blue-500/30 disabled:opacity-40 text-blue-300 font-semibold text-sm py-2.5 rounded-xl transition-all"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            {saving ? 'Saving…' : 'Save Bank Details'}
          </button>
        </div>
      )}
    </div>
  );
}

// MID form — used for both editing the primary MID and adding additional ones
function MidForm({ locationId, corporateId, dbaName, mid, onSaved, onCancel, isFirst }) {
  const blankForm = { conceptName: dbaName || '', mccCode: '', industryType: '', monthlyCardSales: '', avgSaleAmount: '', highestTicketAmount: '', cardPresentPct: '100', internetPct: '0', motoPct: '0', productDescription: '' };
  const [form, setForm] = useState(mid ? {
    conceptName: mid.conceptName || mid.dbaName || dbaName || '',
    mccCode: mid.mccCode || '',
    industryType: mid.industryType || '',
    monthlyCardSales: mid.monthlyCardSales || '',
    avgSaleAmount: mid.avgSaleAmount || '',
    highestTicketAmount: mid.highestTicketAmount || '',
    cardPresentPct: mid.cardPresentPct || '100',
    internetPct: mid.internetPct || '0',
    motoPct: mid.motoPct || '0',
    productDescription: mid.productDescription || '',
  } : blankForm);
  const [saving, setSaving] = useState(false);

  const pctSum = (parseInt(form.cardPresentPct) || 0) + (parseInt(form.internetPct) || 0) + (parseInt(form.motoPct) || 0);
  const canSave = form.mccCode && pctSum === 100;

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      const action = mid?.id ? 'update' : 'add';
      const res = await base44.functions.invoke('manageConcept', {
        action, locationId, corporateId,
        ...(mid?.id ? { conceptId: mid.id } : {}),
        data: { ...form, conceptName: form.conceptName || dbaName },
      });
      const saved = res.data?.concept || res.data?.updatedConcept;
      if (saved) onSaved(saved);
    } catch (_) {}
    finally { setSaving(false); }
  };

  return (
    <div className="space-y-3">
      {!isFirst && (
        <div>
          <label className={labelCls}>MID Label</label>
          <input value={form.conceptName} onChange={e => setForm(p => ({ ...p, conceptName: e.target.value }))}
            placeholder={`e.g. ${dbaName} – Bar`} className={inputCls} autoFocus />
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
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
          {[['cardPresentPct','In-Person'], ['internetPct','Online'], ['motoPct','MOTO']].map(([k, lbl]) => (
            <div key={k}>
              <span className="text-[10px] text-gray-500 mb-1 block">{lbl}</span>
              <input type="number" min="0" max="100" value={form[k]} onChange={e => setForm(p => ({ ...p, [k]: e.target.value }))} className={inputCls} />
            </div>
          ))}
        </div>
        {pctSum !== 100 && <p className="text-[11px] text-amber-400 mt-1">Total: {pctSum}% (must be 100%)</p>}
      </div>
      <div className="flex gap-2 pt-1">
        <button onClick={handleSave} disabled={saving || !canSave}
          className="flex items-center gap-2 bg-amber-500 hover:bg-amber-400 disabled:bg-gray-600 disabled:text-gray-400 text-black font-bold text-sm px-4 py-2.5 rounded-xl transition-all">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
          {saving ? 'Saving…' : 'Save'}
        </button>
        {onCancel && <button onClick={onCancel} className="text-sm text-gray-400 hover:text-white border border-white/10 px-4 py-2.5 rounded-xl transition-colors">Cancel</button>}
      </div>
    </div>
  );
}

// MIDs section — first MID is always shown inline; additional ones can be added
function MidsSection({ location, concepts, corporateId, onConceptAdded, onConceptUpdated }) {
  const locMids = concepts.filter(c => c.locationId === location.id);
  const primaryMid = locMids[0] || null;
  const additionalMids = locMids.slice(1);
  const [addingExtra, setAddingExtra] = useState(false);
  const [editingPrimary, setEditingPrimary] = useState(!primaryMid); // auto-open if no MID yet

  const handlePrimarySaved = (saved) => {
    if (primaryMid) onConceptUpdated(saved);
    else onConceptAdded(saved);
    setEditingPrimary(false);
  };

  const handleExtraSaved = (saved) => {
    onConceptAdded(saved);
    setAddingExtra(false);
  };

  return (
    <div className="space-y-3">
      {/* Primary MID */}
      <div className="bg-white/[0.03] border border-white/10 rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <CreditCard className="w-3.5 h-3.5 text-amber-400" />
            <span className="text-xs font-bold text-gray-300 uppercase tracking-wider">Primary MID</span>
            {primaryMid && <StatusBadge status={primaryMid.applicationStepStatus || 'In Review'} />}
          </div>
          {primaryMid && !editingPrimary && (
            <button onClick={() => setEditingPrimary(true)} className="text-[10px] text-gray-500 hover:text-amber-400 border border-white/10 rounded-lg px-2 py-1 transition-colors">Edit</button>
          )}
        </div>

        {editingPrimary ? (
          <MidForm
            locationId={location.id}
            corporateId={corporateId}
            dbaName={location.dbaName}
            mid={primaryMid}
            onSaved={handlePrimarySaved}
            onCancel={primaryMid ? () => setEditingPrimary(false) : null}
            isFirst={true}
          />
        ) : primaryMid ? (
          <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs">
            <div><span className="text-gray-500">MCC:</span> <span className="text-white font-mono">{primaryMid.mccCode}</span></div>
            <div><span className="text-gray-500">Industry:</span> <span className="text-white">{primaryMid.industryType || '—'}</span></div>
            <div><span className="text-gray-500">Monthly Volume:</span> <span className="text-white font-semibold">${Number(primaryMid.monthlyCardSales || 0).toLocaleString()}</span></div>
            <div><span className="text-gray-500">Avg Sale:</span> <span className="text-white">${Number(primaryMid.avgSaleAmount || 0).toLocaleString()}</span></div>
            <div><span className="text-gray-500">Card Present:</span> <span className="text-white">{primaryMid.cardPresentPct || 100}%</span></div>
            {primaryMid.elavonMID && <div><span className="text-gray-500">MID:</span> <span className="text-green-400 font-mono">{primaryMid.elavonMID}</span></div>}
          </div>
        ) : (
          <p className="text-xs text-amber-400/80">Fill in processing details to complete this merchant application.</p>
        )}
      </div>

      {/* Additional MIDs (shared address) */}
      {additionalMids.map((mid, idx) => (
        <div key={mid.id} className="bg-white/[0.02] border border-white/10 rounded-xl p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <CreditCard className="w-3.5 h-3.5 text-blue-400" />
              <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">{mid.conceptName || `MID ${idx + 2}`}</span>
              <StatusBadge status={mid.applicationStepStatus || 'In Review'} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs">
            <div><span className="text-gray-500">MCC:</span> <span className="text-white font-mono">{mid.mccCode}</span></div>
            <div><span className="text-gray-500">Monthly Volume:</span> <span className="text-white font-semibold">${Number(mid.monthlyCardSales || 0).toLocaleString()}</span></div>
          </div>
        </div>
      ))}

      {/* Add additional MID */}
      {addingExtra ? (
        <div className="bg-white/[0.02] border border-white/10 rounded-xl p-4">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Additional MID (same address, different business)</p>
          <MidForm
            locationId={location.id}
            corporateId={corporateId}
            dbaName={location.dbaName}
            mid={null}
            onSaved={handleExtraSaved}
            onCancel={() => setAddingExtra(false)}
            isFirst={false}
          />
        </div>
      ) : primaryMid && (
        <button onClick={() => setAddingExtra(true)}
          className="w-full flex items-center justify-center gap-2 border border-dashed border-white/10 hover:border-blue-500/30 hover:bg-blue-500/5 rounded-xl py-2.5 text-xs font-semibold text-gray-500 hover:text-blue-400 transition-all">
          <Plus className="w-3.5 h-3.5" /> Add Another MID (same address)
        </button>
      )}
    </div>
  );
}

// A single location card — expandable with banking + MIDs
function LocationCard({ location, corporateId, entities, plaidAccounts, bankDetails, savedEntityBankDetails, concepts, onDelete, onBankSaved, onConceptAdded, onConceptUpdated, onAccountsConnected, isExpanded, onToggleExpand }) {
  const entity = entities.find(e => e.entityId === location.entityId);
  const hasBanking = !!(bankDetails?.routingNumber && bankDetails?.accountNumber);
  const locConcepts = concepts.filter(c => c.locationId === location.id);

  return (
    <div className={`rounded-2xl border transition-all ${isExpanded ? 'border-amber-500/30 bg-[#1c2128]' : 'border-white/10 bg-white/[0.02] hover:border-white/20'}`}>
      {/* Card header — always visible */}
      <div className="flex items-center gap-3 px-5 py-4 cursor-pointer" onClick={onToggleExpand}>
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${hasBanking ? 'bg-green-500/15' : 'bg-amber-500/10'}`}>
          <Store className={`w-4.5 h-4.5 ${hasBanking ? 'text-green-400' : 'text-amber-400'}`} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-white truncate">{location.dbaName}</p>
          <p className="text-[11px] text-gray-400 truncate flex items-center gap-1">
            <MapPin className="w-3 h-3 flex-shrink-0" />{location.businessAddress}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {hasBanking && <CheckCircle2 className="w-3.5 h-3.5 text-green-400" />}
          {locConcepts.length > 0 && (
            <span className="text-[10px] font-bold text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-full px-2 py-0.5">
              {locConcepts.length} MID{locConcepts.length > 1 ? 's' : ''}
            </span>
          )}
          {entity && entities.length > 1 && (
            <span className="text-[10px] text-gray-500 bg-white/5 rounded-full px-2 py-0.5 hidden sm:block truncate max-w-[100px]">{entity.legalBusinessName}</span>
          )}
          <button onClick={(e) => { e.stopPropagation(); onDelete(location); }}
            className="p-1.5 text-gray-600 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all ml-1">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
          {isExpanded ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
        </div>
      </div>

      {/* Expanded content */}
      {isExpanded && (
        <div className="border-t border-white/5 px-5 py-5 space-y-6">
          {/* Banking */}
          <div>
            <SectionHeader icon={Landmark} title="Bank Account" color="amber" />
            <BankingPanel
              location={location}
              corporateId={corporateId}
              plaidAccounts={plaidAccounts}
              onAccountsConnected={onAccountsConnected}
              bankDetails={bankDetails}
              savedEntityBankDetails={savedEntityBankDetails}
              onBankSaved={onBankSaved}
            />
          </div>

          {/* MIDs */}
          <div>
            <SectionHeader icon={CreditCard} title="Merchant Application (MID)" color="blue" />
            <p className="text-[11px] text-gray-500 mb-3">Each MID is a separate merchant application. Most locations need one — add more only if different businesses share this address.</p>
            <MidsSection location={location} concepts={concepts} corporateId={corporateId} onConceptAdded={onConceptAdded} onConceptUpdated={onConceptUpdated} />
          </div>
        </div>
      )}
    </div>
  );
}

// Add location inline form — slides in at the bottom
function AddLocationForm({ corporateId, profile, entities, onSaved, onCancel }) {
  const hasEntities = entities.length > 0;

  const [dbaName, setDbaName] = useState('');
  const [addressDisplay, setAddressDisplay] = useState('');
  const [parsedAddress, setParsedAddress] = useState(null);
  const [unverifiedWarning, setUnverifiedWarning] = useState(false);

  // Entity assignment
  const [entityChoice, setEntityChoice] = useState(hasEntities ? 'existing' : 'new');
  const [selectedEntityId, setSelectedEntityId] = useState(entities[0]?.entityId || '');

  // New entity fields — pre-fill from profile if first entity
  const [newEntityName, setNewEntityName] = useState(!hasEntities ? (profile?.legalName || '') : '');
  const [newEntityEIN, setNewEntityEIN] = useState(() => {
    if (hasEntities) return '';
    const ein = (profile?.taxId || '').replace(/\D/g, '').slice(0, 9);
    return ein; // may be empty or partial — user must complete it
  });

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const addrRef = useRef(null);
  usePlacesAutocomplete(addrRef, (parsed) => {
    setAddressDisplay(parsed.display);
    setParsedAddress(parsed);
    setUnverifiedWarning(false);
  });

  // Derived validation for new entity fields
  const newEINDigits = newEntityEIN.replace(/\D/g, '');
  const newEntityValid = entityChoice !== 'new' || (newEntityName.trim().length > 0 && newEINDigits.length === 9);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!dbaName.trim()) { setError('Store name is required.'); return; }
    if (!addressDisplay.trim()) { setError('Address is required.'); return; }
    if (entityChoice === 'new' && !newEntityName.trim()) { setError('Legal business name is required.'); return; }
    if (entityChoice === 'new' && newEINDigits.length !== 9) { setError('A valid 9-digit EIN is required before saving.'); return; }
    if (!parsedAddress) { setUnverifiedWarning(true); return; }
    await doSave(parsedAddress);
  };

  const doSave = async (addr) => {
    setSaving(true);
    setError('');
    try {
      let targetEntityId = entityChoice === 'existing' ? selectedEntityId : undefined;

      if (entityChoice === 'new') {
        const res = await base44.functions.invoke('manageLegalEntity', {
          action: 'add', corporateId,
          legalBusinessName: newEntityName.trim(),
          federalEIN: newEINDigits,
        });
        if (res.data?.error) throw new Error(res.data.error);
        targetEntityId = res.data.entities[res.data.entities.length - 1]?.entityId;
      }

      const businessAddress = addr ? `${addr.street}, ${addr.city}, ${addr.state} ${addr.zip}` : addressDisplay.trim();
      const locRes = await base44.functions.invoke('addSelfServeLocation', {
        corporateId, entityId: targetEntityId,
        dbaName: dbaName.trim(),
        businessAddress,
        businessStreet: addr?.street || '',
        businessCity: addr?.city || '',
        businessState: addr?.state || '',
        businessZip: addr?.zip || '',
      });
      if (locRes.data?.error) throw new Error(locRes.data.error);
      onSaved({ location: locRes.data.location, concept: locRes.data.concept, reloadEntities: entityChoice === 'new' });
    } catch (err) {
      setError(err.message || 'Failed to save.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-[#1c2128] border border-amber-500/30 rounded-2xl p-5">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-amber-500/15 flex items-center justify-center">
            <Plus className="w-4 h-4 text-amber-400" />
          </div>
          <h3 className="text-sm font-bold text-white">New Location</h3>
        </div>
        <button onClick={onCancel} className="text-gray-500 hover:text-white p-1.5 rounded-lg transition-colors"><X className="w-4 h-4" /></button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Store identity */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>Store / DBA Name *</label>
            <input value={dbaName} onChange={e => setDbaName(e.target.value)}
              placeholder="e.g. Main Street Cafe" className={inputCls} autoFocus />
          </div>
          <div>
            <label className={labelCls}>Physical Address *</label>
            {parsedAddress ? (
              <div className="flex items-center gap-2 bg-green-500/10 border border-green-500/20 rounded-xl px-3.5 py-2.5">
                <CheckCircle2 className="w-4 h-4 text-green-400 flex-shrink-0" />
                <span className="text-sm text-green-300 flex-1 truncate">{addressDisplay}</span>
                <button type="button" onClick={() => { setAddressDisplay(''); setParsedAddress(null); }} className="text-gray-500 hover:text-white">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <>
                <input ref={addrRef} type="text" value={addressDisplay}
                  onChange={e => { setAddressDisplay(e.target.value); setParsedAddress(null); setUnverifiedWarning(false); }}
                  onKeyDown={e => e.key === 'Enter' && e.preventDefault()}
                  placeholder="Start typing to search…" autoComplete="off" className={inputCls} />
                {unverifiedWarning && (
                  <div className="mt-2 bg-amber-500/10 border border-amber-500/20 rounded-xl p-3">
                    <p className="text-[11px] text-amber-300 font-semibold mb-2">Address not Google-verified — processing delays may occur.</p>
                    <div className="flex gap-2">
                      <button type="button" onClick={() => doSave(null)} disabled={saving}
                        className="text-xs text-amber-300 border border-amber-500/30 rounded-lg px-3 py-1.5 hover:bg-amber-500/10">
                        {saving ? 'Saving…' : 'Continue Anyway'}
                      </button>
                      <button type="button" onClick={() => setUnverifiedWarning(false)} className="text-xs text-gray-400 hover:text-white">← Fix Address</button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* Legal Entity */}
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
            <select value={selectedEntityId} onChange={e => setSelectedEntityId(e.target.value)}
              className={inputCls} style={{ colorScheme: 'dark' }}>
              {entities.map(e => (
                <option key={e.entityId} value={e.entityId}>
                  {e.legalBusinessName} {e.federalEIN ? `— ${formatEIN(e.federalEIN)}` : ''}
                </option>
              ))}
            </select>
          )}

          {entityChoice === 'new' && (
            <div className="bg-white/[0.02] border border-purple-500/20 rounded-xl p-4 space-y-3">
              {!hasEntities && (
                <p className="text-[11px] text-gray-400">Enter the legal entity that will own this location's merchant accounts. All MIDs at this location will file under this EIN.</p>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Legal Business Name *</label>
                  <input value={newEntityName} onChange={e => setNewEntityName(e.target.value)}
                    placeholder="e.g. Main St LLC" className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Federal EIN *</label>
                  <input
                    value={newEntityEIN}
                    onChange={e => setNewEntityEIN(e.target.value.replace(/\D/g, '').slice(0, 9))}
                    placeholder="9 digits, e.g. 123456789"
                    className={`${inputCls} ${newEntityEIN.length > 0 && newEINDigits.length !== 9 ? 'border-amber-500/50 focus:ring-amber-500' : ''}`}
                  />
                  {newEntityEIN.length > 0 && newEINDigits.length !== 9 && (
                    <p className="text-[10px] text-amber-400 mt-1">{newEINDigits.length}/9 digits entered</p>
                  )}
                  {newEINDigits.length === 9 && (
                    <p className="text-[10px] text-green-400 mt-1 flex items-center gap-1"><Check className="w-3 h-3" /> Valid EIN</p>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {error && <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-sm text-red-300">{error}</div>}

        <div className="flex gap-3 pt-1">
          <button type="submit" disabled={saving || !newEntityValid}
            className="flex items-center gap-2 bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 disabled:from-gray-600 disabled:to-gray-600 disabled:text-gray-400 text-black font-bold text-sm px-5 py-3 rounded-xl transition-all shadow-lg shadow-amber-900/20">
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
  const [concepts, setConcepts] = useState([]);
  const [bankDetailsByLoc, setBankDetailsByLoc] = useState({}); // { [locId]: bankDetails }
  const [plaidAccounts, setPlaidAccounts] = useState({}); // { [entityId]: accounts[] }
  const [manualBankByEntity, setManualBankByEntity] = useState({}); // { [entityId]: bankDetails } — reusable manual entries
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [expandedLocId, setExpandedLocId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [showBackConfirm, setShowBackConfirm] = useState(false);

  useEffect(() => { loadAll(); }, []);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [entRes, locRes, conRes] = await Promise.all([
        base44.functions.invoke('manageLegalEntity', { action: 'list', corporateId: profile.corporateId }),
        base44.functions.invoke('listLocations', { corporateId: profile.corporateId }),
        base44.functions.invoke('manageConcept', { action: 'list', corporateId: profile.corporateId }),
      ]);

      const loadedEntities = entRes.data?.entities || [];
      const loadedLocations = (locRes.data?.locations || []).map(l => ({
        id: l.id || l.locationId,
        entityId: l.entityId || '',
        dbaName: l.dbaName,
        businessAddress: l.businessAddress,
        applicationStepStatus: l.applicationStepStatus || 'In Review',
        elavonMID: l.elavonMID,
      }));
      const loadedConcepts = conRes.data?.concepts || [];

      // Build bankDetails map from loaded locations
      const bdMap = {};
      (locRes.data?.locations || []).forEach(l => {
        const id = l.id || l.locationId;
        if (l.bankDetails?.routingNumber) bdMap[id] = l.bankDetails;
        else if (l.routingNumber) bdMap[id] = { routingNumber: l.routingNumber, accountNumber: l.accountNumber, authMethod: 'Manual' };
      });

      // Build manual-bank-by-entity map for reuse across sibling locations
      const manualByEntity = {};
      (locRes.data?.locations || []).forEach(l => {
        const bd = l.bankDetails?.routingNumber ? l.bankDetails : (l.routingNumber ? { routingNumber: l.routingNumber, accountNumber: l.accountNumber, authMethod: 'Manual', accountNumberMasked: `••••${(l.accountNumber || '').slice(-4)}` } : null);
        if (bd?.authMethod === 'Manual' && l.entityId) {
          manualByEntity[l.entityId] = bd;
        }
      });

      setEntities(loadedEntities);
      setLocations(loadedLocations);
      setConcepts(loadedConcepts);
      setBankDetailsByLoc(bdMap);
      setManualBankByEntity(manualByEntity);

      // Auto-expand location that still needs a MID or banking
      const incomplete = loadedLocations.find(l => {
        const hasMid = loadedConcepts.some(c => c.locationId === l.id && c.mccCode);
        const hasBanking = !!(bdMap[l.id]?.routingNumber);
        return !hasMid || !hasBanking;
      });
      if (incomplete) setExpandedLocId(incomplete.id);

      // On first load with no locations, show the add form
      if (loadedLocations.length === 0) {
        setShowAddForm(true);
      }
    } catch (_) {}
    finally { setLoading(false); }
  };

  const handleLocationSaved = async ({ reloadEntities, concept }) => {
    setShowAddForm(false);
    if (concept) setConcepts(prev => [...prev, concept]);
    await loadAll();
  };

  const handleDelete = async (loc) => {
    setDeleteConfirm(null);
    try {
      await base44.functions.invoke('removeSelfServeLocation', { locationId: loc.id });
      setLocations(prev => prev.filter(l => l.id !== loc.id));
      // Clean up entity if now empty
      const remaining = locations.filter(l => l.id !== loc.id && l.entityId === loc.entityId);
      if (remaining.length === 0 && loc.entityId) {
        try { await base44.functions.invoke('manageLegalEntity', { action: 'delete', corporateId: profile.corporateId, entityId: loc.entityId }); } catch (_) {}
        setEntities(prev => prev.filter(e => e.entityId !== loc.entityId));
      }
    } catch (_) {}
  };

  const handleBankSaved = (locId, details, entityId) => {
    setBankDetailsByLoc(prev => ({ ...prev, [locId]: details }));
    // Cache manual entries at the entity level so sibling locations can reuse them
    if (details?.authMethod === 'Manual' && entityId) {
      setManualBankByEntity(prev => ({ ...prev, [entityId]: details }));
    }
  };

  const handleConceptAdded = (concept) => {
    setConcepts(prev => [...prev, concept]);
  };

  const handleConceptUpdated = (updated) => {
    setConcepts(prev => prev.map(c => c.id === updated.id ? { ...c, ...updated } : c));
  };

  const handleAccountsConnected = (entityId, accounts) => {
    setPlaidAccounts(prev => ({ ...prev, [entityId]: accounts }));
  };

  const isReady = locations.length > 0 && locations.every(l => {
    const bd = bankDetailsByLoc[l.id];
    const hasBanking = bd?.routingNumber && bd?.accountNumber;
    const hasMid = concepts.some(c => c.locationId === l.id && c.mccCode);
    return hasBanking && hasMid;
  });

  const handleContinue = async () => {
    setSaving(true);
    try {
      onContinue({ locations, legalEntities: entities });
    } finally {
      setSaving(false);
    }
  };

  // Group by entity for summary display
  const grouped = {};
  locations.forEach(l => {
    const key = l.entityId || 'unassigned';
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(l);
  });
  const isMultiEntity = entities.length > 1;

  if (loading) return (
    <div className="flex flex-col items-center justify-center py-24 gap-3">
      <Loader2 className="w-8 h-8 text-gray-500 animate-spin" />
      <p className="text-sm text-gray-500">Loading locations…</p>
    </div>
  );

  return (
    <div className="flex flex-col">
      {/* Header */}
      <div className="px-8 pt-8 pb-6 border-b border-white/10">
        <div className="inline-flex items-center gap-2 bg-blue-500/10 border border-blue-500/20 text-blue-300 text-xs font-semibold px-3 py-1.5 rounded-full mb-3">
          <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
          STEP 2 OF 3 — LOCATIONS &amp; BANKING
        </div>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold text-white mb-1.5">Set Up Your Locations</h2>
            <p className="text-gray-400 text-sm">
              Add each storefront, link a bank account, and complete the merchant application for each location.
            </p>
          </div>
          <button onClick={() => setShowBackConfirm(true)}
            className="flex-shrink-0 flex items-center gap-2 text-sm font-medium text-gray-300 border border-white/15 hover:border-white/30 hover:bg-white/5 px-4 py-2 rounded-xl transition-all">
            <ArrowLeft className="w-4 h-4" /> Back
          </button>
        </div>
      </div>

      {/* Stats bar */}
      {locations.length > 0 && (
        <div className="px-8 py-4 border-b border-white/5 flex flex-wrap gap-x-8 gap-y-2">
          <div>
            <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Locations</p>
            <p className="text-lg font-bold text-white">{locations.length}</p>
          </div>
          <div>
            <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">MIDs</p>
            <p className="text-lg font-bold text-white">{concepts.length}</p>
          </div>
          <div>
            <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Banking Ready</p>
            <p className="text-lg font-bold text-white">
              {Object.values(bankDetailsByLoc).filter(b => b?.routingNumber).length}/{locations.length}
            </p>
          </div>
          {isMultiEntity && (
            <div>
              <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Legal Entities</p>
              <p className="text-lg font-bold text-amber-400">{entities.length}</p>
            </div>
          )}
        </div>
      )}

      {/* Location cards */}
      <div className="px-8 py-6 space-y-3">
        {locations.length === 0 && !showAddForm && (
          <div className="text-center py-16 border border-dashed border-white/10 rounded-2xl">
            <Store className="w-12 h-12 text-gray-600 mx-auto mb-4" />
            <p className="text-sm font-semibold text-gray-400">No locations yet</p>
            <p className="text-xs text-gray-600 mt-1">Add your first storefront to get started.</p>
          </div>
        )}

        {/* Grouped or flat */}
        {isMultiEntity ? (
          Object.entries(grouped).map(([eId, locs]) => {
            const entity = entities.find(e => e.entityId === eId);
            return (
              <div key={eId}>
                <div className="flex items-center gap-2 mb-2 px-1">
                  <Building2 className="w-3.5 h-3.5 text-amber-400/60" />
                  <span className="text-[11px] font-bold text-amber-300/80 uppercase tracking-wider">
                    {entity?.legalBusinessName || 'Unassigned'}
                  </span>
                  {entity?.federalEIN && <span className="text-[10px] text-gray-600 font-mono">{formatEIN(entity.federalEIN)}</span>}
                </div>
                <div className="space-y-2">
                  {locs.map(loc => (
                    <LocationCard
                      key={loc.id}
                      location={loc}
                      corporateId={profile.corporateId}
                      entities={entities}
                      plaidAccounts={plaidAccounts}
                      bankDetails={bankDetailsByLoc[loc.id] || null}
                      savedEntityBankDetails={manualBankByEntity[loc.entityId] || null}
                      concepts={concepts}
                      onDelete={(l) => setDeleteConfirm(l)}
                      onBankSaved={handleBankSaved}
                      onConceptAdded={handleConceptAdded}
                      onConceptUpdated={handleConceptUpdated}
                      onAccountsConnected={handleAccountsConnected}
                      isExpanded={expandedLocId === loc.id}
                      onToggleExpand={() => setExpandedLocId(prev => prev === loc.id ? null : loc.id)}
                    />
                  ))}
                </div>
              </div>
            );
          })
        ) : (
          locations.map(loc => (
            <LocationCard
              key={loc.id}
              location={loc}
              corporateId={profile.corporateId}
              entities={entities}
              plaidAccounts={plaidAccounts}
              bankDetails={bankDetailsByLoc[loc.id] || null}
              savedEntityBankDetails={manualBankByEntity[loc.entityId] || null}
              concepts={concepts}
              onDelete={(l) => setDeleteConfirm(l)}
              onBankSaved={handleBankSaved}
              onConceptAdded={handleConceptAdded}
              onConceptUpdated={handleConceptUpdated}
              onAccountsConnected={handleAccountsConnected}
              isExpanded={expandedLocId === loc.id}
              onToggleExpand={() => setExpandedLocId(prev => prev === loc.id ? null : loc.id)}
            />
          ))
        )}

        {/* Inline Add Form */}
        {showAddForm && (
          <AddLocationForm
            corporateId={profile.corporateId}
            profile={profile}
            entities={entities}
            onSaved={handleLocationSaved}
            onCancel={() => setShowAddForm(false)}
          />
        )}

        {/* Add Location button */}
        {!showAddForm && (
          <button
            onClick={() => setShowAddForm(true)}
            className="w-full flex items-center justify-center gap-2 border border-dashed border-white/15 hover:border-amber-500/40 hover:bg-amber-500/5 rounded-2xl py-4 text-sm font-semibold text-gray-500 hover:text-amber-400 transition-all"
          >
            <Plus className="w-4 h-4" /> Add {locations.length > 0 ? 'Another' : 'a'} Location
          </button>
        )}
      </div>

      {/* Continue footer */}
      <div className="px-8 pt-2 pb-8 border-t border-white/10 space-y-3">
        <button
          onClick={handleContinue}
          disabled={!isReady || saving}
          className="w-full flex items-center justify-center gap-3 bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 disabled:from-gray-700 disabled:to-gray-700 disabled:text-gray-500 text-black font-bold py-4 px-6 rounded-xl text-base transition-all shadow-lg shadow-amber-900/20"
        >
          {saving ? <><Loader2 className="w-5 h-5 animate-spin text-black" /> Saving…</> : <>Continue to Signing <ArrowRight className="w-5 h-5" /></>}
        </button>
        {locations.length === 0 && <p className="text-center text-xs text-gray-600">Add at least one location to continue.</p>}
        {locations.length > 0 && !isReady && (
          <p className="text-center text-xs text-amber-600/80">
            {(() => {
              const needsBank = locations.filter(l => !bankDetailsByLoc[l.id]?.routingNumber).length;
              const needsMid = locations.filter(l => !concepts.some(c => c.locationId === l.id && c.mccCode)).length;
              if (needsBank > 0 && needsMid > 0) return `${needsBank} location${needsBank > 1 ? 's' : ''} need a bank account and ${needsMid} need merchant application details.`;
              if (needsBank > 0) return `${needsBank} location${needsBank > 1 ? 's' : ''} still need${needsBank === 1 ? 's' : ''} a bank account — click to expand and link.`;
              return `${needsMid} location${needsMid > 1 ? 's' : ''} still need${needsMid === 1 ? 's' : ''} merchant application details (MCC, volume).`;
            })()}
          </p>
        )}
      </div>

      {/* Delete confirm */}
      {deleteConfirm && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 px-4" onClick={() => setDeleteConfirm(null)}>
          <div className="bg-[#1c2128] border border-white/10 rounded-2xl shadow-2xl w-full max-w-sm p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-500/15 flex items-center justify-center flex-shrink-0">
                <AlertTriangle className="w-5 h-5 text-red-400" />
              </div>
              <div>
                <h3 className="font-bold text-white">Remove Location?</h3>
                <p className="text-xs text-gray-400 mt-0.5">"{deleteConfirm.dbaName}" and its MIDs will be deleted.</p>
              </div>
            </div>
            <div className="flex gap-3">
              <button onClick={() => handleDelete(deleteConfirm)} className="flex-1 bg-red-500 hover:bg-red-400 text-white font-bold text-sm py-2.5 rounded-xl transition-all">Remove</button>
              <button onClick={() => setDeleteConfirm(null)} className="flex-1 border border-white/15 text-gray-300 hover:text-white font-semibold text-sm py-2.5 rounded-xl transition-all">Keep</button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Back confirm */}
      {showBackConfirm && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 px-4" onClick={() => setShowBackConfirm(false)}>
          <div className="bg-[#1c2128] border border-white/10 rounded-2xl shadow-2xl w-full max-w-sm p-6" onClick={e => e.stopPropagation()}>
            <h3 className="font-bold text-white mb-2">Go Back?</h3>
            <p className="text-sm text-gray-400 mb-5">Your locations and banking are saved. You can return here anytime.</p>
            <div className="flex gap-3">
              <button onClick={() => { setShowBackConfirm(false); onBack(); }} className="flex-1 bg-white/10 hover:bg-white/15 text-white font-bold text-sm py-2.5 rounded-xl transition-all">Go Back</button>
              <button onClick={() => setShowBackConfirm(false)} className="flex-1 border border-white/15 text-gray-300 hover:text-white font-semibold text-sm py-2.5 rounded-xl transition-all">Stay</button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}