import fs from 'fs';

const t = fs.readFileSync(
  'C:/Users/teddy/.cursor/projects/c-Users-teddy-Documents-Github-Cliqbux-onboarding/agent-tools/37a8c367-8f3a-44e4-b68b-d1d99f9e9f4a.txt',
  'utf8',
);
const lines = t.split(/\r?\n/);
let section = '';
const rows = [];
for (const line of lines) {
  if (/^# /.test(line) && !line.includes('Merchant category') && line.length < 90) {
    section = line.slice(2).trim();
    continue;
  }
  const m = line.match(/^\|\s*([0-9]{4}[A-Z]?)\s*\|\s*(.+?)\s*\|\s*$/);
  if (m) rows.push({ mcc: m[1], desc: m[2].trim(), section });
}

const bases = new Set([
  '5411', '5422', '5441', '5451', '5462', '5499', '5811', '5812', '5813', '5814',
  '5611', '5621', '5631', '5641', '5651', '5655', '5661', '5681', '5691', '5697', '5698', '5699', '7230',
  '5732', '5734', '5712', '5211', '5251', '5231', '5261', '7221', '4900', '7011', '7941', '8099', '5932',
  '5311', '5921',
]);

function baseOf(mcc) {
  return mcc.replace(/[A-Z]+$/, '');
}

function groupFor(mcc) {
  const b = baseOf(mcc);
  if (['5411', '5422', '5441', '5451', '5462', '5499', '5811', '5812', '5813', '5814', '5921'].includes(b)) {
    return 'Food & drink';
  }
  if (['5611', '5621', '5631', '5641', '5651', '5655', '5661', '5681', '5691', '5697', '5698', '5699', '7230'].includes(b)) {
    return 'Clothing & personal care';
  }
  if (['5732', '5734'].includes(b)) return 'Electronics';
  if (['5712'].includes(b)) return 'Home & furniture';
  if (['5211', '5251', '5231', '5261'].includes(b)) return 'Hardware & building';
  if (['7221', '5932', '5311'].includes(b)) return 'Retail & services';
  if (['7011', '7941', '8099'].includes(b)) return 'Lodging, sports & health';
  if (['4900'].includes(b)) return 'Utilities';
  return 'Other';
}

function label(desc) {
  return desc.replace(/\s+/g, ' ').trim().replace(/\bAnd\b/g, '&');
}

/** Plain products/services text for MSPWare products_or_services field.
 *  MSPWare max length is 33 (rejected live 2026-07-23 on KK House of Lechon).
 */
const MSP_PRODUCTS_OR_SERVICES_MAX = 33;

function clampProductsOrServices(s) {
  let t = String(s || '').trim().replace(/\s+/g, ' ');
  if (!t) return 'Retail goods and services'.slice(0, MSP_PRODUCTS_OR_SERVICES_MAX);
  if (t.length <= MSP_PRODUCTS_OR_SERVICES_MAX) return t;
  const cut = t.slice(0, MSP_PRODUCTS_OR_SERVICES_MAX);
  const sp = cut.lastIndexOf(' ');
  return (sp >= 12 ? cut.slice(0, sp) : cut).trim();
}

function productsDesc(desc) {
  return clampProductsOrServices(label(desc));
}

const picked = [];
for (const r of rows) {
  const b = baseOf(r.mcc);
  if (!bases.has(b)) continue;
  if (r.mcc.startsWith('5999')) continue;
  if (b === '5311' && r.mcc !== '5311G') continue;
  if (/ephedrine|marijuana|firearm|ammunition|fireworks/i.test(r.desc)) continue;
  picked.push({
    value: r.mcc,
    label: label(r.desc),
    group: groupFor(r.mcc),
    keywords: `${r.desc} ${r.section}`.toLowerCase().replace(/[^a-z0-9\s]/g, ' '),
    products: productsDesc(r.desc),
  });
}

picked.sort(
  (a, b) =>
    a.group.localeCompare(b.group) ||
    a.label.localeCompare(b.label) ||
    a.value.localeCompare(b.value),
);

const productsMap = {};
for (const p of picked) productsMap[p.value] = p.products;

const byGroup = {};
for (const p of picked) byGroup[p.group] = (byGroup[p.group] || 0) + 1;
console.log('picked', picked.length, byGroup);

