import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, MapPin, Loader2, Plus, CheckCircle2, AlertTriangle, Pencil, ChevronDown, ChevronRight } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import EINValidator from '@/components/onboarding/EINValidator';

export default function AddLocationModal({
  corporateId,
  entityId,              // the primary entity UUID to assign by default
  entityName,            // primary entity legal name (shown in default state)
  onLocationAdded,
  onClose,
  initialDbaName = '',
  initialBusinessAddress = '',
  initialSeparateEntity = null,
}) {
  const isEdit = !!(initialDbaName || initialBusinessAddress);
  const [dbaName, setDbaName] = useState(initialDbaName);
  const [addressDisplay, setAddressDisplay] = useState(initialBusinessAddress);
  const [parsedAddress, setParsedAddress] = useState(null);
  const [unverifiedWarning, setUnverifiedWarning] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // — Section B: Entity Expansion —
  const [useAdvancedEntity, setUseAdvancedEntity] = useState(!!initialSeparateEntity);
  const [separateLegalName, setSeparateLegalName] = useState(initialSeparateEntity?.legalBusinessName || '');
  const [separateEIN, setSeparateEIN] = useState(initialSeparateEntity?.federalEIN || '');
  const [separateEINValidated, setSeparateEINValidated] = useState(null); // formatted EIN or null

  const inputRef = useRef(null);
  const autocompleteRef = useRef(null);

  // — Google Places —
  useEffect(() => {
    if (!inputRef.current || !window.google?.maps?.places) return;
    autocompleteRef.current = new window.google.maps.places.Autocomplete(inputRef.current, {
      types: ['address'], componentRestrictions: { country: 'us' }, fields: ['address_components', 'formatted_address'],
    });
    autocompleteRef.current.addListener('place_changed', () => {
      const place = autocompleteRef.current.getPlace();
      if (!place?.address_components) return;
      const get = (types) => (place.address_components.find(c => types.some(t => c.types.includes(t))) || {}).long_name || '';
      const getS = (types) => (place.address_components.find(c => types.some(t => c.types.includes(t))) || {}).short_name || '';
      setParsedAddress({ streetName: (get(['street_number']) ? `${get(['street_number'])} ` : '') + get(['route']), city: get(['locality', 'sublocality']), state: getS(['administrative_area_level_1']), postcode: get(['postal_code']) });
      setAddressDisplay(place.formatted_address || '');
      setUnverifiedWarning(false);
    });
    return () => { if (autocompleteRef.current) window.google.maps.event.clearInstanceListeners(autocompleteRef.current); };
  }, []);

  const handleAddressKeyDown = (e) => { if (e.key === 'Enter') e.preventDefault(); };

  const clearAddress = () => { setAddressDisplay(''); setParsedAddress(null); setUnverifiedWarning(false); setTimeout(() => inputRef.current?.focus(), 0); };

  const buildEntityFields = () => {
    const ef = {};
    if (useAdvancedEntity) {
      ef.separateLegalName = separateLegalName.trim();
      ef.separateEIN = separateEINValidated || separateEIN.replace(/\D/g, '');
    }
    return ef;
  };

  const doSave = async (addressToUse, businessAddressStr) => {
    setSaving(true);
    setError('');
    try {
      const entityFields = buildEntityFields();

      // Create the location
      const res = await base44.functions.invoke('addSelfServeLocation', {
        corporateId,
        dbaName: dbaName.trim(),
        businessAddress: businessAddressStr,
        entityId: useAdvancedEntity ? separateEINValidated : entityId,
      });
      if (res.data?.error) throw new Error(res.data.error);
      const loc = res.data.location;

      // If separate entity was entered, register it as a legal entity
      if (useAdvancedEntity && separateLegalName.trim() && (separateEINValidated || separateEIN.replace(/\D/g, ''))) {
        await base44.functions.invoke('manageLegalEntity', {
          corporateId, action: 'add', legalBusinessName: separateLegalName.trim(),
          federalEIN: separateEINValidated || separateEIN.replace(/\D/g, ''),
        });
      }

      onLocationAdded({
        location: loc,
        addressVerified: !!parsedAddress,
      });
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to save location.');
    } finally {
      setSaving(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!dbaName.trim() || !addressDisplay.trim()) { setError('Both fields are required.'); return; }
    if (!parsedAddress) { setUnverifiedWarning(true); return; }
    const busAddr = `${parsedAddress.streetName}, ${parsedAddress.city}, ${parsedAddress.state} ${parsedAddress.postcode}`;
    await doSave(parsedAddress, busAddr);
  };

  const handleSaveUnverified = async () => { await doSave(null, addressDisplay.trim()); };

  const validAddr = !!parsedAddress;
  const canSave = dbaName.trim() && addressDisplay.trim() && (validAddr || unverifiedWarning);

  const modal = (
    <div className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/45 px-4" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-[520px] max-h-[90vh] overflow-y-auto">
        <form onSubmit={handleSubmit}>
          {/* Header */}
          <div className="flex items-center justify-between p-6 pb-4 border-b border-gray-100">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-blue-50 flex items-center justify-center"><MapPin className="w-4.5 h-4.5 text-blue-500" /></div>
              <div>
                <h3 className="font-bold text-gray-900 text-base">{isEdit ? 'Edit Business Location' : 'Add Business Location'}</h3>
                <p className="text-xs text-gray-400">DBA Name, Address &amp; Legal Entity</p>
              </div>
            </div>
            <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1 rounded-lg"><X size={18} /></button>
          </div>

          <div className="p-6 space-y-6">
            {/* — Section A: Storefront Profile — */}
            <div>
              <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-gray-800 text-white text-[9px] font-bold flex items-center justify-center">A</span> Storefront Profile
              </h4>
              <div className="space-y-3 pl-7">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Storefront DBA Name</label>
                  <input type="text" value={dbaName} onChange={(e) => setDbaName(e.target.value)} placeholder="e.g. Cliqbux Cafe - Downtown" autoFocus
                    className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Storefront Physical Address</label>
                  {validAddr ? (
                    <div className="border border-green-200 bg-green-50 rounded-lg p-3">
                      <div className="flex items-center justify-between">
                        <span className="flex items-center gap-1.5 text-xs font-semibold text-green-700"><CheckCircle2 className="w-3.5 h-3.5" /> Address Verified</span>
                        <button type="button" onClick={clearAddress} className="flex items-center gap-1 text-[10px] text-gray-500 border border-gray-300 rounded px-2 py-1 hover:text-blue-600"><Pencil className="w-3 h-3" /> Change</button>
                      </div>
                      <p className="text-sm text-gray-700 mt-1.5">{parsedAddress.streetName}, {parsedAddress.city}, {parsedAddress.state} {parsedAddress.postcode}</p>
                    </div>
                  ) : (
                    <>
                      <input ref={inputRef} type="text" value={addressDisplay} onChange={(e) => { setAddressDisplay(e.target.value); if (parsedAddress) setParsedAddress(null); setUnverifiedWarning(false); }} onKeyDown={handleAddressKeyDown}
                        placeholder="Start typing to search address..." autoComplete="off"
                        className={`w-full border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 ${unverifiedWarning ? 'border-red-300 bg-red-50 focus:ring-red-400' : 'border-gray-200 focus:ring-blue-500'}`}
                      />
                      <p className="text-[10px] text-gray-400 mt-1 flex items-center gap-1"><MapPin className="w-3 h-3" /> Select from the dropdown to verify</p>
                    </>
                  )}
                  {unverifiedWarning && !validAddr && (
                    <div className="mt-2 bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-start gap-2">
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-600 mt-0.5 flex-shrink-0" />
                      <div className="text-[11px]">
                        <p className="font-semibold text-amber-800">Address not verified</p>
                        <p className="text-amber-600 mt-0.5">Unverified addresses may cause processing delays. Prefer selecting from the dropdown.</p>
                        <div className="flex gap-2 mt-2">
                          <button type="button" onClick={handleSaveUnverified} disabled={saving} className="text-xs font-semibold text-amber-800 bg-amber-100 border border-amber-200 rounded-lg px-3 py-1.5 hover:bg-amber-200 disabled:opacity-50">{saving ? 'Saving...' : 'Continue Without Verification'}</button>
                          <button type="button" onClick={() => setUnverifiedWarning(false)} className="text-xs text-gray-500 bg-white border border-gray-200 rounded-lg px-3 py-1.5 hover:text-gray-700">Go Back</button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* — Section B: Auto-Inherited Legal Entity — */}
            <div className="border-t border-gray-100 pt-5">
              <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-gray-800 text-white text-[9px] font-bold flex items-center justify-center">B</span> Legal Entity
              </h4>
              <div className="pl-7">
                <button type="button" onClick={() => setUseAdvancedEntity(!useAdvancedEntity)}
                  className="flex items-center gap-2 text-xs font-medium text-gray-500 hover:text-gray-800 transition-colors">
                  {useAdvancedEntity ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                  ⚙️ Advanced: This storefront operates under a separate Legal Entity or unique EIN
                </button>

                {useAdvancedEntity ? (
                  <div className="mt-3 space-y-3">
                    <p className="text-[11px] text-gray-400">By default each storefront is grouped under your primary business. Check this to assign a <strong className="text-gray-600">separate corporate shell</strong> — this will board as its own processing account with a distinct MID.</p>
                    <div>
                      <label className="block text-xs font-semibold text-gray-600 mb-1">Legal Corporate Name</label>
                      <input type="text" value={separateLegalName} onChange={(e) => setSeparateLegalName(e.target.value)}
                        placeholder="e.g. Cliqbux Holdings LLC" className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-600 mb-1">Federal EIN</label>
                      <EINValidator corporateId={corporateId} value={separateEIN} onChange={setSeparateEIN} onValidated={(f) => setSeparateEINValidated(f)} />
                    </div>
                    {!separateEINValidated && separateEIN.replace(/\D/g, '').length === 9 && (
                      <p className="text-xs text-gray-400">Click <strong>Verify</strong> to confirm this EIN is valid before saving.</p>
                    )}
                  </div>
                ) : entityId && (
                  <p className="text-xs text-gray-400 mt-2">This storefront will be grouped under your primary legal entity.</p>
                )}
              </div>
            </div>

            {error && <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-xs text-red-700">{error}</div>}
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-gray-100 flex gap-3">
            <button type="submit" disabled={!canSave || saving}
              className="flex-1 flex items-center justify-center gap-2 bg-gray-900 hover:bg-gray-800 disabled:bg-gray-200 disabled:text-gray-400 text-white font-semibold py-3 px-5 rounded-xl text-sm transition-all">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              {isEdit ? 'Update Location' : 'Save Location'}
            </button>
            <button type="button" onClick={onClose} className="text-sm font-medium text-gray-500 border border-gray-200 rounded-xl py-3 px-5 hover:bg-gray-50 transition-all">Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}