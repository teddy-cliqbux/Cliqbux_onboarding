# IRS Form W-9 (fw9.pdf) AcroForm field map

Source PDF: `assets/irs/fw9.pdf` (copy of IRS `fw9`, Rev. March 2024).  
Inspector: `node scripts/inspect-w9-fields.mjs` (2026-08-07).  
Page 0 size: **611.976 × 791.968 pt**. pdf-lib strips XFA on load (warning is expected).

## Domain → AcroForm mapping

Keys match `emptyW9Fields()` in `src/lib/w9Model.js`.

| Domain key | AcroForm field | Type | Notes |
|---|---|---|---|
| `name` | `topmostSubform[0].Page1[0].f1_01[0]` | text | Line 1 — Name |
| `businessName` | `topmostSubform[0].Page1[0].f1_02[0]` | text | Line 2 — Business / disregarded entity name |
| `taxClassification` | see checkboxes below | checkbox | Line 3a federal tax classification |
| `llcTaxClass` | `topmostSubform[0].Page1[0].Boxes3a-b_ReadOrder[0].f1_03[0]` | text (max 1) | LLC box only: `C`, `S`, or `P` |
| `otherClassification` | `topmostSubform[0].Page1[0].Boxes3a-b_ReadOrder[0].f1_04[0]` | text | Other box only |
| `exemptPayeeCode` | `topmostSubform[0].Page1[0].f1_05[0]` | text | Line 4 — Exempt payee code |
| `fatcaCode` | `topmostSubform[0].Page1[0].f1_06[0]` | text | Line 4 — FATCA reporting code |
| `address` | `topmostSubform[0].Page1[0].Address_ReadOrder[0].f1_07[0]` | text | Line 5 — Address |
| `city` + `state` + `zip` | `topmostSubform[0].Page1[0].Address_ReadOrder[0].f1_08[0]` | text | Line 6 — combined `"City, ST ZIP"` |
| `tin` (SSN) | `f1_11[0]` + `f1_12[0]` + `f1_13[0]` | text | 3 + 2 + 4 digits |
| `tin` (EIN) | `f1_14[0]` + `f1_15[0]` | text | 2 + 7 digits |
| `signatureName` / PNG | manual overlay | draw | Part II — no AcroForm field (see overlay) |
| `signedAt` | manual overlay | draw | Part II date — no AcroForm field |

Optional fields not mapped to portal model: `f1_09[0]` (account numbers), `f1_10[0]` (requester), `c1_2[0]` (3b foreign partners).

### Line 3a checkboxes (`c1_1[n]`)

Full prefix: `topmostSubform[0].Page1[0].Boxes3a-b_ReadOrder[0].c1_1`

| Index | W-9 label | `taxClassification` |
|---|---|---|
| `[0]` | Individual / sole proprietor | `individual` — also used when `llc` + `llcTaxClass` `D` (disregarded LLC per IRS instructions) |
| `[1]` | C Corporation | `c_corp` |
| `[2]` | S Corporation | `s_corp` |
| `[3]` | Partnership | `partnership` |
| `[4]` | Trust / estate | `trust` |
| `[5]` | Limited liability company | `llc` (when class is C, S, or P) |
| `[6]` | Other | `other` |

## TIN split

Digits only from `tin` (9 digits). `tinType`:

- **`ein`**: `f1_14[0]` = first 2, `f1_15[0]` = last 7
- **`ssn`**: `f1_11[0]` = first 3, `f1_12[0]` = next 2, `f1_13[0]` = last 4

## Signature & date overlays (page 0)

No AcroForm fields exist for Part II signature/date. `fillW9Pdf` draws after field fill, before `form.flatten()`.

Widget probe (`scripts/inspect-w9-widgets.mjs`): lowest form field is EIN row at **y ≈ 348**. Part II “Sign Here” sits below certification text.

| Overlay | x | y | width | height | Content |
|---|---|---|---|---|---|
| Signature image | 130 | 248 | 280 | 36 | PNG bytes (`signaturePngBytes`); if omitted, `signatureName` as 10pt text |
| Date | 468 | 258 | 100 | 14 | `signedAt` formatted `MM/DD/YYYY` (10pt text) |

Coordinates are PDF bottom-left origin (pdf-lib default).

## Flatten

Always call `form.flatten()` before save so Elavon receives a non-editable PDF.

## Raw inspector output (2026-08-07)

```
topmostSubform[0].Page1[0].f1_01[0]	PDFTextField
topmostSubform[0].Page1[0].f1_02[0]	PDFTextField
topmostSubform[0].Page1[0].Boxes3a-b_ReadOrder[0].c1_1[0]	PDFCheckBox
topmostSubform[0].Page1[0].Boxes3a-b_ReadOrder[0].c1_1[1]	PDFCheckBox
topmostSubform[0].Page1[0].Boxes3a-b_ReadOrder[0].c1_1[2]	PDFCheckBox
topmostSubform[0].Page1[0].Boxes3a-b_ReadOrder[0].c1_1[3]	PDFCheckBox
topmostSubform[0].Page1[0].Boxes3a-b_ReadOrder[0].c1_1[4]	PDFCheckBox
topmostSubform[0].Page1[0].Boxes3a-b_ReadOrder[0].c1_1[5]	PDFCheckBox
topmostSubform[0].Page1[0].Boxes3a-b_ReadOrder[0].f1_03[0]	PDFTextField (maxLen=1)
topmostSubform[0].Page1[0].Boxes3a-b_ReadOrder[0].c1_1[6]	PDFCheckBox
topmostSubform[0].Page1[0].Boxes3a-b_ReadOrder[0].f1_04[0]	PDFTextField
topmostSubform[0].Page1[0].Boxes3a-b_ReadOrder[0].c1_2[0]	PDFCheckBox
topmostSubform[0].Page1[0].f1_05[0]	PDFTextField
topmostSubform[0].Page1[0].f1_06[0]	PDFTextField
topmostSubform[0].Page1[0].Address_ReadOrder[0].f1_07[0]	PDFTextField
topmostSubform[0].Page1[0].Address_ReadOrder[0].f1_08[0]	PDFTextField
topmostSubform[0].Page1[0].f1_09[0]	PDFTextField
topmostSubform[0].Page1[0].f1_10[0]	PDFTextField
topmostSubform[0].Page1[0].f1_11[0]	PDFTextField (maxLen=3)
topmostSubform[0].Page1[0].f1_12[0]	PDFTextField (maxLen=2)
topmostSubform[0].Page1[0].f1_13[0]	PDFTextField (maxLen=4)
topmostSubform[0].Page1[0].f1_14[0]	PDFTextField (maxLen=2)
topmostSubform[0].Page1[0].f1_15[0]	PDFTextField (maxLen=7)
```
