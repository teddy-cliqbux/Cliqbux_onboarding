import { useState, useEffect } from 'react';
import { Plus, ArrowRight, Loader2, Store, Landmark, Trash2, CheckCircle2, AlertCircle, Pencil, Check, MapPin, Building2, Hash, Layers, ChevronDown, AlertTriangle } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import AddLocationModal from '@/components/onboarding/AddLocationModal';
import EntityPlaidButton from '@/components/onboarding/EntityPlaidButton';

function formatEIN(raw) {
  const d = (raw || '').replace(/\D/g, '');
  return d.length >= 9 ? `${d.slice(0, 2)}-${d.slice(2, 9)}` : raw || '';
}

export default function OnboardingLocations({ profile, onContinue, onBack }) {
  const [entities, setEntities] = useState([]);
  const [locs, setLocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddLoc, setShowAddLoc] = useState(false);
  const [editLocId, setEditLocId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [showBackConfirm, setShowBackConfirm] = useState(false);

  const isSelfServe = ['Self_Swiped', 'Self_Keyed', 'Self_CashDiscount'].includes(profile?.pricingTier);

  // Entity-level Plaid accounts: { [entityId]: accounts[] }
  const [plaidAccounts, setPlaidAccounts] = useState({});

  // Per-location state that must never reset when new locations are added
  // { [locId]: { selectedBankId, isManualMode, manualRouting, manualAccount } }
  const [locationState, setLocationState] = useState({});

  useEffect(() => { loadData(); }, []);

  const fetchEntities = async () => {
    const res = await base44.functions.invoke('manageLegalEntity', { action: 'list', corporateId: profile.corporateId });
    return res.data?.entities || [];
  };

  const ensureLocState = (locId) => {
    setLocationState(prev => prev[locId] ? prev : { ...prev, [locId]: { selectedBankId: null, isManualMode: false, manualRouting: '', manualAccount: '' } });
  };

  const loadData = async () => {
    setLoading(true);
    try {
      const activeEntities = await fetchEntities();
      setEntities(activeEntities);
      const liveRes = await base44.functions.invoke('listLocations', { corporateId: profile.corporateId });
      const entityById = Object.fromEntries(activeEntities.map(e => [e.entityId, e]));
      const loaded = (liveRes.data?.locations || []).map(loc => {
        const id = loc.id || loc.locationId;
        ensureLocState(id);
        return {
          id,
          entityId: entityById[loc.entityId] ? loc.entityId : activeEntities[0]?.entityId || '',
          dbaName: loc.dbaName,
          businessAddress: loc.businessAddress,
          addressVerified: loc.addressVerified || false,
          bankDetails: loc.bankDetails || { routingNumber: loc.routingNumber || '', accountNumber: loc.accountNumber || '', authMethod: null },
          applicationStepStatus: loc.applicationStepStatus || 'In Review',
          elavonMID: loc.elavonMID,
        };
      });
      setLocs(loaded);
    } catch (_) { setEntities([]); setLocs([]); }
    finally { setLoading(false); }
  };

  const removeLoc = async (row) => {
    try {
      if (row.id) await base44.functions.invoke('removeSelfServeLocation', { locationId: row.id });
    } catch (_) { /* best-effort backend delete */ }

    // Remove from state
    setLocs(prev => ({ ...prev })); // force snapshot for grouping check
    const remaining = locs.filter(l => l.id !== row.id);
    setLocs(remaining);

    // Clean up local per-location state
    setLocationState(prev => {
      const { [row.id]: _, ...rest } = prev;
      return rest;
    });

    // Auto clean-up: if this was the last location for its entity, remove that entity
    const rowEntityId = row.entityId;
    if (rowEntityId) {
      const otherForEntity = remaining.filter(l => l.entityId === rowEntityId);
      if (otherForEntity.length === 0) {
        // Remove entity from backend
        try { await base44.functions.invoke('manageLegalEntity', { action: 'delete', corporateId: profile.corporateId, entityId: rowEntityId }); } catch (_) {}
        // Remove from local entities state
        setEntities(prev => prev.filter(e => e.entityId !== rowEntityId));
        // Remove any Plaid accounts for this now-orphaned entity
        setPlaidAccounts(prev => {
          const { [rowEntityId]: _, ...rest } = prev;
          return rest;
        });
      }
    }

    setEditLocId(p => p === row.id ? null : p);
  };

  const handleLocationAdded = ({ reloadEntities }) => { loadData(); };
  const handleLocationUpdated = () => { loadData(); };

  const handleAccountsConnected = (entityId, accounts) => {
    setPlaidAccounts(prev => ({ ...prev, [entityId]: accounts }));
    // Auto-select first account for each location under this entity
    if (accounts.length > 0) {
      setLocs(prev => {
        const newLocs = prev.map(l => l.entityId === entityId ? { ...l } : l);
        // Assign first account to affected locations with no existing bank — read current locs from the same snapshot
        setLocationState(prevLocState => Object.fromEntries(Object.entries(prevLocState).map(([locId, ls]) => {
          const loc = newLocs.find(l => l.id === locId);
          return loc && loc.entityId === entityId && !loc.bankDetails?.routingNumber
            ? [locId, { ...ls, selectedBankId: accounts[0].accountId, isManualMode: false }]
            : [locId, ls];
        })));
        // Also un-clear any previously-cleared locs for this entity
        const finalLocs = newLocs.map(l => l.entityId === entityId ? { ...l, bankCleared: false } : l);
        return finalLocs;
      });
    }
  };

  const getLocBankDetails = (loc) => {
    const ls = locationState[loc.id];
    if (!ls) return loc.bankDetails || null;
    if (ls.isManualMode && ls.manualRouting && ls.manualAccount) {
      return {
        routingNumber: ls.manualRouting,
        accountNumber: ls.manualAccount,
        accountNumberMasked: `••••${(ls.manualAccount || '').slice(-4)}`,
        authMethod: 'Manual',
      };
    }
    if (ls.selectedBankId && plaidAccounts[loc.entityId]) {
      const acct = plaidAccounts[loc.entityId].find(a => a.accountId === ls.selectedBankId);
      if (acct) {
        return {
          routingNumber: acct.routingNumber || '',
          accountNumber: acct.accountNumber || '',
          accountNumberMasked: acct.mask ? `••••${acct.mask}` : '',
          accountType: acct.subtype || 'checking',
          authMethod: 'Plaid',
        };
      }
    }
    if (loc.bankCleared) return null;
    return loc.bankDetails || null;
  };

  const entityById = Object.fromEntries(entities.map(e => [e.entityId, e]));

  // Group locations by entity
  const isMultiEntity = entities.length > 1;
  const grouped = {};
  locs.forEach(l => {
    const eId = l.entityId || '';
    if (!grouped[eId]) grouped[eId] = [];
    grouped[eId].push(l);
  });

  const isReady = locs.length > 0 && locs.every(l => {
    if (l.applicationStepStatus === 'Approved') return true;
    const bk = getLocBankDetails(l);
    return bk && bk.routingNumber && bk.accountNumber;
  });

  const handleSaveAndContinue = async () => {
    setSaving(true);
    try {
      const toSave = locs.filter(l => l.applicationStepStatus !== 'Approved').map(l => ({
        id: l.id,
        bankDetails: getLocBankDetails(l) || l.bankDetails || null,
      })).filter(l => l.bankDetails);
      if (toSave.length > 0) await base44.functions.invoke('saveLocationBankDetails', { locations: toSave });
      onContinue({ locations: locs, legalEntities: entities });
    } catch (err) { console.error(err); }
    finally { setSaving(false); }
  };

  // --- Per-location helpers ---

  const selectAccount = async (locId, accountId) => {
    const account = plaidAccounts[entityById[locs.find(l => l.id === locId)?.entityId || '']]?.find(a => a.accountId === accountId);
    if (!account) return;

    setLocationState(prev => ({
      ...prev,
      [locId]: { ...prev[locId], selectedBankId: accountId, isManualMode: false, manualRouting: '', manualAccount: '' }
    }));
    setLocs(prev => prev.map(l => l.id === locId ? { ...l, bankCleared: false } : l));

    const bankDetails = {
      routingNumber: account.routingNumber || '',
      accountNumber: account.accountNumber || '',
      accountNumberMasked: account.mask ? `••••${account.mask}` : '',
      accountType: account.subtype || 'checking',
      authMethod: 'Plaid',
    };
    if (bankDetails.routingNumber && bankDetails.accountNumber) {
      try {
        await base44.functions.invoke('saveLocationBankDetails', { locations: [{ id: locId, bankDetails }] });
      } catch (_) { /* best-effort; Continue button retries save */ }
    }
  };

  const changeBank = (locId) => {
    // Clear the row-level bank so getLocBankDetails falls through to dropdown/connect view
    setLocs(prev => prev.map(l => l.id === locId ? { ...l, bankCleared: true } : l));
    setLocationState(prev => ({
      ...prev,
      [locId]: { ...prev[locId], selectedBankId: null, isManualMode: false, manualRouting: '', manualAccount: '' }
    }));
  };

  const toggleManual = (locId) => {
    setLocationState(prev => ({
      ...prev,
      [locId]: { ...prev[locId], isManualMode: true, selectedBankId: null }
    }));
  };

  const cancelManual = (locId) => {
    setLocationState(prev => ({
      ...prev,
      [locId]: { ...prev[locId], isManualMode: false, manualRouting: '', manualAccount: '' }
    }));
  };

  const updateManualField = (locId, field, value) => {
    setLocationState(prev => ({
      ...prev,
      [locId]: { ...prev[locId], [field]: value }
    }));
  };

  const confirmManual = (locId) => {
    setLocationState(prev => ({ ...prev }));
  };

  const BankingColumn = ({ row }) => {
    const ls = locationState[row.id];
    const bk = getLocBankDetails(row);
    const entityAccounts = plaidAccounts[row.entityId] || [];
    const hasPlaidEntity = entityAccounts.length > 0;

    if (bk && bk.routingNumber && bk.accountNumber && !ls?.isManualMode) {
      const isPlaid = bk.authMethod === 'Plaid';
      return (
        <div className="flex items-center gap-2">
          <Landmark className={`w-4 h-4 flex-shrink-0 ${isPlaid ? 'text-blue-500' : 'text-gray-400'}`} />
          <div>
            <span className="text-xs font-mono font-semibold text-gray-900">{bk.accountNumberMasked || `••••${(bk.accountNumber || '').slice(-4)}`}</span>
            <p className="text-[10px] text-gray-400">{(bk.accountType === 'savings' ? 'Savings' : 'Checking')} · {bk.authMethod}</p>
          </div>
          <button onClick={() => changeBank(row.id)} className="text-[10px] text-blue-500 hover:text-blue-700 underline whitespace-nowrap flex-shrink-0">Change</button>
        </div>
      );
    }

    // Manual entry mode — persistent, never resets
    if (ls?.isManualMode) {
      return (
        <div className="flex flex-wrap items-center gap-1 w-full">
          <div className="flex items-center gap-1 w-full">
            <input type="text" placeholder="Routing" maxLength={9} value={ls.manualRouting || ''} className="w-[6rem] text-[11px] border border-gray-200 rounded-lg px-2 py-1.5 font-mono focus:outline-none focus:ring-1 focus:ring-blue-500"
              onChange={(e) => updateManualField(row.id, 'manualRouting', e.target.value.replace(/\D/g, '').slice(0, 9))} />
            <input type="text" placeholder="Account" value={ls.manualAccount || ''} className="w-[7rem] text-[11px] border border-gray-200 rounded-lg px-2 py-1.5 font-mono focus:outline-none focus:ring-1 focus:ring-blue-500"
              onChange={(e) => updateManualField(row.id, 'manualAccount', e.target.value.replace(/\D/g, '')?.slice(0, 17))} />
            <button onClick={() => confirmManual(row.id)}
              className="text-[10px] font-semibold bg-gray-900 text-white rounded-lg px-2 py-1.5"><Check className="w-3 h-3" /></button>
          </div>
          <button onClick={() => cancelManual(row.id)} className="text-[10px] text-gray-400 hover:text-blue-600 underline whitespace-nowrap">Cancel</button>
        </div>
      );
    }

    // Plaid dropdown when parent entity is connected
    if (hasPlaidEntity) {
      return (
        <div className="flex flex-col gap-0.5 w-full">
          <select value={ls?.selectedBankId || ''}
            onChange={(e) => selectAccount(row.id, e.target.value)}
            className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs font-mono bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 max-w-[14rem]">
            <option value="">Select account...</option>
            {entityAccounts.map(a => (
              <option key={a.accountId} value={a.accountId}>{a.name} ••••{a.mask || (a.accountNumber || '').slice(-4)}</option>
            ))}
          </select>
          <button onClick={() => toggleManual(row.id)} className="text-[10px] text-gray-400 hover:text-blue-600 underline whitespace-nowrap text-left">Set Up Manually...</button>
        </div>
      );
    }

    // No entity Plaid yet — render the entity-level connect button inline
    return (
      <div className="flex flex-col gap-0.5">
        <EntityPlaidButton corporateId={profile.corporateId} entityId={row.entityId} onAccountsConnected={handleAccountsConnected} />
      </div>
    );
  };

  const LocationRow = ({ row, suppressColDef }) => {
    const hasBanking = !!getLocBankDetails(row);
    const ls = locationState[row.id];
    const isApproved = row.applicationStepStatus === 'Approved';
    const isError = row.applicationStepStatus === 'Error';
    const inManualMode = ls?.isManualMode;
    return (
      <div key={row.id} className={`rounded-lg border px-4 py-3 md:grid md:grid-cols-12 md:gap-3 flex flex-col gap-3 ${isApproved ? 'border-green-200 bg-green-50' : isError ? 'border-red-200 bg-red-50' : hasBanking ? 'border-amber-200 bg-amber-50/40' : isMultiEntity ? 'border-gray-200 bg-white' : 'border-gray-100 bg-white hover:border-gray-200'}`}>
        <div className="md:col-span-4 flex items-start gap-2.5 min-w-0">
          <Store className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-gray-900 truncate">{row.dbaName}</p>
            <p className="text-xs text-gray-500 truncate flex items-center gap-1 mt-0.5">
              <MapPin className="w-3 h-3 flex-shrink-0" />{row.businessAddress}
              {row.addressVerified && <span className="flex items-center gap-0.5 text-green-600 font-medium text-[10px] flex-shrink-0"><CheckCircle2 className="w-2.5 h-2.5" /> Verified</span>}
            </p>
            {row.elavonMID && <p className="text-[10px] text-gray-400 font-mono mt-0.5">MID: {row.elavonMID}</p>}
          </div>
        </div>
        <div className="md:col-span-4 flex items-center">
          <BankingColumn row={row} />
        </div>
        <div className="md:col-span-3 flex items-center md:justify-center">
          {isApproved ? <div className="flex items-center gap-1 text-green-700 font-semibold text-xs"><CheckCircle2 className="w-4 h-4" /> Approved</div>
          : isError ? <div className="flex items-center gap-1 text-red-600 font-semibold text-xs"><AlertCircle className="w-4 h-4" /> Error</div>
          : hasBanking ? <span className="text-xs font-semibold text-amber-600">Ready</span>
          : <span className="text-xs text-gray-400">Awaiting Banking</span>}
        </div>
        <div className="md:col-span-1 flex items-center md:justify-end gap-2">
          {!isApproved && (
            <button onClick={() => setEditLocId(row.id)} className="text-xs text-blue-500 hover:text-blue-700 flex items-center gap-1"><Pencil className="w-3 h-3" /> Edit</button>
          )}
          {!isApproved && (
            <button onClick={() => removeLoc(row)} className="text-xs text-red-400 hover:text-red-600 font-semibold flex items-center gap-1"><Trash2 className="w-3 h-3" /> Delete</button>
          )}
        </div>
      </div>
    );
  };

  const renderLocationList = () => {
    if (!isMultiEntity) {
      // Flat table — single entity
      const firstEntityId = entities[0]?.entityId || '';
      return (
        <div className="space-y-2">
          <div className="hidden md:grid grid-cols-12 gap-3 px-4 py-2 text-[10px] font-semibold text-gray-400 uppercase tracking-wide">
            <div className="col-span-4">Storefront Location</div>
            <div className="col-span-4">Bank Account</div>
            <div className="col-span-3">Status</div>
            <div className="col-span-1"></div>
          </div>
          {/* Entity-level Plaid */}
          <div className="flex items-center gap-3 bg-gray-50 border border-gray-200 rounded-lg px-4 py-2.5 mb-3">
            <Landmark className="w-4 h-4 text-amber-600 flex-shrink-0" />
            <span className="text-xs font-semibold text-gray-700 flex-1">Corporate Bank Connection</span>
            {plaidAccounts[firstEntityId]?.length > 0 ? (
              <span className="text-xs text-green-700 font-semibold flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" /> {plaidAccounts[firstEntityId].length} {plaidAccounts[firstEntityId].length === 1 ? 'account' : 'accounts'} connected
              </span>
            ) : (
              <EntityPlaidButton corporateId={profile.corporateId} entityId={firstEntityId} onAccountsConnected={handleAccountsConnected} />
            )}
          </div>
          {locs.map(row => <LocationRow key={row.id} row={row} />)}
          {locs.length === 0 && (
            <div className="text-center py-6 border border-dashed border-gray-200 rounded-xl">
              <p className="text-sm text-gray-400">Add a location to assign an account.</p>
            </div>
          )}
        </div>
      );
    }

    // Grouped tree layout — multi entity
    return (
      <div className="space-y-6">
        {Object.entries(grouped).map(([eId, rows]) => {
          const entity = entityById[eId] || { legalBusinessName: 'Unknown', federalEIN: '', corporateMailingAddress: '' };
          const entityAccounts = plaidAccounts[eId] || [];
          return (
            <div key={eId} className="rounded-xl border border-gray-200 overflow-hidden bg-white shadow-sm">
              <div className="px-5 py-3.5 bg-gray-50 border-b border-gray-200 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center flex-shrink-0">
                    <Building2 className="w-4 h-4 text-amber-600" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-gray-900">Legal Entity: {entity.legalBusinessName}</p>
                    <p className="text-[11px] text-gray-500 flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-0.5">
                      <span className="flex items-center gap-1"><Hash className="w-3 h-3" />EIN: {formatEIN(entity.federalEIN)}</span>
                      <span className="text-gray-300">|</span>
                      {rows.length} {rows.length === 1 ? 'location' : 'locations'}
                    </p>
                    {entity.corporateMailingAddress && (
                      <p className="text-[10px] text-slate-500 flex items-center gap-1 mt-1"><MapPin className="w-3 h-3 flex-shrink-0" />{entity.corporateMailingAddress}</p>
                    )}
                  </div>
                </div>
                <div className="flex-shrink-0">
                  {entityAccounts.length > 0 ? (
                    <span className="text-xs text-green-700 font-semibold flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" /> {entityAccounts.length} {entityAccounts.length === 1 ? 'account' : 'accounts'} connected
                    </span>
                  ) : (
                    <EntityPlaidButton corporateId={profile.corporateId} entityId={eId} onAccountsConnected={handleAccountsConnected} />
                  )}
                </div>
              </div>
              <div className="px-5 py-4 space-y-2">
                <div className="hidden md:grid grid-cols-12 gap-3 text-[10px] font-semibold text-gray-400 uppercase tracking-wide">
                  <div className="col-span-4">Storefront Location</div>
                  <div className="col-span-4">Bank Account</div>
                  <div className="col-span-3">Status</div>
                  <div className="col-span-1"></div>
                </div>
                {rows.map(row => <LocationRow key={row.id} row={row} suppressColDef />)}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  if (loading) return <div className="flex flex-col items-center justify-center py-24 gap-3"><Loader2 className="w-8 h-8 text-gray-400 animate-spin" /><p className="text-sm text-gray-500">Loading locations...</p></div>;

  return (
    <div className="flex flex-col">
      {/* Header */}
      <div className="px-8 pt-8 pb-6 border-b border-gray-100">
        <div className="inline-flex items-center gap-2 bg-blue-50 text-blue-700 text-xs font-semibold px-3 py-1.5 rounded-full mb-3">
          <span className="w-1.5 h-1.5 rounded-full bg-blue-500" /> STEP 2 OF 3 — BUSINESS LOCATIONS
        </div>
        <div>
          <h2 className="text-2xl font-bold text-gray-900 mb-1.5">Add Your Storefront Locations</h2>
          <p className="text-gray-500 text-sm">
            {isMultiEntity
              ? 'Locations are grouped by their assigned legal entity. Each entity boards as its own processing account with a distinct MID.'
              : 'Enter each business location with address verification and legal entity assignment.'}
          </p>
          {isMultiEntity && (
            <div className="mt-3 flex items-center gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              <Layers className="w-3.5 h-3.5 flex-shrink-0" />
              Multi-entity detected — locations are organized by corporate shell below. Each group becomes a separate processing account.
            </div>
          )}
        </div>
      </div>

      {/* Back + CTA buttons */}
      <div className="px-8 pt-6 pb-4 flex gap-3">
        {onBack && (
          <button onClick={() => setShowBackConfirm(true)} className="flex items-center justify-center gap-2 border border-gray-200 hover:bg-gray-50 text-gray-700 font-semibold py-3.5 px-5 rounded-xl text-sm transition-all flex-shrink-0">
            ← Back
          </button>
        )}
        <button onClick={() => setShowAddLoc(true)} className="flex-1 flex items-center justify-center gap-2 bg-gray-900 hover:bg-gray-800 text-white font-semibold py-3.5 px-6 rounded-xl text-sm transition-all shadow-sm">
          <Plus className="w-4 h-4" /> + Add Business Location
        </button>
        {locs.length === 0 && (
          <p className="text-center text-xs text-gray-400 mt-2">Add at least one business location to continue.</p>
        )}
      </div>

      {/* List or Grouped Tree */}
      <div className="px-8 pb-2">
        {locs.length === 0 ? (
          <div className="text-center py-12 border border-dashed border-gray-200 rounded-xl">
            <Store className="w-10 h-10 text-gray-300 mx-auto mb-3" />
            <p className="text-sm text-gray-500">No locations added yet.</p>
            <p className="text-xs text-gray-400 mt-1">Click the button above to add your first storefront.</p>
          </div>
        ) : renderLocationList()}
      </div>

      {/* Continue */}
      <div className="px-8 pt-4 pb-8">
        <button onClick={handleSaveAndContinue} disabled={!isReady || saving} className="w-full flex items-center justify-center gap-3 bg-gray-900 hover:bg-gray-800 disabled:bg-gray-200 disabled:text-gray-400 text-white font-bold py-4 px-6 rounded-xl text-base transition-all shadow-lg shadow-gray-900/20 disabled:shadow-none">
          {saving ? <><Loader2 className="w-5 h-5 animate-spin" /> Saving...</> : <>Continue to Verification <ArrowRight className="w-5 h-5" /></>}
        </button>
        {locs.length === 0 && <p className="text-center text-xs text-gray-400 mt-3">Add at least one business location to continue.</p>}
        {locs.length > 0 && !isReady && <p className="text-center text-xs text-gray-400 mt-3">Assign a bank account to every location to continue.</p>}
      </div>

      {/* Add Modal */}
      {showAddLoc && (
        <AddLocationModal
          corporateId={profile.corporateId}
          entities={entities}
          initialLegalName={profile.legalName}
          initialTaxId={profile.taxId}
          initialDbaName={profile.legalName}
          onLocationAdded={handleLocationAdded}
          onClose={() => setShowAddLoc(false)}
        />
      )}

      {/* Back confirmation dialog */}
      {showBackConfirm && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/45 px-4" onClick={(e) => { if (e.target === e.currentTarget) setShowBackConfirm(false); }}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0"><AlertTriangle className="w-5 h-5 text-amber-600" /></div>
              <div>
                <h3 className="font-bold text-gray-900 text-base">Go Back?</h3>
                <p className="text-xs text-gray-400">
                  {isSelfServe
                    ? 'Returning to the pricing page will let you pick a different plan. Any locations and banking you\'ve added will be saved in this session and reappear when you continue.'
                    : 'Returning to Step 1 will keep your agreement status intact.'}
                </p>
              </div>
            </div>
            {isSelfServe && (
              <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4 flex items-start gap-2">
                <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                Picking a new pricing tier creates a fresh deal. Locations added to the current deal will still be visible here if you continue with any plan — they are only lost if a new deal ID replaces this one.
              </p>
            )}
            <div className="flex gap-3 justify-end">
              <button onClick={() => setShowBackConfirm(false)} className="text-sm font-medium text-gray-500 border border-gray-200 rounded-xl py-2.5 px-5 hover:bg-gray-50 transition-all">Stay Here</button>
              <button onClick={() => { setShowBackConfirm(false); onBack(); }} className="text-sm font-semibold text-white bg-gray-900 hover:bg-gray-800 rounded-xl py-2.5 px-5 transition-all">Go Back</button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {editLocId && (() => {
        const loc = locs.find(l => l.id === editLocId);
        if (!loc) return null;
        return (
          <AddLocationModal
            corporateId={profile.corporateId}
            entities={entities}
            initialLegalName={profile.legalName}
            initialTaxId={profile.taxId}
            initialDbaName={loc.dbaName}
            initialBusinessAddress={loc.businessAddress}
            onLocationAdded={handleLocationUpdated}
            onClose={() => setEditLocId(null)}
          />
        );
      })()}
    </div>
  );
}