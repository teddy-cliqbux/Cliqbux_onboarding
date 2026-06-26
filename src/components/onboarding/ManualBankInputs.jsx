import { useState } from 'react';
import { Check } from 'lucide-react';

export default function ManualBankInputs({ rowId, onConfirm }) {
  const [routing, setRouting] = useState('');
  const [account, setAccount] = useState('');

  const handleSave = () => {
    onConfirm(rowId, routing, account);
  };

  return (
    <div className="w-full flex flex-col gap-1.5">
      <div className="flex gap-1.5 w-full">
        <input
          type="text"
          value={routing}
          onChange={(e) => setRouting(e.target.value)}
          placeholder="Routing #"
          maxLength={9}
          className="flex-1 text-xs border border-gray-200 rounded-lg px-2 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
        />
        <input
          type="text"
          value={account}
          onChange={(e) => setAccount(e.target.value)}
          placeholder="Account #"
          className="flex-1 text-xs border border-gray-200 rounded-lg px-2 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
        />
      </div>
      <button
        onClick={handleSave}
        disabled={!routing || !account}
        className="flex items-center justify-center gap-1 text-xs font-semibold text-white bg-gray-900 hover:bg-gray-800 disabled:bg-gray-200 disabled:text-gray-400 rounded-lg py-1.5 px-3 transition-all"
      >
        <Check className="w-3 h-3" /> Confirm Banking
      </button>
    </div>
  );
}