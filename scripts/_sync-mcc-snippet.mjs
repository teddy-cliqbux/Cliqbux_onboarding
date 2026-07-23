import fs from 'fs';

const snippet = fs.readFileSync('scripts/_mcc-deno-snippet.txt', 'utf8').trim();
const files = [
  'base44/functions/submitToMSP/entry.ts',
  'base44/functions/signApplication/entry.ts',
  'base44/functions/refillMSPForms/entry.ts',
];
const re =
  /\/\/ ─── MCC → industry_type \+ products_or_services \(inlined from mccCatalog\) ───[\s\S]*?function resolveProductsOrServices\([\s\S]*?\n\}/;

for (const f of files) {
  let t = fs.readFileSync(f, 'utf8');
  if (!re.test(t)) {
    console.log('NO MATCH', f);
    continue;
  }
  t = t.replace(re, snippet);
  fs.writeFileSync(f, t);
  console.log('updated', f);
}
