import { useState, useEffect } from 'react';
import { Plus, ArrowRight, Loader2, Building2, Landmark, Trash2, CheckCircle2, AlertCircle, Pencil, ToggleLeft, ToggleRight } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import AddEntityModal from '@/components/onboarding/AddEntityModal';
import AddLocationModal from '@/components/onboarding/AddLocationModal';
import PerRowPlaidLink from '@/components/onboarding/PerRowPlaidLink';
import ManualBankInputs from '@/components/onboarding/ManualBankInputs';

function maskEIN(ein) {
  if (!ein) return '';
  const d = ein.replace(/\D/g, '');
  return d.length >= 5 ? `${d.slice(0, 2)}-XXXXX${d.slice(-2)}` : ein;
}

export default function OnboardingLocations({ profile, locations: initialLocations, onContinue }) {
  const [entities, setEntities] = useState([]);
  const [locs, setLocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddEntity, setShowAddEntity] = useState(false);
  const [showAddLoc, setShowAddLoc] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      let activeEntities = await fetchEntities();
      if (activeEntities.length === 0 && initialLocations.length > 0) {
        await base44.functions.invoke('manageLegalEntity', {
          corporateId: profile.corporateId,
          action: 'add',
          legalBusinessName: profile.legalName,
          federalEIN: profile.corporateId
        });
        activeEntities = await fetchEntities();
      }
      setEntities(activeEntities);
      const activeEntityIds = new Set(activeEntities.map(e => e.entityId));
      setLocs(initialLocations.map(loc => ({
        id: loc.id || loc.locationId,
        entityId: activeEntityIds.has(loc.entityId) ? loc.entityId : activeEntities[0]?.entityId,
        dbaName: loc.dbaName,
        businessAddress: loc.businessAddress,
        addressVerified: loc.addressVerified || false,
        bankDetails: loc.bankDetails || {
          routingNumber: loc.routingNumber || '',
          accountNumber: loc.accountNumber || '',
          authMethod: null
        },
        routingInput: loc.bankDetails?.routingNumber || loc.routingNumber || '',
        accountInput: loc.bankDetails?.accountNumber || loc.accountNumber || '',
        isManualMode: false,
        useCorpAccount: false,
        applicationStepStatus: loc.applicationStepStatus || 'In Review',
        elavonMID: loc.elavonMID,
      })));
    } catch (_) {
      setEntities([]); setLocs([]);
    } finally { setLoading(false); }
  };

  const fetchEntities = async () => {
    const res = await base44.functions.invoke('manageLegalEntity', { action: 'list', corporateId: profile.corporateId });
    return res.data?.entities || [];
  };

  const forEntity = (entityId) => locs.filter(l => l.entityId === entityId);

  const updateLoc = (id, patch) => setLocs(prev => prev.map(l => l.id !== id ? l : { ...l, ...patch }));

  const mapLocs = (fn) => {
    const upd = fn(locs);
    setLocs(upd);
    return upd;
  };

  // Map logo colors by index
  const ENTITY_COLORS = ['#4338CA', '#7C3AED', '#0891B2', '#BE185D'];

  const isReady = entities.length > 0 && locs.length > 0 && locs.every(
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

  if (loading) return <div className="flex flex-col items-center justify-center py-24 gap-3"><Loader2 className="w-8 h-8 text-gray-400 animate-spin" /><p className="text-sm text-gray-500">Loading your entities...</p></div>;

  return (
    <div className="flex flex-col">
      {/* Header */}
      <div className="px-8 pt-8 pb-6 border-b border-gray-100">
        <div className="inline-flex items-center gap-2 bg-blue-50 text-blue-700 text-xs font-semibold px-3 py-1.5 rounded-full mb-3">
          <span className="w-1.5 h-1.5 rounded-full bg-blue-500" /> STEP 2 OF 3 — CORPORATE ENTITIES
        </div>
        <div>
          <h2 className="text-2xl font-bold text-gray-900 mb-1.5">Your Corporate Entities (EINs)</h2>
          <p className="text-gray-500 text-sm mb-4">Each EIN boards as its own processing account and receives a separate Merchant ID from Elavon.</p>
          <button onClick={() => setShowAddEntity(true)} className="w-full flex items-center justify-center gap-2 text-sm font-semibold text-white bg-gray-900 hover:bg-gray-800 px-5 py-3 rounded-xl transition-all shadow-sm">
            <Plus className="w-4 h-4" /> + Add Corporate Entity / EIN
          </button>
        </div>
      </div>

      <div className="px-8 py-6 flex flex-col gap-8">
        {entities.length === 0 && (
          <div className="text-center py-8"><Building2 className="w-10 h-10 text-gray-300 mx-auto mb-3" />
            <p className="text-sm text-gray-500">No corporate entities added yet.</p>
            <p className="text-xs text-gray-400 mt-1">Add your LLC, Corp, or DBA entity and assign storefronts.</p>
          </div>
        )}

        {entities.map((ent, eidx) => {
          const rows = forEntity(ent.entityId);
          const color = ENTITY_COLORS[eidx % ENTITY_COLORS.length];
          return (
            <div key={ent.entityId} className="border border-gray-200 rounded-xl overflow-hidden">
              {/* Entity card header */}
              <div className="border-b border-gray-200" style={{ background: `${color}08` }}>
                <div className="px-5 py-4 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: `${color}18`, color }}>
                      <Building2 className="w-4.5 h-4.5" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-gray-900 truncate">{ent.legalBusinessName}</p>
                      <p className="text-xs text-gray-500 font-mono mt-0.5">EIN: <span className="font-semibold">{maskEIN(ent.federalEIN)}</span></p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <span className="text-xs font-semibold text-gray-500 bg-white border border-gray-200 px-2.5 py-1 rounded-full">
                      {rows.length} location{rows.length !== 1 ? 's' : ''}
                    </span>
                    <button onClick={() => setEntities(prev => prev.filter(e => e.entityId !== ent.entityId))} className="text-gray-300 hover:text-red-500 p-1.5 rounded-lg transition-colors" title="Remove entity">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>

              {/* Location rows inside entity */}
              <div className="px-5 py-4 flex flex-col gap-2">
                {rows.map(row => {
                  const hasBanking = !!row.bankDetails?.routingNumber && !!row.bankDetails?.accountNumber;
                  const isApproved = row.applicationStepStatus === 'Approved';
                  const isError = row.applicationStepStatus === 'Error';
                  const isPlaid = row.bankDetails?.authMethod === 'Plaid';
                  return (
                    <div key={row.id} className={`flex items-center gap-3 p-3 rounded-lg border ${isApproved ? 'border-green-200 bg-green-50' : isError ? 'border-red-200 bg-red-50' : hasBanking ? 'border-amber-200 bg-amber-50/40' : 'border-gray-100 bg-white'}`}>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-900 truncate flex items-center gap-2">
                          {row.dbaName}
                          {!isApproved && <button onClick={() => setShowAddLoc(ent.entityId)} className="text-xs text-blue-500 hover:text-blue-700"><Pencil className="w-3 h-3 inline" /> Edit</button>}
                        </p>
                        <p className="text-xs text-gray-500 truncate">{row.businessAddress}</p>
                        {row.elavonMID && <p className="text-xs text-gray-400 font-mono mt-0.5">MID: {row.elavonMID}</p>}
                      </div>
                      {/* Banking */}
                      {hasBanking ? (
                        <div className="flex-shrink-0 text-right">
                          <span className="text-xs font-mono font-semibold text-gray-900 flex items-center gap-1 justify-end">
                            {isPlaid && <Landmark className="w-3 h-3 text-blue-500" />}
                            {row.bankDetails.accountNumberMasked || `••••${String(Math.random() * 10000 | 0).padStart(4, '0')}`}
                          </span>
                          <p className="text-[10px] text-gray-400">{row.bankDetails.accountType === 'savings' ? 'Savings' : 'Checking'} · {row.bankDetails.authMethod}</p>
                        </div>
                      ) : !isApproved && !isError ? (
                        <div className="flex-shrink-0 w-48 flex flex-col gap-1">
                          <PerRowPlaidLink corporateId={profile.corporateId} locationId={row.id} onBankConnected={(bk) => updateLoc(row.id, { bankDetails: bk, routingInput: bk.routingNumber, accountInput: bk.accountNumber })} />
                          <button onClick={() => updateLoc(row.id, { isManualMode: true })} className="text-[10px] text-gray-400 hover:text-blue-600 underline self-center">Set Up Manually...</button>
                        </div>
                      ) : null}
                      {row.isManualMode && <div className="flex-shrink-0 w-48"><ManualBankInputs rowId={row.id} onConfirm={(rid, routing, account) => {
                        const masked = `••••${(account || '').slice(-4)}`;
                        updateLoc(rid, { isManualMode: false, routingInput: routing || '', accountInput: account || '', bankDetails: { routingNumber: routing || '', accountNumber: account || '', accountNumberMasked: masked, authMethod: 'Manual' }, useCorpAccount: false });
                      }} /></div>}
                      {/* Status */}
                      <div className="flex-shrink-0 text-center w-14">
                        {isApproved ? <CheckCircle2 className="w-5 h-5 text-green-600 mx-auto" /> : isError ? <AlertCircle className="w-5 h-5 text-red-500 mx-auto" /> : hasBanking ? <span className="text-xs font-semibold text-amber-600">Ready</span> : <span className="text-xs text-gray-400">—</span>}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Entity footer: Add location */}
              <div className="border-t border-dashed border-gray-200 px-5 py-3">
                <button onClick={() => setShowAddLoc(ent.entityId)} className="w-full flex items-center justify-center gap-1.5 text-sm font-semibold rounded-lg py-2 px-4 transition-all border" style={{ color, borderColor: `${color}44`, background: `${color}08` }}>
                  <Plus className="w-3.5 h-3.5" />
                  + Add Storefront Location to {ent.legalBusinessName}
                </button>
              </div>
            </div>
          );
        })}

        {/* Continue */}
        <div className="pb-2">
          <button onClick={handleSaveAndContinue} disabled={!isReady || saving} className="w-full flex items-center justify-center gap-3 bg-gray-900 hover:bg-gray-800 disabled:bg-gray-200 disabled:text-gray-400 text-white font-bold py-4 px-6 rounded-xl text-base transition-all shadow-lg shadow-gray-900/20 disabled:shadow-none">
            {saving ? <><Loader2 className="w-5 h-5 animate-spin" /> Saving...</> : <>Continue to Verification <ArrowRight className="w-5 h-5" /></>}
          </button>
          {entities.length === 0 && <p className="text-center text-xs text-gray-400 mt-3">Add at least one corporate entity with locations to continue.</p>}
          {locs.length === 0 && entities.length > 0 && <p className="text-center text-xs text-gray-400 mt-3">Add storefront locations for each entity to continue.</p>}
          {locs.length > 0 && !isReady && <p className="text-center text-xs text-gray-400 mt-3">Assign a bank account to every location to continue.</p>}
        </div>
      </div>

      {showAddEntity && <AddEntityModal corporateId={profile.corporateId} onAdded={(list) => setEntities(list)} onClose={() => setShowAddEntity(false)} />}
      {showAddLoc && (
        <AddLocationModal
          corporateId={profile.corporateId}
          entityId={showAddLoc}
          onLocationAdded={() => { setShowAddLoc(null); loadData(); }}
          onClose={() => setShowAddLoc(null)}
        />
      )}
    </div>
  );
}