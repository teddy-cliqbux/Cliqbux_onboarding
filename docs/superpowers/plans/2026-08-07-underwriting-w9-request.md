# Underwriting Requests + W-9 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deal Room agents can send a MID-scoped W-9 magic link (email/SMS), merchants edit + sign in-house, signed PDF lands in Deal Room, and agents email it to Elavon via Gmail with attachment.

**Architecture:** New `UnderwritingRequest` entity + admin `manageUnderwritingRequest` + token-gated `completeUnderwritingRequest`. Prefill/mapper + IRS PDF fill (`pdf-lib`) run server-side on submit; Deal Room panel lists/sends/Elavon-forwards; Gmail OAuth gains `gmail.send`.

**Tech Stack:** Base44 entities/functions (Deno), React (`/uw/:token`, Deal Room), Resend, Quo, Gmail API, `pdf-lib`, pinned `assets/irs/fw9.pdf`.

**Spec:** `docs/superpowers/specs/2026-08-07-underwriting-w9-request-design.md`

## Global Constraints

- Do not invent MSPWare/BoldSign paths for W-9 — in-house token + PDF only.
- Never invent TIN; never default MCC; never log full SSN/EIN in SMS or server logs.
- Portal/merchant functions must not gate on `base44.auth.me()`; admin function is workspace-only.
- Base44 cannot import shared helpers across functions — inline or duplicate small helpers; keep `src/lib` copies in sync with comments.
- Republish `UnderwritingRequest` in Base44 before live writes depend on new fields.
- Edit code in the local repo only (not Base44 sandbox source).
- `ApplicationStatus@elavon.com` is status-only — never default W-9 To: there.
- One non-terminal request per (`midId`, `type`); resend cancels prior unsigned.

---

## File map

| File | Responsibility |
|---|---|
| `base44/entities/Underwriting Request.jsonc` | New entity schema |
| `assets/irs/fw9.pdf` | Pinned IRS W-9 (March 2024) |
| `assets/irs/fw9-field-map.md` | Discovered AcroForm names → app keys |
| `src/lib/w9Model.js` | Canonical W-9 field object + validation + tax-class mapping |
| `src/lib/w9Model.test.js` | Unit tests |
| `src/lib/w9Prefill.js` | Prefill from legal entity + signers |
| `src/lib/w9Prefill.test.js` | Unit tests |
| `base44/functions/manageUnderwritingRequest/entry.ts` | Admin: list/create/send/resend/cancel/getSignedUrl/sendToElavon |
| `base44/functions/completeUnderwritingRequest/entry.ts` | Token: get / submitSignature (PDF fill + upload) |
| `base44/functions/helpers/w9PdfFill.ts` | Reference copy of PDF fill (inline into complete fn) |
| `src/pages/UnderwritingW9Sign.jsx` | Merchant `/uw/:token` UI |
| `src/components/deal-room/UnderwritingRequestsPanel.jsx` | Deal Room MID panel |
| `src/pages/ApplicationDealRoom.jsx` | Mount panel on selected MID |
| `src/App.jsx` | Route `/uw/:token` |
| `docs/underwriting-inbox.md` | `gmail.send` + `UNDERWRITING_ELAVON_DOCS_TO` |
| `AGENTS.md` / `AI_CHANNEL.md` | Short append on UW W-9 |

---

### Task 1: W-9 domain model + prefill (TDD)

**Files:**
- Create: `src/lib/w9Model.js`
- Create: `src/lib/w9Model.test.js`
- Create: `src/lib/w9Prefill.js`
- Create: `src/lib/w9Prefill.test.js`

**Interfaces:**
- Produces:
  - `emptyW9Fields()` → `{ name, businessName, taxClassification, llcTaxClass, otherClassification, exemptPayeeCode, fatcaCode, address, city, state, zip, tinType: 'ein'|'ssn', tin, signatureName, signedAt }`
  - `validateW9Fields(fields)` → `{ ok: boolean, errors: string[] }` (require name, address, city, state, zip, tin 9 digits, taxClassification)
  - `mapOwnershipToW9TaxClass(ownershipType, taxClassType)` → `{ taxClassification, llcTaxClass? }`
  - `buildW9Prefill({ legalEntity, controlPerson?, locationFallback? })` → W-9 fields (TIN from `federalEIN` digits only; never invent)

