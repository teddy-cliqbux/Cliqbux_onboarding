/**
 * Merchant Center auth — narrow swap-friendly surface.
 * Stage 1: wraps the existing deal-scoped merchant JWT (magic link).
 * Later stages may swap the implementation for account-scoped or dashboard-minted tokens.
 * Nothing outside this module should know how sessions are stored.
 *
 * Does NOT replace or modify merchantAuthFetch.js (onboarding portal auth gate).
 */
import {
  getMerchantToken,
  setMerchantToken,
  clearMerchantToken,
} from '@/lib/merchantAuthFetch';

function decodeJwtPayload(token) {
  if (!token || typeof token !== 'string') return null;
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    let b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const pad = (4 - (b64.length % 4)) % 4;
    b64 += '='.repeat(pad);
    return JSON.parse(atob(b64));
  } catch {
    return null;
  }
}

/**
 * @returns {{ corporateId: string, email?: string, merchantAccountId?: string, kind: string } | null}
 */
export function getSession() {
  const token = getMerchantToken();
  if (!token) return null;
  const payload = decodeJwtPayload(token);
  if (!payload?.corporateId) return null;
  if (typeof payload.exp === 'number' && Date.now() >= payload.exp * 1000) {
    return null;
  }
  return {
    corporateId: String(payload.corporateId),
    email: payload.email ? String(payload.email) : undefined,
    merchantAccountId: payload.merchantAccountId
      ? String(payload.merchantAccountId)
      : undefined,
    kind: payload.imp ? 'impersonation' : 'merchant_jwt',
  };
}

/**
 * Stage 1: accept an already-minted merchant JWT (from magic link / impersonate).
 * Email+password account login is Stage 2+.
 */
export async function signIn({ token } = {}) {
  if (!token || typeof token !== 'string') {
    throw new Error('Use your onboarding magic link to open the Merchant Center.');
  }
  setMerchantToken(token);
  const session = getSession();
  if (!session) {
    clearMerchantToken();
    throw new Error('That link is invalid or expired. Request a new one from Cliqbux.');
  }
  return session;
}

export function signOut() {
  clearMerchantToken();
  try {
    sessionStorage.removeItem('portal_impersonating');
  } catch { /* ignore */ }
}

/**
 * @returns {ReturnType<typeof getSession>}
 * @throws {Error} when no valid session
 */
export function requireAuth() {
  const session = getSession();
  if (!session) {
    throw new Error('Sign in required. Open your onboarding link to continue.');
  }
  return session;
}
