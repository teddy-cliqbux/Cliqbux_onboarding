import { useState, useEffect, useRef } from 'react';
import { Building2, ToggleLeft, ToggleRight, AlertCircle, CheckCircle2, Pencil, Landmark, Check } from 'lucide-react';
import AddLocationModal from './AddLocationModal';
import PerRowPlaidLink from './PerRowPlaidLink';

const GRID = '2fr 2.5fr 3fr 1fr 1.5fr';

export default function LocationsGrid({ corporateId, locations, corporateRouting, corporateAccount, onLocationsChange, onLocationUpdated }) {
  const rowsMapRef = useRef({});
  const [rows, setRows] = useState([]);
  const [editingLocation, setEditingLocation] = useState(null);
  const [bankEditingId, setBankEditingId] = useState(null);

  const stableId = (loc) => loc.id || loc.locationId || loc.dbaName;

  useEffect(() => {
    const newMap = { ...rowsMapRef.current };
    locations.forEach(loc => {
      const id = stableId(loc);
      if (!newMap[id]) {
        newMap[id] = {
          id,
          dbaName: loc.dbaName,
          businessAddress: loc.businessAddress,
          addressVerified: loc.addressVerified || false,
          useCorpAccount: false,
          bankDetails: loc.bankDetails || {
            routingNumber: loc.routingNumber || '',
            accountNumber: loc.accountNumber || '',
            authMethod: null
          },
          isManualMode: false,
          routingInput: loc.bankDetails?.routingNumber || loc.routingNumber || '',
          accountInput: loc.bankDetails?.accountNumber || loc.accountNumber || '',
          applicationStepStatus: loc.applicationStepStatus || 'In Review',
          elavonMID: loc.elavonMID,
        };
      } else {
        newMap[id] = {
          ...newMap[id],
          dbaName: loc.dbaName,
          businessAddress: loc.businessAddress,
          addressVerified: loc.addressVerified !== undefined ? loc.addressVerified : newMap[id].addressVerified,
          applicationStepStatus: loc.applicationStepStatus || newMap[id].applicationStepStatus,
          elavonMID: loc.elavonMID,
        };
      }
    });
    const activeIds = new Set(locations.map(stableId));
    Object.keys(newMap).forEach(k => { if (!activeIds.has(k)) delete newMap[k]; });
    rowsMapRef.current = newMap;
    const ordered = locations.map(loc => newMap[stableId(loc)]).filter(Boolean);
    setRows(ordered);
    onLocationsChange(ordered);
  }, [locations]);

  // Sync corporate routing to rows using Corp Acct toggle
  useEffect(() => {
    setRows(prev => {
      const updated = prev.map(row => {
        if (!row.useCorpAccount) return row;
        const next = { ...row, routingInput: corporateRouting || '', accountInput: corporateAccount || '', bankDetails: { authMethod: 'Manual', routingNumber: corporateRouting || '', accountNumber: corporateAccount || '' } };
        rowsMapRef.current[row.id] = next;
        return next;
      });
      onLocationsChange(updated);
      return updated;
    });
  }, [corporateRouting, corporateAccount]);

  const updateRows = (updater) => {
    setRows(prev => {
      const updated = updater(prev);
      updated.forEach(r => { rowsMapRef.current[r.id] = r; });
      onLocationsChange(updated);
      return updated;
    });
  };

  const toggleCorpAccount = (id, checked) => {
    updateRows(prev => {
      return prev.map(row => {
        if (row.id !== id) return row;
        if (checked) {
          const masterRow = prev[0];
          const banking = masterRow?.bankDetails ? { ...masterRow.bankDetails, authMethod: 'Manual' } : {};
          return {
            ...row,
            useCorpAccount: true,
            routingInput: masterRow?.routingInput || corporateRouting || '',
            accountInput: masterRow?.accountInput || corporateAccount || '',
            bankDetails: {
              routingNumber: masterRow?.routingInput || corporateRouting || '',
              accountNumber: masterRow?.accountInput || corporateAccount || '',
              authMethod: 'Manual',
              ...banking
            }
          };
        }
        return { ...row, useCorpAccount: false, bankDetails: {}, routingInput: '', accountInput: '' };
      });
    });
  };

  const handleBankConnected = (rowId, banking) => {
    updateRows(prev => prev.map(row => {
      if (row.id !== rowId) return row;
      return {
        ...row,
        bankDetails: banking,
        useCorpAccount: false,
        routingInput: banking.routingNumber,
        accountInput: banking.accountNumber
      };
    }));
  };

  const updateField = (id, field, value) => {
    updateRows(prev => prev.map(row => row.id !== id ? row : { ...row, [field]: value }));
  };

  const handleManualSave = (rowId) => {
    const row = rowsMapRef.current[rowId];
    if (!row?.routingInput || !row?.accountInput) return;
    updateRows(prev => prev.map(r => {
      if (r.id !== rowId) return r;
      const masked = `••••${r.accountInput.slice(-4)}`;
      return {
        ...r,
        bankDetails: { routingNumber: r.routingInput, accountNumber: r.accountInput, accountNumberMasked: masked, authMethod: 'Manual' },
        useCorpAccount: false
      };
    }));
    setBankEditingId(null);
  };

  const handleLocationEdited = (updatedLoc) => {
    updateRows(prev => prev.map(row => {
      if (row.id !== editingLocation.id) return row;
      return { ...row, dbaName: updatedLoc.dbaName, businessAddress: updatedLoc.businessAddress, addressVerified: updatedLoc.addressVerified || false };
    }));
    if (onLocationUpdated) onLocationUpdated(editingLocation.id, updatedLoc);
    setEditingLocation(null);
  };

  const getStatusBadge = (row) => {
    if (row.applicationStepStatus === 'Approved') return (
      <span className="inline-flex items-center gap-1 bg-green-50 text-green-700 text-xs font-semibold px-2 py-1 rounded-full border border-green-200 whitespace-nowrap">
        <CheckCircle2 className="w-3 h-3" /> Approved
      </span>
    );
    if (row.applicationStepStatus === 'Error') return (
      <span className="inline-flex items-center gap-1 bg-red-50 text-red-700 text-xs font-semibold px-2 py-1 rounded-full border border-red-200 whitespace-nowrap">
        <AlertCircle className="w-3 h-3" /> Error
      </span>
    );
    const hasBanking = row.bankDetails?.routingNumber && row.bankDetails?.accountNumber;
    if (hasBanking) return (
      <span className="inline-flex items-center gap-1 bg-amber-50 text-amber-700 text-xs font-semibold px-2 py-1 rounded-full border border-amber-200 whitespace-nowrap">
        Ready to Submit
      </span>
    );
    return (
      <span className="inline-flex items-center gap-1 bg-gray-50 text-gray-500 text-xs font-semibold px-2 py-1 rounded-full border border-gray-200 whitespace-nowrap">
        Needs Banking
      </span>
    );
  };

  const isApproved = (row) => row.applicationStepStatus === 'Approved';
  const masterHasBanking = rows.length > 0 && rows[0].bankDetails?.routingNumber;

  const BankingCell = ({ row, idx }) => {
    if (row.useCorpAccount && idx > 0) {
      return (
        <div className="w-full">
          <input
            type="text"
            value={row.accountInput ? `••••${row.accountInput.slice(-4)}` : ''}
            readOnly
            className="w-full text-xs border border-amber-200 rounded-lg px-3 py-2 bg-amber-50 text-amber-800 font-mono focus:outline-none"
            placeholder="Copied from Row 1"
          />
        </div>
      );
    }

    const hasActiveBanking = row.bankDetails?.routingNumber && row.bankDetails?.accountNumber;

    if (hasActiveBanking) {
      const isPlaid = row.bankDetails.authMethod === 'Plaid';
      return (
        <div className="w-full flex flex-col gap-1">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-gray-900 truncate flex items-center gap-1">
              {isPlaid ? <Landmark className="w-3 h-3 text-blue-500" /> : null}
              {row.bankDetails.accountNumberMasked || `••••${row.bankDetails.accountNumber.slice(-4)}`}
              {isPlaid ? <span className="text-[10px] bg-blue-100 text-blue-700 px-1 rounded font-semibold">Plaid</span> : null}
            </span>
            {!isApproved(row) && <button onClick={() => { setBankEditingId(row.id); updateField(row.id, 'routingInput', ''); updateField(row.id, 'accountInput', ''); }} className="text-[10px] text-gray-400 hover:text-gray-600 underline">Clear</button>}
          </div>
          <p className="text-[10px] text-gray-400 font-mono">{row.bankDetails.accountType === 'savings' ? 'Savings' : 'Checking'}</p>
        </div>
      );
    }

    if (isApproved(row)) {
      return <div className="text-xs text-gray-400 italic">Approved</div>;
    }

    if (row.isManualMode) {
      return (
        <div className="w-full flex flex-col gap-1.5">
          <div className="flex gap-1.5 w-full">
            <input
              type="text"
              value={row.routingInput}
              onChange={(e) => updateField(row.id, 'routingInput', e.target.value)}
              placeholder="Routing #"
              maxLength={9}
              className="flex-1 text-xs border border-gray-200 rounded-lg px-2 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
            />
            <input
              type="text"
              value={row.accountInput}
              onChange={(e) => updateField(row.id, 'accountInput', e.target.value)}
              placeholder="Account #"
              className="flex-1 text-xs border border-gray-200 rounded-lg px-2 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
            />
          </div>
          <button
            onClick={() => handleManualSave(row.id)}
            disabled={!row.routingInput || !row.accountInput}
            className="flex items-center justify-center gap-1 text-xs font-semibold text-white bg-gray-900 hover:bg-gray-800 disabled:bg-gray-200 disabled:text-gray-400 rounded-lg py-1.5 px-3 transition-all"
          >
            <Check className="w-3 h-3" /> Confirm Banking
          </button>
        </div>
      );
    }

    // No banking set and not in manual mode — show Plaid link with manual fallback
    return (
      <div className="w-full flex flex-col gap-1">
        <PerRowPlaidLink
          corporateId={corporateId}
          locationId={row.id}
          onBankConnected={(banking) => { setBankEditingId(null); handleBankConnected(row.id, banking); }}
        />
        <button
          onClick={() => updateField(row.id, 'isManualMode', true)}
          className="text-[10px] text-gray-400 hover:text-blue-600 underline self-center"
        >
          Set Up Manually...
        </button>
      </div>
    );
  };

  return (
    <>
      <div className="w-full overflow-x-auto">
        {/* Header */}
        <div
          className="hidden md:grid px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-t-xl"
          style={{ display: 'grid', gridTemplateColumns: GRID, gap: '16px', alignItems: 'center' }}
        >
          <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Location</div>
          <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Address</div>
          <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Plaid Account / A/C #</div>
          <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider text-center">Corp Acct</div>
          <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Status</div>
        </div>

        {/* Rows */}
        <div className="border border-t-0 border-gray-200 rounded-b-xl overflow-hidden">
          {rows.map((row, idx) => {
            const isMaster = idx === 0;
            const canToggleCorp = !isMaster && masterHasBanking && !isApproved(row);

            return (
              <div
                key={row.id}
                style={{ borderBottom: idx < rows.length - 1 ? '1px solid #E2E8F0' : 'none' }}
                className={`transition-colors ${isApproved(row) ? 'opacity-80' : ''}`}
              >
                {/* Mobile layout */}
                <div className="md:hidden flex flex-col gap-3 px-4 py-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <Building2 className="w-4 h-4 text-gray-400 flex-shrink-0" />
                        <span className="font-semibold text-gray-900 text-sm">{row.dbaName}</span>
                        {isMaster && <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-semibold">Primary</span>}
                      </div>
                      <p className="text-xs text-gray-400 mt-0.5 ml-6">{row.businessAddress}</p>
                      {row.addressVerified && <p className="text-xs text-green-600 font-medium ml-6 mt-0.5 flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> Verified</p>}
                    </div>
                    <div className="flex items-center gap-2">
                      {!isApproved(row) && (
                        <button onClick={() => setEditingLocation(row)} className="text-blue-500 hover:text-blue-700 transition-colors p-1">
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                      )}
                      {getStatusBadge(row)}
                    </div>
                  </div>
                  {row.elavonMID && <p className="text-xs text-gray-400">MID: <span className="font-mono font-semibold text-gray-700">{row.elavonMID}</span></p>}
                  <BankingCell row={row} idx={idx} />
                  {!isMaster && (
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-gray-500">Use Corporate Account</span>
                      <button onClick={() => toggleCorpAccount(row.id, !row.useCorpAccount)} disabled={!canToggleCorp} className="disabled:opacity-30 transition-opacity">
                        {row.useCorpAccount ? <ToggleRight className="w-7 h-7 text-amber-500" /> : <ToggleLeft className="w-7 h-7 text-gray-300" />}
                      </button>
                    </div>
                  )}
                </div>

                {/* Desktop flat row */}
                <div
                  className="hidden md:grid px-4 py-3 items-center"
                  style={{ display: 'grid', gridTemplateColumns: GRID, gap: '16px', alignItems: 'start', width: '100%' }}
                >
                  {/* Col 1: Location */}
                  <div className="flex items-center gap-2 min-w-0 pt-1">
                    <Building2 className="w-4 h-4 text-gray-400 flex-shrink-0" />
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <p className="font-semibold text-gray-900 text-sm leading-tight truncate">{row.dbaName}</p>
                        {!isApproved(row) && (
                          <button
                            onClick={() => setEditingLocation(row)}
                            className="flex items-center gap-1 text-xs text-blue-500 hover:text-blue-700 font-medium transition-colors flex-shrink-0"
                            title="Edit location"
                          >
                            <Pencil className="w-3 h-3" />
                            Edit
                          </button>
                        )}
                      </div>
                      {isMaster && <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-semibold">Primary</span>}
                      {row.elavonMID && <p className="text-xs text-gray-400 font-mono">MID: {row.elavonMID}</p>}
                    </div>
                  </div>

                  {/* Col 2: Address */}
                  <div className="min-w-0 pt-1">
                    <p className="text-xs text-gray-600 leading-tight break-words">{row.businessAddress}</p>
                    {row.addressVerified && (
                      <span className="inline-flex items-center gap-1 text-xs text-green-600 font-medium mt-0.5">
                        <CheckCircle2 className="w-3 h-3" /> Verified
                      </span>
                    )}
                  </div>

                  {/* Col 3: Banking */}
                  <BankingCell row={row} idx={idx} />

                  {/* Col 4: Corp Acct toggle */}
                  <div className="flex justify-center pt-1">
                    {isMaster ? (
                      <span className="text-xs text-gray-300">—</span>
                    ) : (
                      <button
                        onClick={() => toggleCorpAccount(row.id, !row.useCorpAccount)}
                        disabled={!canToggleCorp}
                        className="disabled:opacity-30 transition-opacity"
                        title={!masterHasBanking ? 'Set banking for Row 1 first' : ''}
                      >
                        {row.useCorpAccount ? <ToggleRight className="w-7 h-7 text-amber-500" /> : <ToggleLeft className="w-7 h-7 text-gray-300" />}
                      </button>
                    )}
                  </div>

                  {/* Col 5: Status */}
                  <div className="pt-1">{getStatusBadge(row)}</div>
                </div>
              </div>
            );
          })}

          {rows.length === 0 && (
            <div className="text-center py-12 text-gray-400 text-sm">
              No locations yet — add your first business location above.
            </div>
          )}
        </div>
      </div>

      {/* Edit modal */}
      {editingLocation && (
        <AddLocationModal
          mode="edit"
          corporateId={editingLocation.id}
          initialDbaName={editingLocation.dbaName}
          initialBusinessAddress={editingLocation.businessAddress}
          onLocationAdded={handleLocationEdited}
          onClose={() => setEditingLocation(null)}
        />
      )}
    </>
  );
}