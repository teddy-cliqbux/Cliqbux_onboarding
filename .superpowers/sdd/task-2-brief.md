### Task 2: Pin IRS PDF + AcroForm field map + fill helper

**Files:**
- Create: `assets/irs/fw9.pdf` (copy from IRS or Teddy’s `fw9 (1).pdf`)
- Create: `assets/irs/fw9-field-map.md`
- Create: `scripts/inspect-w9-fields.mjs` (one-off: list AcroForm names via `pdf-lib`)
- Create: `src/lib/w9PdfFill.js` (Node-testable fill; Deno function will inline equivalent)
- Create: `src/lib/w9PdfFill.test.js`
- Modify: `package.json` — add `pdf-lib` dependency + `"test:w9": "node --test src/lib/w9*.test.js"`

**Interfaces:**
- Produces: `async fillW9Pdf(pdfBytes: Uint8Array, fields, signaturePngBytes?: Uint8Array): Promise<Uint8Array>`
  - Sets text/checkbox fields per `fw9-field-map.md`
  - Draws signature image on signature line page (coordinates documented in map after inspect)
  - Sets date field
  - `form.flatten()` before save so Elavon gets a non-editable signed PDF

- [ ] **Step 1: Add `pdf-lib`**, copy PDF into `assets/irs/fw9.pdf`, run inspect script, write `fw9-field-map.md` with real field names (do not guess — inspect output is source of truth).

- [ ] **Step 2: Write a test** that loads the pinned PDF, fills sample fields, asserts output bytes longer than input and that re-load has flattened form (0 editable fields or getForm throws / empty).

- [ ] **Step 3: Implement `fillW9Pdf` to pass**

- [ ] **Step 4: Commit**

```bash
git add assets/irs package.json package-lock.json scripts/inspect-w9-fields.mjs src/lib/w9PdfFill.js src/lib/w9PdfFill.test.js
git commit --trailer "Co-authored-by: Cursor <cursoragent@cursor.com>" -m "feat(uw): pin IRS W-9 PDF and pdf-lib fill helper"
```
