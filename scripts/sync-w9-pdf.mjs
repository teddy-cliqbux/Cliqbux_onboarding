/**
 * Copy canonical W-9 PDF from assets/ to public/ for static serving.
 * Run: node scripts/sync-w9-pdf.mjs
 */
import { copyFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'assets', 'irs', 'fw9.pdf');
const dest = join(root, 'public', 'irs', 'fw9.pdf');

copyFileSync(src, dest);
console.log(`Copied ${src} → ${dest}`);
