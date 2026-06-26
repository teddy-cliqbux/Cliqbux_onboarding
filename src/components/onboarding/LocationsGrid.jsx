import { useState, useEffect } from 'react';
import { Building2, ToggleLeft, ToggleRight, AlertCircle, CheckCircle2 } from 'lucide-react';

export default function LocationsGrid({ locations, corporateRouting, corporateAccount, onLocationsChange }) {
  const [rows, setRows] = useState([]);

  useEffect(() => {
    setRows(locations.map(loc => ({
      id: loc.id,
      dbaName: loc.dbaName,
      businessAddress: loc.businessAddress,
      routingNumber: loc.routingNumber ? '••••' : '',
      accountNumber: loc.accountNumber ? '••••' : '',
      useCorpAccount: false,
      routingInput: '',
      accountInput: '',
      applicationStepStatus: loc.applicationStepStatus,
      elavonMID: loc.elavonMID,
      hasExistingBanking: loc.hasRoutingNumber && loc.hasAccountNumber,
      errorMessage: null
    })));
  }, [locations]);

  // When corporate bank values change, update toggled rows
  useEffect(() => {
    setRows(prev => prev.map(row => {
      if (row.useCorpAccount) {
        return { ...row, routingInput: corporateRouting || '', accountInput: corporateAccount || '' };
      }
      return row;
    }));
  }, [corporateRouting, corporateAccount]);

  const toggleCorpAccount = (id, checked) => {
    setRows(prev => {
      const updated = prev.map(row => {
        if (row.id !== id) return row;
        return {
          ...row,
          useCorpAccount: checked,
          routingInput: checked ? (corporateRouting || '') : '',
          accountInput: checked ? (corporateAccount || '') : ''
        };
      });
      onLocationsChange(updated);
      return updated;
    });
  };

  const updateField = (id, field, value) => {
    setRows(prev => {
      const updated = prev.map(row => {
        if (row.id !== id) return row;
        return { ...row, [field]: value };
      });
      onLocationsChange(updated);
      return updated;
    });
  };

  const getStatusBadge = (status) => {
    if (status === 'Approved') return (
      <span className="inline-flex items-center gap-1 bg-green-50 text-green-700 text-xs font-semibold px-2 py-0.5 rounded-full border border-green-200">
        <CheckCircle2 className="w-3 h-3" /> Approved
      </span>
    );
    if (status === 'Error') return (
      <span className="inline-flex items-center gap-1 bg-red-50 text-red-700 text-xs font-semibold px-2 py-0.5 rounded-full border border-red-200">
        <AlertCircle className="w-3 h-3" /> Error
      </span>
    );
    return (
      <span className="inline-flex items-center gap-1 bg-blue-50 text-blue-700 text-xs font-semibold px-2 py-0.5 rounded-full border border-blue-100">
        In Review
      </span>
    );
  };

  return (
    <div className="rounded-xl border border-gray-200 overflow-hidden">
      {/* Table header */}
      <div className="bg-gray-50 border-b border-gray-200 px-5 py-3 hidden md:grid grid-cols-12 gap-3">
        <div className="col-span-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Location</div>
        <div className="col-span-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Address</div>
        <div className="col-span-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">Routing #</div>
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
            ${row.applicationStepStatus === 'Approved' ? 'opacity-80' : ''}
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
              {getStatusBadge(row.applicationStepStatus)}
            </div>
            {row.elavonMID && (
              <p className="text-xs text-gray-400">Elavon MID: <span className="font-mono font-semibold text-gray-700">{row.elavonMID}</span></p>
            )}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">Routing #</label>
                <input
                  type="text"
                  value={row.routingInput}
                  onChange={(e) => updateField(row.id, 'routingInput', e.target.value)}
                  disabled={row.useCorpAccount || row.applicationStepStatus === 'Approved'}
                  placeholder="9-digit routing"
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-400"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">Account #</label>
                <input
                  type="text"
                  value={row.accountInput}
                  onChange={(e) => updateField(row.id, 'accountInput', e.target.value)}
                  disabled={row.useCorpAccount || row.applicationStepStatus === 'Approved'}
                  placeholder="Account number"
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-400"
                />
              </div>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-gray-500">Use Corporate Account</span>
              <button
                onClick={() => toggleCorpAccount(row.id, !row.useCorpAccount)}
                disabled={!corporateRouting || !corporateAccount || row.applicationStepStatus === 'Approved'}
                className="disabled:opacity-40"
              >
                {row.useCorpAccount
                  ? <ToggleRight className="w-7 h-7 text-amber-500" />
                  : <ToggleLeft className="w-7 h-7 text-gray-300" />}
              </button>
            </div>
            {row.errorMessage && (
              <p className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg flex items-center gap-1.5">
                <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" /> {row.errorMessage}
              </p>
            )}
          </div>

          {/* Desktop layout */}
          <div className="hidden md:grid grid-cols-12 gap-3 items-center">
            {/* Location name */}
            <div className="col-span-3">
              <div className="flex items-center gap-2">
                <Building2 className="w-4 h-4 text-gray-400 flex-shrink-0" />
                <div>
                  <p className="font-semibold text-gray-900 text-sm leading-tight">{row.dbaName}</p>
                  {row.elavonMID && <p className="text-xs text-gray-400 font-mono">MID: {row.elavonMID}</p>}
                </div>
              </div>
            </div>
            {/* Address */}
            <div className="col-span-3">
              <p className="text-sm text-gray-500 leading-tight">{row.businessAddress}</p>
            </div>
            {/* Routing */}
            <div className="col-span-2">
              <input
                type="text"
                value={row.routingInput}
                onChange={(e) => updateField(row.id, 'routingInput', e.target.value)}
                disabled={row.useCorpAccount || row.applicationStepStatus === 'Approved'}
                placeholder="9-digit"
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-400 font-mono"
              />
            </div>
            {/* Account */}
            <div className="col-span-2">
              <input
                type="text"
                value={row.accountInput}
                onChange={(e) => updateField(row.id, 'accountInput', e.target.value)}
                disabled={row.useCorpAccount || row.applicationStepStatus === 'Approved'}
                placeholder="Account #"
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-400 font-mono"
              />
            </div>
            {/* Toggle */}
            <div className="col-span-1 flex justify-center">
              <button
                onClick={() => toggleCorpAccount(row.id, !row.useCorpAccount)}
                disabled={!corporateRouting || !corporateAccount || row.applicationStepStatus === 'Approved'}
                className="disabled:opacity-40 transition-opacity"
                title={!corporateRouting || !corporateAccount ? 'Upload a document first to use corporate account' : ''}
              >
                {row.useCorpAccount
                  ? <ToggleRight className="w-7 h-7 text-amber-500" />
                  : <ToggleLeft className="w-7 h-7 text-gray-300" />}
              </button>
            </div>
            {/* Status */}
            <div className="col-span-1">
              {getStatusBadge(row.applicationStepStatus)}
            </div>
          </div>

          {row.errorMessage && (
            <div className="mt-3 hidden md:flex items-center gap-1.5 text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg">
              <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" /> {row.errorMessage}
            </div>
          )}
        </div>
      ))}

      {rows.length === 0 && (
        <div className="text-center py-12 text-gray-400 text-sm">
          No locations found for this corporate profile.
        </div>
      )}
    </div>
  );
}