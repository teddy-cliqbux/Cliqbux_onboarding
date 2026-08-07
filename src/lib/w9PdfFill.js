/**
 * Fill pinned IRS W-9 PDF (assets/irs/fw9.pdf) from canonical W-9 fields.
 * Field names documented in assets/irs/fw9-field-map.md (from inspect-w9-fields.mjs).
 */
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

const P = 'topmostSubform[0].Page1[0]';
const BOXES = `${P}.Boxes3a-b_ReadOrder[0]`;

/** AcroForm field names — keep in sync with assets/irs/fw9-field-map.md */
export const W9_ACROFORM = {
  name: `${P}.f1_01[0]`,
  businessName: `${P}.f1_02[0]`,
  taxCheckboxes: [
    `${BOXES}.c1_1[0]`,
    `${BOXES}.c1_1[1]`,
    `${BOXES}.c1_1[2]`,
    `${BOXES}.c1_1[3]`,
    `${BOXES}.c1_1[4]`,
    `${BOXES}.c1_1[5]`,
    `${BOXES}.c1_1[6]`,
  ],
  llcTaxClass: `${BOXES}.f1_03[0]`,
  otherClassification: `${BOXES}.f1_04[0]`,
  exemptPayeeCode: `${P}.f1_05[0]`,
  fatcaCode: `${P}.f1_06[0]`,
  address: `${P}.Address_ReadOrder[0].f1_07[0]`,
  cityStateZip: `${P}.Address_ReadOrder[0].f1_08[0]`,
  ssn1: `${P}.f1_11[0]`,
  ssn2: `${P}.f1_12[0]`,
  ssn3: `${P}.f1_13[0]`,
  ein1: `${P}.f1_14[0]`,
  ein2: `${P}.f1_15[0]`,
};

/** Manual overlays — page 0, PDF coords (bottom-left origin) */
export const W9_SIGNATURE_OVERLAY = { pageIndex: 0, x: 130, y: 248, width: 280, height: 36 };
export const W9_DATE_OVERLAY = { pageIndex: 0, x: 468, y: 258, fontSize: 10 };

const TAX_CLASS_TO_CHECKBOX = {
  individual: 0,
  c_corp: 1,
  s_corp: 2,
  partnership: 3,
  trust: 4,
  llc: 5,
  other: 6,
};

function setText(form, fieldName, value) {
  const text = String(value ?? '').trim();
  if (!text) return;
  form.getTextField(fieldName).setText(text);
}

function splitTin(tin) {
  const digits = String(tin ?? '').replace(/\D/g, '').slice(0, 9);
  return digits.length === 9 ? digits : '';
}

function formatCityStateZip(city, state, zip) {
  const c = String(city ?? '').trim();
  const s = String(state ?? '').trim().toUpperCase();
  const z = String(zip ?? '').trim();
  if (!c && !s && !z) return '';
  const parts = [c, [s, z].filter(Boolean).join(' ')].filter(Boolean);
  return parts.join(', ');
}

