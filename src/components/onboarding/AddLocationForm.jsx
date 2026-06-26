import { useState, useEffect, useRef } from 'react';
import { Plus, Loader2, MapPin } from 'lucide-react';
import { base44 } from '@/api/base44Client';

export default function AddLocationForm({ corporateId, onLocationAdded }) {
  const [open, setOpen] = useState(false);
  const [dbaName, setDbaName] = useState('');
  const [businessAddress, setBusinessAddress] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const addressRef = useRef(null);
  const autocompleteRef = useRef(null);

  // Initialize Google Places Autocomplete when form opens
  useEffect(() => {
    if (!open || !addressRef.current) return;

    const tryInitAutocomplete = () => {
      if (window.google?.maps?.places?.Autocomplete) {
        autocompleteRef.current = new window.google.maps.places.Autocomplete(addressRef.current, {
          types: ['address'],
          componentRestrictions: { country: 'us' }
        });
        autocompleteRef.current.addListener('place_changed', () => {
          const place = autocompleteRef.current.getPlace();
          if (place?.formatted_address) {
            setBusinessAddress(place.formatted_address);
          }
        });
      }
    };

    // Small delay to ensure element is rendered
    const timer = setTimeout(tryInitAutocomplete, 100);
    return () => clearTimeout(timer);
  }, [open]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!dbaName || !businessAddress) {
      setError('Please fill in both fields.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const res = await base44.functions.invoke('addSelfServeLocation', {
        corporateId,
        dbaName,
        businessAddress
      });
      if (res.data?.error) throw new Error(res.data.error);
      onLocationAdded(res.data.location);
      setDbaName('');
      setBusinessAddress('');
      setOpen(false);
    } catch (err) {
      setError(err.message || 'Failed to add location.');
    } finally {
      setSaving(false);
    }
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-full flex items-center justify-center gap-2 border-2 border-dashed border-gray-200 hover:border-blue-400 hover:bg-blue-50 rounded-xl py-4 px-6 text-sm font-semibold text-gray-400 hover:text-blue-600 transition-all"
      >
        <Plus className="w-4 h-4" /> Add Location
      </button>
    );
  }

  return (
    <div className="rounded-xl border-2 border-blue-200 bg-blue-50/50 p-5">
      <h4 className="font-semibold text-gray-800 text-sm mb-4 flex items-center gap-2">
        <MapPin className="w-4 h-4 text-blue-600" /> Add New Location
      </h4>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <div>
          <label className="text-xs font-semibold text-gray-600 mb-1 block">DBA / Store Name</label>
          <input
            type="text"
            value={dbaName}
            onChange={(e) => setDbaName(e.target.value)}
            placeholder="e.g. Acme Downtown"
            className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
          />
        </div>
        <div>
          <label className="text-xs font-semibold text-gray-600 mb-1 block">Business Address</label>
          <input
            ref={addressRef}
            type="text"
            value={businessAddress}
            onChange={(e) => setBusinessAddress(e.target.value)}
            placeholder="Start typing your address..."
            className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
          />
          <p className="text-xs text-gray-400 mt-1">Google Places autocomplete enabled</p>
        </div>

        {error && <p className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}

        <div className="flex items-center gap-3 mt-1">
          <button
            type="submit"
            disabled={saving}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold px-5 py-2.5 rounded-lg text-sm transition-colors disabled:opacity-60"
          >
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
            Add Location
          </button>
          <button
            type="button"
            onClick={() => { setOpen(false); setError(''); }}
            className="text-sm text-gray-400 hover:text-gray-600 font-medium"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}