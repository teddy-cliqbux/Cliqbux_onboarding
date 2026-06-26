import { useState, useEffect, useRef } from 'react';
import { X, MapPin, Loader2, Plus } from 'lucide-react';
import { base44 } from '@/api/base44Client';

export default function AddLocationModal({ corporateId, onLocationAdded, onClose }) {
  const [dbaName, setDbaName] = useState('');
  const [businessAddress, setBusinessAddress] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const addressRef = useRef(null);
  const autocompleteRef = useRef(null);

  useEffect(() => {
    const tryInit = () => {
      if (window.google?.maps?.places?.Autocomplete && addressRef.current) {
        autocompleteRef.current = new window.google.maps.places.Autocomplete(addressRef.current, {
          types: ['address'],
          componentRestrictions: { country: 'us' }
        });
        autocompleteRef.current.addListener('place_changed', () => {
          const place = autocompleteRef.current.getPlace();
          if (place?.formatted_address) setBusinessAddress(place.formatted_address);
        });
      }
    };
    const timer = setTimeout(tryInit, 150);
    return () => clearTimeout(timer);
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!dbaName.trim() || !businessAddress.trim()) {
      setError('Both fields are required.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const res = await base44.functions.invoke('addSelfServeLocation', {
        corporateId,
        dbaName: dbaName.trim(),
        businessAddress: businessAddress.trim()
      });
      if (res.data?.error) throw new Error(res.data.error);
      onLocationAdded(res.data.location);
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to add location.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center">
              <MapPin className="w-4 h-4 text-blue-600" />
            </div>
            <h3 className="font-bold text-gray-900 text-base">Add Business Location</h3>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label className="text-xs font-semibold text-gray-600 mb-1.5 block">Location Name / DBA Name</label>
            <input
              type="text"
              value={dbaName}
              onChange={(e) => setDbaName(e.target.value)}
              placeholder="e.g. Cliqbux Cafe - Downtown"
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              autoFocus
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-600 mb-1.5 block">Business Physical Address</label>
            <input
              ref={addressRef}
              type="text"
              value={businessAddress}
              onChange={(e) => setBusinessAddress(e.target.value)}
              placeholder="Start typing your address..."
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <p className="text-xs text-gray-400 mt-1 flex items-center gap-1">
              <MapPin className="w-3 h-3" /> Google Places verified
            </p>
          </div>

          {error && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-200 px-3 py-2 rounded-lg">{error}</p>
          )}

          <div className="flex items-center gap-3 pt-1">
            <button
              type="submit"
              disabled={saving}
              className="flex-1 flex items-center justify-center gap-2 bg-gray-900 hover:bg-gray-800 text-white font-semibold px-5 py-2.5 rounded-lg text-sm transition-colors disabled:opacity-60"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              Save Location
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 text-sm font-medium text-gray-500 hover:text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}