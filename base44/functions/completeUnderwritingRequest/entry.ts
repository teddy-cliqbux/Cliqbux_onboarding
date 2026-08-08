/**
 * completeUnderwritingRequest — token-gated merchant W-9 complete + PDF stamp.
 *
 * Actions:
 *   get             { token }
 *   submitSignature { token, fields, signatureDataUrl }
 *
 * Auth: opaque magic-link token only — NO auth.me() / merchant JWT gate.
 * Token store: sha256(token + MERCHANT_JWT_SECRET) → tokenHash (same as manageUnderwritingRequest).
 *
 * PDF: fetch pinned fw9 from PUBLIC_APP_URL (/irs/fw9.pdf), fill via inlined pdf-lib
 * (sync with src/lib/w9PdfFill.js + assets/irs/fw9-field-map.md), UploadFile → https signedPdfUrl.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
// redeployed 2026-08-08a — force-redeploy to pick up published UnderwritingRequest entity schema
import { PDFDocument, StandardFonts, rgb } from 'npm:pdf-lib@1.17.1';

const SIGNED_STATUSES = new Set(['signed', 'sent_to_elavon']);
const OPENABLE_STATUSES = new Set(['sent', 'opened', 'send_failed']);
const MAX_SIGNATURE_BYTES = Math.floor(2 * 1024 * 1024);

// --- BEGIN w9Model validate (sync with src/lib/w9Model.js) ---

function emptyW9Fields() {
  return {
    name: '',
    businessName: '',
    taxClassification: '',
    llcTaxClass: '',
    otherClassification: '',
    exemptPayeeCode: '',
    fatcaCode: '',
    address: '',
    city: '',
    state: '',
    zip: '',
    tinType: 'ein',
    tin: '',
    signatureName: '',
    signedAt: '',
  };
}

function validateW9Fields(fields: any): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  const f = fields || {};

  if (!String(f.name || '').trim()) errors.push('Name is required');
  if (!String(f.address || '').trim()) errors.push('Address is required');
  if (!String(f.city || '').trim()) errors.push('City is required');
  if (!String(f.state || '').trim()) errors.push('State is required');
  if (!String(f.zip || '').trim()) errors.push('ZIP is required');
  if (!String(f.taxClassification || '').trim()) errors.push('Tax classification is required');

  const tinDigits = String(f.tin || '').replace(/\D/g, '');
  if (!tinDigits) {
    errors.push('TIN is required');
  } else if (tinDigits.length !== 9) {
    errors.push('TIN must be 9 digits');
  }

  return { ok: errors.length === 0, errors };
}

// --- END w9Model validate ---

// --- BEGIN w9PdfFill (sync with src/lib/w9PdfFill.js + assets/irs/fw9-field-map.md) ---

const P = 'topmostSubform[0].Page1[0]';
const BOXES = `${P}.Boxes3a-b_ReadOrder[0]`;

const W9_ACROFORM = {
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

const W9_SIGNATURE_OVERLAY = { pageIndex: 0, x: 130, y: 248, width: 280, height: 36 };
const W9_DATE_OVERLAY = { pageIndex: 0, x: 468, y: 258, fontSize: 10 };

const TAX_CLASS_TO_CHECKBOX: Record<string, number> = {
  individual: 0,
  c_corp: 1,
  s_corp: 2,
  partnership: 3,
  trust: 4,
  llc: 5,
  other: 6,
};

function setText(form: any, fieldName: string, value: unknown) {
  const text = String(value ?? '').trim();
  if (!text) return;
  form.getTextField(fieldName).setText(text);
}

function splitTin(tin: unknown): string {
  const digits = String(tin ?? '').replace(/\D/g, '').slice(0, 9);
  return digits.length === 9 ? digits : '';
}

function formatCityStateZip(city: unknown, state: unknown, zip: unknown): string {
  const c = String(city ?? '').trim();
  const s = String(state ?? '').trim().toUpperCase();
  const z = String(zip ?? '').trim();
  if (!c && !s && !z) return '';
  const parts = [c, [s, z].filter(Boolean).join(' ')].filter(Boolean);
  return parts.join(', ');
}

function formatSignedDate(signedAt: unknown): string {
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

function resolveTaxCheckbox(fields: any) {
  const tax = String(fields.taxClassification ?? '').trim().toLowerCase();
  if (tax === 'llc' && String(fields.llcTaxClass ?? '').toUpperCase() === 'D') {
    return { checkboxIndex: 0, llcLetter: '', useOther: false };
  }
  if (tax === 'llc') {
    const letter = String(fields.llcTaxClass ?? '').toUpperCase().slice(0, 1);
    return {
      checkboxIndex: 5,
      llcLetter: letter === 'C' || letter === 'S' || letter === 'P' ? letter : '',
      useOther: false,
    };
  }
  if (tax === 'other') {
    return { checkboxIndex: 6, llcLetter: '', useOther: true };
  }
  const idx = TAX_CLASS_TO_CHECKBOX[tax];
  if (idx == null) return { checkboxIndex: -1, llcLetter: '', useOther: false };
  return { checkboxIndex: idx, llcLetter: '', useOther: false };
}

function applyTaxClassification(form: any, fields: any) {
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

function applyTin(form: any, fields: any) {
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

async function drawSignatureAndDate(doc: any, fields: any, signaturePngBytes: Uint8Array | null) {
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

async function fillW9Pdf(
  pdfBytes: Uint8Array,
  fields: any,
  signaturePngBytes: Uint8Array | null,
): Promise<Uint8Array> {
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

// --- END w9PdfFill ---

function getPortalBaseUrl(): string {
  const configured = Deno.env.get('PUBLIC_APP_URL');
  if (configured && configured.startsWith('http')) return configured.replace(/\/$/, '');
  return 'https://cliqbux-onboard-prime.base44.app';
}

/** Same hash as manageUnderwritingRequest — sha256(rawToken + MERCHANT_JWT_SECRET) hex. */
async function hashToken(rawToken: string): Promise<string> {
  const secret = Deno.env.get('MERCHANT_JWT_SECRET');
  if (!secret) throw new Error('MERCHANT_JWT_SECRET not set');
  const data = new TextEncoder().encode(`${rawToken}${secret}`);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function parsePrefillSnapshot(raw: unknown): Record<string, any> {
  if (!raw) return emptyW9Fields();
  if (typeof raw === 'object' && !Array.isArray(raw)) {
    return { ...emptyW9Fields(), ...(raw as Record<string, any>) };
  }
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return { ...emptyW9Fields(), ...parsed };
      }
    } catch { /* fall through */ }
  }
  return emptyW9Fields();
}

