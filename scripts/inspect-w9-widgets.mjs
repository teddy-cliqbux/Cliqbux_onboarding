/**
 * Dump AcroForm widget rectangles (page index + PDF coords) for overlay placement.
 * Run: node scripts/inspect-w9-widgets.mjs
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
const pages = doc.getPages();

console.log(`PDF: ${pdfPath}`);
console.log(`Page 0 size: ${pages[0].getWidth()} × ${pages[0].getHeight()} pt\n`);
console.log('field\tpage\tx\ty\twidth\theight');

const rows = [];

for (const field of form.getFields()) {
  const widgets = field.acroField.getWidgets?.() ?? [];
  for (const widget of widgets) {
    const rect = widget.getRectangle?.();
    if (!rect) continue;
    const pageRef = widget.P?.();
    const pageIndex = pageRef ? pages.findIndex((p) => p.ref === pageRef) : -1;
    rows.push({
      name: field.getName(),
      pageIndex,
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
    });
  }
}

rows.sort((a, b) => a.y - b.y || a.x - b.x);

for (const r of rows) {
  console.log(
    `${r.name}\t${r.pageIndex}\t${r.x.toFixed(1)}\t${r.y.toFixed(1)}\t${r.width.toFixed(1)}\t${r.height.toFixed(1)}`,
  );
}

if (rows.length) {
  const lowest = rows.reduce((min, r) => (r.y < min.y ? r : min), rows[0]);
  console.log(`\nLowest widget (min y): ${lowest.name} at y=${lowest.y.toFixed(1)}`);
}
