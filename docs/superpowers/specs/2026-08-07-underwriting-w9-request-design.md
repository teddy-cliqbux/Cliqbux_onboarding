# Underwriting Requests + W-9 + Outbound Gmail Send

**Date:** 2026-08-07  
**Status:** Draft — awaiting Teddy review  
**Repo:** Cliqbux_onboarding  
**Surfaces:** Deal Room (`/admin/applications/:corporateId`), merchant `/uw/:token`

## Goal

Give CliqBux underwriting agents a Deal Room flow to request a **signed IRS Form W-9** from a merchant contact (email and/or SMS), with **editable prefill**, in-house e-sign (no BoldSign), store the signed PDF on the **MID**, and **email it to Elavon** from `underwriting@cliqbux.com` with the PDF attached.

This is **sub-project 1** of post-signing underwriting support. Later sub-projects add more request types and UW thread polish; this build ships the reusable request panel + W-9 + outbound Gmail send.

## Decisions (ratified in design session)

| Topic | Choice |
|---|---|
| E-sign | In-house magic link: form UI + draw/type signature → stamped IRS PDF (`pdf-lib`) |
| Recipient | Agent picks from deal people each time |
| Prefill | Starting point only — merchant may edit any W-9 field before signing |
| Channels | Agent chooses email, SMS, or both (Resend + Quo) |
| Scope | One request per **MID** (`type=w9`) |
| Elavon handoff | Send from Deal Room via Gmail API with attachment (not download-only) |
| Broader UW | Panel is typed (`w9` now; other types later) — not a one-off W-9 page |

## Non-goals (this build)

- Other document types (voided check, liquor license, etc.) — panel hooks only
- Unlocking / demoting the merchant application to fix a typo in MSPWare
- BoldSign, DocuSign, or MSPWare signature packages for the W-9
- Auto-upload into Elavon’s portal (email attachment only)
- Replacing Deal Room **Request document** (checklist upload) — that stays for ad-hoc file asks
- Changing inbound-only Gmail sync behavior beyond adding send capability

## Architecture

```
Deal Room (admin)
  → manageUnderwritingRequest (create / send / list / cancel / sendToElavon)
  → Resend email and/or Quo SMS with magic link
  → Gmail API send (underwriting@) with signed PDF + AWB subject

Merchant
  → GET/POST completeUnderwritingRequest (token-gated)
  → /uw/:token  edit fields → sign → confirmation

Storage
  → UnderwritingRequest entity
  → signed PDF file (Base44 private file / URL on request)
  → UnderwritingMessage outbound log on MID thread (after Elavon send)
```

### Entity: `UnderwritingRequest`

| Field | Notes |
|---|---|
| `corporateId` | HubSpot deal / profile id |
| `merchantAccountId` | Optional; set when known |
| `midId` | Required — request is MID-scoped |
| `legalEntityId` | Entity used for prefill (from profile/account `legalEntities`) |
| `type` | `w9` (extensible enum) |
| `status` | `draft` \| `sent` \| `opened` \| `signed` \| `sent_to_elavon` \| `cancelled` \| `expired` \| `send_failed` |
| `recipientName` | Display name |
| `recipientEmail` | Optional if SMS-only |
| `recipientPhone` | E.164; optional if email-only |
| `channels` | `['email']` \| `['sms']` \| `['email','sms']` |
| `agentNote` | Optional message shown in email/SMS and on the page |
| `prefillSnapshot` | JSON: W-9 field values at send; updated to final values on sign |
| `tokenHash` | HMAC/SHA of opaque token (never store raw token) |
| `tokenExpiresAt` | Default 7 days from send |
| `signedPdfUrl` / file id | Set on sign |
| `sentAt`, `openedAt`, `signedAt`, `sentToElavonAt` | Audit |
| `elavonGmailMessageId` | After successful send |
| `createdByEmail` | Agent workspace email |
| `lastError` | Last channel/Gmail failure message (ops-visible) |

**Uniqueness:** at most one **non-terminal** request per (`midId`, `type`) in `draft` \| `sent` \| `opened` \| `send_failed`. Creating/resending cancels any prior unsigned request for that pair. Multiple `signed` / `sent_to_elavon` history rows are allowed (audit).