function normalizeIncomingFields(raw: unknown): Record<string, any> {
  const base = emptyW9Fields();
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return base;
  const src = raw as Record<string, any>;
  for (const key of Object.keys(base)) {
    if (src[key] != null) base[key] = src[key];
  }
  // Preserve tinType casing for PDF path
  if (src.tinType != null) base.tinType = String(src.tinType).toLowerCase() === 'ssn' ? 'ssn' : 'ein';
  return base;
}

function isExpired(tokenExpiresAt: unknown): boolean {
  const raw = String(tokenExpiresAt || '').trim();
  if (!raw) return false;
  const t = Date.parse(raw);
  if (Number.isNaN(t)) return false;
  return Date.now() > t;
}

function genericTokenError(kind: 'invalid' | 'expired' | 'cancelled') {
  if (kind === 'expired') {
    return Response.json({
      error: 'This W-9 link has expired. Please ask CliqBux to send a new request.',
      code: 'TOKEN_EXPIRED',
    }, { status: 410 });
  }
  if (kind === 'cancelled') {
    return Response.json({
      error: 'This W-9 link is no longer valid. Please ask CliqBux to send a new request.',
      code: 'TOKEN_CANCELLED',
    }, { status: 410 });
  }
  return Response.json({
    error: 'This W-9 link is invalid. Please ask CliqBux for a new link.',
    code: 'TOKEN_INVALID',
  }, { status: 404 });
}

