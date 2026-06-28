import { useState, useEffect } from 'react';
import { ArrowLeft, ArrowRight, CheckCircle2, AlertCircle, CreditCard, Store, BarChart3, Percent, DollarSign, Loader2 } from 'lucide-react';
import LocationStatusTable from '@/components/onboarding/LocationStatusTable';
import { base44 } from '@/api/base44Client';

const inputCls = 'w-full bg-[#1A1D24] border border-white/25 rounded-lg px-3 py-2 text-sm text-white placeholder:text-gray-100 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent';
const statCls = 'text-sm font-semibold text-white';

function formatCurrency(val) {
  if (!val && val !== 0) return '—';
  return '$' + Number(val).toLocaleString();
}

function formatPct(val) {
  if (val == null) return '—';
  return val + '%';
}

export default function OnboardingSummary({ profile, locations, onContinue, onBack }) {
  const [merchantIDs, setMerchantIDs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [proceeding, setProceeding] = useState(false);
  const [editingMerchantID, setEditingMerchantID] = useState(null);
  const [editData, setEditData] = useState({});

  useEffect(() => {
    loadMerchantIDs();
  }, []);

  const loadMerchantIDs = async () => {
    setLoading(true);
    try {
      const res = await base44.functions.invoke('manageMerchantID', { action: 'list', corporateId: profile.corporateId });
      setMerchantIDs(res.data?.merchantIDs || []);
    } catch (_) { setMerchantIDs([]); }
    finally { setLoading(false); }
  };

  const locById = {};
  locations.forEach(l => { locById[l.id] = l; });

  // Group Merchant IDs by location
  const merchantIDsByLoc = {};
  merchantIDs.forEach(c => {
    const locId = c.locationId;
    if (!merchantIDsByLoc[locId]) merchantIDsByLoc[locId] = [];
    merchantIDsByLoc[locId].push(c);
  });

  const allLocations = locations.filter(l => {
    const cs = merchantIDsByLoc[l.id];
    return cs && cs.length > 0;
  });

  // Editing
  const startEdit = (merchantID) => {
    setEditingMerchantID(merchantID.id);
    setEditData({
      merchantName: merchantID.merchantName || merchantID.dbaName || '',
      mccCode: merchantID.mccCode || '',
      industryType: merchantID.industryType || '',
      monthlyCardSales: merchantID.monthlyCardSales || '',
      avgSaleAmount: merchantID.avgSaleAmount || '',
      highestTicketAmount: merchantID.highestTicketAmount || '',
      cardPresentPct: merchantID.cardPresentPct ?? 100,
      productDescription: merchantID.productDescription || '',
    });
  };

  // Allow proceeding even without Merchant IDs — some merchants may not have added any yet.
  // But warn them.
  const hasNoMerchantIDs = merchantIDs.length === 0;

  const handleProceed = () => {
    setProceeding(true);
    onContinue({ locations, merchantIDs });
  };

  // — Location summary cards with Merchant ID details —
  const renderLocationMerchantIDGroup = (loc) => {
    const cs = merchantIDsByLoc[loc.id] || [];

    return (
      <div key={loc.id} className="portal-card overflow-hidden">
        {/* Location header */}
        <div className="px-6 py-4 border-b border-white/10 flex items-center gap-3">
          <Store className="w-5 h-5 text-amber-400 flex-shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-white truncate">{loc.dbaName}</p>
            <p className="text-xs text-gray-200 truncate">{loc.businessAddress}</p>
          </div>
        </div>

        {cs.length === 0 ? (
          <div className="px-6 py-5 text-center">
            <p className="text-sm text-gray-200">No processing concepts set for this location yet.</p>
            <p className="text-xs text-gray-400 mt-1">You can add them from the Locations step.</p>
          </div>
        ) : (
          <div className="divide-y divide-white/5">
            {cs.map(c => (
              <div key={c.id} className="px-6 py-4">
                {editingMerchantID === c.id ? (
                  <InlineMerchantIDEdit
                    merchantID={c}
                    editData={editData}
                    setEditData={setEditData}
                    onSave={async () => {
                      try {
                        await base44.functions.invoke('manageMerchantID', {
                          action: 'update',
                          corporateId: profile.corporateId,
                          merchantIDId: c.id,
                          data: editData,
                        });
                        await loadMerchantIDs();
                      } catch (_) { /* best effort */ }
                      setEditingMerchantID(null);
                    }}
                    onCancel={() => setEditingMerchantID(null)}
                  />
                ) : (
                  <div>
                    {/* Concept header row */}
                    <div className="flex items-center justify-between gap-3 mb-3">
                      <div className="flex items-center gap-2 min-w-0">
                        <CreditCard className="w-4 h-4 text-amber-400 flex-shrink-0" />
                        <span className="text-sm font-bold text-white truncate">{c.conceptName || c.dbaName || 'Processing Concept'}</span>
                        <span className="text-[10px] font-mono text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded px-1.5 py-0.5">
                          {c.mccCode}
                        </span>
                      </div>
                      {c.industryType && (
                        <span className="text-[10px] text-gray-200 bg-white/5 rounded px-2 py-0.5">{c.industryType}</span>
                      )}
                    </div>

                    {/* Volume & stats grid */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <StatBox icon={<DollarSign className="w-3.5 h-3.5 text-amber-400" />}
                        label="Monthly Volume" value={formatCurrency(c.monthlyCardSales)} />
                      <StatBox icon={<DollarSign className="w-3.5 h-3.5 text-blue-400" />}
                        label="Avg Sale" value={formatCurrency(c.avgSaleAmount)} />
                      <StatBox icon={<DollarSign className="w-3.5 h-3.5 text-purple-400" />}
                        label="Highest Ticket" value={formatCurrency(c.highestTicketAmount)} />
                      <StatBox icon={<Percent className="w-3.5 h-3.5 text-green-400" />}
                        label="Card Present" value={formatPct(c.cardPresentPct)} />
                    </div>

                    {c.productDescription && (
                      <p className="text-xs text-gray-200 mt-3 italic">"{c.productDescription}"</p>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  if (loading) return (
    <div className="flex flex-col items-center justify-center py-24 gap-3">
      <Loader2 className="w-8 h-8 text-gray-400 animate-spin" />
      <p className="text-sm text-gray-500">Loading concept details...</p>
    </div>
  );

  return (
    <div className="flex flex-col">
      {/* Header */}
      <div className="px-8 pt-8 pb-6 border-b border-white/10">
        <div className="inline-flex items-center gap-2 bg-amber-500/15 text-amber-300 text-xs font-semibold px-3 py-1.5 rounded-full mb-3">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
          STEP 3 OF 4 — REVIEW &amp; CONFIRM
        </div>
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold text-white mb-1.5">Review Your Application</h2>
            <p className="text-gray-200 text-sm">
              Verify the volume, industry, and processing details for each location before proceeding.
            </p>
          </div>
          <button onClick={onBack}
            className="flex-shrink-0 flex items-center gap-2 text-sm font-medium text-gray-200 border border-white/15 hover:border-white/30 hover:bg-white/5 px-4 py-2 rounded-xl transition-all">
            <ArrowLeft className="w-4 h-4" /> Back
          </button>
        </div>
      </div>

      {/* Summary card — corporate totals */}
      <div className="px-8 py-5 border-b border-white/5">
        <div className="portal-card-amber px-5 py-4 flex flex-wrap items-center gap-x-8 gap-y-3">
          <div>
            <p className="text-[10px] font-semibold text-amber-400/70 uppercase tracking-wider">Total Locations</p>
            <p className="text-lg font-bold text-white">{allLocations.length}</p>
          </div>
          <div>
            <p className="text-[10px] font-semibold text-amber-400/70 uppercase tracking-wider">Total Concepts</p>
            <p className="text-lg font-bold text-white">{concepts.length}</p>
          </div>
          <div>
            <p className="text-[10px] font-semibold text-amber-400/70 uppercase tracking-wider">Combined Monthly Volume</p>
            <p className="text-lg font-bold text-white">
              {formatCurrency(concepts.reduce((sum, c) => sum + (Number(c.monthlyCardSales) || 0), 0))}
            </p>
          </div>
          <div>
            <p className="text-[10px] font-semibold text-amber-400/70 uppercase tracking-wider">Pricing Plan</p>
            <p className="text-sm font-bold text-white">{profile.pricingTier || 'Standard'}</p>
          </div>
        </div>
      </div>

      {/* Status table overview */}
      <div className="px-8 py-6">
        <h3 className="text-sm font-bold text-gray-300 uppercase tracking-wider mb-4">Onboarding Status</h3>
        <LocationStatusTable
          locations={locations}
          concepts={concepts}
          corporateId={profile.corporateId}
          onStatusChanged={loadConcepts}
        />
      </div>

      {/* Location review cards */}
      <div className="px-8 py-6 space-y-4">
        {hasNoConcepts && (
          <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl px-5 py-4 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-amber-300">No processing concepts added</p>
              <p className="text-xs text-amber-200 mt-1">
                No concepts (MCC/volume configurations) have been added for any location. You can continue and add them later, or go back to the Locations step to define them now.
              </p>
            </div>
          </div>
        )}

        {allLocations.length === 0 ? (
          <div className="text-center py-10 border border-dashed border-white/10 rounded-xl">
            <BarChart3 className="w-10 h-10 text-gray-500 mx-auto mb-3" />
            <p className="text-sm text-gray-200">No concepts to review yet.</p>
            <p className="text-xs text-gray-400 mt-1">Add processing concepts in the Locations step.</p>
          </div>
        ) : (
          allLocations.map(loc => renderLocationConceptGroup(loc))
        )}

        {/* Locations without concepts — show as minimal cards */}
        {locations.filter(l => {
          const cs = conceptsByLoc[l.id];
          return !cs || cs.length === 0;
        }).map(loc => (
          <div key={loc.id} className="portal-card px-6 py-4 flex items-center gap-3">
            <Store className="w-4 h-4 text-gray-400 flex-shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-white truncate">{loc.dbaName}</p>
              <p className="text-xs text-gray-200 truncate">{loc.businessAddress}</p>
            </div>
            <span className="text-[10px] text-gray-400 bg-white/5 rounded px-2 py-1">No concepts</span>
          </div>
        ))}
      </div>

      {/* Proceed */}
      <div className="px-8 pt-4 pb-8 border-t border-white/10">
        <button onClick={handleProceed} disabled={proceeding}
          className="w-full flex items-center justify-center gap-3 bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 disabled:from-gray-600 disabled:to-gray-600 disabled:text-gray-400 text-white font-bold py-4 px-6 rounded-xl text-base transition-all shadow-lg shadow-amber-900/30">
          {proceeding ? (
            <><Loader2 className="w-5 h-5 animate-spin" /> Proceeding...</>
          ) : (
            <>Continue to Identity Verification <ArrowRight className="w-5 h-5" /></>
          )}
        </button>
      </div>
    </div>
  );
}

// — Sub-components —

function StatBox({ icon, label, value }) {
  return (
    <div className="bg-white/5 rounded-lg px-3 py-2.5">
      <div className="flex items-center gap-1.5 mb-1">
        {icon}
        <span className="text-[10px] font-medium text-gray-200 uppercase tracking-wider">{label}</span>
      </div>
      <p className={statCls}>{value}</p>
    </div>
  );
}

function InlineConceptEdit({ concept, editData, setEditData, onSave, onCancel }) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-[10px] font-semibold text-gray-200 mb-1 block">Concept Name</label>
          <input type="text" value={editData.conceptName || ''}
            onChange={e => setEditData(p => ({ ...p, conceptName: e.target.value }))}
            className={inputCls} />
        </div>
        <div>
          <label className="text-[10px] font-semibold text-gray-200 mb-1 block">MCC</label>
          <input type="text" value={editData.mccCode || ''}
            onChange={e => setEditData(p => ({ ...p, mccCode: e.target.value }))}
            className={inputCls} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-[10px] font-semibold text-gray-200 mb-1 block">Monthly Volume ($)</label>
          <input type="number" value={editData.monthlyCardSales || ''}
            onChange={e => setEditData(p => ({ ...p, monthlyCardSales: e.target.value }))}
            className={inputCls} />
        </div>
        <div>
          <label className="text-[10px] font-semibold text-gray-200 mb-1 block">Avg Sale ($)</label>
          <input type="number" value={editData.avgSaleAmount || ''}
            onChange={e => setEditData(p => ({ ...p, avgSaleAmount: e.target.value }))}
            className={inputCls} />
        </div>
      </div>
      <div className="flex gap-2 justify-end pt-2">
        <button onClick={onCancel} className="text-xs font-medium text-gray-200 border border-white/20 rounded-lg px-3 py-1.5 hover:bg-white/5">Cancel</button>
        <button onClick={onSave} className="text-xs font-semibold text-white bg-amber-500 hover:bg-amber-400 rounded-lg px-3 py-1.5">Save</button>
      </div>
    </div>
  );
}