# Review package Task 2
Base: 1d75a6e3b10954101f5cb81f4e12140a5399ab0b
Head: 70d31bcbdc5a4ce897e05c173122e2200a6eb1a3
Note: binary PDFs excluded from diff text; confirm they exist via stat.

## Commits
70d31bc feat(uw): pin IRS W-9 PDF and pdf-lib fill helper


## Stat
 assets/irs/fw9-field-map.md   |  93 +++++++++++++++++++
 assets/irs/fw9.pdf            | Bin 0 -> 140815 bytes
 package-lock.json             |  55 ++++++++++++
 package.json                  |   2 +
 public/irs/fw9.pdf            | Bin 0 -> 140815 bytes
 scripts/inspect-w9-fields.mjs |  39 ++++++++
 src/lib/w9PdfFill.js          | 201 ++++++++++++++++++++++++++++++++++++++++++
 src/lib/w9PdfFill.test.js     |  86 ++++++++++++++++++
 8 files changed, 476 insertions(+)


## Diff (excludes PDF binaries)
```diff
diff --git a/assets/irs/fw9-field-map.md b/assets/irs/fw9-field-map.md
new file mode 100644
index 0000000..cc60f99
--- /dev/null
+++ b/assets/irs/fw9-field-map.md
@@ -0,0 +1,93 @@
+# IRS Form W-9 (fw9.pdf) AcroForm field map
+
+Source PDF: `assets/irs/fw9.pdf` (copy of IRS `fw9`, Rev. March 2024).  
+Inspector: `node scripts/inspect-w9-fields.mjs` (2026-08-07).  
+Page 0 size: **611.976 ├ù 791.968 pt**. pdf-lib strips XFA on load (warning is expected).
+
+## Domain ΓåÆ AcroForm mapping
+
+Keys match `emptyW9Fields()` in `src/lib/w9Model.js`.
+
+| Domain key | AcroForm field | Type | Notes |
+|---|---|---|---|
+| `name` | `topmostSubform[0].Page1[0].f1_01[0]` | text | Line 1 ΓÇö Name |
+| `businessName` | `topmostSubform[0].Page1[0].f1_02[0]` | text | Line 2 ΓÇö Business / disregarded entity name |
+| `taxClassification` | see checkboxes below | checkbox | Line 3a federal tax classification |
+| `llcTaxClass` | `topmostSubform[0].Page1[0].Boxes3a-b_ReadOrder[0].f1_03[0]` | text (max 1) | LLC box only: `C`, `S`, or `P` |
+| `otherClassification` | `topmostSubform[0].Page1[0].Boxes3a-b_ReadOrder[0].f1_04[0]` | text | Other box only |
+| `exemptPayeeCode` | `topmostSubform[0].Page1[0].f1_05[0]` | text | Line 4 ΓÇö Exempt payee code |
+| `fatcaCode` | `topmostSubform[0].Page1[0].f1_06[0]` | text | Line 4 ΓÇö FATCA reporting code |
+| `address` | `topmostSubform[0].Page1[0].Address_ReadOrder[0].f1_07[0]` | text | Line 5 ΓÇö Address |
+| `city` + `state` + `zip` | `topmostSubform[0].Page1[0].Address_ReadOrder[0].f1_08[0]` | text | Line 6 ΓÇö combined `"City, ST ZIP"` |
+| `tin` (SSN) | `f1_11[0]` + `f1_12[0]` + `f1_13[0]` | text | 3 + 2 + 4 digits |
+| `tin` (EIN) | `f1_14[0]` + `f1_15[0]` | text | 2 + 7 digits |
+| `signatureName` / PNG | manual overlay | draw | Part II ΓÇö no AcroForm field (see overlay) |
+| `signedAt` | manual overlay | draw | Part II date ΓÇö no AcroForm field |
+
+Optional fields not mapped to portal model: `f1_09[0]` (account numbers), `f1_10[0]` (requester), `c1_2[0]` (3b foreign partners).
+
+### Line 3a checkboxes (`c1_1[n]`)
+
+Full prefix: `topmostSubform[0].Page1[0].Boxes3a-b_ReadOrder[0].c1_1`
+
+| Index | W-9 label | `taxClassification` |
+|---|---|---|
+| `[0]` | Individual / sole proprietor | `individual` ΓÇö also used when `llc` + `llcTaxClass` `D` (disregarded LLC per IRS instructions) |
+| `[1]` | C Corporation | `c_corp` |
+| `[2]` | S Corporation | `s_corp` |
+| `[3]` | Partnership | `partnership` |
+| `[4]` | Trust / estate | `trust` |
+| `[5]` | Limited liability company | `llc` (when class is C, S, or P) |
+| `[6]` | Other | `other` |
+
+## TIN split
+
+Digits only from `tin` (9 digits). `tinType`:
+
+- **`ein`**: `f1_14[0]` = first 2, `f1_15[0]` = last 7
+- **`ssn`**: `f1_11[0]` = first 3, `f1_12[0]` = next 2, `f1_13[0]` = last 4
+
+## Signature & date overlays (page 0)
+
+No AcroForm fields exist for Part II signature/date. `fillW9Pdf` draws after field fill, before `form.flatten()`.
+
+Widget probe (`scripts/inspect-w9-widgets.mjs`): lowest form field is EIN row at **y Γëê 348**. Part II ΓÇ£Sign HereΓÇ¥ sits below certification text.
+
+| Overlay | x | y | width | height | Content |
+|---|---|---|---|---|---|
+| Signature image | 130 | 248 | 280 | 36 | PNG bytes (`signaturePngBytes`); if omitted, `signatureName` as 10pt text |
+| Date | 468 | 258 | 100 | 14 | `signedAt` formatted `MM/DD/YYYY` (10pt text) |
+
+Coordinates are PDF bottom-left origin (pdf-lib default).
+
+## Flatten
+
+Always call `form.flatten()` before save so Elavon receives a non-editable PDF.
+
+## Raw inspector output (2026-08-07)
+
+```
+topmostSubform[0].Page1[0].f1_01[0]	PDFTextField
+topmostSubform[0].Page1[0].f1_02[0]	PDFTextField
+topmostSubform[0].Page1[0].Boxes3a-b_ReadOrder[0].c1_1[0]	PDFCheckBox
+topmostSubform[0].Page1[0].Boxes3a-b_ReadOrder[0].c1_1[1]	PDFCheckBox
+topmostSubform[0].Page1[0].Boxes3a-b_ReadOrder[0].c1_1[2]	PDFCheckBox
+topmostSubform[0].Page1[0].Boxes3a-b_ReadOrder[0].c1_1[3]	PDFCheckBox
+topmostSubform[0].Page1[0].Boxes3a-b_ReadOrder[0].c1_1[4]	PDFCheckBox
+topmostSubform[0].Page1[0].Boxes3a-b_ReadOrder[0].c1_1[5]	PDFCheckBox
+topmostSubform[0].Page1[0].Boxes3a-b_ReadOrder[0].f1_03[0]	PDFTextField (maxLen=1)
+topmostSubform[0].Page1[0].Boxes3a-b_ReadOrder[0].c1_1[6]	PDFCheckBox
+topmostSubform[0].Page1[0].Boxes3a-b_ReadOrder[0].f1_04[0]	PDFTextField
+topmostSubform[0].Page1[0].Boxes3a-b_ReadOrder[0].c1_2[0]	PDFCheckBox
+topmostSubform[0].Page1[0].f1_05[0]	PDFTextField
+topmostSubform[0].Page1[0].f1_06[0]	PDFTextField
+topmostSubform[0].Page1[0].Address_ReadOrder[0].f1_07[0]	PDFTextField
+topmostSubform[0].Page1[0].Address_ReadOrder[0].f1_08[0]	PDFTextField
+topmostSubform[0].Page1[0].f1_09[0]	PDFTextField
+topmostSubform[0].Page1[0].f1_10[0]	PDFTextField
+topmostSubform[0].Page1[0].f1_11[0]	PDFTextField (maxLen=3)
+topmostSubform[0].Page1[0].f1_12[0]	PDFTextField (maxLen=2)
+topmostSubform[0].Page1[0].f1_13[0]	PDFTextField (maxLen=4)
+topmostSubform[0].Page1[0].f1_14[0]	PDFTextField (maxLen=2)
+topmostSubform[0].Page1[0].f1_15[0]	PDFTextField (maxLen=7)
+```
diff --git a/package-lock.json b/package-lock.json
index ba890c9..4e58e5c 100644
--- a/package-lock.json
+++ b/package-lock.json
@@ -56,10 +56,11 @@
         "jspdf": "^4.2.1",
         "lodash": "^4.17.21",
         "lucide-react": "^0.475.0",
         "moment": "^2.30.1",
         "next-themes": "^0.4.4",
+        "pdf-lib": "^1.17.1",
         "react": "^18.2.0",
         "react-day-picker": "^8.10.1",
         "react-dom": "^18.2.0",
         "react-hook-form": "^7.54.2",
         "react-hot-toast": "^2.6.0",
@@ -1214,10 +1215,40 @@
       },
       "engines": {
         "node": ">= 8"
       }
     },
+    "node_modules/@pdf-lib/standard-fonts": {
+      "version": "1.0.0",
+      "resolved": "https://registry.npmjs.org/@pdf-lib/standard-fonts/-/standard-fonts-1.0.0.tgz",
+      "integrity": "sha512-hU30BK9IUN/su0Mn9VdlVKsWBS6GyhVfqjwl1FjZN4TxP6cCw0jP2w7V3Hf5uX7M0AZJ16vey9yE0ny7Sa59ZA==",
+      "license": "MIT",
+      "dependencies": {
+        "pako": "^1.0.6"
+      }
+    },
+    "node_modules/@pdf-lib/standard-fonts/node_modules/pako": {
+      "version": "1.0.11",
+      "resolved": "https://registry.npmjs.org/pako/-/pako-1.0.11.tgz",
+      "integrity": "sha512-4hLB8Py4zZce5s4yd9XzopqwVv/yGNhV1Bl8NTmCq1763HeK2+EwVTv+leGeL13Dnh2wfbqowVPXCIO0z4taYw==",
+      "license": "(MIT AND Zlib)"
+    },
+    "node_modules/@pdf-lib/upng": {
+      "version": "1.0.1",
+      "resolved": "https://registry.npmjs.org/@pdf-lib/upng/-/upng-1.0.1.tgz",
+      "integrity": "sha512-dQK2FUMQtowVP00mtIksrlZhdFXQZPC+taih1q4CvPZ5vqdxR/LKBaFg0oAfzd1GlHZXXSPdQfzQnt+ViGvEIQ==",
+      "license": "MIT",
+      "dependencies": {
+        "pako": "^1.0.10"
+      }
+    },
+    "node_modules/@pdf-lib/upng/node_modules/pako": {
+      "version": "1.0.11",
+      "resolved": "https://registry.npmjs.org/pako/-/pako-1.0.11.tgz",
+      "integrity": "sha512-4hLB8Py4zZce5s4yd9XzopqwVv/yGNhV1Bl8NTmCq1763HeK2+EwVTv+leGeL13Dnh2wfbqowVPXCIO0z4taYw==",
+      "license": "(MIT AND Zlib)"
+    },
     "node_modules/@playwright/test": {
       "version": "1.61.1",
       "resolved": "https://registry.npmjs.org/@playwright/test/-/test-1.61.1.tgz",
       "integrity": "sha512-8nKv6+0RJSL9FE4jYOEGXnPeM/Hg12qZpmqzZjRh3qM0Y7c3z1mrOTfFLids72RDQYVh9WpLEfR5WdpNX4fkig==",
       "dev": true,
@@ -7944,10 +7975,34 @@
       "version": "1.0.7",
       "resolved": "https://registry.npmjs.org/path-parse/-/path-parse-1.0.7.tgz",
       "integrity": "sha512-LDJzPVEEEPR+y48z93A0Ed0yXb8pAByGWo/k5YYdYgpY2/2EsOsksJrq7lOHxryrVOn1ejG6oAp8ahvOIQD8sw==",
       "license": "MIT"
     },
+    "node_modules/pdf-lib": {
+      "version": "1.17.1",
+      "resolved": "https://registry.npmjs.org/pdf-lib/-/pdf-lib-1.17.1.tgz",
+      "integrity": "sha512-V/mpyJAoTsN4cnP31vc0wfNA1+p20evqqnap0KLoRUN0Yk/p3wN52DOEsL4oBFcLdb76hlpKPtzJIgo67j/XLw==",
+      "license": "MIT",
+      "dependencies": {
+        "@pdf-lib/standard-fonts": "^1.0.0",
+        "@pdf-lib/upng": "^1.0.1",
+        "pako": "^1.0.11",
+        "tslib": "^1.11.1"
+      }
+    },
+    "node_modules/pdf-lib/node_modules/pako": {
+      "version": "1.0.11",
+      "resolved": "https://registry.npmjs.org/pako/-/pako-1.0.11.tgz",
+      "integrity": "sha512-4hLB8Py4zZce5s4yd9XzopqwVv/yGNhV1Bl8NTmCq1763HeK2+EwVTv+leGeL13Dnh2wfbqowVPXCIO0z4taYw==",
+      "license": "(MIT AND Zlib)"
+    },
+    "node_modules/pdf-lib/node_modules/tslib": {
+      "version": "1.14.1",
+      "resolved": "https://registry.npmjs.org/tslib/-/tslib-1.14.1.tgz",
+      "integrity": "sha512-Xni35NKzjgMrwevysHTCArtLDpPvye8zV/0E4EyYn43P7/7qvQwPh9BGkHewbMulVntbigmcT7rdX3BNo9wRJg==",
+      "license": "0BSD"
+    },
     "node_modules/performance-now": {
       "version": "2.1.0",
       "resolved": "https://registry.npmjs.org/performance-now/-/performance-now-2.1.0.tgz",
       "integrity": "sha512-7EAHlyLHI56VEIdK57uwHdHKIaAGbnXPiw0yWbarQZOKaKpvUIgW0jWRVLiatnM+XXlSwsanIBH/hzGMJulMow==",
       "license": "MIT",
diff --git a/package.json b/package.json
index 6ba829c..00c67c9 100644
--- a/package.json
+++ b/package.json
@@ -16,10 +16,11 @@
     "test:website": "node --test src/lib/businessWebsite.test.js",
     "test:ops-events": "node --test src/lib/operationalEvents.test.js",
     "test:merchant-account": "node --test src/lib/merchantAccountStatus.test.js",
     "test:feedback-shot": "node --test src/lib/feedbackScreenshot.test.js",
     "test:signing-layout": "node --test src/lib/signingFrameLayout.test.js",
+    "test:w9": "node --test src/lib/w9*.test.js",
     "test:signing-mobile": "playwright test --config=playwright.config.ts --project=signing-mobile",
     "test:stress": "playwright test --config=playwright.config.ts",
     "test:stress:report": "playwright test --config=playwright.config.ts && echo Report: stress-test-report.md"
   },
   "dependencies": {
@@ -71,10 +72,11 @@
     "jspdf": "^4.2.1",
     "lodash": "^4.17.21",
     "lucide-react": "^0.475.0",
     "moment": "^2.30.1",
     "next-themes": "^0.4.4",
+    "pdf-lib": "^1.17.1",
     "react": "^18.2.0",
     "react-day-picker": "^8.10.1",
     "react-dom": "^18.2.0",
     "react-hook-form": "^7.54.2",
     "react-hot-toast": "^2.6.0",
diff --git a/scripts/inspect-w9-fields.mjs b/scripts/inspect-w9-fields.mjs
new file mode 100644
index 0000000..58954cd
--- /dev/null
+++ b/scripts/inspect-w9-fields.mjs
@@ -0,0 +1,39 @@
+/**
+ * One-off inspector: list AcroForm field names in the pinned IRS W-9 PDF.
+ * Run: node scripts/inspect-w9-fields.mjs
+ */
+import { readFileSync } from 'node:fs';
+import { fileURLToPath } from 'node:url';
+import { dirname, join } from 'node:path';
+import { PDFDocument } from 'pdf-lib';
+
+const __dirname = dirname(fileURLToPath(import.meta.url));
+const pdfPath = join(__dirname, '..', 'assets', 'irs', 'fw9.pdf');
+
+const bytes = readFileSync(pdfPath);
+const doc = await PDFDocument.load(bytes);
+const form = doc.getForm();
+
+console.log(`PDF: ${pdfPath}`);
+console.log(`Pages: ${doc.getPageCount()}`);
+console.log(`Fields: ${form.getFields().length}\n`);
+
+for (const field of form.getFields()) {
+  const name = field.getName();
+  const ctor = field.constructor.name;
+  let detail = '';
+
+  if (ctor === 'PDFTextField') {
+    detail = `text maxLen=${field.getMaxLength?.() ?? 'n/a'}`;
+  } else if (ctor === 'PDFCheckBox') {
+    detail = 'checkbox';
+  } else if (ctor === 'PDFRadioGroup') {
+    const opts = field.getOptions?.() ?? [];
+    detail = `radio options=[${opts.join(', ')}]`;
+  } else if (ctor === 'PDFDropdown') {
+    const opts = field.getOptions?.() ?? [];
+    detail = `dropdown options=[${opts.join(', ')}]`;
+  }
+
+  console.log(`${name}\t${ctor}\t${detail}`);
+}
diff --git a/src/lib/w9PdfFill.js b/src/lib/w9PdfFill.js
new file mode 100644
index 0000000..4fe73ab
--- /dev/null
+++ b/src/lib/w9PdfFill.js
@@ -0,0 +1,201 @@
+/**
+ * Fill pinned IRS W-9 PDF (assets/irs/fw9.pdf) from canonical W-9 fields.
+ * Field names documented in assets/irs/fw9-field-map.md (from inspect-w9-fields.mjs).
+ */
+import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
+
+const P = 'topmostSubform[0].Page1[0]';
+const BOXES = `${P}.Boxes3a-b_ReadOrder[0]`;
+
+/** AcroForm field names ΓÇö keep in sync with assets/irs/fw9-field-map.md */
+export const W9_ACROFORM = {
+  name: `${P}.f1_01[0]`,
+  businessName: `${P}.f1_02[0]`,
+  taxCheckboxes: [
+    `${BOXES}.c1_1[0]`,
+    `${BOXES}.c1_1[1]`,
+    `${BOXES}.c1_1[2]`,
+    `${BOXES}.c1_1[3]`,
+    `${BOXES}.c1_1[4]`,
+    `${BOXES}.c1_1[5]`,
+    `${BOXES}.c1_1[6]`,
+  ],
+  llcTaxClass: `${BOXES}.f1_03[0]`,
+  otherClassification: `${BOXES}.f1_04[0]`,
+  exemptPayeeCode: `${P}.f1_05[0]`,
+  fatcaCode: `${P}.f1_06[0]`,
+  address: `${P}.Address_ReadOrder[0].f1_07[0]`,
+  cityStateZip: `${P}.Address_ReadOrder[0].f1_08[0]`,
+  ssn1: `${P}.f1_11[0]`,
+  ssn2: `${P}.f1_12[0]`,
+  ssn3: `${P}.f1_13[0]`,
+  ein1: `${P}.f1_14[0]`,
+  ein2: `${P}.f1_15[0]`,
+};
+
+/** Manual overlays ΓÇö page 0, PDF coords (bottom-left origin) */
+export const W9_SIGNATURE_OVERLAY = { pageIndex: 0, x: 130, y: 248, width: 280, height: 36 };
+export const W9_DATE_OVERLAY = { pageIndex: 0, x: 468, y: 258, fontSize: 10 };
+
+const TAX_CLASS_TO_CHECKBOX = {
+  individual: 0,
+  c_corp: 1,
+  s_corp: 2,
+  partnership: 3,
+  trust: 4,
+  llc: 5,
+  other: 6,
+};
+
+function setText(form, fieldName, value) {
+  const text = String(value ?? '').trim();
+  if (!text) return;
+  form.getTextField(fieldName).setText(text);
+}
+
+function splitTin(tin) {
+  const digits = String(tin ?? '').replace(/\D/g, '').slice(0, 9);
+  return digits.length === 9 ? digits : '';
+}
+
+function formatCityStateZip(city, state, zip) {
+  const c = String(city ?? '').trim();
+  const s = String(state ?? '').trim().toUpperCase();
+  const z = String(zip ?? '').trim();
+  if (!c && !s && !z) return '';
+  const parts = [c, [s, z].filter(Boolean).join(' ')].filter(Boolean);
+  return parts.join(', ');
+}
+
+function formatSignedDate(signedAt) {
+  const raw = String(signedAt ?? '').trim();
+  if (!raw) return '';
+
+  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
+  if (iso) return `${iso[2]}/${iso[3]}/${iso[1]}`;
+
+  const slash = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
+  if (slash) {
+    const mm = slash[1].padStart(2, '0');
+    const dd = slash[2].padStart(2, '0');
+    return `${mm}/${dd}/${slash[3]}`;
+  }
+
+  return raw;
+}
+
+/**
+ * Resolve which Line 3a checkbox to check.
+ * Disregarded LLC (class D) ΓåÆ Individual per IRS W-9 instructions.
+ */
+function resolveTaxCheckbox(fields) {
+  const tax = String(fields.taxClassification ?? '').trim().toLowerCase();
+  if (tax === 'llc' && String(fields.llcTaxClass ?? '').toUpperCase() === 'D') {
+    return { checkboxIndex: 0, llcLetter: '', useOther: false };
+  }
+  if (tax === 'llc') {
+    const letter = String(fields.llcTaxClass ?? '').toUpperCase().slice(0, 1);
+    return { checkboxIndex: 5, llcLetter: letter === 'C' || letter === 'S' || letter === 'P' ? letter : '', useOther: false };
+  }
+  if (tax === 'other') {
+    return { checkboxIndex: 6, llcLetter: '', useOther: true };
+  }
+  const idx = TAX_CLASS_TO_CHECKBOX[tax];
+  if (idx == null) return { checkboxIndex: -1, llcLetter: '', useOther: false };
+  return { checkboxIndex: idx, llcLetter: '', useOther: false };
+}
+
+function applyTaxClassification(form, fields) {
+  const { checkboxIndex, llcLetter, useOther } = resolveTaxCheckbox(fields);
+  if (checkboxIndex < 0) return;
+
+  form.getCheckBox(W9_ACROFORM.taxCheckboxes[checkboxIndex]).check();
+
+  if (llcLetter) {
+    setText(form, W9_ACROFORM.llcTaxClass, llcLetter);
+  }
+  if (useOther) {
+    setText(form, W9_ACROFORM.otherClassification, fields.otherClassification);
+  }
+}
+
+function applyTin(form, fields) {
+  const digits = splitTin(fields.tin);
+  if (!digits) return;
+
+  const tinType = String(fields.tinType ?? 'ein').toLowerCase();
+  if (tinType === 'ssn') {
+    setText(form, W9_ACROFORM.ssn1, digits.slice(0, 3));
+    setText(form, W9_ACROFORM.ssn2, digits.slice(3, 5));
+    setText(form, W9_ACROFORM.ssn3, digits.slice(5, 9));
+  } else {
+    setText(form, W9_ACROFORM.ein1, digits.slice(0, 2));
+    setText(form, W9_ACROFORM.ein2, digits.slice(2, 9));
+  }
+}
+
+async function drawSignatureAndDate(doc, fields, signaturePngBytes) {
+  const page = doc.getPage(W9_SIGNATURE_OVERLAY.pageIndex);
+  const { x, y, width, height } = W9_SIGNATURE_OVERLAY;
+
+  if (signaturePngBytes?.length) {
+    const png = await doc.embedPng(signaturePngBytes);
+    const scale = Math.min(width / png.width, height / png.height);
+    const drawWidth = png.width * scale;
+    const drawHeight = png.height * scale;
+    page.drawImage(png, {
+      x,
+      y: y + (height - drawHeight) / 2,
+      width: drawWidth,
+      height: drawHeight,
+    });
+  } else if (String(fields.signatureName ?? '').trim()) {
+    const font = await doc.embedFont(StandardFonts.Helvetica);
+    page.drawText(String(fields.signatureName).trim(), {
+      x,
+      y: y + 10,
+      size: 10,
+      font,
+      color: rgb(0, 0, 0),
+    });
+  }
+
+  const dateText = formatSignedDate(fields.signedAt);
+  if (dateText) {
+    const font = await doc.embedFont(StandardFonts.Helvetica);
+    page.drawText(dateText, {
+      x: W9_DATE_OVERLAY.x,
+      y: W9_DATE_OVERLAY.y,
+      size: W9_DATE_OVERLAY.fontSize,
+      font,
+      color: rgb(0, 0, 0),
+    });
+  }
+}
+
+/**
+ * @param {Uint8Array} pdfBytes - pinned fw9.pdf bytes
+ * @param {import('./w9Model.js').emptyW9Fields extends () => infer R ? R : Record<string, string>} fields
+ * @param {Uint8Array} [signaturePngBytes]
+ * @returns {Promise<Uint8Array>}
+ */
+export async function fillW9Pdf(pdfBytes, fields, signaturePngBytes) {
+  const doc = await PDFDocument.load(pdfBytes);
+  const form = doc.getForm();
+
+  setText(form, W9_ACROFORM.name, fields.name);
+  setText(form, W9_ACROFORM.businessName, fields.businessName);
+  applyTaxClassification(form, fields);
+  setText(form, W9_ACROFORM.exemptPayeeCode, fields.exemptPayeeCode);
+  setText(form, W9_ACROFORM.fatcaCode, fields.fatcaCode);
+  setText(form, W9_ACROFORM.address, fields.address);
+  setText(form, W9_ACROFORM.cityStateZip, formatCityStateZip(fields.city, fields.state, fields.zip));
+  applyTin(form, fields);
+
+  await drawSignatureAndDate(doc, fields, signaturePngBytes);
+
+  form.flatten();
+  return doc.save();
+}
+
+export { formatCityStateZip, formatSignedDate, splitTin, resolveTaxCheckbox };
diff --git a/src/lib/w9PdfFill.test.js b/src/lib/w9PdfFill.test.js
new file mode 100644
index 0000000..d137042
--- /dev/null
+++ b/src/lib/w9PdfFill.test.js
@@ -0,0 +1,86 @@
+/**
+ * W-9 PDF fill helper tests.
+ * Run: npm run test:w9
+ */
+import { describe, it } from 'node:test';
+import assert from 'node:assert/strict';
+import { readFileSync } from 'node:fs';
+import { fileURLToPath } from 'node:url';
+import { dirname, join } from 'node:path';
+import { PDFDocument } from 'pdf-lib';
+import { fillW9Pdf, formatCityStateZip, resolveTaxCheckbox } from './w9PdfFill.js';
+import { emptyW9Fields } from './w9Model.js';
+
+const __dirname = dirname(fileURLToPath(import.meta.url));
+const pdfPath = join(__dirname, '..', '..', 'assets', 'irs', 'fw9.pdf');
+
+function sampleFields(overrides = {}) {
+  return {
+    ...emptyW9Fields(),
+    name: 'Acme Holdings LLC',
+    businessName: 'Acme Coffee',
+    taxClassification: 'llc',
+    llcTaxClass: 'C',
+    address: '123 Market St',
+    city: 'San Francisco',
+    state: 'CA',
+    zip: '94103',
+    tinType: 'ein',
+    tin: '12-3456789',
+    signatureName: 'Jane Doe',
+    signedAt: '2026-08-07',
+    ...overrides,
+  };
+}
+
+describe('formatCityStateZip', () => {
+  it('combines city, state, zip', () => {
+    assert.equal(formatCityStateZip('SF', 'ca', '94103'), 'SF, CA 94103');
+  });
+});
+
+describe('resolveTaxCheckbox', () => {
+  it('maps disregarded LLC to individual checkbox', () => {
+    assert.deepEqual(resolveTaxCheckbox({ taxClassification: 'llc', llcTaxClass: 'D' }), {
+      checkboxIndex: 0,
+      llcLetter: '',
+      useOther: false,
+    });
+  });
+
+  it('maps LLC corporation to LLC box with C letter', () => {
+    assert.deepEqual(resolveTaxCheckbox({ taxClassification: 'llc', llcTaxClass: 'C' }), {
+      checkboxIndex: 5,
+      llcLetter: 'C',
+      useOther: false,
+    });
+  });
+});
+
+describe('fillW9Pdf', () => {
+  it('fills sample fields, grows output, and flattens the form', async () => {
+    const inputBytes = readFileSync(pdfPath);
+    const filled = await fillW9Pdf(inputBytes, sampleFields());
+
+    assert.ok(filled.length > inputBytes.length, 'filled PDF should be larger than template');
+
+    const doc = await PDFDocument.load(filled);
+    const form = doc.getForm();
+    assert.equal(form.getFields().length, 0, 'flattened PDF should have no editable fields');
+  });
+
+  it('accepts optional signature PNG bytes', async () => {
+    // Minimal valid 1├ù1 PNG
+    const png = Uint8Array.from([
+      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
+      0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
+      0x89, 0x00, 0x00, 0x00, 0x0a, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
+      0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae,
+      0x42, 0x60, 0x82,
+    ]);
+
+    const inputBytes = readFileSync(pdfPath);
+    const filled = await fillW9Pdf(inputBytes, sampleFields(), png);
+    assert.ok(filled.length > inputBytes.length);
+  });
+});

```
