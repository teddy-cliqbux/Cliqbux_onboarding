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

  // Stable controlled entry: use a growing counter so that each time manual mode is
  // (re-)entered we render a fresh uncontrolled input — React values it from defaultValue,
  // then syncOrigin flushes it to the parent on blur / confirm.
  const manualKeyRef = useRef(0); // increments each time manual mode is entered
  const syncOrigin = () => {
    const inpEl = document.getElementById(`loc-${locId}-routing`);
    const inpAc = document.getElementById(`loc-${locId}-account`);
    const r = inpEl?.value || '';
    const a = inpAc?.value || '';
    onUpdateManualField(locId, 'manualRouting', r);
    onUpdateManualField(locId, 'manualAccount', a);
    return { r, a };
  };

  // Manual-mode state — managed inside this component with a mount-key gating, so
  // uncontrolled inputs never flicker and focus is never stolen during typing.
  const [cachedInManual, setCachedInManual] = useState(false);
  const [cachedSelectedBankId, setCachedSelectedBankId] = useState('');

  // Auto-persist the first Plaid account on connect, and re-sync after "Change"
  // or toggling from manual back to Plaid, so the Continue button stays unblocked.
  const autoInitRef = useRef(false);
  useEffect(() => {
    if (!hasPlaidEntity) return;
    const hasPersistedBank = !!bankDetails?.routingNumber;
    const wasCleared = row.bankCleared;
    // If a bank is already persisted and hasn't been cleared, honor it (don't re-trigger).
    if (hasPersistedBank && !wasCleared) return;
    // Show the "Select account..." prompt after a Change/clear.
    if (wasCleared) { setCachedSelectedBankId(''); return; }
    // One-shot: select and persist the first account on connect or re-enter Plaid.
    if (autoInitRef.current) return;
    autoInitRef.current = true;
    const first = entityAccounts[0];
    if (!first?.accountId) return;
    setCachedSelectedBankId(first.accountId);
    onSelectBank(locId, first.accountId);
  }, [hasPlaidEntity, entityAccounts.length, row.bankCleared]);

  // React once to the parent telling us we are in Manual mode (either on mount or
  // at runtime via "Set Up Manually..."). Mute the parent before doing so.
  const initRef = useRef(false);
  useEffect(() => {
    if (bankDetails?.authMethod !== 'Manual') return;
    if (!initRef.current) initRef.current = true;
    manualKeyRef.current += 1;
    setCachedInManual(true);
  }, [bankDetails?.authMethod]);

  const syncManualDetails = () => {
    syncOrigin();
  };

  const handleToggleManual = () => {
    const enteringManual = !cachedInManual;
    if (!enteringManual) {
      // Exiting manual → sync typed values before switching away from Plaid.
      syncManualDetails();
    } else {
      // Entering manual → clear any stale Plaid state and reset manual fields.
      onUpdateManualField(locId, 'manualRouting', '');
      onUpdateManualField(locId, 'manualAccount', '');
    }
    onToggleManual(locId, enteringManual);
    setCachedInManual(enteringManual);
  };

  const handleConfirmManual = () => {
    syncManualDetails();
    onConfirmManual(locId);
    setCachedInManual(true);
  };

  const clearSym = (v) => (v || '').replace(/\D/g, '');

  // STATE C: Manual Entry Mode — uncontrolled inputs keyed on enter of manual mode so
  // focus is never lost during typing.
  if (cachedInManual) {
    return (
      <div className="flex flex-col items-center justify-center gap-1 w-full">
        <div key={`manual-${manualKeyRef.current}`} className="flex items-center gap-1 w-full justify-center">
          <input id={`loc-${locId}-routing`}
            type="text" placeholder="Routing #" maxLength={9} defaultValue=""
            className="w-[6rem] text-[11px] border border-gray-200 rounded-lg px-2 py-1.5 font-mono focus:outline-none focus:ring-1 focus:ring-blue-500"
            onBlur={syncOrigin}
          />
          <input id={`loc-${locId}-account`}
            type="text" placeholder="Account #" defaultValue=""
            className="w-[7rem] text-[11px] border border-gray-200 rounded-lg px-2 py-1.5 font-mono focus:outline-none focus:ring-1 focus:ring-blue-500"
            onBlur={syncOrigin}
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