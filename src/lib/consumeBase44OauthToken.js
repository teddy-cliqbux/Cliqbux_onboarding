import { removeAccessToken } from '@base44/sdk';
import { base44 } from '@/api/base44Client';

/**
 * Base44 Google/OAuth often returns `?token=` (or `?access_token=`) on the
 * post-login redirect. The merchant portal also uses `?token=` for magic links.
 *
 * Probe: set the candidate as a Base44 session token and call auth.me().
 * - success → OAuth/staff session; strip from URL; return { kind: 'oauth', user }
 * - failure → clear the bad session token; return { kind: 'not_oauth' } so the
 *   caller can run validateResumeToken (merchant magic link).
 */
export async function tryClaimBase44OauthToken(rawToken) {
  if (!rawToken || typeof rawToken !== 'string') {
    return { kind: 'none' };
  }

  try {
    base44.auth.setToken(rawToken, true);
    const user = await base44.auth.me();
    const url = new URL(window.location.href);
    url.searchParams.delete('token');
    url.searchParams.delete('access_token');
    window.history.replaceState({}, '', url.pathname + url.search + url.hash);
    return { kind: 'oauth', user };
  } catch (err) {
    console.warn('[tryClaimBase44OauthToken] not a Base44 session token', err?.status || err?.message);
    try {
      removeAccessToken({});
    } catch { /* ignore */ }
    return { kind: 'not_oauth', error: err };
  }
}
