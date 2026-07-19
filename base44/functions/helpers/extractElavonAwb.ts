/**
 * Extract Elavon AWB from MSPWare status / application JSON.
 * Field name is not yet confirmed live — try common keys and labeled values.
 * When confirmed via debugMSPFormRaw / live status, pin the winner in AGENTS.md.
 */
export function extractElavonAwb(...payloads: unknown[]): string | null {
  for (const payload of payloads) {
    const found = walkForAwb(payload, 0);
    if (found) return found;
  }
  return null;
}

const KEY_RE = /^(awb|elavon_?awb|application_?work_?basket|work_?basket(_?id|_?no|_?number)?|boarding_?id|processor_?(ref|reference|application_?id)|elavon_?(ref|reference|app(lication)?_?id))$/i;

function walkForAwb(node: unknown, depth: number): string | null {
  if (node == null || depth > 8) return null;
  if (typeof node === 'string' || typeof node === 'number') return null;
  if (Array.isArray(node)) {
    for (const item of node) {
      const f = walkForAwb(item, depth + 1);
      if (f) return f;
    }
    return null;
  }
  if (typeof node !== 'object') return null;
  const obj = node as Record<string, unknown>;

  for (const [k, v] of Object.entries(obj)) {
    if (KEY_RE.test(k) && (typeof v === 'string' || typeof v === 'number')) {
      const s = String(v).trim();
      if (s && s.length >= 4 && s.length <= 32) return s;
    }
  }

  // Labeled strings: "AWB: 12345" inside free text fields
  for (const v of Object.values(obj)) {
    if (typeof v === 'string') {
      const m = v.match(/\bAWB\s*[:#]?\s*([A-Z0-9-]{4,24})\b/i);
      if (m?.[1]) return m[1];
    }
  }

  for (const v of Object.values(obj)) {
    if (v && typeof v === 'object') {
      const f = walkForAwb(v, depth + 1);
      if (f) return f;
    }
  }
  return null;
}
