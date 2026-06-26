import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, MapPin, Loader2, Plus, CheckCircle2, AlertTriangle, Pencil, ChevronDown, ChevronRight } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import EINValidator from '@/components/onboarding/EINValidator';

export default function AddLocationModal({
  corporateId,
  entities = [],
  initialLegalName = '',
  initialTaxId = '',
  onLocationAdded,
  onClose,
  initialDbaName = '',
  initialBusinessAddress = '',
  initialEntityId = '',
}) {
  const isEdit = !!(initialDbaName || initialBusinessAddress);
  const isFirstLocation = !isEdit && entities.length === 0;

  const [dbaName, setDbaName] = useState(initialDbaName);
  const [addressDisplay, setAddressDisplay] = useState(initialBusinessAddress);
  const [parsedAddress, setParsedAddress] = useState(null);
  const [unverifiedWarning, setUnverifiedWarning] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef(null);

  // — Section B: Inherit from Step 1 (profile.legalName + profile.taxId) —
  const [corporateLegalName, setCorporateLegalName] = useState(initialLegalName || initialDbaName || '');
  const [federalEIN, setFederalEIN] = useState(initialTaxId || '');
  const [einValidated, setEinValidated] = useState(null);
  const [corporateMailingAddress, setCorporateMailingAddress] = useState(initialBusinessAddress || '');

  // subsequent locations: dropdown choice
  const [entityChoice, setEntityChoice] = useState('existing'); // 'existing' | 'new'
  const [selectedEntityId, setSelectedEntityId] = useState(isEdit && initialEntityId ? initialEntityId : (entities[0]?.entityId || ''));

  const autocompleteRef = useRef(null);
  const mailRef = useRef(null);
  const mailAutocompleteRef = useRef(null);

  // Helper to initialize Google Places on a given input ref
  const initPlaces = (ref, setter) => {
    if (!ref.current || !window.google?.maps?.places) return;
    const ac = new window.google.maps.places.Autocomplete(ref.current, {
      types: ['address'], componentRestrictions: { country: 'us' }, fields: ['address_components', 'formatted_address'],
    });
    ac.addListener('place_changed', () => {
      const place = ac.getPlace();
      if (!place?.address_components) return;
      const get = (types) => (place.address_components.find(c => types.some(t => c.types.includes(t))) || {}).long_name || '';
      const getS = (types) => (place.address_components.find(c => types.some(t => c.types.includes(t))) || {}).short_name || '';
      const addr = `${get(['street_number']) ? `${get(['street_number'])} ` : ''}${get(['route'])}, ${get(['locality', 'sublocality'])}, ${getS(['administrative_area_level_1'])} ${get(['postal_code'])}`;
      setter(addr);
    });
    return () => { if (ac) window.google.maps.event.clearInstanceListeners(ac); };
  };

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
      const street = (get(['street_number']) ? `${get(['street_number'])} ` : '') + get(['route']);
      const city = get(['locality', 'sublocality']);
      const state = getS(['administrative_area_level_1']);
      const postcode = get(['postal_code']);
      setParsedAddress({ streetName: street, city, state, postcode });
      const formatted = `${street}, ${city}, ${state} ${postcode}`;
      setAddressDisplay(formatted);
      setUnverifiedWarning(false);
      // Pre-fill corporate mailing address on first location if not yet edited
      if (isFirstLocation && !corporateMailingAddress.trim()) {
        setCorporateMailingAddress(formatted);
      }
    });
    return () => { if (autocompleteRef.current) window.google.maps.event.clearInstanceListeners(autocompleteRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFirstLocation]);

  useEffect(() => { return initPlaces(mailRef, setCorporateMailingAddress); }, []);

  const handleAddressKeyDown = (e) => { if (e.key === 'Enter') e.preventDefault(); };

  const clearAddress = () => { setAddressDisplay(''); setParsedAddress(null); setUnverifiedWarning(false); setTimeout(() => inputRef.current?.focus(), 0); };

  const formatEIN = (d) => {
    const nd = d.replace(/\D/g, '');
    return nd.length > 2 ? `${nd.slice(0, 2)}-${nd.slice(2, 9)}` : nd;
  };

  // Normalize EIN to raw 9-digit string — strips dashes for reliable length checks
  const rawEIN = () => {
    const val = einValidated || federalEIN;
    return (val || '').replace(/[^0-9]/g, '').slice(0, 9);
  };

  const isValidRawEIN = () => /^\d{9}$/.test(rawEIN());

  const setEinError = (msg) => { if (msg) setError(msg); };

  const doSave = async (addressToUse, businessAddressStr) => {
    setSaving(true);
    setError('');
    try {
      let targetEntityId = '';
      let shouldReloadEntities = false;

      if (isFirstLocation || entityChoice === 'new') {
        const name = (corporateLegalName || dbaName).trim();
        const ein = rawEIN();
        if (!name || ein.length !== 9) throw new Error('Legal corporate name and a valid 9-digit EIN are required.');
        const res = await base44.functions.invoke('manageLegalEntity', {
          corporateId, action: 'add', legalBusinessName: name, federalEIN: ein, corporateMailingAddress: corporateMailingAddress.trim(),
        });
        if (res.data?.error) throw new Error(res.data.error);
        targetEntityId = res.data.entities[res.data.entities.length - 1].entityId;
        shouldReloadEntities = true;
      } else {
        targetEntityId = selectedEntityId;
      }

      const locRes = await base44.functions.invoke('addSelfServeLocation', {
        corporateId,
        entityId: targetEntityId,
        dbaName: dbaName.trim(),
        businessAddress: businessAddressStr,
      });
      if (locRes.data?.error) throw new Error(locRes.data.error);

      onLocationAdded({
        location: locRes.data.location,
        addressVerified: !!parsedAddress,
        reloadEntities: shouldReloadEntities,
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
    setError('');
    if (!dbaName.trim() || !addressDisplay.trim()) { setError('Both fields are required.'); return; }
    if (isFirstLocation || entityChoice === 'new') {
      const name = (corporateLegalName || dbaName).trim();
      if (!name) { setError('Corporate Legal Name is required.'); return; }
      if (!isValidRawEIN()) { setError('A valid 9-digit Federal EIN is required.'); return; }
    }
    if (!parsedAddress) { setUnverifiedWarning(true); return; }
    const busAddr = `${parsedAddress.streetName}, ${parsedAddress.city}, ${parsedAddress.state} ${parsedAddress.postcode}`;
    await doSave(parsedAddress, busAddr);
  };

  const handleSaveUnverified = async () => {
    setError('');
    if (isFirstLocation || entityChoice === 'new') {
      const name = (corporateLegalName || dbaName).trim();
      if (!name) { setError('Corporate Legal Name is required.'); return; }
      if (!isValidRawEIN()) { setError('A valid 9-digit Federal EIN is required.'); return; }
    }
    await doSave(null, addressDisplay.trim());
  };

  const validAddr = !!parsedAddress;
  const canSave = dbaName.trim() && addressDisplay.trim() && (validAddr || unverifiedWarning);

  const renderEntitySection = () => {
    if (isFirstLocation) {
      // First location: mandatory Corporate Name + EIN + Corporate Mailing Address
      return (
        <div className="border-t border-gray-100 pt-5">
          <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-2">
            <span className="w-5 h-5 rounded-full bg-gray-800 text-white text-[9px] font-bold flex items-center justify-center">B</span> Corporate Entity (Primary Legal Name)
          </h4>
          <div className="space-y-3 pl-7">
            <p className="text-[11px] text-gray-400 bg-blue-50 border border-blue-100 rounded-lg p-2.5">💡 Note: These fields default to your storefront identity. Only change them if your official corporate tax registration or billing address is legally different from your store name.</p>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Corporate Legal Name</label>
              <input type="text" value={corporateLegalName} onChange={(e) => setCorporateLegalName(e.target.value)}
                placeholder="Legal corporate name (pre-filled from storefront)" className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Federal EIN</label>
              <EINValidator corporateId={corporateId} value={federalEIN} onChange={setFederalEIN} onValidated={(f) => setEinValidated(f)} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Corporate Mailing Address</label>
              <input ref={mailRef} type="text" value={corporateMailingAddress} onChange={(e) => setCorporateMailingAddress(e.target.value)} onKeyDown={handleAddressKeyDown}
                placeholder="Start typing to search address..." autoComplete="off" className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              <p className="text-[10px] text-gray-400 mt-1 flex items-center gap-1"><MapPin className="w-3 h-3" /> Pre-filled from your storefront address. Change only if different.</p>
            </div>
          </div>
        </div>
      );
    }

    // Subsequent locations: entity picker with optional create-new hatch
    return (
      <div className="border-t border-gray-100 pt-5">
        <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-2">
          <span className="w-5 h-5 rounded-full bg-gray-800 text-white text-[9px] font-bold flex items-center justify-center">B</span> Legal Entity Assignment
        </h4>
        <div className="pl-7 space-y-3">
          {entityChoice === 'existing' ? (
            <>
              <div className="flex items-center gap-2">
                <select value={selectedEntityId} onChange={(e) => setSelectedEntityId(e.target.value)}
                  className="flex-1 border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
                  {entities.map(e => (
                    <option key={e.entityId} value={e.entityId}>{e.legalBusinessName} — EIN: {e.federalEIN && formatEIN(e.federalEIN)}</option>
                  ))}
                </select>
              </div>
              <p className="text-[11px] text-gray-400">This location will automatically group under your primary corporate entity above. Use the button below only if this specific store runs under a legally distinct EIN.</p>
            </>
          ) : (
            <>
              <p className="text-[11px] text-gray-400 bg-blue-50 border border-blue-100 rounded-lg p-2.5">💡 Note: These fields default to your storefront identity. Only change them if your official corporate tax registration is legally different from your store name.</p>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Corporate Legal Name</label>
                <input type="text" value={corporateLegalName} onChange={(e) => setCorporateLegalName(e.target.value)}
                  placeholder="Legal corporate name" className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Federal EIN</label>
                <EINValidator corporateId={corporateId} value={federalEIN} onChange={setFederalEIN} onValidated={(f) => setEinValidated(f)} />
              </div>
            </>
          )}

          <div className="flex items-center gap-2 pt-1">
            <button type="button" onClick={() => {
              if (entityChoice === 'existing') {
                // Switch to new-entity mode — re-select dropdown, clear manual fields
                setSelectedEntityId(entities[0]?.entityId || '');
                setCorporateLegalName('');
                setFederalEIN('');
                setEinValidated(null);
                setEntityChoice('new');
              } else {
                // Switch back to existing dropdown
                setCorporateLegalName('');
                setFederalEIN('');
                setEinValidated(null);
                setEntityChoice('existing');
              }
            }}
              className="text-xs text-blue-600 hover:text-blue-800 font-medium flex items-center gap-1 border border-blue-200 hover:bg-blue-50 rounded-lg px-3 py-1.5 transition-all">
              {entityChoice === 'existing' ? '+ Create New Legal Entity / EIN' : '← Assign to Existing Entity'}
            </button>
          </div>
        </div>
      </div>
    );
  };

  const modal = (
    <div className="fixed inset-0 z-[9998] flex items-start justify-center bg-black/45 px-4 pt-8 pb-8 overflow-y-auto" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-[540px] my-auto">
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

            {renderEntitySection()}

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