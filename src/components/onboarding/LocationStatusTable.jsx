import { useState, useEffect } from 'react';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { CheckCircle2, AlertCircle, Clock, Store, CreditCard, ArrowRight, Loader2, CheckSquare, Square, Check, X, Copy, GripVertical, Building2, ChevronDown, ChevronRight } from 'lucide-react';
import DragOrgMenu from './DragOrgMenu';
import { base44 } from '@/api/base44Client';

const STATUS_STYLES = {
  'Active':            { icon: CheckCircle2, cls: 'text-green-600 bg-green-50 border-green-200', label: 'Active' },
  'Active (Existing)': { icon: CheckCircle2, cls: 'text-green-600 bg-green-50 border-green-200', label: 'Active (Existing)' },
  'Pending MID':       { icon: Clock, cls: 'text-amber-600 bg-amber-50 border-amber-200', label: 'Pending MID' },
  'Ready to Submit':   { icon: ArrowRight, cls: 'text-blue-600 bg-blue-50 border-blue-200', label: 'Ready to Submit' },
  'In Review':         { icon: Clock, cls: 'text-gray-500 bg-gray-50 border-gray-200', label: 'In Review' },
  'Error':             { icon: AlertCircle, cls: 'text-red-600 bg-red-50 border-red-200', label: 'Error' },
};

const BATCH_STATUS_OPTIONS = ['In Review', 'Ready to Submit', 'Pending MID', 'Active', 'Error'];

function formatCurrency(val) {
  if (!val && val !== 0) return '—';
  return '$' + Number(val).toLocaleString();
}

