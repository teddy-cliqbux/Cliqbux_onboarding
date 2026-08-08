# Task 2 Report: Pin IRS PDF + AcroForm field map + fill helper

**Status:** DONE  
**Branch:** `feature/underwriting-w9-request`  
**Date:** 2026-08-07

## Deliverables

| Artifact | Path |
|---|---|
| Pinned PDF (source of truth) | `assets/irs/fw9.pdf` |
| Public static copy | `public/irs/fw9.pdf` |
| Field map (inspector output) | `assets/irs/fw9-field-map.md` |
| Inspector script | `scripts/inspect-w9-fields.mjs` |
| Fill helper | `src/lib/w9PdfFill.js` |
| Tests | `src/lib/w9PdfFill.test.js` |
| Dependency | `pdf-lib` in `package.json` |
| Test script | `npm run test:w9` |

## Inspector findings

- **23 AcroForm fields** on page 0 (6-page PDF; only page 1 is fillable).
- pdf-lib emits `Removing XFA form data` — expected; AcroForm names are authoritative.
- **No AcroForm fields** for Part II signature or date — handled via manual page overlays documented in `fw9-field-map.md`.

## `fillW9Pdf` behavior

1. Loads PDF bytes, sets text/checkbox fields per map.
2. Maps `taxClassification` / `llcTaxClass` to Line 3a checkboxes; disregarded LLC (`D`) → Individual checkbox per IRS instructions.
3. Splits TIN into SSN (3+2+4) or EIN (2+7) boxes by `tinType`.
4. Draws signature PNG (or `signatureName` text fallback) and `signedAt` date on page 0.
5. Calls `form.flatten()` before save.

## Tests

```
npm run test:w9
```

Result: **20/20 pass** (includes Task 1 `w9Model` / `w9Prefill` suites matched by `w9*.test.js` glob).

Key assertions:
- Filled output byte length > template.
- Reloaded PDF has **0 editable fields** after flatten.
- Minimal PNG signature embed succeeds.

## Commit

```
feat(uw): pin IRS W-9 PDF and pdf-lib fill helper
```

Files staged per brief + `public/irs/fw9.pdf`.

## Concerns / follow-ups

1. **Signature/date coordinates** are manual overlays (no AcroForm widgets). Visual QA on a filled sample PDF recommended before Elavon submission.
2. **XFA strip** — pdf-lib drops XFA layer on load; AcroForm fill path verified by tests but not visually proofed.
3. **Disregarded LLC (`D`)** maps to Individual checkbox at fill time; portal model still stores `llc` + `D` — intentional per IRS W-9 instructions.
4. Deno boarding function (Task 3+) must **inline** equivalent logic — Base44 cannot import `w9PdfFill.js`.

## Not in scope (Task 3+)

- HTTP endpoint / storage upload
- Merchant UI for W-9 capture
- Elavon underwriting request wiring

## Review fix (2026-08-07)

- Added `scripts/inspect-w9-widgets.mjs` (widget rects for overlay placement) — referenced by field map.
- Added `scripts/sync-w9-pdf.mjs` (`assets/irs/fw9.pdf` → `public/irs/fw9.pdf`).
- Field map documents canonical PDF + sync; overlay coords tied to `w9PdfFill.js` constants.
- `npm run test:w9`: **20/20 pass**.
- Commit: `fix(uw): document W-9 overlay coords and PDF sync`
