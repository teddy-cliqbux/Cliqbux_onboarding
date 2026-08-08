/**
 * W-9 PDF fill helper tests.
 * Run: npm run test:w9
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { PDFDocument } from 'pdf-lib';
import { fillW9Pdf, formatCityStateZip, resolveTaxCheckbox } from './w9PdfFill.js';
import { emptyW9Fields } from './w9Model.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pdfPath = join(__dirname, '..', '..', 'assets', 'irs', 'fw9.pdf');

function sampleFields(overrides = {}) {
  return {
    ...emptyW9Fields(),
    name: 'Acme Holdings LLC',
    businessName: 'Acme Coffee',
    taxClassification: 'llc',
    llcTaxClass: 'C',
    address: '123 Market St',
    city: 'San Francisco',
    state: 'CA',
    zip: '94103',
    tinType: 'ein',
    tin: '12-3456789',
    signatureName: 'Jane Doe',
    signedAt: '2026-08-07',
    ...overrides,
  };
}

describe('formatCityStateZip', () => {
  it('combines city, state, zip', () => {
    assert.equal(formatCityStateZip('SF', 'ca', '94103'), 'SF, CA 94103');
  });
});

describe('resolveTaxCheckbox', () => {
  it('maps disregarded LLC to individual checkbox', () => {
    assert.deepEqual(resolveTaxCheckbox({ taxClassification: 'llc', llcTaxClass: 'D' }), {
      checkboxIndex: 0,
      llcLetter: '',
      useOther: false,
    });
  });

  it('maps LLC corporation to LLC box with C letter', () => {
    assert.deepEqual(resolveTaxCheckbox({ taxClassification: 'llc', llcTaxClass: 'C' }), {
      checkboxIndex: 5,
      llcLetter: 'C',
      useOther: false,
    });
  });
});

describe('fillW9Pdf', () => {
  it('fills sample fields, grows output, and flattens the form', async () => {
    const inputBytes = readFileSync(pdfPath);
    const filled = await fillW9Pdf(inputBytes, sampleFields());

    assert.ok(filled.length > inputBytes.length, 'filled PDF should be larger than template');

    const doc = await PDFDocument.load(filled);
    const form = doc.getForm();
    assert.equal(form.getFields().length, 0, 'flattened PDF should have no editable fields');
  });

  it('accepts optional signature PNG bytes', async () => {
    // Minimal valid 1×1 PNG
    const png = Uint8Array.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
      0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
      0x89, 0x00, 0x00, 0x00, 0x0a, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
      0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae,
      0x42, 0x60, 0x82,
    ]);

    const inputBytes = readFileSync(pdfPath);
    const filled = await fillW9Pdf(inputBytes, sampleFields(), png);
    assert.ok(filled.length > inputBytes.length);
  });
});
