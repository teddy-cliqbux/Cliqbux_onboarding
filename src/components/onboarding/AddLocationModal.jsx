import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X, MapPin, Loader2, Plus } from 'lucide-react';
import { base44 } from '@/api/base44Client';

export default function AddLocationModal({ corporateId, onLocationAdded, onClose }) {
  const [dbaName, setDbaName] = useState('');
  const [businessAddress, setBusinessAddress] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const addressRef = useRef(null);
  const autocompleteRef = useRef(null);

  // Inject pac-container z-index override once
  useEffect(() => {
    const styleId = 'pac-z-index-fix';
    if (!document.getElementById(styleId)) {
      const style = document.createElement('style');
      style.id = styleId;
      style.textContent = '.pac-container { z-index: 99999 !important; pointer-events: auto !important; }';
      document.head.appendChild(style);
    }
  }, []);

  useEffect(() => {
    const tryInit = (attempts = 0) => {
      if (window.google?.maps?.places?.Autocomplete && addressRef.current) {
        try {
          autocompleteRef.current = new window.google.maps.places.Autocomplete(addressRef.current, {
            types: ['address'],
            componentRestrictions: { country: 'us' }
          });
          autocompleteRef.current.addListener('place_changed', () => {
            const place = autocompleteRef.current.getPlace();
            if (place?.formatted_address) {
              setBusinessAddress(place.formatted_address);
              if (addressRef.current) addressRef.current.value = place.formatted_address;
            }
          });
        } catch (e) {
          console.warn('Google Places init failed:', e);
        }
      } else if (attempts < 10) {
        // Retry up to 10 times (5s total) waiting for Maps SDK to load
        setTimeout(() => tryInit(attempts + 1), 500);
      }
    };
    const timer = setTimeout(() => tryInit(0), 200);
    return () => clearTimeout(timer);
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    // Read the raw DOM value in case state is stale (uncontrolled input)
    const addressValue = addressRef.current?.value || businessAddress;
    if (!dbaName.trim() || !addressValue.trim()) {
      setError('Both fields are required.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const res = await base44.functions.invoke('addSelfServeLocation', {
        corporateId,
        dbaName: dbaName.trim(),
        businessAddress: addressValue.trim()
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

          {/* Address — uncontrolled to allow Google Places to manage DOM value */}
          <div>
            <label style={{ fontSize: '11px', fontWeight: 600, color: '#4B5563', display: 'block', marginBottom: '6px' }}>
              Business Physical Address
            </label>
            <input
              ref={addressRef}
              type="text"
              placeholder="Start typing your address..."
              style={{
                width: '100%', border: '1px solid #E5E7EB', borderRadius: '8px',
                padding: '10px 12px', fontSize: '14px', outline: 'none', boxSizing: 'border-box'
              }}
            />
            <p style={{ fontSize: '11px', color: '#9CA3AF', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <MapPin size={11} /> Google Places verified
            </p>
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