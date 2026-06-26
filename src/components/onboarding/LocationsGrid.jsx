import { useState, useEffect } from 'react';
import { Building2, ToggleLeft, ToggleRight, AlertCircle, CheckCircle2, ChevronDown } from 'lucide-react';

export default function LocationsGrid({ locations, corporateRouting, corporateAccount, plaidAccounts, onLocationsChange }) {
  const [rows, setRows] = useState([]);

  useEffect(() => {
    setRows(locations.map(loc => ({
      id: loc.id,
      dbaName: loc.dbaName,
      businessAddress: loc.businessAddress,
      useCorpAccount: false,
      routingInput: loc.routingNumber || '',
      accountInput: loc.accountNumber || '',
      selectedPlaidAccountId: null,
      applicationStepStatus: loc.applicationStepStatus || 'In Review',
      elavonMID: loc.elavonMID,
      isNew: !loc.routingNumber && !loc.accountNumber
    })));
  }, [locations]);

  // When corporate bank values change, propagate to toggled rows
  useEffect(() => {
    setRows(prev => {
      const updated = prev.map(row => {
        if (!row.useCorpAccount) return row;
        return { ...row, routingInput: corporateRouting || '', accountInput: corporateAccount || '' };
      });
      onLocationsChange(updated);
      return updated;
    });
  }, [corporateRouting, corporateAccount]);

  const toggleCorpAccount = (id, checked) => {
    setRows(prev => {
      const updated = prev.map(row => {
        if (row.id !== id) return row;
        return {
          ...row,
          useCorpAccount: checked,
          selectedPlaidAccountId: null,
          routingInput: checked ? (corporateRouting || '') : '',
          accountInput: checked ? (corporateAccount || '') : ''
        };
      });
      onLocationsChange(updated);
      return updated;
    });
  };

  const handlePlaidSelect = (id, accountId) => {
    const acct = plaidAccounts.find(a => a.accountId === accountId);
    setRows(prev => {
      const updated = prev.map(row => {
        if (row.id !== id) return row;
        return {
          ...row,
          selectedPlaidAccountId: accountId,
          useCorpAccount: false,
          routingInput: acct?.routingNumber || '',
          accountInput: acct?.accountNumber || ''
        };
      });
      onLocationsChange(updated);
      return updated;
    });
  };

  const updateField = (id, field, value) => {
    setRows(prev => {
      const updated = prev.map(row => row.id !== id ? row : { ...row, [field]: value });
      onLocationsChange(updated);
      return updated;
    });
  };

  const getStatusBadge = (row) => {
    if (row.applicationStepStatus === 'Approved') return (
      <span className="inline-flex items-center gap-1 bg-green-50 text-green-700 text-xs font-semibold px-2 py-0.5 rounded-full border border-green-200 whitespace-nowrap">
        <CheckCircle2 className="w-3 h-3" /> Approved
      </span>
    );
    if (row.applicationStepStatus === 'Error') return (
      <span className="inline-flex items-center gap-1 bg-red-50 text-red-700 text-xs font-semibold px-2 py-0.5 rounded-full border border-red-200 whitespace-nowrap">
        <AlertCircle className="w-3 h-3" /> Error
      </span>
    );
    // New/unfilled rows show "Ready to Submit"
    const hasBanking = row.routingInput && row.accountInput;
    if (hasBanking) return (
      <span className="inline-flex items-center gap-1 bg-amber-50 text-amber-700 text-xs font-semibold px-2 py-0.5 rounded-full border border-amber-200 whitespace-nowrap">
        Ready to Submit
      </span>
    );
    return (
      <span className="inline-flex items-center gap-1 bg-gray-50 text-gray-500 text-xs font-semibold px-2 py-0.5 rounded-full border border-gray-200 whitespace-nowrap">
        Needs Banking
      </span>
    );
  };

  const hasPlaid = plaidAccounts && plaidAccounts.length > 0;
  const isApproved = (row) => row.applicationStepStatus === 'Approved';

  // Shared routing/account input or Plaid dropdown
  const BankingCell = ({ row, field, placeholder }) => {
    if (hasPlaid && !row.useCorpAccount && !isApproved(row)) {
      // Show Plaid dropdown for the routing cell only; account mirrors it
      if (field === 'routingInput') {
        return (
          <div className="relative">
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
        );
      }
      // Account cell: show masked value if a Plaid account is selected, else empty
      return (
        <input
          type="text"
          value={row.selectedPlaidAccountId ? `••••${plaidAccounts.find(a => a.accountId === row.selectedPlaidAccountId)?.mask || ''}` : ''}
          readOnly
          placeholder="Auto-filled"
          className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 bg-gray-50 text-gray-500 font-mono focus:outline-none"
        />
      );
    }

    return (
      <input
        type="text"
        value={row[field]}
        onChange={(e) => updateField(row.id, field, e.target.value)}
        disabled={row.useCorpAccount || isApproved(row)}
        placeholder={placeholder}
        className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-400 font-mono"
      />
    );
  };

  return (
    <div className="rounded-xl border border-gray-200 overflow-hidden">
      {/* Table header */}
      <div className="bg-gray-50 border-b border-gray-200 px-5 py-3 hidden md:grid grid-cols-12 gap-3">
        <div className="col-span-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Location</div>
        <div className="col-span-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Address</div>
        <div className="col-span-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">{hasPlaid ? 'Plaid Account' : 'Routing #'}</div>
        <div className="col-span-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">Account #</div>
        <div className="col-span-1 text-xs font-semibold text-gray-500 uppercase tracking-wider text-center">Corp Acct</div>
        <div className="col-span-1 text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</div>
      </div>

      {/* Rows */}
      {rows.map((row, idx) => (
        <div
          key={row.id}
          className={`px-5 py-4 border-b last:border-b-0 border-gray-100 transition-colors
            ${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}
            ${isApproved(row) ? 'opacity-80' : ''}
          `}
        >
          {/* Mobile layout */}
          <div className="md:hidden flex flex-col gap-3">
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-gray-400 flex-shrink-0" />
                  <span className="font-semibold text-gray-900 text-sm">{row.dbaName}</span>
                </div>
                <p className="text-xs text-gray-400 mt-0.5 ml-6">{row.businessAddress}</p>
              </div>
              {getStatusBadge(row)}
            </div>
            {row.elavonMID && (
              <p className="text-xs text-gray-400">Elavon MID: <span className="font-mono font-semibold text-gray-700">{row.elavonMID}</span></p>
            )}
            <div className="flex flex-col gap-2">
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">{hasPlaid ? 'Plaid Account' : 'Routing #'}</label>
                <BankingCell row={row} field="routingInput" placeholder="9-digit routing" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">Account #</label>
                <BankingCell row={row} field="accountInput" placeholder="Account number" />
              </div>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-gray-500">Use Corporate Account</span>
              <button
                onClick={() => toggleCorpAccount(row.id, !row.useCorpAccount)}
                disabled={!corporateRouting || !corporateAccount || isApproved(row)}
                className="disabled:opacity-40"
              >
                {row.useCorpAccount
                  ? <ToggleRight className="w-7 h-7 text-amber-500" />
                  : <ToggleLeft className="w-7 h-7 text-gray-300" />}
              </button>
            </div>
          </div>

          {/* Desktop layout */}
          <div className="hidden md:grid grid-cols-12 gap-3 items-center">
            <div className="col-span-3">
              <div className="flex items-center gap-2">
                <Building2 className="w-4 h-4 text-gray-400 flex-shrink-0" />
                <div>
                  <p className="font-semibold text-gray-900 text-sm leading-tight">{row.dbaName}</p>
                  {row.elavonMID && <p className="text-xs text-gray-400 font-mono">MID: {row.elavonMID}</p>}
                </div>
              </div>
            </div>
            <div className="col-span-3">
              <p className="text-sm text-gray-500 leading-tight">{row.businessAddress}</p>
            </div>
            <div className="col-span-2">
              <BankingCell row={row} field="routingInput" placeholder="9-digit" />
            </div>
            <div className="col-span-2">
              <BankingCell row={row} field="accountInput" placeholder="Account #" />
            </div>
            <div className="col-span-1 flex justify-center">
              <button
                onClick={() => toggleCorpAccount(row.id, !row.useCorpAccount)}
                disabled={!corporateRouting || !corporateAccount || isApproved(row)}
                className="disabled:opacity-40 transition-opacity"
                title={!corporateRouting || !corporateAccount ? 'Connect bank via Plaid or upload a document first' : ''}
              >
                {row.useCorpAccount
                  ? <ToggleRight className="w-7 h-7 text-amber-500" />
                  : <ToggleLeft className="w-7 h-7 text-gray-300" />}
              </button>
            </div>
            <div className="col-span-1">
              {getStatusBadge(row)}
            </div>
          </div>
        </div>
      ))}

      {rows.length === 0 && (
        <div className="text-center py-12 text-gray-400 text-sm">
          No locations yet — add your first business location above.
        </div>
      )}
    </div>
  );
}