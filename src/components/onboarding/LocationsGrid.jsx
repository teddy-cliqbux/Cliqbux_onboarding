import { useState, useEffect, useRef } from 'react';
import { Building2, ToggleLeft, ToggleRight, AlertCircle, CheckCircle2, ChevronDown } from 'lucide-react';

export default function LocationsGrid({ locations, corporateRouting, corporateAccount, plaidAccounts, onLocationsChange }) {
  // Use a ref-based rows map to avoid wiping state on new location pushes.
  // rowsMap: { [stableId]: rowState }
  const rowsMapRef = useRef({});
  const [rows, setRows] = useState([]);

  // Stable id for each location: prefer entity id, fallback to locationId field
  const stableId = (loc) => loc.id || loc.locationId || loc.dbaName;

  // Sync new locations in without resetting existing row state
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
          routingInput: loc.routingNumber || '',
          accountInput: loc.accountNumber || '',
          selectedPlaidAccountId: null,
          applicationStepStatus: loc.applicationStepStatus || 'In Review',
          elavonMID: loc.elavonMID,
        };
      } else {
        // Update non-user-editable fields only
        newMap[id] = {
          ...newMap[id],
          dbaName: loc.dbaName,
          businessAddress: loc.businessAddress,
          applicationStepStatus: loc.applicationStepStatus || newMap[id].applicationStepStatus,
          elavonMID: loc.elavonMID,
        };
      }
    });
    // Remove stale keys
    const activeIds = new Set(locations.map(stableId));
    Object.keys(newMap).forEach(k => { if (!activeIds.has(k)) delete newMap[k]; });

    rowsMapRef.current = newMap;
    const ordered = locations.map(loc => newMap[stableId(loc)]).filter(Boolean);
    setRows(ordered);
    onLocationsChange(ordered);
  }, [locations]);

  // When corporate bank values change, propagate to toggled rows
  useEffect(() => {
    setRows(prev => {
      const updated = prev.map(row => {
        if (!row.useCorpAccount) return row;
        const next = { ...row, routingInput: corporateRouting || '', accountInput: corporateAccount || '' };
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

  // Corp account toggle: copies Row 0 (master) Plaid account into the toggled row
  const toggleCorpAccount = (id, checked) => {
    updateRows(prev => {
      const masterRow = prev[0];
      return prev.map(row => {
        if (row.id !== id) return row;
        if (checked && masterRow) {
          return {
            ...row,
            useCorpAccount: true,
            selectedPlaidAccountId: masterRow.selectedPlaidAccountId,
            routingInput: masterRow.routingInput || corporateRouting || '',
            accountInput: masterRow.accountInput || corporateAccount || '',
          };
        }
        return { ...row, useCorpAccount: false, selectedPlaidAccountId: null, routingInput: '', accountInput: '' };
      });
    });
  };

  const handlePlaidSelect = (id, accountId) => {
    const acct = plaidAccounts.find(a => a.accountId === accountId);
    updateRows(prev => prev.map(row => {
      if (row.id !== id) return row;
      return {
        ...row,
        selectedPlaidAccountId: accountId,
        useCorpAccount: false,
        routingInput: acct?.routingNumber || '',
        accountInput: acct?.accountNumber || '',
      };
    }));
  };

  const updateField = (id, field, value) => {
    updateRows(prev => prev.map(row => row.id !== id ? row : { ...row, [field]: value }));
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
    const hasBanking = row.routingInput && row.accountInput;
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

  const hasPlaid = plaidAccounts && plaidAccounts.length > 0;
  const isApproved = (row) => row.applicationStepStatus === 'Approved';

  // Master row (row 0) determines what gets copied by Corp Acct toggle
  const masterHasBanking = rows.length > 0 && (rows[0].routingInput || rows[0].selectedPlaidAccountId);

  const BankingCell = ({ row, isMaster }) => {
    // Corp-toggled non-master rows: show locked values from master
    if (row.useCorpAccount && !isMaster) {
      return (
        <div className="col-span-4 flex items-center gap-2">
          <input
            type="text"
            value={row.selectedPlaidAccountId
              ? `••••${plaidAccounts.find(a => a.accountId === row.selectedPlaidAccountId)?.mask || ''}`
              : row.accountInput ? `••••${row.accountInput.slice(-4)}` : ''}
            readOnly
            className="w-full text-xs border border-amber-200 rounded-lg px-3 py-2 bg-amber-50 text-amber-800 font-mono focus:outline-none"
            placeholder="Copied from Row 1"
          />
        </div>
      );
    }

    if (hasPlaid && !isApproved(row)) {
      return (
        <div className="col-span-4 flex gap-2">
          <div className="relative flex-1">
            <select
              value={row.selectedPlaidAccountId || ''}
              onChange={(e) => handlePlaidSelect(row.id, e.target.value)}
              className="w-full text-xs border border-gray-200 rounded-lg px-2 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none pr-7 bg-white"
            >
              <option value="">Select account...</option>
              {plaidAccounts.map(acct => (
                <option key={acct.accountId} value={acct.accountId}>
                  {acct.name} ••••{acct.mask}
                </option>
              ))}
            </select>
            <ChevronDown className="w-3 h-3 text-gray-400 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>
          <input
            type="text"
            value={row.selectedPlaidAccountId ? `••••${plaidAccounts.find(a => a.accountId === row.selectedPlaidAccountId)?.mask || ''}` : ''}
            readOnly
            placeholder="Auto-filled"
            className="w-24 text-xs border border-gray-200 rounded-lg px-2 py-2 bg-gray-50 text-gray-500 font-mono focus:outline-none"
          />
        </div>
      );
    }

    return (
      <div className="col-span-4 flex gap-2">
        <input
          type="text"
          value={row.routingInput}
          onChange={(e) => updateField(row.id, 'routingInput', e.target.value)}
          disabled={isApproved(row)}
          placeholder="Routing #"
          className="flex-1 text-xs border border-gray-200 rounded-lg px-2 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-400 font-mono"
        />
        <input
          type="text"
          value={row.accountInput}
          onChange={(e) => updateField(row.id, 'accountInput', e.target.value)}
          disabled={isApproved(row)}
          placeholder="Account #"
          className="flex-1 text-xs border border-gray-200 rounded-lg px-2 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-400 font-mono"
        />
      </div>
    );
  };

  return (
    <div className="rounded-xl border border-gray-200 overflow-visible">
      {/* Table header */}
      <div className="bg-gray-50 border-b border-gray-200 px-4 py-3 hidden md:grid gap-3" style={{ gridTemplateColumns: '2fr 2fr 3fr 1fr 1.5fr' }}>
        <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Location</div>
        <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Address</div>
        <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{hasPlaid ? 'Plaid Account / Acct #' : 'Routing # / Account #'}</div>
        <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider text-center">Corp Acct</div>
        <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</div>
      </div>

      {/* Rows */}
      {rows.map((row, idx) => {
        const isMaster = idx === 0;
        const canToggleCorp = !isMaster && masterHasBanking && !isApproved(row);
        return (
          <div
            key={row.id}
            className={`px-4 py-4 border-b last:border-b-0 border-gray-100 transition-colors ${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'} ${isApproved(row) ? 'opacity-80' : ''}`}
          >
            {/* Mobile */}
            <div className="md:hidden flex flex-col gap-3">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <Building2 className="w-4 h-4 text-gray-400 flex-shrink-0" />
                    <span className="font-semibold text-gray-900 text-sm">{row.dbaName}</span>
                    {isMaster && <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-semibold">Primary</span>}
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5 ml-6">{row.businessAddress}</p>
                </div>
                {getStatusBadge(row)}
              </div>
              {row.elavonMID && <p className="text-xs text-gray-400">MID: <span className="font-mono font-semibold text-gray-700">{row.elavonMID}</span></p>}
              <div className="grid grid-cols-12 gap-2">
                <div className="col-span-12"><BankingCell row={row} isMaster={isMaster} /></div>
              </div>
              {!isMaster && (
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-gray-500">Use Corporate Account</span>
                  <button
                    onClick={() => toggleCorpAccount(row.id, !row.useCorpAccount)}
                    disabled={!canToggleCorp}
                    className="disabled:opacity-30 transition-opacity"
                  >
                    {row.useCorpAccount
                      ? <ToggleRight className="w-7 h-7 text-amber-500" />
                      : <ToggleLeft className="w-7 h-7 text-gray-300" />}
                  </button>
                </div>
              )}
            </div>

            {/* Desktop */}
            <div className="hidden md:grid gap-3 items-center" style={{ gridTemplateColumns: '2fr 2fr 3fr 1fr 1.5fr' }}>
              <div className="flex items-center gap-2 min-w-0">
                <Building2 className="w-4 h-4 text-gray-400 flex-shrink-0" />
                <div className="min-w-0">
                  <p className="font-semibold text-gray-900 text-sm leading-tight truncate">{row.dbaName}</p>
                  {isMaster && <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-semibold">Primary</span>}
                  {row.elavonMID && <p className="text-xs text-gray-400 font-mono">MID: {row.elavonMID}</p>}
                </div>
              </div>
              <div className="min-w-0">
                <p className="text-xs text-gray-500 leading-tight break-words">{row.businessAddress}</p>
                {row.addressVerified && (
                  <span className="inline-flex items-center gap-1 text-xs text-green-600 font-medium mt-0.5">
                    <CheckCircle2 className="w-3 h-3" /> Verified
                  </span>
                )}
              </div>
              <BankingCell row={row} isMaster={isMaster} />
              <div className="flex justify-center">
                {isMaster ? (
                  <span className="text-xs text-gray-300 font-medium">—</span>
                ) : (
                  <button
                    onClick={() => toggleCorpAccount(row.id, !row.useCorpAccount)}
                    disabled={!canToggleCorp}
                    className="disabled:opacity-30 transition-opacity"
                    title={!masterHasBanking ? 'Set banking for Row 1 first' : ''}
                  >
                    {row.useCorpAccount
                      ? <ToggleRight className="w-7 h-7 text-amber-500" />
                      : <ToggleLeft className="w-7 h-7 text-gray-300" />}
                  </button>
                )}
              </div>
              <div className="flex items-center">
                {getStatusBadge(row)}
              </div>
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
  );
}