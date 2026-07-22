/**
 * Compose street + optional apt/suite/unit for display and MSPWare single-line streets.
 * Empty line 2 is omitted (same as street-only today).
 */
export function composeStreet(street, street2) {
  const line1 = String(street || '').trim();
  const line2 = String(street2 || '').trim();
  if (!line1) return line2;
  if (!line2) return line1;
  return `${line1}, ${line2}`;
}

/**
 * Full US address display: street[, street2], city, ST ZIP
 */
export function composeFullAddress({ street, street2, city, state, zip } = {}) {
  const streetLine = composeStreet(street, street2);
  const cityPart = String(city || '').trim();
  const statePart = String(state || '').trim();
  const zipPart = String(zip || '').trim();
  const cityStateZip = [cityPart, [statePart, zipPart].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  return [streetLine, cityStateZip].filter(Boolean).join(', ');
}