- [ ] **Step 1: Write failing tests** for tax-class mapping (`LIMITED_COMPANY`+`Corporation` → LLC + C; `SOLE_PROPRIETORSHIP` → individual; `CORPORATION`/`SUB_S_CORP` → c_corp / s_corp), validation (missing TIN fails; 9-digit EIN passes), prefill (entity mailing address wins over store).

- [ ] **Step 2: Run tests — expect FAIL**

```bash
node --test src/lib/w9Model.test.js src/lib/w9Prefill.test.js
```

- [ ] **Step 3: Implement `w9Model.js` + `w9Prefill.js` until tests pass**

- [ ] **Step 4: Commit**

```bash
git add src/lib/w9Model.js src/lib/w9Model.test.js src/lib/w9Prefill.js src/lib/w9Prefill.test.js
git commit -m "feat(uw): add W-9 field model and prefill helpers"
```

---

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
git commit -m "feat(uw): pin IRS W-9 PDF and pdf-lib fill helper"
```

---

### Task 3: Entity schema `UnderwritingRequest`

**Files:**
- Create: `base44/entities/Underwriting Request.jsonc`

**Schema properties (all declared):**  
`corporateId`, `merchantAccountId`, `midId`, `legalEntityId`, `type` (enum `w9`), `status` (enum per spec), `recipientName`, `recipientEmail`, `recipientPhone`, `channels` (string JSON array or comma list — prefer string `email|sms|both` for simplicity matching `nudgeMerchant`), `agentNote`, `prefillSnapshot` (string JSON), `tokenHash`, `tokenExpiresAt`, `signedPdfUrl`, `sentAt`, `openedAt`, `signedAt`, `sentToElavonAt`, `elavonGmailMessageId`, `createdByEmail`, `lastError`

- [ ] **Step 1: Write JSONC** matching Base44 entity style in `Underwriting Message.jsonc` (name `UnderwritingRequest`, required: `corporateId`, `midId`, `type`, `status`).

- [ ] **Step 2: Note in commit body:** Teddy must **Publish entity** in Base44 Dashboard before live create works.

- [ ] **Step 3: Commit**

```bash
git add "base44/entities/Underwriting Request.jsonc"
git commit -m "feat(uw): add UnderwritingRequest entity schema"
```

---

### Task 4: `manageUnderwritingRequest` (admin)

**Files:**
- Create: `base44/functions/manageUnderwritingRequest/entry.ts`

**Interfaces:**
- Auth: workspace `base44.auth.me()` only — reject merchant JWT (admin desk).
- Actions:
  - `list` `{ corporateId, midId? }` → requests (mask TIN in list: show last 4 only via derived `tinMasked` from snapshot)
  - `create` `{ corporateId, midId, legalEntityId, recipientName, recipientEmail?, recipientPhone?, channels, agentNote? }` → builds prefill (inline copy of `w9Prefill` logic), status `draft`, returns request + full prefill for UI preview
  - `send` `{ requestId }` → validate channels, cancel other non-terminal same mid+type, generate 32-byte hex token, store `sha256(token + MERCHANT_JWT_SECRET)`, `tokenExpiresAt` = now+7d, send Resend and/or Quo with `${PUBLIC_APP_URL}/uw/${token}`, status `sent`, `sentAt`
  - `resend` `{ requestId }` → cancel if needed + same as send on new or same row (prefer update same row with new token if still unsigned)
  - `cancel` `{ requestId }` → `cancelled`
  - `getSignedUrl` `{ requestId }` → `{ signedPdfUrl }` if status signed|sent_to_elavon
  - `sendToElavon` `{ requestId, to, subject, bodyText }` → require signed PDF; Gmail send multipart; log `UnderwritingMessage` outbound; set `sent_to_elavon`

**Email/SMS:** Copy Resend + Quo patterns from `nudgeMerchant/entry.ts` (normalizePhone, Quo-Api-Version `2026-03-30`, Resend from `onboarding@onboarding.cliqbuxpos.com`). SMS body must not include TIN.

**Gmail send:** Reuse token refresh from `syncUnderwritingMail`; POST `https://gmail.googleapis.com/gmail/v1/users/me/messages/send` with raw RFC 2822 base64url MIME (PDF attachment). On missing scope, return 503 with hint to reconnect OAuth with `gmail.send`.

