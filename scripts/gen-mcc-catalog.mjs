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

/** Plain products/services text for MSPWare products_or_services field. */
function productsDesc(desc) {
  const cleaned = label(desc);
  // Prefer Elavon's own wording — matches how MSPWare MCC pickers describe the business.
  return cleaned;
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

/** MCC → MSPWare industry_type (RE / RS / SP / HT). Letter variants use the base family. */
export function mccToIndustry(mcc) {
  const b = mccBase(mcc);
  if (['5811', '5812', '5813', '5814'].includes(b)) return 'RS';
  if (b === '5411') return 'SP';
  if (b === '7011') return 'HT';
  return 'RE';
}

/** MCC → products_or_services for MSPWare when profile.productDescription is blank. */
export function mccToProductsOrServices(mcc) {
  const raw = String(mcc || '').trim().toUpperCase();
  if (!raw) return 'Retail goods and services';
  if (MCC_PRODUCTS_OR_SERVICES[raw]) return MCC_PRODUCTS_OR_SERVICES[raw];
  const b = mccBase(raw);
  if (MCC_PRODUCTS_OR_SERVICES[b]) return MCC_PRODUCTS_OR_SERVICES[b];
  const opt = MCC_OPTIONS.find((o) => o.value === raw || mccBase(o.value) === b);
  if (opt?.label) return opt.label;
  return 'Retail goods and services';
}
`;

fs.writeFileSync('src/lib/mccCatalog.js', catalogOut);
console.log('wrote src/lib/mccCatalog.js');

// Deno-inlinable snippet for boarding functions (Base44 cannot import shared modules).
const denoSnippet = `// ─── MCC → industry_type + products_or_services (inlined from mccCatalog) ───
// Regenerate via: node scripts/gen-mcc-catalog.mjs
const MCC_PRODUCTS_OR_SERVICES: Record<string, string> = ${JSON.stringify(productsMap, null, 2)};
function mccBaseCode(mcc: string): string {
  return String(mcc || '').trim().replace(/[A-Z]+$/i, '');
}
function mccToIndustryCode(mcc: string): string {
  const b = mccBaseCode(mcc);
  if (['5811', '5812', '5813', '5814'].includes(b)) return 'RS';
  if (b === '5411') return 'SP';
  if (b === '7011') return 'HT';
  return 'RE';
}
function mccToProductsOrServices(mcc: string): string {
  const raw = String(mcc || '').trim().toUpperCase();
  if (!raw) return 'Retail goods and services';
  if (MCC_PRODUCTS_OR_SERVICES[raw]) return MCC_PRODUCTS_OR_SERVICES[raw];
  const b = mccBaseCode(raw);
  if (MCC_PRODUCTS_OR_SERVICES[b]) return MCC_PRODUCTS_OR_SERVICES[b];
  return 'Retail goods and services';
}
function resolveIndustryType(merchantMID: any, mcc: string, pricingCategory: any, mapIndustryTypeFn: (c: any) => string): string {
  return merchantMID.industryType || mccToIndustryCode(mcc) || mapIndustryTypeFn(pricingCategory) || 'RE';
}
function resolveProductsOrServices(profile: any, mcc: string): string {
  const manual = String(profile?.productDescription || '').trim();
  if (manual) return manual;
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
