import { useState } from 'react';
import { X } from 'lucide-react';

const MCC_OPTIONS = [
  { value: '5812', label: '5812 — Eating Places / Restaurant' },
  { value: '5411', label: '5411 — Grocery / Supermarket' },
  { value: '5211', label: '5211 — Lumber / Building Materials' },
  { value: '5734', label: '5734 — Computer Software' },
  { value: '5311', label: '5311 — Department Stores' },
  { value: '5813', label: '5813 — Drinking Places / Bars' },
  { value: '5999', label: '5999 — Miscellaneous / Specialty Retail' },
  { value: '5814', label: '5814 — Fast Food Restaurants' },
  { value: '7221', label: '7221 — Photography Studios' },
  { value: '7922', label: '7922 — Theatrical Producers' },
  { value: '5932', label: '5932 — Used Merchandise Stores' },
  { value: '7230', label: '7230 — Beauty / Barber Shops' },
  { value: '5651', label: '5651 — Family Clothing Stores' },
  { value: '4900', label: '4900 — Utilities' },
];

const INDUSTRY_OPTIONS = [
  { value: 'RE', label: 'RE — Retail' },
  { value: 'RS', label: 'RS — Restaurant' },
  { value: 'SP', label: 'SP — Supermarket' },
  { value: 'HT', label: 'HT — Lodging / Hotel' },
  { value: 'MS', label: 'MS — MOTO' },
  { value: 'ARU', label: 'ARU' },
];

export default function AddConceptModal({ locationName, onSave, onClose }) {
  const [conceptName, setConceptName] = useState('');
  const [mccCode, setMccCode] = useState('');
  const [industryType, setIndustryType] = useState('');

  const handleSave = () => {
    onSave({ conceptName: conceptName.trim() || locationName, mccCode, industryType });
  };

  const isReady = !!conceptName.trim();

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/45 px-4" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <div>
            <h3 className="font-bold text-gray-900 text-base">Add Processing Concept</h3>
            <p className="text-xs text-gray-400 mt-0.5">
              A concept is a distinct processing account (MID) under <strong className="text-gray-500">{locationName}</strong>. Each concept accesses different interchange rates.
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400"><X className="w-4 h-4" /></button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide block mb-1">Concept Name *</label>
            <input type="text" placeholder="e.g. Cafe, Bakery, Floral"
              value={conceptName} onChange={e => setConceptName(e.target.value)}
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide block mb-1">MCC Code</label>
            <select value={mccCode} onChange={e => setMccCode(e.target.value)}
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-1 focus:ring-blue-500">
              <option value="">Select MCC...</option>
              {MCC_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide block mb-1">Industry Type</label>
            <select value={industryType} onChange={e => setIndustryType(e.target.value)}
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-1 focus:ring-blue-500">
              <option value="">Select industry...</option>
              {INDUSTRY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
        </div>

        <div className="flex gap-3 justify-end mt-6">
          <button onClick={onClose} className="text-sm font-medium text-gray-500 border border-gray-200 rounded-xl py-2.5 px-5 hover:bg-gray-50">Cancel</button>
          <button onClick={handleSave} disabled={!isReady}
            className="text-sm font-semibold text-white bg-gray-900 hover:bg-gray-800 disabled:bg-gray-200 disabled:text-gray-400 rounded-xl py-2.5 px-5 transition-all">Add Concept</button>
        </div>
      </div>
    </div>
  );
}