- [ ] **Step 1: Scaffold function** with action switch + admin gate + `list`/`create`/`cancel` (no email yet).

- [ ] **Step 2: Add `send`/`resend`** with Resend + Quo.

- [ ] **Step 3: Add `sendToElavon` + `getSignedUrl`.**

- [ ] **Step 4: Manual smoke** against published app after entity publish (or document blocked until publish).

- [ ] **Step 5: Commit**

```bash
git add base44/functions/manageUnderwritingRequest/entry.ts
git commit -m "feat(uw): admin manageUnderwritingRequest send and Elavon forward"
```

---

### Task 5: `completeUnderwritingRequest` (token + PDF)

**Files:**
- Create: `base44/functions/completeUnderwritingRequest/entry.ts`

**Interfaces:**
- No `auth.me()` gate. Body always includes `token`.
- `get` `{ token }` → lookup by hashing token; if expired → 410; if signed → `{ status, fields, signedPdfUrl, viewOnly: true }`; else mark `opened` once, return `{ status, fields, agentNote, midLabel?, expiresAt }` (full TIN ok — token holder).
- `submitSignature` `{ token, fields, signatureDataUrl }` → validate fields; if already signed return existing URL; decode PNG from data URL; load pinned PDF bytes (bundle: fetch from `PUBLIC_APP_URL/assets/irs/fw9.pdf` **or** embed base64 constant generated at build — prefer fetch from app public URL after copying PDF to `public/irs/fw9.pdf`); fill+flatten; `asServiceRole.integrations.Core.UploadFile`; update request `signed`, `signedPdfUrl`, `prefillSnapshot`, `signedAt`; return `{ signedPdfUrl }`.

Also copy PDF to `public/irs/fw9.pdf` so Deno can `fetch` it without shipping megabytes in source.

- [ ] **Step 1: Implement token hash lookup + `get`.**

- [ ] **Step 2: Implement `submitSignature` with inlined pdf-lib fill (sync field names from `fw9-field-map.md`).**

- [ ] **Step 3: Idempotent re-submit test plan** (call twice → same URL).

- [ ] **Step 4: Commit**

```bash
git add base44/functions/completeUnderwritingRequest/entry.ts public/irs/fw9.pdf
git commit -m "feat(uw): token-gated W-9 complete and PDF stamp"
```

---

### Task 6: Merchant page `/uw/:token`

**Files:**
- Create: `src/pages/UnderwritingW9Sign.jsx`
- Modify: `src/App.jsx` — public route (no AdminProtectedRoute, no merchant JWT required)

**UI:**
- Load via `base44.functions.invoke('completeUnderwritingRequest', { action: 'get', token })` (public function invoke — same as `verifySignerToken` pattern; if CORS/auth blocks anonymous invoke, use raw `fetch` to `/functions/completeUnderwritingRequest` like other public entry points).
- Form: editable fields from model; Continue → canvas draw **or** typed name → Submit.
- States: loading, expired, error, signed confirmation + download link.
- Use `cb-*` tokens; light form surface for readability.

- [ ] **Step 1: Add route + skeleton page.**

- [ ] **Step 2: Wire get + submit + signature pad** (simple canvas; typed mode renders text to canvas before submit).

- [ ] **Step 3: Manual check** on `/uw/test` expired state + happy path against staging function.

