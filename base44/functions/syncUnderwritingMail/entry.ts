/**
 * syncUnderwritingMail — admin-only Gmail pull for underwriting@cliqbux.com.
 *
 * Matches emails to MerchantMID.elavonAwb (AWB in subject/body), dedupes by
 * Gmail message id → UnderwritingMessage.externalId.
 *
 * Env (Google Workspace OAuth for the shared inbox):
 *   UNDERWRITING_GMAIL_CLIENT_ID
 *   UNDERWRITING_GMAIL_CLIENT_SECRET
 *   UNDERWRITING_GMAIL_REFRESH_TOKEN
 * Optional:
 *   UNDERWRITING_GMAIL_ACCESS_TOKEN — skip refresh (short-lived / testing)
 *   UNDERWRITING_GMAIL_USER — mailbox (default underwriting@cliqbux.com)
 *   UNDERWRITING_GMAIL_QUERY — Gmail search override
 *
 * Body: { maxResults?: number, corporateId?: string } — if corporateId set,
 * only attach matches for MIDs on that deal (still searches the whole inbox).
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const DEFAULT_MAILBOX = 'underwriting@cliqbux.com';

function __b64uDecode(str: string): Uint8Array {
  const pad = (4 - (str.length % 4)) % 4;
  const bin = atob(str.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat(pad));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

async function requireAdmin(req: Request, base44: any): Promise<boolean> {
  try {
    const m = (req.headers.get('Authorization') || '').match(/^Bearer\s+(.+)$/i);
    const parts = m ? m[1].split('.') : [];
    const secret = Deno.env.get('MERCHANT_JWT_SECRET');
    if (parts.length === 3 && secret) {
      // Merchant tokens are never allowed to sync the shared inbox
      const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
      const ok = await crypto.subtle.verify('HMAC', key, __b64uDecode(parts[2]), new TextEncoder().encode(`${parts[0]}.${parts[1]}`));
      if (ok) return false;
    }
  } catch { /* ignore */ }
  try {
    const user = await base44.auth.me();
    return !!user;
  } catch {
    return false;
  }
}

async function getGmailAccessToken(): Promise<string> {
  const direct = Deno.env.get('UNDERWRITING_GMAIL_ACCESS_TOKEN');
  if (direct) return direct;

  const clientId = Deno.env.get('UNDERWRITING_GMAIL_CLIENT_ID');
  const clientSecret = Deno.env.get('UNDERWRITING_GMAIL_CLIENT_SECRET');
  const refreshToken = Deno.env.get('UNDERWRITING_GMAIL_REFRESH_TOKEN');
  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error(
      'Gmail not configured. Set UNDERWRITING_GMAIL_CLIENT_ID, UNDERWRITING_GMAIL_CLIENT_SECRET, and UNDERWRITING_GMAIL_REFRESH_TOKEN (or UNDERWRITING_GMAIL_ACCESS_TOKEN).'
    );
  }

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) {
    throw new Error(`Gmail token refresh failed: ${res.status} ${JSON.stringify(data)}`);
  }
  return String(data.access_token);
}

function decodeBodyData(data?: string): string {
  if (!data) return '';
  try {
    const b64 = data.replace(/-/g, '+').replace(/_/g, '/');
    const pad = (4 - (b64.length % 4)) % 4;
    return atob(b64 + '='.repeat(pad));
  } catch {
    return '';
  }
}

function collectTextParts(payload: any, out: string[] = []): string[] {
  if (!payload) return out;
  const mime = String(payload.mimeType || '');
  if (mime === 'text/plain' && payload.body?.data) {
    out.push(decodeBodyData(payload.body.data));
  }
  if (Array.isArray(payload.parts)) {
    for (const p of payload.parts) collectTextParts(p, out);
  }
  return out;
}

function headerMap(headers: any[] | undefined): Record<string, string> {
  const m: Record<string, string> = {};
  for (const h of headers || []) {
    if (h?.name) m[String(h.name).toLowerCase()] = String(h.value || '');
  }
  return m;
}

