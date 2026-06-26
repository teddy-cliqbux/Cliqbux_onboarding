// Entity suffixes that should be normalized to UPPERCASE
const ENTITY_SUFFIXES = [
  'llc', 'llc.', 'inc', 'inc.', 'ltd', 'ltd.', 'corp', 'corp.', 'corporation',
  'lp', 'lp.', 'llp', 'llp.', 'pc', 'pc.', 'pllc', 'pllc.', 'llc',
];

// Normalize a business name: title-case, uppercase entity suffixes
export function normalizeBusinessName(name) {
  if (!name) return '';
  const trimmed = name.trim().replace(/\s+/g, ' ');
  const lower = trimmed.toLowerCase();
  const words = lower.split(' ');
  const normalized = words.map((word, i) => {
    const match = ENTITY_SUFFIXES.find(s => s === word || s === word + '.');
    if (match) return match.toUpperCase().replace(/\.$/, '');
    if (word === 'and' && i > 0) return word;
    return word.charAt(0).toUpperCase() + word.slice(1);
  }).join(' ');

  // Re-capitalize any standalone 2-3 char suffix that still looks lower after title-case
  return normalized.split(' ').map(w => {
    return ENTITY_SUFFIXES.includes(w.toLowerCase()) ? w.toUpperCase() : w;
  }).join(' ');
}

// Format SSN with dashes: XXX-XX-XXXX
export function formatSSN(raw) {
  const digits = raw.replace(/\D/g, '').slice(0, 9);
  if (digits.length <= 3) return digits;
  if (digits.length <= 5) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}`;
}

// Mask SSN for display: •••-••-XXXX (last 4 visible)
export function maskSSN(raw) {
  const digits = raw.replace(/\D/g, '').slice(0, 9);
  if (digits.length <= 6) return '••••••';
  return `•••-••-${digits.slice(5)}`;
}

// Raw digits from a formatted SSN
export function rawSSN(formatted) {
  return (formatted || '').replace(/\D/g, '');
}

// Format phone: (XXX) XXX-XXXX
export function formatPhone(raw) {
  const digits = raw.replace(/\D/g, '').slice(0, 10);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

// Raw digits from a formatted phone
export function rawPhone(formatted) {
  return (formatted || '').replace(/\D/g, '');
}