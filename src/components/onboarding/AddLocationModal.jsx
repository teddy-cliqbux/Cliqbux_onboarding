import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, MapPin, Loader2, Plus, CheckCircle2, AlertTriangle, Pencil } from 'lucide-react';
import { base44 } from '@/api/base44Client';

const inputStyle = {
  width: '100%', border: '1px solid #E5E7EB', borderRadius: '8px',
  padding: '9px 12px', fontSize: '13px', outline: 'none', boxSizing: 'border-box',
  fontFamily: 'Inter, sans-serif', color: '#111827',
};
const labelStyle = { fontSize: '11px', fontWeight: 600, color: '#6B7280', display: 'block', marginBottom: '5px', textTransform: 'uppercase', letterSpacing: '0.04em' };

export default function AddLocationModal({ corporateId, onLocationAdded, onClose }) {
  const [dbaName, setDbaName] = useState('');
  const [addressDisplay, setAddressDisplay] = useState('');
  const [parsedAddress, setParsedAddress] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [unverifiedWarning, setUnverifiedWarning] = useState(false);
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
      const get = (types) => (place.address_components.find(c => types.some(t => c.types.includes(t))) || {}).long_name || '';
      const getShort = (types) => (place.address_components.find(c => types.some(t => c.types.includes(t))) || {}).short_name || '';
      const streetNumber = get(['street_number']);
      const route = get(['route']);
      setParsedAddress({
        streetName: streetNumber ? `${streetNumber} ${route}` : route,
        city: get(['locality', 'sublocality']),
        state: getShort(['administrative_area_level_1']),
        postcode: get(['postal_code']),
      });
      setAddressDisplay(place.formatted_address || '');
      setUnverifiedWarning(false);
    });
    return () => {
      if (autocompleteRef.current) window.google.maps.event.clearInstanceListeners(autocompleteRef.current);
    };
  }, []);

  const handleAddressInput = (e) => {
    setAddressDisplay(e.target.value);
    if (parsedAddress) setParsedAddress(null);
    setUnverifiedWarning(false);
  };

  const handleAddressKeyDown = (e) => {
    // Prevent Enter from submitting form — force user to pick from dropdown
    if (e.key === 'Enter') e.preventDefault();
  };

  const handleClearAddress = () => {
    setAddressDisplay('');
    setParsedAddress(null);
    setUnverifiedWarning(false);
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const doSave = async (addressToUse, businessAddressStr) => {
    setSaving(true);
    setError('');
    try {
      const res = await base44.functions.invoke('addSelfServeLocation', {
        corporateId,
        dbaName: dbaName.trim(),
        businessAddress: businessAddressStr,
        businessInfo: {
          address: {
            streetName: addressToUse?.streetName || '',
            city: addressToUse?.city || '',
            state: addressToUse?.state || '',
            postcode: addressToUse?.postcode || '',
          }
        }
      });
      if (res.data?.error) throw new Error(res.data.error);
      onLocationAdded({ ...res.data.location, addressVerified: !!parsedAddress });
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to add location.');
    } finally {
      setSaving(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!dbaName.trim() || !addressDisplay.trim()) {
      setError('Both fields are required.');
      return;
    }
    if (!parsedAddress) {
      // Show unverified warning — user must explicitly confirm
      setUnverifiedWarning(true);
      return;
    }
    const businessAddress = `${parsedAddress.streetName}, ${parsedAddress.city}, ${parsedAddress.state} ${parsedAddress.postcode}`;
    await doSave(parsedAddress, businessAddress);
  };

  const handleSaveUnverified = async () => {
    await doSave(null, addressDisplay.trim());
  };

  const modal = (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 9998, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.45)', padding: '0 16px' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{ background: '#fff', borderRadius: '16px', boxShadow: '0 25px 50px rgba(0,0,0,0.3)', width: '100%', maxWidth: '460px', padding: '28px' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: '#EFF6FF', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <MapPin size={16} color="#2563EB" />
            </div>
            <div>
              <h3 style={{ fontWeight: 700, color: '#111827', fontSize: '15px', margin: 0 }}>Add Business Location</h3>
              <p style={{ fontSize: '12px', color: '#9CA3AF', margin: 0, marginTop: 2 }}>Enter storefront details below</p>
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9CA3AF', padding: 4, borderRadius: 6 }}>
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
          {/* DBA Name */}
          <div>
            <label style={labelStyle}>Location Name / DBA</label>
            <input
              type="text"
              value={dbaName}
              onChange={(e) => setDbaName(e.target.value)}
              placeholder="e.g. Cliqbux Cafe - Downtown"
              autoFocus
              style={inputStyle}
            />
          </div>

          {/* Address */}
          <div>
            <label style={labelStyle}>Business Physical Address</label>

            {/* If verified: show locked chip with change option */}
            {parsedAddress ? (
              <div style={{ border: '1px solid #BBF7D0', borderRadius: '8px', background: '#F0FDF4', padding: '10px 14px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <CheckCircle2 size={15} color="#16A34A" />
                    <span style={{ fontSize: '13px', fontWeight: 600, color: '#15803D' }}>Address Verified</span>
                  </div>
                  <button
                    type="button"
                    onClick={handleClearAddress}
                    style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: '#6B7280', background: 'none', border: '1px solid #D1D5DB', borderRadius: '6px', padding: '3px 8px', cursor: 'pointer' }}
                  >
                    <Pencil size={11} /> Change
                  </button>
                </div>
                <p style={{ fontSize: '13px', color: '#374151', marginTop: 6, marginBottom: 0 }}>
                  {parsedAddress.streetName}, {parsedAddress.city}, {parsedAddress.state} {parsedAddress.postcode}
                </p>
              </div>
            ) : (
              <>
                <input
                  ref={inputRef}
                  type="text"
                  value={addressDisplay}
                  onChange={handleAddressInput}
                  onKeyDown={handleAddressKeyDown}
                  placeholder="Start typing to search address..."
                  autoComplete="off"
                  style={{ ...inputStyle, borderColor: unverifiedWarning ? '#FCA5A5' : '#E5E7EB', background: unverifiedWarning ? '#FFF7F7' : '#fff' }}
                />
                <p style={{ fontSize: '11px', color: '#9CA3AF', marginTop: '5px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <MapPin size={10} />
                  Select from the dropdown to verify
                </p>
              </>
            )}

            {/* Unverified address warning block */}
            {unverifiedWarning && !parsedAddress && (
              <div style={{ marginTop: '10px', background: '#FFFBEB', border: '1px solid #FCD34D', borderRadius: '8px', padding: '12px 14px' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                  <AlertTriangle size={15} color="#D97706" style={{ marginTop: 1, flexShrink: 0 }} />
                  <div>
                    <p style={{ fontSize: '12px', fontWeight: 700, color: '#92400E', margin: 0 }}>Address not verified</p>
                    <p style={{ fontSize: '11px', color: '#B45309', margin: '3px 0 10px' }}>
                      Unverified addresses may cause processing delays during underwriting. We recommend selecting from the dropdown.
                    </p>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button
                        type="button"
                        onClick={handleSaveUnverified}
                        disabled={saving}
                        style={{ flex: 1, fontSize: '12px', fontWeight: 600, color: '#92400E', background: '#FEF3C7', border: '1px solid #FCD34D', borderRadius: '6px', padding: '7px 12px', cursor: 'pointer' }}
                      >
                        {saving ? 'Saving...' : 'Continue Without Verification'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setUnverifiedWarning(false)}
                        style={{ fontSize: '12px', fontWeight: 500, color: '#6B7280', background: '#fff', border: '1px solid #E5E7EB', borderRadius: '6px', padding: '7px 12px', cursor: 'pointer' }}
                      >
                        Go Back
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {error && (
            <p style={{ fontSize: '12px', color: '#DC2626', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '8px', padding: '8px 12px', margin: 0 }}>
              {error}
            </p>
          )}

          {/* Action buttons — only show when not in unverified-warning state */}
          {!unverifiedWarning && (
            <div style={{ display: 'flex', gap: '10px', paddingTop: '2px' }}>
              <button
                type="submit"
                disabled={saving}
                style={{
                  flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                  background: saving ? '#D1D5DB' : '#111827', color: '#fff', fontWeight: 600,
                  padding: '11px 20px', borderRadius: '9px', fontSize: '13px', border: 'none', cursor: saving ? 'not-allowed' : 'pointer',
                  fontFamily: 'Inter, sans-serif',
                }}
              >
                {saving ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />}
                Save Location
              </button>
              <button
                type="button"
                onClick={onClose}
                style={{ padding: '11px 16px', fontSize: '13px', fontWeight: 500, color: '#6B7280', border: '1px solid #E5E7EB', borderRadius: '9px', background: '#fff', cursor: 'pointer', fontFamily: 'Inter, sans-serif' }}
              >
                Cancel
              </button>
            </div>
          )}
        </form>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}