function formatSignedDate(signedAt) {
  const raw = String(signedAt ?? '').trim();
  if (!raw) return '';

  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[2]}/${iso[3]}/${iso[1]}`;

  const slash = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (slash) {
    const mm = slash[1].padStart(2, '0');
    const dd = slash[2].padStart(2, '0');
    return `${mm}/${dd}/${slash[3]}`;
  }

  return raw;
}

/**
 * Resolve which Line 3a checkbox to check.
 * Disregarded LLC (class D) → Individual per IRS W-9 instructions.
 */
function resolveTaxCheckbox(fields) {
  const tax = String(fields.taxClassification ?? '').trim().toLowerCase();
  if (tax === 'llc' && String(fields.llcTaxClass ?? '').toUpperCase() === 'D') {
    return { checkboxIndex: 0, llcLetter: '', useOther: false };
  }
  if (tax === 'llc') {
    const letter = String(fields.llcTaxClass ?? '').toUpperCase().slice(0, 1);
    return { checkboxIndex: 5, llcLetter: letter === 'C' || letter === 'S' || letter === 'P' ? letter : '', useOther: false };
  }
  if (tax === 'other') {
    return { checkboxIndex: 6, llcLetter: '', useOther: true };
  }
  const idx = TAX_CLASS_TO_CHECKBOX[tax];
  if (idx == null) return { checkboxIndex: -1, llcLetter: '', useOther: false };
  return { checkboxIndex: idx, llcLetter: '', useOther: false };
}

function applyTaxClassification(form, fields) {
  const { checkboxIndex, llcLetter, useOther } = resolveTaxCheckbox(fields);
  if (checkboxIndex < 0) return;

  form.getCheckBox(W9_ACROFORM.taxCheckboxes[checkboxIndex]).check();

  if (llcLetter) {
    setText(form, W9_ACROFORM.llcTaxClass, llcLetter);
  }
  if (useOther) {
    setText(form, W9_ACROFORM.otherClassification, fields.otherClassification);
  }
}

function applyTin(form, fields) {
  const digits = splitTin(fields.tin);
  if (!digits) return;

  const tinType = String(fields.tinType ?? 'ein').toLowerCase();
  if (tinType === 'ssn') {
    setText(form, W9_ACROFORM.ssn1, digits.slice(0, 3));
    setText(form, W9_ACROFORM.ssn2, digits.slice(3, 5));
    setText(form, W9_ACROFORM.ssn3, digits.slice(5, 9));
  } else {
    setText(form, W9_ACROFORM.ein1, digits.slice(0, 2));
    setText(form, W9_ACROFORM.ein2, digits.slice(2, 9));
  }
}

async function drawSignatureAndDate(doc, fields, signaturePngBytes) {
  const page = doc.getPage(W9_SIGNATURE_OVERLAY.pageIndex);
  const { x, y, width, height } = W9_SIGNATURE_OVERLAY;

  if (signaturePngBytes?.length) {
    const png = await doc.embedPng(signaturePngBytes);
    const scale = Math.min(width / png.width, height / png.height);
    const drawWidth = png.width * scale;
    const drawHeight = png.height * scale;
    page.drawImage(png, {
      x,
      y: y + (height - drawHeight) / 2,
      width: drawWidth,
      height: drawHeight,
    });
  } else if (String(fields.signatureName ?? '').trim()) {
    const font = await doc.embedFont(StandardFonts.Helvetica);
    page.drawText(String(fields.signatureName).trim(), {
      x,
      y: y + 10,
      size: 10,
      font,
      color: rgb(0, 0, 0),
    });
  }

  const dateText = formatSignedDate(fields.signedAt);
  if (dateText) {
    const font = await doc.embedFont(StandardFonts.Helvetica);
    page.drawText(dateText, {
      x: W9_DATE_OVERLAY.x,
      y: W9_DATE_OVERLAY.y,
      size: W9_DATE_OVERLAY.fontSize,
      font,
      color: rgb(0, 0, 0),
    });
  }
}

/**
 * @param {Uint8Array} pdfBytes - pinned fw9.pdf bytes
 * @param {import('./w9Model.js').emptyW9Fields extends () => infer R ? R : Record<string, string>} fields
 * @param {Uint8Array} [signaturePngBytes]
 * @returns {Promise<Uint8Array>}
 */
export async function fillW9Pdf(pdfBytes, fields, signaturePngBytes) {
  const doc = await PDFDocument.load(pdfBytes);
  const form = doc.getForm();

  setText(form, W9_ACROFORM.name, fields.name);
  setText(form, W9_ACROFORM.businessName, fields.businessName);
  applyTaxClassification(form, fields);
  setText(form, W9_ACROFORM.exemptPayeeCode, fields.exemptPayeeCode);
  setText(form, W9_ACROFORM.fatcaCode, fields.fatcaCode);
  setText(form, W9_ACROFORM.address, fields.address);
  setText(form, W9_ACROFORM.cityStateZip, formatCityStateZip(fields.city, fields.state, fields.zip));
  applyTin(form, fields);

  await drawSignatureAndDate(doc, fields, signaturePngBytes);

  form.flatten();
  return doc.save();
}

export { formatCityStateZip, formatSignedDate, splitTin, resolveTaxCheckbox };