export default function LocationStatusTable({ locations = [], concepts = [], loading, corporateId, onStatusChanged }) {
  const [selectedIds, setSelectedIds] = useState([]);
  const [entities, setEntities] = useState([]);
  const [batchStatus, setBatchStatus] = useState('');
  const [batchBusy, setBatchBusy] = useState(false);
  const [batchError, setBatchError] = useState('');
  const [batchDone, setBatchDone] = useState(false);
  const [duplicatingIds, setDuplicatingIds] = useState([]);
  const [movingLocId, setMovingLocId] = useState(null);
  const [dragError, setDragError] = useState('');
  const [collapsedGroups, setCollapsedGroups] = useState(new Set());

  const toggleGroup = (entityId) => setCollapsedGroups(prev => {
    const next = new Set(prev);
    next.has(entityId) ? next.delete(entityId) : next.add(entityId);
    return next;
  });

  useEffect(() => {
    if (corporateId) {
      base44.functions.invoke('manageLegalEntity', { action: 'list', corporateId })
        .then(res => setEntities(res.data?.entities || []))
        .catch(() => {});
    }
  }, [corporateId]);

  // Group concepts by locationId
  const conceptsByLoc = {};
  concepts.forEach(c => {
    if (!conceptsByLoc[c.locationId]) conceptsByLoc[c.locationId] = [];
    conceptsByLoc[c.locationId].push(c);
  });

  const getLocationStatus = (loc) => {
    const cs = conceptsByLoc[loc.id];
    if (cs && cs.length > 0) {
      const order = { 'Error': 0, 'Active': 1, 'Active (Existing)': 2, 'Pending MID': 3, 'Ready to Submit': 4, 'In Review': 5 };
      const best = cs.reduce((a, b) => (order[a.applicationStepStatus] || 99) < (order[b.applicationStepStatus] || 99) ? a : b);
      return best.applicationStepStatus || loc.applicationStepStatus || 'In Review';
    }
    return loc.applicationStepStatus || 'In Review';
  };

  // Group locations by entityId (or 'unassigned')
  const grouped = {};
  locations.forEach(loc => {
    const key = loc.entityId || 'unassigned';
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(loc);
  });

  // Build ordered group list: known entities first, then unassigned
  const entityGroups = entities.map(e => ({
    entityId: e.entityId,
    label: e.legalBusinessName || e.tradeNameDBA || e.entityId,
    ein: e.federalEIN ? `EIN …${e.federalEIN.slice(-4)}` : '',
    locations: grouped[e.entityId] || [],
  }));

  // Add "unassigned" group if any locations don't match a known entity
  const assignedIds = new Set(entities.map(e => e.entityId));
  const unassigned = locations.filter(l => !l.entityId || !assignedIds.has(l.entityId));
  const showGroups = entities.length >= 1;

  // ── Drag and drop ──────────────────────────────────────
  const onDragEnd = async ({ source, destination, draggableId }) => {
    setDragError('');
    if (!destination) return;
    if (source.droppableId === destination.droppableId) return; // same entity, no-op

    const targetEntityId = destination.droppableId === 'unassigned' ? null : destination.droppableId;
    if (!targetEntityId) return; // can't drop into unassigned

    setMovingLocId(draggableId);
    try {
      const res = await base44.functions.invoke('batchUpdateStatus', {
        corporateId,
        action: 'moveToEntity',
        locationIds: [draggableId],
        targetEntityId,
      });
      if (res.data?.error) throw new Error(res.data.error);
      if (onStatusChanged) onStatusChanged();
    } catch (err) {
      setDragError(err.message || 'Move failed.');
    } finally {
      setMovingLocId(null);
    }
  };

  // ── Selection ──
  const allSelected = selectedIds.length === locations.length && locations.length > 0;
  const toggleSelect = (id) => setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  const toggleSelectAll = () => allSelected ? setSelectedIds([]) : setSelectedIds(locations.map(l => l.id));

  // ── Duplicate ──
  const handleDuplicate = async (locId) => {
    setDuplicatingIds(prev => [...prev, locId]);
    try {
      await base44.functions.invoke('batchUpdateStatus', { corporateId, action: 'duplicateLocation', locationIds: [locId] });
      if (onStatusChanged) onStatusChanged();
    } catch (_) {}
    finally { setDuplicatingIds(prev => prev.filter(x => x !== locId)); }
  };

  // ── Batch status ──
  const clearSelection = () => { setSelectedIds([]); setBatchStatus(''); setBatchError(''); setBatchDone(false); };

  const handleBatchStatus = async () => {
    if (!batchStatus) { setBatchError('Select a status.'); return; }
    setBatchBusy(true); setBatchError('');
    try {
      const res = await base44.functions.invoke('batchUpdateStatus', { corporateId, action: 'updateStatus', locationIds: selectedIds, newStatus: batchStatus });
      if (res.data?.error) throw new Error(res.data.error);
      setBatchDone(true);
      if (onStatusChanged) onStatusChanged();
      setTimeout(clearSelection, 2000);
    } catch (err) { setBatchError(err.message || 'Update failed.'); }
    finally { setBatchBusy(false); }
  };

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

  const renderRow = (loc, dragHandleProps, isDragging) => {
    const cs = conceptsByLoc[loc.id] || [];
    const status = getLocationStatus(loc);
    const statDef = STATUS_STYLES[status] || STATUS_STYLES['In Review'];
    const StatIcon = statDef.icon;
    const isSelected = selectedIds.includes(loc.id);
    const isMoving = movingLocId === loc.id;

    return (
      <tr
        className={`transition-colors ${isDragging ? 'opacity-60 bg-amber-500/10' : 'hover:bg-white/[0.02]'} ${isSelected ? 'bg-amber-500/5 border-l-2 border-l-amber-400' : ''}`}
      >
        {/* Drag handle */}
        <td className="w-6 pl-2 py-4 text-center">
          <span {...dragHandleProps} className="text-gray-600 hover:text-gray-400 cursor-grab active:cursor-grabbing block">
            <GripVertical className="w-3.5 h-3.5" />
          </span>
        </td>
        {/* Checkbox */}
        <td className="px-2 py-4 text-center">
          <button onClick={() => toggleSelect(loc.id)} className="hover:text-white transition-colors">
            {isSelected ? <CheckSquare className="w-4 h-4 text-amber-400" /> : <Square className="w-4 h-4 text-gray-500" />}
          </button>
        </td>
        {/* Location */}
        <td className="px-2 py-4">
          <div className="flex items-center gap-2.5">
            {isMoving
              ? <Loader2 className="w-4 h-4 text-amber-400 animate-spin flex-shrink-0" />
              : <Store className={`w-4 h-4 flex-shrink-0 ${isSelected ? 'text-amber-400' : 'text-amber-400/70'}`} />
            }
            <div className="min-w-0">
              <p className="text-sm font-semibold text-white truncate max-w-[180px]">{loc.dbaName}</p>
              <p className="text-[11px] text-gray-400 truncate max-w-[180px]">{loc.businessAddress}</p>
            </div>
          </div>
        </td>
        {/* Concepts */}
        <td className="px-4 py-4">
          {cs.length > 0 ? (
            <div className="flex flex-col gap-1">
              {cs.map(c => (
                <div key={c.id} className="flex items-center gap-1.5">
                  <CreditCard className="w-3 h-3 text-amber-400/70 flex-shrink-0" />
                  <span className="text-xs text-gray-200 truncate max-w-[120px]">{c.conceptName || c.dbaName || 'Concept'}</span>
                  {c.elavonMID && <span className="text-[10px] font-mono text-green-500/70">MID</span>}
                </div>
              ))}
            </div>
          ) : <span className="text-xs text-gray-500">—</span>}
        </td>
        {/* MCC */}
        <td className="px-4 py-4">
          {cs.length > 0 ? (
            <div className="flex flex-col gap-1">
              {cs.map(c => (
                <div key={c.id} className="flex items-center gap-1.5">
                  <span className="text-[10px] font-mono text-amber-400 bg-amber-500/10 rounded px-1.5 py-0.5">{c.mccCode || '—'}</span>
                  {c.industryType && <span className="text-[10px] text-gray-400">{c.industryType}</span>}
                </div>
              ))}
            </div>
          ) : <span className="text-xs text-gray-500">—</span>}
        </td>
        {/* Volume */}
        <td className="px-4 py-4 text-right">
          {cs.length > 0 ? (
            <div className="flex flex-col gap-1 items-end">
              {cs.map(c => <span key={c.id} className="text-xs font-semibold text-white">{formatCurrency(c.monthlyCardSales)}</span>)}
            </div>
          ) : <span className="text-xs text-gray-500">—</span>}
        </td>
        {/* Avg sale */}
        <td className="px-4 py-4 text-right">
          {cs.length > 0 ? (
            <div className="flex flex-col gap-1 items-end">
              {cs.map(c => <span key={c.id} className="text-xs text-gray-200">{formatCurrency(c.avgSaleAmount)}</span>)}
            </div>
          ) : <span className="text-xs text-gray-500">—</span>}
        </td>
        {/* Status */}
        <td className="pr-4 py-4 text-center">
          <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-full border ${statDef.cls}`}>
            <StatIcon className="w-3 h-3" />
            {statDef.label}
          </span>
        </td>
        {/* Duplicate */}
        <td className="pr-3 py-4 text-center">
          <button
            onClick={() => handleDuplicate(loc.id)}
            disabled={duplicatingIds.includes(loc.id)}
            className="text-gray-500 hover:text-amber-400 disabled:text-gray-600 transition-colors p-1"
            title="Duplicate this location"
          >
            {duplicatingIds.includes(loc.id)
              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
              : <Copy className="w-3.5 h-3.5" />
            }
          </button>
        </td>
      </tr>
    );
  };

  const tableHead = (
    <thead>
      <tr className="border-b border-white/5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
        <th className="w-6 pl-2 py-3" />
        <th className="w-10 px-2 py-3 text-center">
          <button onClick={toggleSelectAll} className="hover:text-white transition-colors">
            {allSelected ? <CheckSquare className="w-4 h-4 text-amber-400" /> : <Square className="w-4 h-4" />}
          </button>
        </th>
        <th className="text-left px-2 py-3">Location</th>
        <th className="text-left px-4 py-3">Concepts</th>
        <th className="text-left px-4 py-3">MCC / Industry</th>
        <th className="text-right px-4 py-3">Monthly Volume</th>
        <th className="text-right px-4 py-3">Avg Sale</th>
        <th className="text-center pr-4 py-3">Status</th>
        <th className="w-10 pr-3 py-3" />
      </tr>
    </thead>
  );

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
            {locations.filter(l => { const s = getLocationStatus(l); return s === 'Active' || s === 'Active (Existing)'; }).length} / {locations.length}
          </p>
        </div>
        {showGroups && (
          <div className="ml-auto flex items-center gap-1.5 text-[10px] text-gray-400">
            <GripVertical className="w-3 h-3" />
            Drag rows between entities to reassign
          </div>
        )}
        {selectedIds.length > 0 && !showGroups && (
          <div className="ml-auto">
            <span className="text-xs text-amber-400 font-semibold">{selectedIds.length} selected</span>
          </div>
        )}
      </div>

      {/* Drag error */}
      {dragError && (
        <div className="px-6 py-2 bg-red-500/10 border-b border-red-500/20 text-xs text-red-400 flex items-center gap-2">
          <AlertCircle className="w-3.5 h-3.5" /> {dragError}
          <button onClick={() => setDragError('')} className="ml-auto"><X className="w-3.5 h-3.5" /></button>
        </div>
      )}

      {/* Batch action bar */}
      {selectedIds.length > 0 && (
        <div className="px-6 py-3 border-b border-amber-500/30 bg-amber-500/5 flex flex-wrap items-center gap-3">
          <button onClick={clearSelection} className="text-xs text-gray-400 hover:text-white flex items-center gap-1">
            <X className="w-3 h-3" /> Clear
          </button>
          <span className="w-px h-5 bg-white/10" />
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <span className="text-[10px] font-semibold text-gray-300 uppercase">Set Status:</span>
            <select
              value={batchStatus}
              onChange={(e) => { setBatchStatus(e.target.value); setBatchError(''); setBatchDone(false); }}
              className="bg-[#111318] border border-white/20 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-amber-500"
              style={{ colorScheme: 'dark' }}
            >
              <option value="">Choose...</option>
              {BATCH_STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <button
              onClick={handleBatchStatus}
              disabled={batchBusy || !batchStatus}
              className="text-xs font-semibold bg-amber-500 disabled:bg-gray-600 disabled:text-gray-400 text-black px-3 py-1.5 rounded-lg hover:bg-amber-400 transition-all flex items-center gap-1"
            >
              {batchBusy ? <Loader2 className="w-3 h-3 animate-spin" /> : batchDone ? <Check className="w-3 h-3" /> : <CheckCircle2 className="w-3 h-3" />}
              {batchBusy ? 'Applying...' : batchDone ? 'Done' : 'Apply'}
            </button>
            {batchError && <span className="text-[10px] text-red-400">{batchError}</span>}
          </div>
          <span className="w-px h-5 bg-white/10" />
          {entities.length > 1 && (
            <div className="flex-shrink-0">
              <DragOrgMenu corporateId={corporateId} entities={entities} selectedIds={selectedIds} onActionDone={clearSelection} />
            </div>
          )}
        </div>
      )}

      {/* Table — grouped by entity when multiple entities exist */}
      <div className="overflow-x-auto">
        {showGroups ? (
          <DragDropContext onDragEnd={onDragEnd}>
            <table className="w-full text-sm">
              {tableHead}
              {entityGroups.map((group) => {
                const isCollapsed = collapsedGroups.has(group.entityId);
                // Compute group-level stats for the summary pill
                const groupVolume = group.locations.reduce((sum, l) => {
                  return sum + (conceptsByLoc[l.id] || []).reduce((s, c) => s + (Number(c.monthlyCardSales) || 0), 0);
                }, 0);
                const activeCount = group.locations.filter(l => {
                  const s = getLocationStatus(l);
                  return s === 'Active' || s === 'Active (Existing)';
                }).length;

                return (
                  <Droppable droppableId={group.entityId} key={group.entityId}>
                    {(provided, snapshot) => (
                      <>
                        {/* Entity group header — collapsible */}
                        <tbody>
                          <tr>
                            <td colSpan={9} className={`transition-colors ${snapshot.isDraggingOver ? 'bg-amber-500/10' : 'bg-[#111318]'}`}>
                              <button
                                type="button"
                                onClick={() => toggleGroup(group.entityId)}
                                className="w-full flex items-center gap-2.5 px-4 py-2.5 hover:bg-white/[0.03] transition-colors text-left"
                              >
                                <Building2 className="w-3.5 h-3.5 text-amber-400/70 flex-shrink-0" />
                                <span className="text-[11px] font-bold text-amber-300 uppercase tracking-wider flex-1 truncate">{group.label}</span>
                                {group.ein && <span className="text-[10px] text-gray-500 font-mono">{group.ein}</span>}
                                <span className="text-[10px] text-gray-500">
                                  {group.locations.length} loc{group.locations.length !== 1 ? 's' : ''}
                                  {groupVolume > 0 && <> · {formatCurrency(groupVolume)}/mo</>}
                                  {activeCount > 0 && <span className="text-green-500 ml-1">· {activeCount} active</span>}
                                </span>
                                {snapshot.isDraggingOver
                                  ? <span className="text-[10px] text-amber-400 font-semibold animate-pulse ml-1">Drop here →</span>
                                  : isCollapsed
                                    ? <ChevronRight className="w-3.5 h-3.5 text-gray-500 flex-shrink-0" />
                                    : <ChevronDown className="w-3.5 h-3.5 text-gray-500 flex-shrink-0" />
                                }
                              </button>
                            </td>
                          </tr>
                        </tbody>
                        {/* Droppable tbody — hidden when collapsed */}
                        <tbody ref={provided.innerRef} {...provided.droppableProps} className={`divide-y divide-white/5 ${isCollapsed ? 'hidden' : ''}`}>
                          {group.locations.map((loc, idx) => (
                            <Draggable draggableId={loc.id} index={idx} key={loc.id}>
                              {(dragProvided, dragSnapshot) => (
                                <tr
                                  ref={dragProvided.innerRef}
                                  {...dragProvided.draggableProps}
                                  className={`transition-colors ${dragSnapshot.isDragging ? 'opacity-70 bg-amber-500/10' : 'hover:bg-white/[0.02]'} ${selectedIds.includes(loc.id) ? 'bg-amber-500/5 border-l-2 border-l-amber-400' : ''}`}
                                >
                                  <td className="w-6 pl-2 py-4 text-center">
                                    <span {...dragProvided.dragHandleProps} className="text-gray-600 hover:text-gray-300 cursor-grab active:cursor-grabbing block">
                                      <GripVertical className="w-3.5 h-3.5" />
                                    </span>
                                  </td>
                                  <td className="px-2 py-4 text-center">
                                    <button onClick={() => toggleSelect(loc.id)} className="hover:text-white transition-colors">
                                      {selectedIds.includes(loc.id) ? <CheckSquare className="w-4 h-4 text-amber-400" /> : <Square className="w-4 h-4 text-gray-500" />}
                                    </button>
                                  </td>
                                  {renderRowCells(loc, conceptsByLoc, movingLocId, duplicatingIds, handleDuplicate, selectedIds)}
                                </tr>
                              )}
                            </Draggable>
                          ))}
                          {provided.placeholder}
                          {group.locations.length === 0 && !snapshot.isDraggingOver && (
                            <tr>
                              <td colSpan={9} className="px-6 py-4 text-center text-xs text-gray-600">
                                No locations assigned — drag one here
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </>
                    )}
                  </Droppable>
                );
              })}
              {/* Unassigned locations (no droppable — not a valid drop target) */}
              {unassigned.length > 0 && (
                <>
                  <tbody>
                    <tr>
                      <td colSpan={9} className="px-4 py-2 bg-white/[0.02]">
                        <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">Unassigned · {unassigned.length}</span>
                      </td>
                    </tr>
                  </tbody>
                  <tbody className="divide-y divide-white/5">
                    {unassigned.map((loc) => (
                      <tr key={loc.id} className={`hover:bg-white/[0.02] transition-colors ${selectedIds.includes(loc.id) ? 'bg-amber-500/5 border-l-2 border-l-amber-400' : ''}`}>
                        <td className="w-6 pl-2 py-4" />
                        <td className="px-2 py-4 text-center">
                          <button onClick={() => toggleSelect(loc.id)} className="hover:text-white transition-colors">
                            {selectedIds.includes(loc.id) ? <CheckSquare className="w-4 h-4 text-amber-400" /> : <Square className="w-4 h-4 text-gray-500" />}
                          </button>
                        </td>
                        {renderRowCells(loc, conceptsByLoc, movingLocId, duplicatingIds, handleDuplicate, selectedIds)}
                      </tr>
                    ))}
                  </tbody>
                </>
              )}
            </table>
          </DragDropContext>
        ) : (
          // Single entity — simple flat table, no drag needed
          <table className="w-full text-sm">
            {tableHead}
            <tbody className="divide-y divide-white/5">
              {locations.map(loc => (
                <tr key={loc.id} className={`hover:bg-white/[0.02] transition-colors ${selectedIds.includes(loc.id) ? 'bg-amber-500/5 border-l-2 border-l-amber-400' : ''}`}>
                  <td className="w-6 pl-2 py-4" />
                  <td className="px-2 py-4 text-center">
                    <button onClick={() => toggleSelect(loc.id)} className="hover:text-white transition-colors">
                      {selectedIds.includes(loc.id) ? <CheckSquare className="w-4 h-4 text-amber-400" /> : <Square className="w-4 h-4 text-gray-500" />}
                    </button>
                  </td>
                  {renderRowCells(loc, conceptsByLoc, movingLocId, duplicatingIds, handleDuplicate, selectedIds)}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// Extracted shared row cells (everything after the grip + checkbox columns)
function renderRowCells(loc, conceptsByLoc, movingLocId, duplicatingIds, handleDuplicate, selectedIds) {
  const cs = conceptsByLoc[loc.id] || [];
  const status = (() => {
    if (cs.length > 0) {
      const order = { 'Error': 0, 'Active': 1, 'Active (Existing)': 2, 'Pending MID': 3, 'Ready to Submit': 4, 'In Review': 5 };
      const best = cs.reduce((a, b) => (order[a.applicationStepStatus] || 99) < (order[b.applicationStepStatus] || 99) ? a : b);
      return best.applicationStepStatus || loc.applicationStepStatus || 'In Review';
    }
    return loc.applicationStepStatus || 'In Review';
  })();
  const statDef = STATUS_STYLES[status] || STATUS_STYLES['In Review'];
  const StatIcon = statDef.icon;
  const isMoving = movingLocId === loc.id;
  const isSelected = selectedIds.includes(loc.id);

  return (
    <>
      <td className="px-2 py-4">
        <div className="flex items-center gap-2.5">
          {isMoving
            ? <Loader2 className="w-4 h-4 text-amber-400 animate-spin flex-shrink-0" />
            : <Store className={`w-4 h-4 flex-shrink-0 ${isSelected ? 'text-amber-400' : 'text-amber-400/70'}`} />
          }
          <div className="min-w-0">
            <p className="text-sm font-semibold text-white truncate max-w-[180px]">{loc.dbaName}</p>
            <p className="text-[11px] text-gray-400 truncate max-w-[180px]">{loc.businessAddress}</p>
          </div>
        </div>
      </td>
      <td className="px-4 py-4">
        {cs.length > 0 ? (
          <div className="flex flex-col gap-1">
            {cs.map(c => (
              <div key={c.id} className="flex items-center gap-1.5">
                <CreditCard className="w-3 h-3 text-amber-400/70 flex-shrink-0" />
                <span className="text-xs text-gray-200 truncate max-w-[120px]">{c.conceptName || c.dbaName || 'Concept'}</span>
                {c.elavonMID && <span className="text-[10px] font-mono text-green-500/70">MID</span>}
              </div>
            ))}
          </div>
        ) : <span className="text-xs text-gray-500">—</span>}
      </td>
      <td className="px-4 py-4">
        {cs.length > 0 ? (
          <div className="flex flex-col gap-1">
            {cs.map(c => (
              <div key={c.id} className="flex items-center gap-1.5">
                <span className="text-[10px] font-mono text-amber-400 bg-amber-500/10 rounded px-1.5 py-0.5">{c.mccCode || '—'}</span>
                {c.industryType && <span className="text-[10px] text-gray-400">{c.industryType}</span>}
              </div>
            ))}
          </div>
        ) : <span className="text-xs text-gray-500">—</span>}
      </td>
      <td className="px-4 py-4 text-right">
        {cs.length > 0 ? (
          <div className="flex flex-col gap-1 items-end">
            {cs.map(c => <span key={c.id} className="text-xs font-semibold text-white">{formatCurrency(c.monthlyCardSales)}</span>)}
          </div>
        ) : <span className="text-xs text-gray-500">—</span>}
      </td>
      <td className="px-4 py-4 text-right">
        {cs.length > 0 ? (
          <div className="flex flex-col gap-1 items-end">
            {cs.map(c => <span key={c.id} className="text-xs text-gray-200">{formatCurrency(c.avgSaleAmount)}</span>)}
          </div>
        ) : <span className="text-xs text-gray-500">—</span>}
      </td>
      <td className="pr-4 py-4 text-center">
        <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-full border ${statDef.cls}`}>
          <StatIcon className="w-3 h-3" />
          {statDef.label}
        </span>
      </td>
      <td className="pr-3 py-4 text-center">
        <button
          onClick={() => handleDuplicate(loc.id)}
          disabled={duplicatingIds.includes(loc.id)}
          className="text-gray-500 hover:text-amber-400 disabled:text-gray-600 transition-colors p-1"
          title="Duplicate this location"
        >
          {duplicatingIds.includes(loc.id)
            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
            : <Copy className="w-3.5 h-3.5" />
          }
        </button>
      </td>
    </>
  );
}