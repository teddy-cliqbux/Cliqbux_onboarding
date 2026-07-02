import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { signMerchantToken } from '../helpers/auth.ts';

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