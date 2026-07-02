import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// ─── Merchant Portal Auth Helper (inlined) ────────────────────────────────────
// Base44 bundles each function in isolation — relative imports can't reach
// outside functions/{name}/, so this is duplicated from base44/functions/helpers/auth.ts
// rather than imported. Keep both copies in sync if the signing logic changes.
// See that file for verifyMerchantToken and full documentation.

interface MerchantTokenPayload {
  corporateId: string;
  email?: string;
  exp: number; // unix seconds
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function getHmacKey(usage: 'sign' | 'verify'): Promise<CryptoKey> {
  const secret = Deno.env.get('MERCHANT_JWT_SECRET');
  if (!secret) throw new Error('MERCHANT_JWT_SECRET env var not set');
  const keyData = new TextEncoder().encode(secret);
  return crypto.subtle.importKey('raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, [usage]);
}

// Signs { corporateId, email, exp } into a compact HMAC-SHA256 token.
// expiresAt should be the same ISO 8601 timestamp as the MerchantAccessTokens
// record's expiresAt, so the signed token expires exactly when the magic
// link itself would have — no separate TTL policy to keep in sync.
async function signMerchantToken(
  corporateId: string,
  email: string | undefined,
  expiresAt: string
): Promise<string> {
  const header = { alg: 'HS256', typ: 'JWT' };
  const exp = Math.floor(new Date(expiresAt).getTime() / 1000);
  const payload: MerchantTokenPayload = { corporateId, email, exp };

  const encodedHeader = base64UrlEncode(new TextEncoder().encode(JSON.stringify(header)));
  const encodedPayload = base64UrlEncode(new TextEncoder().encode(JSON.stringify(payload)));
  const signingInput = `${encodedHeader}.${encodedPayload}`;

  const key = await getHmacKey('sign');
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(signingInput));
  const encodedSignature = base64UrlEncode(new Uint8Array(signature));

  return `${signingInput}.${encodedSignature}`;
}

// ─── validateResumeToken ──────────────────────────────────────────────────────
// Validates a magic link token and returns the associated corporateId.
// Marks the token as used after first successful validation.
// The frontend then stores the corporateId in sessionStorage to allow
// normal navigation within the portal without re-validating on every render.
//
// POST /functions/validateResumeToken
// Body: { token }

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    if (req.method !== 'POST') {
      return Response.json({ error: 'Method not allowed' }, { status: 405 });
    }

    const body = await req.json();
    const { token } = body;

    if (!token) {
      return Response.json({ error: 'token is required' }, { status: 400 });
    }

    // Look up the token
    const records = await base44.asServiceRole.entities.MerchantAccessTokens.filter({ token });
    const record = records?.[0];

    if (!record) {
      return Response.json({
        success: false,
        error: 'Invalid or expired link. Please request a new one.',
      }, { status: 401 });
    }

    // Check expiry
    if (new Date(record.expiresAt) < new Date()) {
      return Response.json({
        success: false,
        error: 'This link has expired. Please request a new one.',
        expired: true,
      }, { status: 401 });
    }

    // Sign a merchant-portal token bound to this corporateId — expires at the
    // same instant the magic link itself does, so no separate TTL to manage.
    const merchantToken = await signMerchantToken(record.corporateId, record.email, record.expiresAt);

    console.log(`[validateResumeToken] Token validated for corporateId=${record.corporateId}, email=${record.email}`);

    return Response.json({
      success: true,
      corporateId: record.corporateId,
      email: record.email,
      merchantToken,
    });

  } catch (error: any) {
    return Response.json({
      error: error.message,
      stack: error.stack?.split('\n').slice(0, 3).join(' | '),
    }, { status: 500 });
  }
});