const catalogOut = `/** Elavon eBoarding MCC catalog — curated merchant-facing list with letter variants.
 *  Source: developer.elavon.com eBoarding MCC list.
 *  Letter suffixes confirmed in MSPWare UI 2026-07-17 (Teddy screenshot: 5251 / 5251A–E).
 *  5999 family and other high-risk codes intentionally omitted.
 *  Department store brands under 5311 skipped — only 5311G (Department Stores).
 *  Regenerate: node scripts/gen-mcc-catalog.mjs
 */
export const MCC_OPTIONS = ${JSON.stringify(picked.map(({ value, label, group, keywords }) => ({ value, label, group, keywords })), null, 2)};

/** Exact MCC → MSPWare products_or_services text (Elavon description). */
export const MCC_PRODUCTS_OR_SERVICES = ${JSON.stringify(productsMap, null, 2)};

export function mccOptionLabel(opt) {
  return \`\${opt.label} (\${opt.value})\`;
}

export function mccDisplayLabel(mccCode) {
  const opt = MCC_OPTIONS.find((o) => o.value === mccCode);
  return opt ? mccOptionLabel(opt) : mccCode || '';
}

/** Strip letter suffix for industry / liquor rules that key on the 4-digit family. */
export function mccBase(mcc) {
  return String(mcc || '').trim().replace(/[A-Z]+$/i, '');
}

/**
 * Cafe / bakery-style MCCs that tip like restaurants. Exact match only —
 * do NOT family-strip 5462/5499 (Cookie, Convenience, etc. stay RE).
 */
const RS_EXACT = new Set([
  '5462', '5462A', '5462C',
  '5499', '5499F', '5499H', '5499K', '5499N',
]);

/** MCC → MSPWare industry_type (RE / RS / SP / HT). RS: exact cafe codes + 5811–5814 family. */
export function mccToIndustry(mcc) {
  const raw = String(mcc || '').trim().toUpperCase();
  if (RS_EXACT.has(raw)) return 'RS';
  const b = mccBase(mcc);
  if (['5811', '5812', '5813', '5814'].includes(b)) return 'RS';
  if (b === '5411') return 'SP';
  if (b === '7011') return 'HT';
  return 'RE';
}

/** MCC → products_or_services for MSPWare when profile.productDescription is blank.
 *  MSPWare rejects values longer than 33 characters (live 2026-07-23).
 */
export const MSP_PRODUCTS_OR_SERVICES_MAX = 33;

export function clampProductsOrServices(s) {
  let t = String(s || '').trim().replace(/\\s+/g, ' ');
  if (!t) return 'Retail goods and services'.slice(0, MSP_PRODUCTS_OR_SERVICES_MAX);
  if (t.length <= MSP_PRODUCTS_OR_SERVICES_MAX) return t;
  const cut = t.slice(0, MSP_PRODUCTS_OR_SERVICES_MAX);
  const sp = cut.lastIndexOf(' ');
  return (sp >= 12 ? cut.slice(0, sp) : cut).trim();
}

export function mccToProductsOrServices(mcc) {
  const raw = String(mcc || '').trim().toUpperCase();
  let out = 'Retail goods and services';
  if (raw) {
    if (MCC_PRODUCTS_OR_SERVICES[raw]) out = MCC_PRODUCTS_OR_SERVICES[raw];
    else {
      const b = mccBase(raw);
      if (MCC_PRODUCTS_OR_SERVICES[b]) out = MCC_PRODUCTS_OR_SERVICES[b];
      else {
        const opt = MCC_OPTIONS.find((o) => o.value === raw || mccBase(o.value) === b);
        if (opt?.label) out = opt.label;
      }
    }
  }
  return clampProductsOrServices(out);
}
`;

fs.writeFileSync('src/lib/mccCatalog.js', catalogOut);
console.log('wrote src/lib/mccCatalog.js');

// Deno-inlinable snippet for boarding functions (Base44 cannot import shared modules).
const denoSnippet = `// ─── MCC → industry_type + products_or_services (inlined from mccCatalog) ───
// Regenerate via: node scripts/gen-mcc-catalog.mjs
// MSPWare products_or_services max length 33 (rejected live 2026-07-23 KK House of Lechon).
const MSP_PRODUCTS_OR_SERVICES_MAX = 33;
function clampProductsOrServices(s: string): string {
  let t = String(s || '').trim().replace(/\\s+/g, ' ');
  if (!t) return 'Retail goods and services'.slice(0, MSP_PRODUCTS_OR_SERVICES_MAX);
  if (t.length <= MSP_PRODUCTS_OR_SERVICES_MAX) return t;
  const cut = t.slice(0, MSP_PRODUCTS_OR_SERVICES_MAX);
  const sp = cut.lastIndexOf(' ');
  return (sp >= 12 ? cut.slice(0, sp) : cut).trim();
}
const MCC_PRODUCTS_OR_SERVICES: Record<string, string> = ${JSON.stringify(productsMap, null, 2)};
function mccBaseCode(mcc: string): string {
  return String(mcc || '').trim().replace(/[A-Z]+$/i, '');
}
/** Exact cafe/bakery RS codes — do NOT family-strip 5462/5499 siblings. */
const RS_EXACT = new Set([
  '5462', '5462A', '5462C',
  '5499', '5499F', '5499H', '5499K', '5499N',
]);
function mccToIndustryCode(mcc: string): string {
  const raw = String(mcc || '').trim().toUpperCase();
  if (RS_EXACT.has(raw)) return 'RS';
  const b = mccBaseCode(mcc);
  if (['5811', '5812', '5813', '5814'].includes(b)) return 'RS';
  if (b === '5411') return 'SP';
  if (b === '7011') return 'HT';
  return 'RE';
}
function mccToProductsOrServices(mcc: string): string {
  const raw = String(mcc || '').trim().toUpperCase();
  let out = 'Retail goods and services';
  if (raw) {
    if (MCC_PRODUCTS_OR_SERVICES[raw]) out = MCC_PRODUCTS_OR_SERVICES[raw];
    else {
      const b = mccBaseCode(raw);
      if (MCC_PRODUCTS_OR_SERVICES[b]) out = MCC_PRODUCTS_OR_SERVICES[b];
    }
  }
  return clampProductsOrServices(out);
}
function resolveIndustryType(merchantMID: any, mcc: string, pricingCategory: any, mapIndustryTypeFn: (c: any) => string): string {
  return merchantMID.industryType || mccToIndustryCode(mcc) || mapIndustryTypeFn(pricingCategory) || 'RE';
}
function resolveProductsOrServices(profile: any, mcc: string): string {
  const manual = String(profile?.productDescription || '').trim();
  if (manual) return clampProductsOrServices(manual);
  return mccToProductsOrServices(mcc);
}
`;

fs.writeFileSync('base44/functions/helpers/mccDerived.ts', `// Canonical copy — boarding functions inline this (Base44 isolates each entry.ts).
// Regenerate: node scripts/gen-mcc-catalog.mjs
${denoSnippet}
`);
console.log('wrote base44/functions/helpers/mccDerived.ts');
fs.writeFileSync('scripts/_mcc-deno-snippet.txt', denoSnippet);
console.log('wrote scripts/_mcc-deno-snippet.txt');
