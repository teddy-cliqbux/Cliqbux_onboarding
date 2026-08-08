### Task 5: `completeUnderwritingRequest` (token + PDF)

**Files:**
- Create: `base44/functions/completeUnderwritingRequest/entry.ts`

**Interfaces:**
- No `auth.me()` gate. Body always includes `token`.
- `get` `{ token }` â†’ lookup by hashing token; if expired â†’ 410; if signed â†’ `{ status, fields, signedPdfUrl, viewOnly: true }`; else mark `opened` once, return `{ status, fields, agentNote, midLabel?, expiresAt }` (full TIN ok â€” token holder).
- `submitSignature` `{ token, fields, signatureDataUrl }` â†’ validate fields; if already signed return existing URL; decode PNG from data URL; load pinned PDF bytes (bundle: fetch from `PUBLIC_APP_URL/assets/irs/fw9.pdf` **or** embed base64 constant generated at build â€” prefer fetch from app public URL after copying PDF to `public/irs/fw9.pdf`); fill+flatten; `asServiceRole.integrations.Core.UploadFile`; update request `signed`, `signedPdfUrl`, `prefillSnapshot`, `signedAt`; return `{ signedPdfUrl }`.

Also copy PDF to `public/irs/fw9.pdf` so Deno can `fetch` it without shipping megabytes in source.

- [ ] **Step 1: Implement token hash lookup + `get`.**

- [ ] **Step 2: Implement `submitSignature` with inlined pdf-lib fill (sync field names from `fw9-field-map.md`).**

- [ ] **Step 3: Idempotent re-submit test plan** (call twice â†’ same URL).

- [ ] **Step 4: Commit**

```bash
git add base44/functions/completeUnderwritingRequest/entry.ts public/irs/fw9.pdf
git commit -m "feat(uw): token-gated W-9 complete and PDF stamp"
```

