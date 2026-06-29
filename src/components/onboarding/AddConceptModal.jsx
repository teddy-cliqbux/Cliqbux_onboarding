import { useState } from 'react';
import { X, CheckCircle } from 'lucide-react';

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

const inputCls = 'w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-1 focus:ring-blue-500';
const labelCls = 'text-[11px] font-semibold text-gray-500 uppercase tracking-wide block mb-1';

export default function AddMerchantIDModal({ locationName, onSave, onClose }) {
  const [merchantName, setMerchantName] = useState('');
  const [mccCode, setMccCode] = useState('');
  const [industryType, setIndustryType] = useState('');
  const [avgSaleAmount, setAvgSaleAmount] = useState('');
  const [monthlyCardSales, setMonthlyCardSales] = useState('');
  const [annualRevenue, setAnnualRevenue] = useState('');
  const [highestTicketAmount, setHighestTicketAmount] = useState('');
  const [cardPresentPct, setCardPresentPct] = useState('100');
  const [internetPct, setInternetPct] = useState('0');
  const [motoPct, setMotoPct] = useState('0');
  const [productDescription, setProductDescription] = useState('');

  const pctSum = (parseInt(cardPresentPct, 10) || 0) + (parseInt(internetPct, 10) || 0) + (parseInt(motoPct, 10) || 0);
  const pctValid = pctSum === 100;

  const handleSave = () => {
    onSave({
      merchantName: merchantName.trim() || locationName,
      mccCode,
      industryType,
      avgSaleAmount,
      monthlyCardSales,
      annualRevenue,
      highestTicketAmount: highestTicketAmount || avgSaleAmount,
      cardPresentPct,
      internetPct,
      motoPct,
      productDescription: productDescription.trim(),
    });
  };

  const isReady = !!merchantName.trim() && !!mccCode && pctValid;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/45 px-4" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <div>
            <h3 className="font-bold text-gray-900 text-base">Add Merchant ID</h3>
            <p className="text-xs text-gray-400 mt-0.5">
              A Merchant ID is a distinct processing account (MID) under <strong className="text-gray-500">{locationName}</strong>. Each Merchant ID can have its own industry, volume, and rates.
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400"><X className="w-4 h-4" /></button>
        </div>

        <div className="space-y-5">
          {/* — Concept Identity — */}
          <div className="border-b border-gray-100 pb-4">
            <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-3">Merchant ID Details</h4>
            <div className="space-y-3">
              <div>
                <label className={labelCls}>Merchant ID Name *</label>
                <input type="text" placeholder="e.g. Cafe, Bakery, Floral"
                  value={merchantName} onChange={e => setMerchantName(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>MCC Code *</label>
                <select value={mccCode} onChange={e => setMccCode(e.target.value)} className={inputCls}>
                  <option value="">Select MCC...</option>
                  {MCC_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>Industry Type</label>
                <select value={industryType} onChange={e => setIndustryType(e.target.value)} className={inputCls}>
                  <option value="">Select industry...</option>
                  {INDUSTRY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>What do you sell?</label>
                <input type="text" value={productDescription} onChange={e => setProductDescription(e.target.value)}
                  placeholder="e.g. Fresh-baked goods and specialty coffee" className={inputCls} />
              </div>
            </div>
          </div>

          {/* — Processing Volume — */}
          <div className="border-b border-gray-100 pb-4">
            <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-3">Processing Volume</h4>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Avg Sale ($)</label>
                <input type="number" min="1" value={avgSaleAmount} onChange={e => setAvgSaleAmount(e.target.value)}
                  placeholder="e.g. 35" className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Monthly Volume ($)</label>
                <input type="number" min="1" value={monthlyCardSales} onChange={e => setMonthlyCardSales(e.target.value)}
                  placeholder="e.g. 8000" className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Annual Revenue ($)</label>
                <input type="number" min="1" value={annualRevenue} onChange={e => setAnnualRevenue(e.target.value)}
                  placeholder="e.g. 96000" className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Highest Ticket ($)</label>
                <input type="number" min="1" value={highestTicketAmount} onChange={e => setHighestTicketAmount(e.target.value)}
                  placeholder="e.g. 200" className={inputCls} />
              </div>
            </div>
          </div>

          {/* — Card Acceptance Mix — */}
          <div>
            <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-3">Card Acceptance Mix</h4>
            <p className="text-xs text-gray-400 mb-3">How customers pay. Must total 100%.</p>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className={labelCls}>In-Person %</label>
                <input type="number" min="0" max="100" value={cardPresentPct} onChange={e => setCardPresentPct(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Online %</label>
                <input type="number" min="0" max="100" value={internetPct} onChange={e => setInternetPct(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>MOTO %</label>
                <input type="number" min="0" max="100" value={motoPct} onChange={e => setMotoPct(e.target.value)} className={inputCls} />
              </div>
            </div>
            {pctSum !== 100 && (cardPresentPct || internetPct || motoPct) && (
              <p className="text-[11px] text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mt-2">Total {pctSum}% — must be 100%.</p>
            )}
            {pctSum === 100 && (
              <p className="text-[11px] text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2 mt-2 flex items-center gap-1">
                <CheckCircle className="w-3 h-3" /> Total 100%
              </p>
            )}
          </div>
        </div>

        <div className="flex gap-3 justify-end mt-6 pt-4 border-t border-gray-100">
          <button onClick={onClose} className="text-sm font-medium text-gray-500 border border-gray-200 rounded-xl py-2.5 px-5 hover:bg-gray-50">Cancel</button>
          <button onClick={handleSave} disabled={!isReady}
            className="text-sm font-semibold text-white bg-gray-900 hover:bg-gray-800 disabled:bg-gray-200 disabled:text-gray-400 rounded-xl py-2.5 px-5 transition-all">Add Merchant ID</button>
        </div>
      </div>
    </div>
  );
}