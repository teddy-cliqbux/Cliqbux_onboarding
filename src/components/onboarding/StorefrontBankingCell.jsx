import { useState, useEffect, useRef } from 'react';
import { Check } from 'lucide-react';
import EntityPlaidButton from '@/components/onboarding/EntityPlaidButton';

export default function StorefrontBankingCell({
  row, corporateId, plaidAccounts, bankDetails,
  onSelectBank, onToggleManual, onConfirmManual, onUpdateManualField, onPlaidAccountsConnected,
}) {
  const locId = row.id;
  const entityId = row.entityId;
  const entityAccounts = plaidAccounts[entityId] || [];
  const hasPlaidEntity = entityAccounts.length > 0;

  // Local buffer to prevent focus loss from global state updates on every keystroke.
  // Sync back to parent only on blur (not on every onChange).
  const [localRouting, setLocalRouting] = useState('');
  const [localAccount, setLocalAccount] = useState('');
  const [cachedInManual, setCachedInManual] = useState(false);
  const [cachedSelectedBankId, setCachedSelectedBankId] = useState('');

  // Initialize mode from parent state once, then re-hydrate local buffer when parent switches mode.
  const initRef = useRef(false);
  useEffect(() => {
    if (!initRef.current && bankDetails?.authMethod === 'Manual') {
      setCachedInManual(true);
    }
    initRef.current = true;
    setLocalRouting('');
    setLocalAccount('');
    setCachedSelectedBankId('');
  }, [bankDetails?.authMethod, bankDetails?.accountNumberMasked]);

  const syncManualDetails = () => {
    if (cachedInManual) {
      onUpdateManualField(locId, 'manualRouting', localRouting);
      onUpdateManualField(locId, 'manualAccount', localAccount);
    }
  };

  const handleToggleManual = () => {
    syncManualDetails();
    onToggleManual(locId);
    setCachedInManual(!cachedInManual);
  };

  const handleConfirmManual = () => {
    syncManualDetails();
    onConfirmManual(locId);
    setCachedInManual(true);
  };

  const clearSym = (v) => (v || '').replace(/\D/g, '');

  // STATE C: Manual Entry Mode
  if (cachedInManual) {
    return (
      <div className="flex flex-col items-center justify-center gap-1 w-full">
        <div className="flex items-center gap-1 w-full justify-center">
          <input
            type="text" placeholder="Routing #" maxLength={9} value={localRouting}
            className="w-[6rem] text-[11px] border border-gray-200 rounded-lg px-2 py-1.5 font-mono focus:outline-none focus:ring-1 focus:ring-blue-500"
            onChange={(e) => setLocalRouting(clearSym(e.target.value).slice(0, 9))}
            onBlur={() => onUpdateManualField(locId, 'manualRouting', localRouting)}
          />
          <input
            type="text" placeholder="Account #" value={localAccount}
            className="w-[7rem] text-[11px] border border-gray-200 rounded-lg px-2 py-1.5 font-mono focus:outline-none focus:ring-1 focus:ring-blue-500"
            onChange={(e) => setLocalAccount(clearSym(e.target.value).slice(0, 17))}
            onBlur={() => onUpdateManualField(locId, 'manualAccount', localAccount)}
          />
          <button onClick={handleConfirmManual}
            className="text-[10px] font-semibold bg-gray-900 text-white rounded-lg px-2 py-1.5"><Check className="w-3 h-3" /></button>
        </div>
        <button onClick={handleToggleManual} className="text-[10px] text-gray-400 hover:text-blue-600 underline whitespace-nowrap">← Use Plaid instead</button>
      </div>
    );
  }

  // STATE B: Entity Plaid is connected — dropdown with account selections
  if (hasPlaidEntity) {
    return (
      <div className="flex flex-col items-center justify-center gap-1 w-full">
        <select value={cachedSelectedBankId}
          onChange={(e) => { setCachedSelectedBankId(e.target.value); onSelectBank(locId, e.target.value); }}
          className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs font-mono bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 max-w-[14rem]">
          <option value="">Select account...</option>
          {entityAccounts.map(a => (
            <option key={a.accountId} value={a.accountId}>{a.name} ••••{a.mask || (a.accountNumber || '').slice(-4)}</option>
          ))}
        </select>
        <button onClick={handleToggleManual} className="text-[10px] text-gray-400 hover:text-blue-600 underline whitespace-nowrap">Set Up Manually...</button>
      </div>
    );
  }

  // STATE A: No bank connected — entity-scoped Plaid button with manual fallback
  return (
    <div className="flex flex-col items-center justify-center gap-1 w-full">
      <EntityPlaidButton corporateId={corporateId} entityId={entityId} onAccountsConnected={onPlaidAccountsConnected} />
      <button onClick={handleToggleManual} className="text-[10px] text-gray-400 hover:text-blue-600 underline whitespace-nowrap">Set Up Manually...</button>
    </div>
  );
}