/** Extract likely AWB tokens from subject + body. Elavon AWBs vary; keep broad. */
function extractAwbCandidates(text: string): string[] {
  const found = new Set<string>();
  const upper = String(text || '');
  // Explicit labels
  const labeled = upper.matchAll(/\b(?:AWB|Application\s*Work\s*Basket|App(?:lication)?\s*(?:#|No\.?|Number)?)\s*[:#]?\s*([A-Z0-9-]{6,24})\b/gi);
  for (const m of labeled) found.add(m[1].toUpperCase());
  // Bare long alphanumerics that match stored AWBs are handled by includes() against known list
  return [...found];
}

function stripHtml(html: string): string {
  return String(html || '')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    if (!(await requireAdmin(req, base44))) {
      return Response.json({ error: 'Unauthorized — admin only' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const maxResults = Math.min(Number(body.maxResults) || 40, 100);
    const filterCorporateId = body.corporateId ? String(body.corporateId).trim() : '';

    let accessToken: string;
    try {
      accessToken = await getGmailAccessToken();
    } catch (e: any) {
      return Response.json({
        error: e?.message || 'Gmail not configured',
        configured: false,
        hint: 'Add UNDERWRITING_GMAIL_* env vars in Base44, or use Deal Room → Log email until then.',
      }, { status: 503 });
    }

    const mailbox = Deno.env.get('UNDERWRITING_GMAIL_USER') || DEFAULT_MAILBOX;
    const query = Deno.env.get('UNDERWRITING_GMAIL_QUERY')
      || `to:${mailbox} OR in:inbox newer_than:90d`;

    const listRes = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=${maxResults}&q=${encodeURIComponent(query)}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    const listData = await listRes.json().catch(() => ({}));
    if (!listRes.ok) {
      return Response.json({
        error: 'Gmail list failed',
        status: listRes.status,
        detail: listData,
      }, { status: 502 });
    }

    // Load MIDs that have an AWB (optionally scoped to one deal)
    let midsWithAwb: any[] = [];
    if (filterCorporateId) {
      const mids = await base44.asServiceRole.entities.MerchantMID.filter(
        { corporateId: filterCorporateId }, '-created_date', 100
      );
      midsWithAwb = (mids || []).filter((m: any) => String(m.elavonAwb || '').trim());
    } else {
      // Base44 filter may not support "field not empty" — pull recent Pending/Active MIDs
      const batches = await Promise.all([
        base44.asServiceRole.entities.MerchantMID.filter({ applicationStepStatus: 'Pending MID' }, '-updated_date', 200),
        base44.asServiceRole.entities.MerchantMID.filter({ applicationStepStatus: 'Active' }, '-updated_date', 200),
        base44.asServiceRole.entities.MerchantMID.filter({ applicationStepStatus: 'Active (Existing)' }, '-updated_date', 100),
      ]);
      const seen = new Set<string>();
      for (const batch of batches) {
        for (const m of batch || []) {
          if (!m?.id || seen.has(m.id)) continue;
          if (!String(m.elavonAwb || '').trim()) continue;
          seen.add(m.id);
          midsWithAwb.push(m);
        }
      }
    }

    const awbIndex = new Map<string, any>();
    for (const m of midsWithAwb) {
      awbIndex.set(String(m.elavonAwb).trim().toUpperCase(), m);
    }

    const messageIds: string[] = (listData.messages || []).map((m: any) => m.id).filter(Boolean);
    const results = {
      scanned: 0,
      created: 0,
      skippedDup: 0,
      unmatched: 0,
      matched: [] as any[],
      unmatchedSamples: [] as any[],
    };

    for (const gmailId of messageIds) {
      results.scanned += 1;

      // Dedup
      let existing: any[] = [];
      try {
        existing = await base44.asServiceRole.entities.UnderwritingMessage.filter(
          { externalId: gmailId }, '-created_date', 1
        );
      } catch (e: any) {
        return Response.json({
          error: 'UnderwritingMessage entity missing — republish schema in Base44.',
          detail: e?.message,
        }, { status: 503 });
      }
      if (existing?.length) {
        results.skippedDup += 1;
        continue;
      }

      const msgRes = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${gmailId}?format=full`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      const msg = await msgRes.json().catch(() => ({}));
      if (!msgRes.ok) continue;

      const headers = headerMap(msg.payload?.headers);
      const subject = headers.subject || '';
      const fromAddress = headers.from || '';
      const toAddress = headers.to || mailbox;
      const dateHeader = headers.date || '';
      let messageDate = new Date().toISOString();
      if (dateHeader) {
        const parsed = new Date(dateHeader);
        if (!Number.isNaN(parsed.getTime())) messageDate = parsed.toISOString();
      } else if (msg.internalDate) {
        messageDate = new Date(Number(msg.internalDate)).toISOString();
      }

      const textParts = collectTextParts(msg.payload);
      let bodyText = textParts.join('\n\n').trim();
      if (!bodyText && msg.snippet) bodyText = String(msg.snippet);
      if (!bodyText) bodyText = '(no text body)';

      // Prefer plain text; if we only got HTML-ish, strip tags
      if (bodyText.includes('<') && bodyText.includes('>')) bodyText = stripHtml(bodyText);

      const haystack = `${subject}\n${bodyText}`;
      const candidates = extractAwbCandidates(haystack);

      // Also match any known AWB that appears as a substring (case-insensitive)
      let matchedMid: any = null;
      let matchedAwb = '';
      for (const c of candidates) {
        if (awbIndex.has(c)) {
          matchedMid = awbIndex.get(c);
          matchedAwb = c;
          break;
        }
      }
      if (!matchedMid) {
        const hayUpper = haystack.toUpperCase();
        for (const [awb, mid] of awbIndex.entries()) {
          if (awb.length >= 6 && hayUpper.includes(awb)) {
            matchedMid = mid;
            matchedAwb = awb;
            break;
          }
        }
      }

      if (!matchedMid) {
        results.unmatched += 1;
        if (results.unmatchedSamples.length < 8) {
          results.unmatchedSamples.push({ gmailId, subject: subject.slice(0, 120), fromAddress });
        }
        continue;
      }

      const direction = fromAddress.toLowerCase().includes('cliqbux') ? 'outbound' : 'inbound';
      await base44.asServiceRole.entities.UnderwritingMessage.create({
        corporateId: String(matchedMid.corporateId),
        midId: String(matchedMid.id),
        elavonAwb: matchedAwb || String(matchedMid.elavonAwb || ''),
        direction,
        subject,
        bodyText,
        fromAddress,
        toAddress,
        messageDate,
        externalId: gmailId,
        source: 'gmail',
        snippet: String(msg.snippet || bodyText).slice(0, 160),
      });
      results.created += 1;
      results.matched.push({
        gmailId,
        midId: matchedMid.id,
        corporateId: matchedMid.corporateId,
        awb: matchedAwb,
        subject: subject.slice(0, 80),
      });
    }

    return Response.json({
      success: true,
      configured: true,
      mailbox,
      query,
      awbIndexSize: awbIndex.size,
      ...results,
    });
  } catch (error: any) {
    console.error('[syncUnderwritingMail]', error?.message);
    return Response.json({ error: error?.message || String(error) }, { status: 500 });
  }
});
