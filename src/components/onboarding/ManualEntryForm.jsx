import { useState } from 'react';
import { Save, Loader2, User, Home, Calendar, Lock } from 'lucide-react';
import { base44 } from '@/api/base44Client';

const US_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA',
  'KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
  'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT',
  'VA','WA','WV','WI','WY'
];

export default function ManualEntryForm({ corporateId, onSaved }) {
  const [form, setForm] = useState({
    firstName: '', lastName: '',
    dobMonth: '', dobDay: '', dobYear: '',
    ssn: '',
    homeStreet: '', homeCity: '', homeState: '', homeZip: '',
    taxId: ''
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const set = (field, val) => setForm(p => ({ ...p, [field]: val }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.firstName || !form.lastName || !form.dobMonth || !form.dobDay || !form.dobYear ||
        !form.ssn || !form.homeStreet || !form.homeCity || !form.homeState || !form.homeZip) {
      setError('Please fill in all required fields.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await base44.functions.invoke('updateMerchantProfile', { corporateId, ...form });
      onSaved(form);
    } catch (err) {
      setError(err.message || 'Failed to save. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      {/* Personal Identity */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <User className="w-4 h-4 text-gray-400" />
          <h4 className="text-sm font-semibold text-gray-700">Personal Identity</h4>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-semibold text-gray-500 mb-1 block">First Name *</label>
            <input value={form.firstName} onChange={e => set('firstName', e.target.value)}
              placeholder="Jane" className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-500 mb-1 block">Last Name *</label>
            <input value={form.lastName} onChange={e => set('lastName', e.target.value)}
              placeholder="Smith" className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
        </div>
      </div>

      {/* Date of Birth */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Calendar className="w-4 h-4 text-gray-400" />
          <h4 className="text-sm font-semibold text-gray-700">Date of Birth *</h4>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="text-xs font-semibold text-gray-500 mb-1 block">Month</label>
            <select value={form.dobMonth} onChange={e => set('dobMonth', e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
              <option value="">MM</option>
              {Array.from({length:12},(_,i)=>(
                <option key={i+1} value={String(i+1).padStart(2,'0')}>{String(i+1).padStart(2,'0')}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-500 mb-1 block">Day</label>
            <select value={form.dobDay} onChange={e => set('dobDay', e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
              <option value="">DD</option>
              {Array.from({length:31},(_,i)=>(
                <option key={i+1} value={String(i+1).padStart(2,'0')}>{String(i+1).padStart(2,'0')}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-500 mb-1 block">Year</label>
            <input value={form.dobYear} onChange={e => set('dobYear', e.target.value)}
              placeholder="YYYY" maxLength={4}
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
        </div>
      </div>

      {/* SSN */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Lock className="w-4 h-4 text-gray-400" />
          <h4 className="text-sm font-semibold text-gray-700">Social Security Number *</h4>
        </div>
        <input value={form.ssn} onChange={e => set('ssn', e.target.value)}
          placeholder="XXX-XX-XXXX" maxLength={11} type="password"
          className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        <p className="text-xs text-gray-400 mt-1">Encrypted and used only for identity verification.</p>
      </div>

      {/* Home Address */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Home className="w-4 h-4 text-gray-400" />
          <h4 className="text-sm font-semibold text-gray-700">Home Address *</h4>
        </div>
        <div className="flex flex-col gap-3">
          <input value={form.homeStreet} onChange={e => set('homeStreet', e.target.value)}
            placeholder="123 Main St" className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-1">
              <input value={form.homeCity} onChange={e => set('homeCity', e.target.value)}
                placeholder="City" className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <select value={form.homeState} onChange={e => set('homeState', e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
                <option value="">State</option>
                {US_STATES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <input value={form.homeZip} onChange={e => set('homeZip', e.target.value)}
                placeholder="ZIP" maxLength={5}
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>
        </div>
      </div>

      {/* Tax ID (optional) */}
      <div>
        <label className="text-xs font-semibold text-gray-500 mb-1 block">Business EIN / Tax ID (optional)</label>
        <input value={form.taxId} onChange={e => set('taxId', e.target.value)}
          placeholder="XX-XXXXXXX"
          className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
      </div>

      {error && (
        <p className="text-xs text-red-600 bg-red-50 border border-red-200 px-3 py-2.5 rounded-lg">{error}</p>
      )}

      <button type="submit" disabled={saving}
        className="w-full flex items-center justify-center gap-2 bg-gray-900 hover:bg-gray-800 text-white font-bold py-3 px-6 rounded-xl text-sm transition-all disabled:opacity-60">
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
        Save & Continue to Locations
      </button>
    </form>
  );
}