- [ ] **Step 4: Commit**

```bash
git add src/pages/UnderwritingW9Sign.jsx src/App.jsx
git commit -m "feat(uw): merchant W-9 review and sign page"
```

---

### Task 7: Deal Room `UnderwritingRequestsPanel`

**Files:**
- Create: `src/components/deal-room/UnderwritingRequestsPanel.jsx`
- Modify: `src/pages/ApplicationDealRoom.jsx` — render panel under Underwriting-by-MID when `selectedMid` set; pass `corporateId`, `mid`, `legalEntities`, `signers`, `profile`

**UI flow:**
1. List requests for MID (status dots + recipient + dates)
2. New W-9: entity select → recipient select (from signers) → editable email/phone → channels checkboxes → note → Create & Send (or Create draft then Send)
3. Signed row: Download + Send to Elavon modal (To prefilled from `UNDERWRITING_ELAVON_DOCS_TO` if API returns it; Subject with AWB; body textarea)
4. Resend / Cancel on unsigned

Load people from Deal Room `data.signers` already fetched by `manageApplicationDesk.get`. Prefill preview from client `buildW9Prefill` for agent confidence before send (server still authoritative on create).

- [ ] **Step 1: Build panel component** with list + new request form.

- [ ] **Step 2: Mount in Deal Room**; wire invoke `manageUnderwritingRequest`.

- [ ] **Step 3: Add Send to Elavon modal.**

- [ ] **Step 4: Commit**

```bash
git add src/components/deal-room/UnderwritingRequestsPanel.jsx src/pages/ApplicationDealRoom.jsx
git commit -m "feat(uw): Deal Room underwriting requests panel for W-9"
```

---

### Task 8: Docs + Gmail scope + agent briefing

**Files:**
- Modify: `docs/underwriting-inbox.md` — scopes include `gmail.send`; env `UNDERWRITING_ELAVON_DOCS_TO`; W-9 send flow pointer to spec
- Modify: `AGENTS.md` — short subsection under Merchant Center / Deal Room
- Append: `AI_CHANNEL.md` — entry that W-9 UW request shipped in plan
- Optional vault: amend `Cliqbux Second Brain/specs/merchant-center.md` Constraints/Behavior with link to repo spec (no live data)

- [ ] **Step 1: Update docs.**

- [ ] **Step 2: Checklist for Teddy:** republish entity; re-consent Gmail; set env vars; redeploy both functions; smoke one test MID.

- [ ] **Step 3: Commit**

```bash
git add docs/underwriting-inbox.md AGENTS.md AI_CHANNEL.md
git commit -m "docs(uw): W-9 underwriting request and Gmail send scopes"
```

---

## Spec coverage check

| Spec requirement | Task |
|---|---|
| In-house magic link e-sign | 5, 6 |
| Agent picks recipient from deal people | 7 |
| Merchant can edit any field | 6 |
| Email / SMS / both | 4 |
| Per-MID requests | 3, 4 |
| Prefill from legal entity | 1, 4 |
| Signed PDF in Deal Room | 5, 7 |
| Gmail send with attachment | 4, 8 |
| Panel extensible for future types | 3 (`type` enum), 7 |
| Token expiry / resend / idempotent sign | 4, 5 |
| No BoldSign / no checklist replacement | Global constraints |

## Rollout (human)

1. Publish `UnderwritingRequest` entity in Base44  
2. Push + redeploy `manageUnderwritingRequest`, `completeUnderwritingRequest`  
3. Re-consent underwriting@ OAuth with `https://www.googleapis.com/auth/gmail.send` (+ keep readonly for sync)  
4. Set `UNDERWRITING_ELAVON_DOCS_TO` when known  
5. Smoke: send → sign → download → send to self → confirm attachment  

---

## Execution

After this plan is saved, choose:

1. **Subagent-Driven (recommended)** — fresh subagent per task + review between tasks  
2. **Inline Execution** — execute tasks in this session with checkpoints  

Which approach?
