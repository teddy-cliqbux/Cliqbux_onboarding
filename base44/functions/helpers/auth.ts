// ─── Merchant Portal Auth Helpers ─────────────────────────────────────────────
// Lightweight HMAC-SHA256 signed token binding a corporateId to a signature,
// so backend functions can trust an identity without a Base44 workspace
// session. Not a full JWT library — just enough structure (header.payload.sig,
// base64url, HMAC-SHA256) to be inspectable and interoperable.
//
// Secret: Deno.env.get('MERCHANT_JWT_SECRET') — must be set in Base44's env vars.
//
// NOTE ON DEPLOYMENT: every other function in base44/functions/ duplicates its
// own helpers inline rather than importing shared code (see submitToMSP vs
// signApplication). That may mean Base44's deploy pipeline bundles each
// functions/{name}/entry.ts in isolation. If importing this file from another
// function's entry.ts fails at deploy time, inline this module's contents
// directly into the calling file as a fallback.

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

function base64UrlDecode(str: string): Uint8Array {
  const padLength = (4 - (str.length % 4)) % 4;
  const padded = str.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat(padLength);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
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
export async function signMerchantToken(
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

// Extracts and verifies the Bearer token from an incoming Request.
// Returns the embedded corporateId, or throws on missing/malformed/invalid/expired token.
export async function verifyMerchantToken(req: Request): Promise<{ corporateId: string; email?: string }> {
  const authHeader = req.headers.get('Authorization') || req.headers.get('authorization') || '';
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match) throw new Error('Missing or malformed Authorization header');

  const token = match[1];
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('Malformed token');

  const [encodedHeader, encodedPayload, encodedSignature] = parts;
  const signingInput = `${encodedHeader}.${encodedPayload}`;

  const key = await getHmacKey('verify');
  const signatureValid = await crypto.subtle.verify(
    'HMAC',
    key,
    base64UrlDecode(encodedSignature),
    new TextEncoder().encode(signingInput)
  );
  if (!signatureValid) throw new Error('Invalid token signature');

  const payload: MerchantTokenPayload = JSON.parse(new TextDecoder().decode(base64UrlDecode(encodedPayload)));

  if (!payload.corporateId) throw new Error('Token missing corporateId');
  if (typeof payload.exp !== 'number' || Date.now() >= payload.exp * 1000) {
    throw new Error('Token expired');
  }

  return { corporateId: payload.corporateId, email: payload.email };
}

// ─── getPortalActor — the standard per-request auth check ─────────────────────
// This is the canonical copy of the block inlined into every merchant-facing
// function (Base44 bundles each function in isolation, so it cannot be
// imported — keep the inlined copies in sync with this one).
//
// Returns:
//   { actor: 'merchant', corporateId }  — request carries a valid merchant JWT
//     (issued by validateResumeToken, createHubspotDeal,
//     manageStagedApplication 'validate', or manageStagedApplication 'impersonate')
//   { actor: 'admin' }                  — request carries a Base44 workspace session
//   null                                — neither; callers must respond 401
//
// Callers must also enforce that merchant actors only touch their own data:
//   const actor = await getPortalActor(req, base44);
//   if (!actor || (actor.actor === 'merchant' && actor.corporateId !== String(corporateId))) {
//     return Response.json({ error: 'Unauthorized' }, { status: 401 });
//   }
export async function getPortalActor(req: Request, base44: any): Promise<{ actor: 'merchant' | 'admin'; corporateId?: string } | null> {
  try {
    const tok = await verifyMerchantToken(req);
    if (tok) return { actor: 'merchant', corporateId: String(tok.corporateId) };
  } catch { /* invalid/missing merchant token — fall through to workspace check */ }
  try {
    const user = await base44.auth.me();
    if (user) return { actor: 'admin' };
  } catch { /* no workspace session */ }
  return null;
}
