import { useState } from 'react';
import { Loader2, Copy, ArrowRightFromLine, Check, Building2 } from 'lucide-react';
import { base44 } from '@/api/base44Client';

export default function DragOrgMenu({ corporateId, entities, selectedIds, onActionDone }) {
  const [targetEntityId, setTargetEntityId] = useState('');
  const [action, setAction] = useState('move'); // 'move' | 'copy'
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  if (done) {
    return (
      <div className="flex items-center gap-2 text-xs text-green-400">
        <Check className="w-4 h-4" />
        {action === 'move' ? 'Moved' : 'Copied'} {selectedIds.length} location{selectedIds.length > 1 ? 's' : ''}
      </div>
    );
  }

  const handleSubmit = async () => {
    if (!targetEntityId) { setError('Select a target entity.'); return; }
    setBusy(true);
    setError('');
    try {
      const res = await base44.functions.invoke('batchUpdateStatus', {
        corporateId,
        action: action === 'move' ? 'moveToEntity' : 'copyToEntity',
        locationIds: selectedIds,
        targetEntityId,
      });
      if (res.data?.error) throw new Error(res.data.error);
      setDone(true);
      if (onActionDone) onActionDone();
    } catch (err) {
      setError(err.message || 'Operation failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {/* Action type toggle */}
      <div className="flex bg-white/10 rounded-lg p-0.5">
        <button
          onClick={() => { setAction('move'); setError(''); }}
          className={`flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-semibold rounded-md transition-all ${
            action === 'move' ? 'bg-amber-500 text-black' : 'text-gray-300 hover:text-white'
          }`}
        >
          <ArrowRightFromLine className="w-3 h-3" />
          Move
        </button>
        <button
          onClick={() => { setAction('copy'); setError(''); }}
          className={`flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-semibold rounded-md transition-all ${
            action === 'copy' ? 'bg-amber-500 text-black' : 'text-gray-300 hover:text-white'
          }`}
        >
          <Copy className="w-3 h-3" />
          Copy
        </button>
      </div>

      {/* Entity dropdown */}
      <div className="relative flex-1 min-w-[140px]">
        <select
          value={targetEntityId}
          onChange={(e) => { setTargetEntityId(e.target.value); setError(''); }}
          className="w-full bg-[#111318] border border-white/20 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-amber-500 appearance-none cursor-pointer"
          style={{ colorScheme: 'dark' }}
        >
          <option value="">Target entity...</option>
          {entities.map(e => (
            <option key={e.entityId} value={e.entityId}>
              {e.legalBusinessName} ({e.federalEIN ? e.federalEIN.slice(-4) : '—'})
            </option>
          ))}
        </select>
        <Building2 className="w-3 h-3 text-gray-400 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
      </div>

      <button
        onClick={handleSubmit}
        disabled={busy || !targetEntityId}
        className="bg-amber-500 disabled:bg-gray-600 disabled:text-gray-400 text-black font-semibold text-xs px-3 py-1.5 rounded-lg hover:bg-amber-400 transition-all flex items-center gap-1"
      >
        {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : action === 'move' ? <ArrowRightFromLine className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
        {busy ? 'Working...' : action === 'move' ? 'Move' : 'Copy'}
      </button>

      {error && <span className="text-[10px] text-red-400">{error}</span>}
    </div>
  );
}