function entityMissingError(e: any): boolean {
  const msg = String(e?.message || e || '').toLowerCase();
  return msg.includes('not found') || msg.includes('unknown entity') || msg.includes('does not exist')
    || (msg.includes('entity') && msg.includes('missing'));
}

async function lookupByToken(base44: any, rawToken: string): Promise<{ request?: any; error?: Response }> {
  let tokenHash: string;
  try {
    tokenHash = await hashToken(rawToken);
  } catch (e: any) {
    return {
      error: Response.json({ error: e?.message || 'Token hashing failed' }, { status: 500 }),
    };
  }

  let rows: any[];
  try {
    rows = await base44.asServiceRole.entities.UnderwritingRequest.filter({ tokenHash }, '-created_date', 5);
  } catch (e: any) {
    if (entityMissingError(e)) {
      return {
        error: Response.json({
          error: 'UnderwritingRequest entity missing — publish schema in Base44 Dashboard, then retry.',
          detail: e?.message,
          code: 'ENTITY_SCHEMA_MISSING',
        }, { status: 503 }),
      };
    }
    throw e;
  }

  const request = rows?.[0];
  if (!request) return { error: genericTokenError('invalid') };
  return { request };
}

async function resolveMidLabel(base44: any, midId: string): Promise<string | undefined> {
  if (!midId) return undefined;
  try {
    const mid = await base44.asServiceRole.entities.MerchantMID.get(midId);
    const label = String(mid?.dbaName || mid?.merchantName || mid?.elavonMID || '').trim();
    return label || undefined;
  } catch {
    try {
      const rows = await base44.asServiceRole.entities.MerchantMID.filter({ id: midId }, undefined, 1);
      const mid = rows?.[0];
      const label = String(mid?.dbaName || mid?.merchantName || mid?.elavonMID || '').trim();
      return label || undefined;
    } catch {
      return undefined;
    }
  }
}

function decodePngDataUrl(raw: unknown): Uint8Array | null {
  if (raw == null || raw === '') return null;
  let b64 = String(raw).trim();
  const dataUrl = /^data:image\/png;base64,/i.exec(b64);
  if (dataUrl) {
    b64 = b64.slice(dataUrl[0].length);
  } else if (/^data:image\//i.test(b64)) {
    // Only PNG is supported for pdf-lib embedPng
    return null;
  }
  if (!/^[A-Za-z0-9+/=\s]+$/.test(b64) || b64.length < 32) return null;
  try {
    const bin = atob(b64.replace(/\s/g, ''));
    if (bin.length > MAX_SIGNATURE_BYTES) return null;
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  } catch {
    return null;
  }
}

async function loadPinnedFw9Bytes(): Promise<Uint8Array> {
  const base = getPortalBaseUrl();
  const candidates = [
    `${base}/irs/fw9.pdf`,
    `${base}/assets/irs/fw9.pdf`,
    'https://cliqbux-onboard-prime.base44.app/irs/fw9.pdf',
  ];
  const tried: string[] = [];
  for (const url of candidates) {
    if (tried.includes(url)) continue;
    tried.push(url);
    try {
      const res = await fetch(url);
      if (!res.ok) continue;
      const buf = new Uint8Array(await res.arrayBuffer());
      if (buf.length > 1000 && buf[0] === 0x25 && buf[1] === 0x50) { // %P… PDF magic
        return buf;
      }
    } catch {
      /* try next */
    }
  }
  throw new Error(`Could not load pinned W-9 PDF (tried ${tried.join(', ')})`);
}

/**
 * Upload stamped PDF via service-role UploadFile.
 * Returns a publicly fetchable https URL (required for later Gmail attach in sendToElavon).
 */
