/**
 * Compose street + optional apt/suite/unit for MSPWare single-line street fields.
 * Mirror of src/lib/addressLine.js — Base44 functions cannot import shared helpers;
 * keep in sync when editing either copy.
 * Join with space (not comma) — MSPWare Address Line 1 rejects commas/special chars.
 */
export function composeStreet(street: string | null | undefined, street2: string | null | undefined): string {
  const line1 = String(street || '').trim();
  const line2 = String(street2 || '').trim();
  if (!line1) return line2;
  if (!line2) return line1;
  return `${line1} ${line2}`;
}
