import { CheckCircle2, AlertCircle, Clock, Store, CreditCard, ArrowRight, Loader2 } from 'lucide-react';

const STATUS_STYLES = {
  'Active':          { icon: CheckCircle2, cls: 'text-green-600 bg-green-50 border-green-200', label: 'Active' },
  'Active (Existing)': { icon: CheckCircle2, cls: 'text-green-600 bg-green-50 border-green-200', label: 'Active (Existing)' },
  'Pending MID':     { icon: Clock, cls: 'text-amber-600 bg-amber-50 border-amber-200', label: 'Pending MID' },
  'Ready to Submit': { icon: ArrowRight, cls: 'text-blue-600 bg-blue-50 border-blue-200', label: 'Ready to Submit' },
  'In Review':       { icon: Clock, cls: 'text-gray-500 bg-gray-50 border-gray-200', label: 'In Review' },
  'Error':           { icon: AlertCircle, cls: 'text-red-600 bg-red-50 border-red-200', label: 'Error' },
};

function formatCurrency(val) {
  if (!val && val !== 0) return '—';
  return '$' + Number(val).toLocaleString();
}

export default function LocationStatusTable({ locations = [], concepts = [], loading }) {
  if (loading) {
    return (
      <div className="bg-[#1c2128] rounded-xl border border-white/10 p-12 flex flex-col items-center justify-center gap-3">
        <Loader2 className="w-6 h-6 text-gray-400 animate-spin" />
        <p className="text-sm text-gray-400">Loading location data...</p>
      </div>
    );
  }

  if (!locations.length) {
    return (
      <div className="bg-[#1c2128] rounded-xl border border-white/10 p-12 text-center">
        <Store className="w-10 h-10 text-gray-600 mx-auto mb-3" />
        <p className="text-sm text-gray-400">No business locations added yet.</p>
      </div>
    );
  }

  // Group concepts by locationId
  const conceptsByLoc = {};
  concepts.forEach(c => {
    const locId = c.locationId;
    if (!conceptsByLoc[locId]) conceptsByLoc[locId] = [];
    conceptsByLoc[locId].push(c);
  });

  // Derive status — concept status takes priority over location status
  const getLocationStatus = (loc) => {
    const cs = conceptsByLoc[loc.id];
    if (cs && cs.length > 0) {
      const best = cs.reduce((a, b) => {
        const order = { 'Error': 0, 'Active': 1, 'Active (Existing)': 2, 'Pending MID': 3, 'Ready to Submit': 4, 'In Review': 5 };
        return (order[a.applicationStepStatus] || 99) < (order[b.applicationStepStatus] || 99) ? a : b;
      });
      return best.applicationStepStatus || loc.applicationStepStatus || 'In Review';
    }
    return loc.applicationStepStatus || 'In Review';
  };

  return (
    <div className="bg-[#1c2128] rounded-xl border border-white/10 overflow-hidden">
      {/* Summary bar */}
      <div className="px-6 py-4 border-b border-white/10 flex flex-wrap items-center gap-x-8 gap-y-2">
        <div>
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Locations</p>
          <p className="text-lg font-bold text-white">{locations.length}</p>
        </div>
        <div>
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Concepts</p>
          <p className="text-lg font-bold text-white">{concepts.length}</p>
        </div>
        <div>
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Combined Volume</p>
          <p className="text-lg font-bold text-white">
            {formatCurrency(concepts.reduce((s, c) => s + (Number(c.monthlyCardSales) || 0), 0))}
          </p>
        </div>
        <div>
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Active / Complete</p>
          <p className="text-lg font-bold text-green-400">
            {locations.filter(l => {
              const s = getLocationStatus(l);
              return s === 'Active' || s === 'Active (Existing)';
            }).length} / {locations.length}
          </p>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
              <th className="text-left px-6 py-3">Location</th>
              <th className="text-left px-4 py-3">Concepts</th>
              <th className="text-left px-4 py-3">MCC / Industry</th>
              <th className="text-right px-4 py-3">Monthly Volume</th>
              <th className="text-right px-4 py-3">Avg Sale</th>
              <th className="text-center px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {locations.map(loc => {
              const cs = conceptsByLoc[loc.id] || [];
              const status = getLocationStatus(loc);
              const statDef = STATUS_STYLES[status] || STATUS_STYLES['In Review'];
              const StatIcon = statDef.icon;

              return (
                <tr key={loc.id} className="hover:bg-white/[0.02] transition-colors">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2.5">
                      <Store className="w-4 h-4 text-amber-400 flex-shrink-0" />
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-white truncate max-w-[200px]">{loc.dbaName}</p>
                        <p className="text-[11px] text-gray-400 truncate max-w-[200px]">{loc.businessAddress}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    {cs.length > 0 ? (
                      <div className="flex flex-col gap-1">
                        {cs.map(c => (
                          <div key={c.id} className="flex items-center gap-1.5">
                            <CreditCard className="w-3 h-3 text-amber-400/70 flex-shrink-0" />
                            <span className="text-xs text-gray-200 truncate max-w-[120px]">
                              {c.conceptName || c.dbaName || 'Concept'}
                            </span>
                            {c.elavonMID && (
                              <span className="text-[10px] font-mono text-green-500/70">MID</span>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <span className="text-xs text-gray-500">—</span>
                    )}
                  </td>
                  <td className="px-4 py-4">
                    {cs.length > 0 ? (
                      <div className="flex flex-col gap-1">
                        {cs.map(c => (
                          <div key={c.id} className="flex items-center gap-1.5">
                            <span className="text-[10px] font-mono text-amber-400 bg-amber-500/10 rounded px-1.5 py-0.5">
                              {c.mccCode || '—'}
                            </span>
                            {c.industryType && (
                              <span className="text-[10px] text-gray-400">{c.industryType}</span>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <span className="text-xs text-gray-500">—</span>
                    )}
                  </td>
                  <td className="px-4 py-4 text-right">
                    {cs.length > 0 ? (
                      <div className="flex flex-col gap-1 items-end">
                        {cs.map(c => (
                          <span key={c.id} className="text-xs font-semibold text-white">
                            {formatCurrency(c.monthlyCardSales)}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-xs text-gray-500">—</span>
                    )}
                  </td>
                  <td className="px-4 py-4 text-right">
                    {cs.length > 0 ? (
                      <div className="flex flex-col gap-1 items-end">
                        {cs.map(c => (
                          <span key={c.id} className="text-xs text-gray-200">
                            {formatCurrency(c.avgSaleAmount)}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-xs text-gray-500">—</span>
                    )}
                  </td>
                  <td className="px-4 py-4 text-center">
                    <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-full border ${statDef.cls}`}>
                      <StatIcon className="w-3 h-3" />
                      {statDef.label}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}