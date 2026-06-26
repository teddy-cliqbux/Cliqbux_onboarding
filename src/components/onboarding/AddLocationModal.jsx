import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, MapPin, Loader2, Plus } from 'lucide-react';
import { base44 } from '@/api/base44Client';

export default function AddLocationModal({ corporateId, onLocationAdded, onClose }) {
  const [dbaName, setDbaName] = useState('');
  const [addressDisplay, setAddressDisplay] = useState('');
  const [parsedAddress, setParsedAddress] = useState(null); // { streetName, city, state, postcode }
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef(null);
  const autocompleteRef = useRef(null);

  useEffect(() => {
    if (!inputRef.current || !window.google?.maps?.places) return;

    autocompleteRef.current = new window.google.maps.places.Autocomplete(inputRef.current, {
      types: ['address'],
      componentRestrictions: { country: 'us' },
      fields: ['address_components', 'formatted_address'],
    });

    autocompleteRef.current.addListener('place_changed', () => {
      const place = autocompleteRef.current.getPlace();
      if (!place?.address_components) return;

      const get = (types) => {
        const comp = place.address_components.find(c => types.some(t => c.types.includes(t)));
        return comp ? comp.long_name : '';
      };
      const getShort = (types) => {
        const comp = place.address_components.find(c => types.some(t => c.types.includes(t)));
        return comp ? comp.short_name : '';
      };

      const streetNumber = get(['street_number']);
      const streetName = get(['route']);
      const fullStreet = streetNumber ? `${streetNumber} ${streetName}` : streetName;

      const parsed = {
        streetName: fullStreet,
        city: get(['locality', 'sublocality']),
        state: getShort(['administrative_area_level_1']),
        postcode: get(['postal_code']),
      };

      setParsedAddress(parsed);
      setAddressDisplay(place.formatted_address || '');
    });

    return () => {
      if (autocompleteRef.current) {
        window.google.maps.event.clearInstanceListeners(autocompleteRef.current);
      }
    };
  }, []);

  const handleAddressInput = (e) => {
    setAddressDisplay(e.target.value);
    // If user edits after selection, clear parsed data to avoid stale values
    if (parsedAddress) setParsedAddress(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!dbaName.trim() || !addressDisplay.trim()) {
      setError('Both fields are required.');
      return;
    }

    // Build businessAddress string for storage
    const businessAddress = parsedAddress
      ? `${parsedAddress.streetName}, ${parsedAddress.city}, ${parsedAddress.state} ${parsedAddress.postcode}`
      : addressDisplay.trim();

    setSaving(true);
    setError('');
    try {
      const res = await base44.functions.invoke('addSelfServeLocation', {
        corporateId,
        dbaName: dbaName.trim(),
        businessAddress,
        // Pass structured fields for backend use
        businessInfo: {
          address: {
            streetName: parsedAddress?.streetName || '',
            city: parsedAddress?.city || '',
            state: parsedAddress?.state || '',
            postcode: parsedAddress?.postcode || '',
          }
        }
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

  const modal = (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9998,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(0,0,0,0.4)',
        padding: '0 16px',
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        style={{
          background: '#fff',
          borderRadius: '16px',
          boxShadow: '0 25px 50px rgba(0,0,0,0.3)',
          width: '100%',
          maxWidth: '448px',
          padding: '24px',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: '#EFF6FF', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <MapPin size={16} color="#2563EB" />
            </div>
            <h3 style={{ fontWeight: 700, color: '#111827', fontSize: '15px', margin: 0 }}>Add Business Location</h3>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9CA3AF', padding: 4 }}>
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* DBA Name */}
          <div>
            <label style={{ fontSize: '11px', fontWeight: 600, color: '#4B5563', display: 'block', marginBottom: '6px' }}>
              Location Name / DBA Name
            </label>
            <input
              type="text"
              value={dbaName}
              onChange={(e) => setDbaName(e.target.value)}
              placeholder="e.g. Cliqbux Cafe - Downtown"
              autoFocus
              style={{
                width: '100%', border: '1px solid #E5E7EB', borderRadius: '8px',
                padding: '10px 12px', fontSize: '14px', outline: 'none', boxSizing: 'border-box'
              }}
            />
          </div>

          {/* Address — Google Places Autocomplete */}
          <div style={{ position: 'relative' }}>
            <label style={{ fontSize: '11px', fontWeight: 600, color: '#4B5563', display: 'block', marginBottom: '6px' }}>
              Business Physical Address
            </label>
            <input
              ref={inputRef}
              type="text"
              value={addressDisplay}
              onChange={handleAddressInput}
              placeholder="Start typing your address..."
              autoComplete="off"
              style={{
                width: '100%', border: '1px solid #E5E7EB', borderRadius: '8px',
                padding: '10px 12px', fontSize: '14px', outline: 'none', boxSizing: 'border-box'
              }}
            />
            <p style={{ fontSize: '11px', color: '#9CA3AF', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <MapPin size={11} />
              {parsedAddress
                ? <span style={{ color: '#16A34A', fontWeight: 600 }}>Address verified ✓</span>
                : 'Select your address from the dropdown suggestions'}
            </p>
            {parsedAddress && (
              <div style={{ marginTop: '6px', background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: '8px', padding: '8px 12px', fontSize: '11px', color: '#15803D' }}>
                {parsedAddress.streetName} · {parsedAddress.city}, {parsedAddress.state} {parsedAddress.postcode}
              </div>
            )}
          </div>

          {error && (
            <p style={{ fontSize: '12px', color: '#DC2626', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '8px', padding: '8px 12px', margin: 0 }}>
              {error}
            </p>
          )}

          <div style={{ display: 'flex', gap: '12px', paddingTop: '4px' }}>
            <button
              type="submit"
              disabled={saving}
              style={{
                flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                background: saving ? '#D1D5DB' : '#111827', color: '#fff', fontWeight: 600,
                padding: '10px 20px', borderRadius: '8px', fontSize: '14px', border: 'none', cursor: saving ? 'not-allowed' : 'pointer'
              }}
            >
              {saving ? <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> : <Plus size={16} />}
              Save Location
            </button>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: '10px 16px', fontSize: '14px', fontWeight: 500, color: '#6B7280',
                border: '1px solid #E5E7EB', borderRadius: '8px', background: '#fff', cursor: 'pointer'
              }}
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}