async function uploadSignedPdf(base44: any, pdfBytes: Uint8Array): Promise<string> {
  const file = new File([pdfBytes], `w9-signed-${Date.now()}.pdf`, { type: 'application/pdf' });
  const srv = base44.asServiceRole;
  if (!srv?.integrations?.Core?.UploadFile) {
    throw new Error('UploadFile integration unavailable on service role');
  }
  const up = await srv.integrations.Core.UploadFile({ file });
  // Prefer file_url; some SDK shapes also expose url
  const url = String(up?.file_url || up?.url || up?.fileUrl || '').trim();
  if (!url.startsWith('https://')) {
    throw new Error(
      `UploadFile did not return a public https URL (got: ${url ? url.slice(0, 48) : 'empty'}). `
      + 'Gmail Elavon attach requires a bare-fetchable https signedPdfUrl.',
    );
  }
  return url;
}

Deno.serve(async (req) => {
  try {
    // Token-only — intentionally no auth.me() / getPortalActor gate
    const base44 = createClientFromRequest(req);
    if (req.method !== 'POST') {
      return Response.json({ error: 'Method not allowed' }, { status: 405 });
    }

    const body = await req.json().catch(() => ({}));
    const action = String(body.action || '').trim();
    const rawToken = String(body.token || '').trim();

    if (!rawToken) {
      return Response.json({ error: 'token is required' }, { status: 400 });
    }
    if (!action) {
      return Response.json({ error: 'action is required' }, { status: 400 });
    }

    // ── get ─────────────────────────────────────────────────────────────────
    if (action === 'get') {
      const looked = await lookupByToken(base44, rawToken);
      if (looked.error) return looked.error;
      let request = looked.request;

      const status = String(request.status || '');
      if (status === 'cancelled') return genericTokenError('cancelled');
      if (status === 'expired' || isExpired(request.tokenExpiresAt)) {
        if (status !== 'expired' && !SIGNED_STATUSES.has(status)) {
          try {
            await base44.asServiceRole.entities.UnderwritingRequest.update(request.id, {
              status: 'expired',
            });
          } catch (e: any) {
            console.warn('[completeUnderwritingRequest] expire mark failed:', e?.message);
          }
        }
        // Signed requests remain viewable even past token expiry
        if (!SIGNED_STATUSES.has(status)) return genericTokenError('expired');
      }

      const fields = parsePrefillSnapshot(request.prefillSnapshot);

      if (SIGNED_STATUSES.has(status)) {
        return Response.json({
          status,
          fields,
          signedPdfUrl: String(request.signedPdfUrl || '').trim() || null,
          viewOnly: true,
          signedAt: request.signedAt || null,
          expiresAt: request.tokenExpiresAt || null,
        });
      }

      if (!OPENABLE_STATUSES.has(status)) {
        // draft / unknown — no merchant access without a live send
        return genericTokenError('invalid');
      }

      // First open: sent | send_failed → opened (once)
      if (status === 'sent' || status === 'send_failed') {
        const openedAt = new Date().toISOString();
        try {
          request = await base44.asServiceRole.entities.UnderwritingRequest.update(request.id, {
            status: 'opened',
            openedAt: request.openedAt || openedAt,
          });
        } catch (e: any) {
          console.warn('[completeUnderwritingRequest] opened transition failed:', e?.message);
        }
      }

      const midLabel = await resolveMidLabel(base44, String(request.midId || ''));

      return Response.json({
        status: String(request.status || 'opened'),
        fields,
        agentNote: String(request.agentNote || '').trim() || null,
        midLabel: midLabel || null,
        expiresAt: request.tokenExpiresAt || null,
        recipientName: request.recipientName || null,
      });
    }

    // ── submitSignature ─────────────────────────────────────────────────────
    if (action === 'submitSignature') {
      const looked = await lookupByToken(base44, rawToken);
      if (looked.error) return looked.error;
      const request = looked.request;

      const status = String(request.status || '');

      // Idempotent: already signed → return existing URL (no re-stamp)
      if (SIGNED_STATUSES.has(status)) {
        const existing = String(request.signedPdfUrl || '').trim();
        if (!existing) {
          return Response.json({
            error: 'Request is signed but signedPdfUrl is missing',
            code: 'PDF_MISSING',
          }, { status: 404 });
        }
        return Response.json({
          success: true,
          signedPdfUrl: existing,
          status,
          idempotent: true,
        });
      }

      if (status === 'cancelled') return genericTokenError('cancelled');
      if (status === 'expired' || isExpired(request.tokenExpiresAt)) {
        return genericTokenError('expired');
      }
      if (!OPENABLE_STATUSES.has(status)) {
        return genericTokenError('invalid');
      }

      const fields = normalizeIncomingFields(body.fields);
      const validation = validateW9Fields(fields);
      if (!validation.ok) {
        return Response.json({
          error: 'W-9 fields incomplete',
          code: 'VALIDATION',
          errors: validation.errors,
        }, { status: 422 });
      }

      const signaturePng = decodePngDataUrl(body.signatureDataUrl);
      const typedName = String(fields.signatureName || body.signatureName || '').trim();
      if (!signaturePng && !typedName) {
        return Response.json({
          error: 'signatureDataUrl (PNG) or signatureName is required',
          code: 'SIGNATURE_REQUIRED',
        }, { status: 422 });
      }

      const signedAt = new Date().toISOString();
      fields.signedAt = signedAt;
      if (typedName) fields.signatureName = typedName;

      let pdfBytes: Uint8Array;
      try {
        const template = await loadPinnedFw9Bytes();
        pdfBytes = await fillW9Pdf(template, fields, signaturePng);
      } catch (e: any) {
        console.error('[completeUnderwritingRequest] PDF fill failed:', e?.message || e);
        return Response.json({
          error: e?.message || 'Failed to fill W-9 PDF',
          code: 'PDF_FILL_FAILED',
        }, { status: 502 });
      }

      let signedPdfUrl: string;
      try {
        signedPdfUrl = await uploadSignedPdf(base44, pdfBytes);
      } catch (e: any) {
        console.error('[completeUnderwritingRequest] UploadFile failed:', e?.message || e);
        return Response.json({
          error: e?.message || 'Failed to upload signed PDF',
          code: 'UPLOAD_FAILED',
        }, { status: 502 });
      }

      // Re-check idempotency race: another submit may have won
      try {
        const fresh = await base44.asServiceRole.entities.UnderwritingRequest.get(request.id);
        if (fresh && SIGNED_STATUSES.has(String(fresh.status || ''))) {
          const existing = String(fresh.signedPdfUrl || '').trim();
          if (existing) {
            return Response.json({
              success: true,
              signedPdfUrl: existing,
              status: fresh.status,
              idempotent: true,
            });
          }
        }
      } catch { /* proceed with our write */ }

      let updated: any;
      try {
        updated = await base44.asServiceRole.entities.UnderwritingRequest.update(request.id, {
          status: 'signed',
          signedPdfUrl,
          prefillSnapshot: JSON.stringify(fields),
          signedAt,
          openedAt: request.openedAt || signedAt,
        });
      } catch (e: any) {
        console.error('[completeUnderwritingRequest] signed update failed:', e?.message || e);
        return Response.json({
          error: e?.message || 'Failed to persist signed request',
          code: 'PERSIST_FAILED',
        }, { status: 500 });
      }

      return Response.json({
        success: true,
        signedPdfUrl,
        status: String(updated?.status || 'signed'),
        signedAt,
      });
    }

    return Response.json({
      error: `Unknown action: ${action}. Supported: get, submitSignature`,
    }, { status: 400 });
  } catch (error: any) {
    console.error('[completeUnderwritingRequest]', error?.message || error);
    return Response.json({ error: error?.message || String(error) }, { status: 500 });
  }
});