**Republish** the entity in Base44 before relying on persistence (Lesson #4 pattern).

### Functions

| Function | Auth | Actions |
|---|---|---|
| `manageUnderwritingRequest` | Admin workspace only | `list`, `create`, `send`, `resend`, `cancel`, `getSignedUrl`, `sendToElavon` |
| `completeUnderwritingRequest` | Opaque token in body (no merchant JWT required) | `get`, `saveDraft`, `submitSignature` |

Reuse existing patterns from `nudgeMerchant` (Resend + Quo) and `syncUnderwritingMail` (Gmail OAuth token refresh). Do **not** call `base44.auth.me()` as a gate on merchant-facing paths; admin function uses workspace session.

### Gmail outbound

- Env: existing `UNDERWRITING_GMAIL_*` (+ same mailbox default `underwriting@cliqbux.com`)
- OAuth scopes: upgrade from `gmail.readonly` to include **`gmail.send`** (re-consent; new refresh token in Base44)
- `sendToElavon`: multipart MIME with PDF attachment. **To / Subject / body are agent-editable** in the confirm dialog. Prefill Subject with AWB when `MerchantMID.elavonAwb` is set. Prefill To only when a CliqBux-confirmed Elavon docs address is configured via env (`UNDERWRITING_ELAVON_DOCS_TO`); otherwise leave To blank for the agent to fill — do not invent an Elavon inbox.
- On success: create `UnderwritingMessage` outbound row on that MID; set `status=sent_to_elavon`
- On OAuth/scope failure: surface banner in Deal Room; signed PDF remains downloadable

Document the scope change (and optional `UNDERWRITING_ELAVON_DOCS_TO`) in `docs/underwriting-inbox.md`.

## Agent UX (Deal Room)

On **Underwriting by MID** (selected MID), add **Underwriting requests** panel:

1. List requests for this MID (type, recipient, status, timestamps)
2. **New W-9**
   - Select legal entity → show prefill preview (name, TIN masked, address, tax class)
   - Select recipient from deal people (Control Person, owners/signers, profile contacts) → editable email/phone
   - Channels: Email / SMS / both
   - Optional agent note
   - **Send**
3. When `signed`: Preview / Download + **Send to Elavon** (confirm To/Subject/body; attach PDF)
4. Resend: cancels prior **unsigned** request of same MID+type (or marks `cancelled`) and issues new token

Keep existing **Request document** (checklist) and AWB / inbox sync unchanged.

## Merchant UX (`/uw/:token`)

Standalone page (CliqBux branded, `cb-*` tokens; light document readability for the form area):

1. Validate token → `opened`
2. Editable W-9 Part I fields (plain form, not PDF editing):
   - Name / business name
   - Federal tax classification (checkboxes / radio matching W-9)
   - Address, city, state, ZIP
   - TIN (EIN or SSN)
   - Exempt payee / FATCA codes if we map them (optional v1: omit if not in prefill)
3. Continue → signature: draw **or** type name; date auto-filled
4. Submit → server generates filled IRS `fw9.pdf` via `pdf-lib` AcroForm + embedded signature image → store → `signed`
5. Confirmation + optional download of their copy
6. Expired/invalid token: generic message, no deal data leaked
7. Already signed: view/download only

**PDF source:** official IRS Form W-9 (`https://www.irs.gov/pub/irs-pdf/fw9.pdf`); pin a copy under repo `assets/` or function bundle so fills don’t break if IRS CDN changes. Field-name map documented in code comments after one mapping pass against the pinned PDF.

## Prefill mapping (best-effort)

| W-9 concept | Source |
|---|---|
| Name (individual) / business name | Legal entity `legalBusinessName`; Control Person name when sole prop |
| Tax classification | `ownershipType` + `taxClassType` → W-9 boxes (LLC + llc_class style) |
| Address | Legal mailing address if set; else store / profile |
| TIN | `federalEIN` (EIN) or sole-prop SSN from signer KYC when applicable |

Never invent TIN. If missing, agent must fill before send or merchant fills on the page.

## Notifications

**Email (Resend):** from `onboarding@onboarding.cliqbuxpos.com` (existing verified domain); subject like “Action needed: sign your W-9 for CliqBux / Elavon”; inline logo CID pattern from `helpers/emailBrand.ts` (copied into function — Base44 cannot import helpers); CTA button → magic link.

**SMS (Quo):** short message + link; no full TIN in SMS body. Requires `QUO_API_KEY` + `QUO_FROM_NUMBER` (E.164 with `+`).

Channel validation: email required if email channel selected; phone required if SMS selected.

## Status machine

```
draft → sent → opened → signed → sent_to_elavon
         ↘ send_failed (retry → sent)
sent|opened → cancelled (resend or agent cancel)
sent|opened → expired (token past expiresAt)
```

`submitSignature` is idempotent once `signed`.

## Security

- Admin-only create/send/Elavon send
- Merchant path: token only; constant-time hash compare; no listing of other requests
- Token TTL 7 days; raw token shown once in send response for ops debug only if needed — prefer never log raw token
- Signed PDFs: admin getSignedUrl + token holder download; not public unguessable-only without auth
- TIN: mask in Deal Room list; full on edit form for token holder and in PDF

## Error handling

| Case | Behavior |
|---|---|
| Missing email/phone for selected channel | 422 before send |
| Resend/Quo failure | `send_failed` + `lastError`; retry |
| Bad/expired token | 401/410 generic copy |
| Double submit | Return existing signed PDF |
| Gmail send failure | Keep `signed`; show reconnect/send error; download still works |
| No AWB | Allow Elavon send with warning; agent can edit subject |

## Testing

- Multi-entity deal: pick entity B, recipient owner, email+SMS
- Merchant edits legal name + TIN, signs; PDF AcroForm values + signature visible
- Resend invalidates old link
- `sendToElavon` attaches PDF; `UnderwritingMessage` logged; status advances
- Gmail without send scope: clear UI error; PDF retained
- Expired token after 7 days

## Rollout

1. Republish `UnderwritingRequest` entity
2. Redeploy `manageUnderwritingRequest`, `completeUnderwritingRequest`
3. Re-consent Gmail OAuth with `gmail.send`; update refresh token in Base44
4. Update `docs/underwriting-inbox.md` scopes
5. Pin `fw9.pdf` + field map; smoke-test one internal MID
6. Vault: link this spec from merchant-center / underwriting notes when accepted

## Open questions (non-blocking for plan)

1. Confirm env prefill for `UNDERWRITING_ELAVON_DOCS_TO` when Teddy pins the real Elavon docs inbox (ApplicationStatus@ is status-only and must not be the default for W-9 attachments).
2. `saveDraft` mid-edit is optional; v1 requires only **Submit** (implementation may no-op or omit `saveDraft`).
3. Signed W-9 does **not** appear on the merchant checklist in v1 (Deal Room + merchant confirmation email/page only).

## Related

- `docs/underwriting-inbox.md` — inbound Gmail + AWB status inquiry
- Deal Room `Request document` → `manageMerchantChecklist.requestDocument` (unchanged)
- `nudgeMerchant` — Quo/Resend patterns
- Vault: `specs/merchant-center.md` (post-signing hub)
