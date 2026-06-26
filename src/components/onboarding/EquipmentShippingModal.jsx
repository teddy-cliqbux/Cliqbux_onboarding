import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, MapPin, Package, Home, Building2, Warehouse } from 'lucide-react';
import { base44 } from '@/api/base44Client';

const SHIPPING_OPTIONS = [
  { key: 'address_verified', label: 'Storefront Address', icon: MapPin },
  { key: 'corporate_mailing', label: 'Corporate Mailing Address', icon: Building2 },
  { key: 'custom_staging', label: 'Custom / Staging Warehouse', icon: Warehouse },
];

const inputStyle = {
  width: '100%', border: '1px solid #D1D5DB', borderRadius: '8px',
  padding: '9px 12px', fontSize: '13px', outline: 'none', boxSizing: 'border-box',
  fontFamily: 'Inter, sans-serif', color: '#111827',
};

export default function EquipmentShippingModal({ profile, locations, onClose }) {
  const [shippingSelections, setShippingSelections] = useState({});
  const [customAddresses, setCustomAddresses] = useState({});
  const [globalMode, setGlobalMode] = useState(null);
  const [globalCustom, setGlobalCustom] = useState('');

  useEffect(() => {
    const initial = {};
    locations.forEach((l) => { initial[l.id || l.locationId] = null; });
    setShippingSelections(initial);
  }, [locations]);

  // Corporate mailing — defaults to profile home address as our mailing proxy
  const corporateAddress = `${profile.homeStreet || ''}, ${profile.homeCity || ''}, ${profile.homeState || ''} ${profile.homeZip || ''}`.replace(/^,\s*|,\s*$/g, '') || 'Not set';

  const setSelection = (locId, key) => {
    setShippingSelections((prev) => ({ ...prev, [locId]: key }));
    if (key !== 'custom_staging') {
      setCustomAddresses((prev) => ({ ...prev, [locId]: '' }));
    }
  };

  const setCustom = (locId, val) => {
    setShippingSelections((prev) => ({ ...prev, [locId]: 'custom_staging' }));
    setCustomAddresses((prev) => ({ ...prev, [locId]: val }));
  };

  const applyGlobal = (mode) => {
    setGlobalMode(mode);
    const locationIds = locations.map((l) => l.id || l.locationId);
    setShippingSelections((prev) => {
      const next = {};
      locationIds.forEach((id) => { next[id] = mode; });
      return next;
    });
    setCustomAddresses((prev) => ({ ...prev }));
  };

  const applyGlobalCustom = () => {
    setGlobalMode('custom_staging');
    const val = globalCustom;
    setCustomAddresses((prev) => {
      const next = { ...prev };
      locations.forEach((l) => { next[l.id || l.locationId] = val; });
      return next;
    });
    setShippingSelections((prev) => {
      const next = { ...prev };
      locations.forEach((l) => { next[l.id || l.locationId] = 'custom_staging'; });
      return next;
    });
  };

  const modal = (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 9998, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.45)', padding: '12px' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{ background: '#fff', borderRadius: '16px', boxShadow: '0 25px 50px rgba(0,0,0,0.3)', width: '100%', maxWidth: '640px', maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}>
        {/* Header */}
        <div style={{ padding: '24px 24px 16px', borderBottom: '1px solid #F3F4F6' }}>
          <div className="flex items-center gap-3 mb-1">
            <Package className="w-5 h-5 text-gray-900" />
            <h2 className="text-lg font-bold text-gray-900">Equipment Shipping Router</h2>
          </div>
          <p className="text-sm text-gray-500">Choose where each location&apos;s terminal equipment should be shipped.</p>
          {/* Bulk apply */}
          <div className="mt-3 flex flex-wrap items-center gap-2" style={{ fontSize: 12 }}>
            <span className="text-gray-500 font-medium">Apply to all:</span>
            {SHIPPING_OPTIONS.filter((o) => o.key !== 'custom_staging').map((o) => (
              <button
                key={o.key}
                onClick={() => applyGlobal(o.key)}
                className={`px-3 py-1 rounded-full border font-semibold transition-colors ${
                  globalMode === o.key ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-700 border-gray-200 hover:border-gray-300'
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>

        {/* Locations list */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 24px' }}>
          {locations.length === 0 && <p className="text-sm text-gray-400 text-center py-6">No locations to route.</p>}
          <div className="flex flex-col gap-3">
            {locations.map((loc) => {
              const id = loc.id || loc.locationId;
              const sel = shippingSelections[id];
              const custom = customAddresses[id] || '';
              return (
                <div key={id} className="border border-gray-100 rounded-xl p-4">
                  <p className="text-sm font-semibold text-gray-900 mb-0.5">{loc.dbaName}</p>
                  <p className="text-xs text-gray-400 mb-3">{loc.businessAddress}</p>
                  <div className="flex flex-col gap-2">
                    {SHIPPING_OPTIONS.map((opt) => {
                      const selected = sel === opt.key;
                      const Icon = opt.icon;
                      return (
                        <button
                          key={opt.key}
                          onClick={() => setSelection(id, opt.key)}
                          className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border text-left transition-colors ${
                            selected ? 'border-amber-400 bg-amber-50 ring-1 ring-amber-400' : 'border-gray-100 bg-gray-50 hover:border-gray-200'
                          }`}
                        >
                          <Icon className={`w-4 h-4 flex-shrink-0 ${selected ? 'text-amber-500' : 'text-gray-400'}`} />
                          <div className="flex-1 min-w-0">
                            <p className={`text-xs font-semibold ${selected ? 'text-amber-900' : 'text-gray-900'}`}>{opt.label}</p>
                            <p className="text-[10px] text-gray-400 truncate">
                              {opt.key === 'address_verified' && loc.businessAddress}
                              {opt.key === 'corporate_mailing' && corporateAddress}
                              {opt.key === 'custom_staging' && (custom || 'Enter a staging address below')}
                            </p>
                          </div>
                          <div className={`w-4 h-4 rounded-full border-2 flex-shrink-0 ${selected ? 'border-amber-500 bg-amber-500' : 'border-gray-300'}`}>
                            {selected && <div className="w-2 h-2 rounded-full bg-white m-auto mt-0.5" />}
                          </div>
                        </button>
                      );
                    })}
                    {/* Custom address input — always visible */}
                    <div className="relative mt-1">
                      <input
                        type="text"
                        value={custom}
                        onChange={(e) => setCustom(id, e.target.value)}
                        placeholder="123 Warehouse Rd, City, ST ZIP"
                        disabled={sel !== 'custom_staging'}
                        className={`w-full rounded-lg border px-3 py-2 text-xs outline-none bg-white ${sel === 'custom_staging' ? 'text-gray-900 border-amber-300' : 'text-gray-300 border-gray-100'}`}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div style={{ padding: '16px 24px', borderTop: '1px solid #F3F4F6' }}>
          <button
            onClick={() => {
              if (globalMode === 'custom_staging' && globalCustom) applyGlobalCustom();
              onClose({ shippingSelections, customAddresses });
            }}
            className="w-full flex items-center justify-center gap-2 bg-gray-900 hover:bg-gray-800 text-white font-bold py-3 rounded-lg text-sm transition-colors"
          >
            Save Shipping Routes & Close
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}