import { useState, useEffect } from 'react';
import { Plus, ArrowRight, Loader2, Store, Landmark, Trash2, CheckCircle2, AlertCircle, Pencil, Check, MapPin, Building2, Hash, Layers } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import AddLocationModal from '@/components/onboarding/AddLocationModal';
import PerRowPlaidLink from '@/components/onboarding/PerRowPlaidLink';

function formatEIN(raw) {
  const d = (raw || '').replace(/\D/g, '');
  return d.length >= 9 ? `${d.slice(0, 2)}-${d.slice(2, 9)}` : raw || '';
}

export default function OnboardingLocations({ profile, onContinue }) {
  const [entities, setEntities] = useState([]);
  const [locs, setLocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddLoc, setShowAddLoc] = useState(false);
  const [editLocId, setEditLocId] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => { loadData(); }, []);

  const fetchEntities = async () => {
    const res = await base44.functions.invoke('manageLegalEntity', { action: 'list', corporateId: profile.corporateId });
    return res.data?.entities || [];
  };

  const loadData = async () => {
    setLoading(true);
    try {
      const activeEntities = await fetchEntities();
      setEntities(activeEntities);
      const liveRes = await base44.functions.invoke('listLocations', { corporateId: profile.corporateId });
      const entityById = Object.fromEntries(activeEntities.map(e => [e.entityId, e]));
      setLocs((liveRes.data?.locations || []).map(loc => ({
        id: loc.id || loc.locationId,
        entityId: entityById[loc.entityId] ? loc.entityId : activeEntities[0]?.entityId || '',
        dbaName: loc.dbaName,
        businessAddress: loc.businessAddress,
        addressVerified: loc.addressVerified || false,
        bankDetails: loc.bankDetails || { routingNumber: loc.routingNumber || '', accountNumber: loc.accountNumber || '', authMethod: null },
        isManualMode: false,
        applicationStepStatus: loc.applicationStepStatus || 'In Review',
        elavonMID: loc.elavonMID,
      })));
    } catch (_) { setEntities([]); setLocs([]); }
    finally { setLoading(false); }
  };

  const updateLoc = (id, patch) => setLocs(prev => prev.map(l => l.id !== id ? l : { ...l, ...patch }));
  const removeLoc = (id) => { setLocs(prev => prev.filter(l => l.id !== id)); setEditLocId(p => p === id ? null : p); };

  const handleLocationAdded = ({ reloadEntities }) => {
    if (reloadEntities) loadData();
    else loadData();
  };
  const handleLocationUpdated = () => { loadData(); };

  const entityById = Object.fromEntries(entities.map(e => [e.entityId, e]));

  // Group locations by entity
  const isMultiEntity = entities.length > 1;
  const grouped = {};
  locs.forEach(l => {
    const eId = l.entityId || '';
    if (!grouped[eId]) grouped[eId] = [];
    grouped[eId].push(l);
  });

  const isReady = locs.length > 0 && locs.every(
    l => l.applicationStepStatus === 'Approved' || (l.bankDetails?.routingNumber && l.bankDetails?.accountNumber)
  );

  const handleSaveAndContinue = async () => {
    setSaving(true);
    try {
      const toSave = locs.filter(l => l.applicationStepStatus !== 'Approved').map(l => ({ id: l.id, bankDetails: l.bankDetails }));
      if (toSave.length > 0) await base44.functions.invoke('saveLocationBankDetails', { locations: toSave });
      onContinue({ locations: locs, legalEntities: entities });
    } catch (err) { console.error(err); }
    finally { setSaving(false); }
  };

  const LocationRow = ({ row, suppressColDef }) => {
    const hasBanking = !!row.bankDetails?.routingNumber && !!row.bankDetails?.accountNumber;
    const isApproved = row.applicationStepStatus === 'Approved';
    const isError = row.applicationStepStatus === 'Error';
    const isPlaid = row.bankDetails?.authMethod === 'Plaid';
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
          {hasBanking ? (
            <div className="flex items-center gap-2">
              <Landmark className={`w-4 h-4 flex-shrink-0 ${isPlaid ? 'text-blue-500' : 'text-gray-400'}`} />
              <div>
                <span className="text-xs font-mono font-semibold text-gray-900">{row.bankDetails.accountNumberMasked || `••••${(row.bankDetails.accountNumber || '').slice(-4)}`}</span>
                <p className="text-[10px] text-gray-400">{row.bankDetails.accountType === 'savings' ? 'Savings' : 'Checking'} · {row.bankDetails.authMethod}</p>
              </div>
            </div>
          ) : !isApproved && !isError ? (
            <div className="flex flex-wrap items-center gap-1.5 w-full">
              <div className="min-w-0 w-auto">
                <PerRowPlaidLink corporateId={profile.corporateId} locationId={row.id} onBankConnected={(bk) => updateLoc(row.id, { bankDetails: bk })} />
              </div>
              {!row.isManualMode ? (
                <button onClick={() => updateLoc(row.id, { isManualMode: true })} className="text-[10px] text-gray-400 hover:text-blue-600 underline whitespace-nowrap">Set Up Manually...</button>
              ) : (
                <div className="flex items-center gap-1 w-full">
                  <input type="text" placeholder="Routing" maxLength={9} className="w-[6rem] text-[11px] border border-gray-200 rounded-lg px-2 py-1.5 font-mono focus:outline-none focus:ring-1 focus:ring-blue-500"
                    onChange={(e) => updateLoc(row.id, { manualRouting: e.target.value })} />
                  <input type="text" placeholder="Account" className="w-[7rem] text-[11px] border border-gray-200 rounded-lg px-2 py-1.5 font-mono focus:outline-none focus:ring-1 focus:ring-blue-500"
                    onChange={(e) => updateLoc(row.id, { manualAccount: e.target.value })} />
                  <button onClick={async () => {
                    const bk = { routingNumber: row.manualRouting || '', accountNumber: row.manualAccount || '', accountNumberMasked: `••••${(row.manualAccount || '').slice(-4)}`, authMethod: 'Manual' };
                    updateLoc(row.id, { bankDetails: bk, isManualMode: false });
                  }} disabled={!row.manualRouting || !row.manualAccount}
                    className="text-[10px] font-semibold bg-gray-900 text-white rounded-lg px-2 py-1.5 disabled:bg-gray-200 disabled:text-gray-400"><Check className="w-3 h-3" /></button>
                </div>
              )}
            </div>
          ) : null}
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
          {!isApproved && !hasBanking && (
            <button onClick={() => removeLoc(row.id)} className="text-xs text-gray-400 hover:text-red-500"><Trash2 className="w-3.5 h-3.5" /></button>
          )}
        </div>
      </div>
    );
  };

  const renderLocationList = () => {
    if (!isMultiEntity) {
      // Flat table — single entity
      return (
        <div className="space-y-2">
          <div className="hidden md:grid grid-cols-12 gap-3 px-4 py-2 text-[10px] font-semibold text-gray-400 uppercase tracking-wide">
            <div className="col-span-4">Storefront Location</div>
            <div className="col-span-4">Bank Account</div>
            <div className="col-span-3">Status</div>
            <div className="col-span-1"></div>
          </div>
          {locs.map(row => <LocationRow key={row.id} row={row} />)}
        </div>
      );
    }

    // Grouped tree layout — multi entity
    return (
      <div className="space-y-6">
        {Object.entries(grouped).map(([eId, rows]) => {
          const entity = entityById[eId] || { legalBusinessName: 'Unknown', federalEIN: '' };
          return (
            <div key={eId} className="rounded-xl border border-gray-200 overflow-hidden bg-white shadow-sm">
              <div className="px-5 py-3.5 bg-gray-50 border-b border-gray-200 flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center flex-shrink-0">
                  <Building2 className="w-4 h-4 text-amber-600" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-gray-900">Legal Entity: {entity.legalBusinessName}</p>
                  <p className="text-[11px] text-gray-500 flex items-center gap-1.5 mt-0.5">
                    <Hash className="w-3 h-3" /> EIN: {formatEIN(entity.federalEIN)}
                    <span className="text-gray-300 mx-1">·</span>
                    {rows.length} {rows.length === 1 ? 'location' : 'locations'}
                  </p>
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

      {/* Single CTA button */}
      <div className="px-8 pt-6 pb-4">
        <button onClick={() => setShowAddLoc(true)} className="w-full flex items-center justify-center gap-2 bg-gray-900 hover:bg-gray-800 text-white font-semibold py-3.5 px-6 rounded-xl text-sm transition-all shadow-sm">
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
          onLocationAdded={handleLocationAdded}
          onClose={() => setShowAddLoc(false)}
        />
      )}

      {/* Edit Modal */}
      {editLocId && (() => {
        const loc = locs.find(l => l.id === editLocId);
        if (!loc) return null;
        return (
          <AddLocationModal
            corporateId={profile.corporateId}
            entities={entities}
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