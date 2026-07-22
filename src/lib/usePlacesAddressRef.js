import { useCallback, useRef } from 'react';

/**
 * Callback ref that attaches Google Places Autocomplete to an address input.
 * Re-attaches when the input remounts (e.g. after clearing a verified address chip).
 * The old hook bailed if acRef was set, so Places died after the first clear.
 */
export function usePlacesAddressRef(onParsed) {
  const onParsedRef = useRef(onParsed);
  onParsedRef.current = onParsed;
  const acRef = useRef(null);
  const elRef = useRef(null);

  return useCallback((el) => {
    if (el === elRef.current) return;

    if (acRef.current && window.google?.maps?.event) {
      try {
        window.google.maps.event.clearInstanceListeners(acRef.current);
      } catch { /* ignore */ }
      acRef.current = null;
    }
    elRef.current = el;
    if (!el || !window.google?.maps?.places) return;

    const ac = new window.google.maps.places.Autocomplete(el, {
      types: ['address'],
      componentRestrictions: { country: 'us' },
      fields: ['address_components'],
    });
    ac.addListener('place_changed', () => {
      const place = ac.getPlace();
      if (!place?.address_components) return;
      const get = (types) =>
        (place.address_components.find((c) => types.some((t) => c.types.includes(t))) || {}).long_name || '';
      const getS = (types) =>
        (place.address_components.find((c) => types.some((t) => c.types.includes(t))) || {}).short_name || '';
      const street = (get(['street_number']) ? `${get(['street_number'])} ` : '') + get(['route']);
      const street2 = get(['subpremise']);
      const city = get(['locality', 'sublocality']);
      const state = getS(['administrative_area_level_1']);
      const zip = get(['postal_code']);
      onParsedRef.current?.({ street, street2, city, state, zip });
    });
    acRef.current = ac;
  }, []);
}
