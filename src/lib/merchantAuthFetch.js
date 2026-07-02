import { appParams } from '@/lib/app-params';

// Merchant-portal auth token (signed by validateResumeToken), cached per-tab.
const STORAGE_KEY = 'merchant_jwt';

export function getMerchantToken() {
  return sessionStorage.getItem(STORAGE_KEY);
}

export function setMerchantToken(token) {
  if (token) sessionStorage.setItem(STORAGE_KEY, token);
}

export function clearMerchantToken() {
  sessionStorage.removeItem(STORAGE_KEY);
}

// Invokes a Base44 backend function directly via fetch, attaching the
// merchant-portal JWT as a Bearer token.
//
// This bypasses base44.functions.invoke() on purpose: the SDK builds its own
// Authorization header internally (from the workspace/session token) with no
// hook to inject a different bearer token per call. Since magic-link portal
// users have no workspace session token, there's no collision — this hits
// the same /api/apps/{appId}/functions/{name} path the SDK itself uses
// (proxied to Base44's hosted backend via vercel.json), just with our own
// header attached.
//
// Response shape matches base44.functions.invoke() (`{ data }`) so call
// sites don't need restructuring beyond swapping the function name/import.
export async function invokePortalFunction(functionName, payload = {}) {
  const token = getMerchantToken();
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`/api/apps/${appParams.appId}/functions/${functionName}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });

  let data;
  try {
    data = await res.json();
  } catch {
    data = null;
  }

  if (!res.ok) {
    throw new Error(data?.error || `Request failed with status ${res.status}`);
  }

  return { data };
}
