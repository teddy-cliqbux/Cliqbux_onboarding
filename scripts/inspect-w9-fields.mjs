/**
 * One-off inspector: list AcroForm field names in the pinned IRS W-9 PDF.
 * Run: node scripts/inspect-w9-fields.mjs
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { PDFDocument } from 'pdf-lib';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pdfPath = join(__dirname, '..', 'assets', 'irs', 'fw9.pdf');

const bytes = readFileSync(pdfPath);
const doc = await PDFDocument.load(bytes);
const form = doc.getForm();

console.log(`PDF: ${pdfPath}`);
console.log(`Pages: ${doc.getPageCount()}`);
console.log(`Fields: ${form.getFields().length}\n`);

for (const field of form.getFields()) {
  const name = field.getName();
  const ctor = field.constructor.name;
  let detail = '';

  if (ctor === 'PDFTextField') {
    detail = `text maxLen=${field.getMaxLength?.() ?? 'n/a'}`;
  } else if (ctor === 'PDFCheckBox') {
    detail = 'checkbox';
  } else if (ctor === 'PDFRadioGroup') {
    const opts = field.getOptions?.() ?? [];
    detail = `radio options=[${opts.join(', ')}]`;
  } else if (ctor === 'PDFDropdown') {
    const opts = field.getOptions?.() ?? [];
    detail = `dropdown options=[${opts.join(', ')}]`;
  }

  console.log(`${name}\t${ctor}\t${detail}`);
}
