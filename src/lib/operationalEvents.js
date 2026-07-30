/**
 * Client helpers for operational events + product feedback.
 * Uses a quiet fetch path (no failure re-reporting) to avoid loops.
 *
 * See docs/superpowers/specs/2026-07-29-feedback-fix-loop-design.md
 */
import { getMerchantToken } from '@/lib/merchantAuthFetch';
import { appParams } from '@/lib/app-params';
import { base44 } from '@/api/base44Client';
import {
  BOARDING_CRITICAL_CODES,
  classifyPortalFailure,
} from '@/lib/operationalEventClassify';

export { BOARDING_CRITICAL_CODES, classifyPortalFailure };

/** Quiet invoke — never reports failures (avoids loops with merchantAuthFetch). */
async function invokeQuiet(functionName, payload) {
  try {
    const token = getMerchantToken();
    if (!token) {
      await base44.functions.invoke(functionName, payload);
      return;
    }
    await fetch(`/api/apps/${appParams.appId}/functions/${functionName}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });
  } catch {
    // swallow
  }
}

/**
 * Fire-and-forget operational event. Safe to call from catch blocks.
 */
export function reportClientOperationalEvent({
  severity = 'medium',
  code,
  message,
  corporateId,
  midId,
  mspApplicationNo,
  route,
  functionName,
  httpStatus,
  fingerprint,
} = {}) {
  if (!code) return;
  const path = route || (typeof window !== 'undefined' ? window.location.pathname + window.location.search : '');
  const corp =
    corporateId ||
    (typeof window !== 'undefined'
      ? new URLSearchParams(window.location.search).get('corporateId') ||
        new URLSearchParams(window.location.search).get('dealId')
      : null);

  void invokeQuiet('reportOperationalEvent', {
    severity,
    code: String(code).slice(0, 64),
    message: String(message || '').slice(0, 500),
    corporateId: corp ? String(corp) : undefined,
    midId: midId ? String(midId) : undefined,
    mspApplicationNo: mspApplicationNo != null ? String(mspApplicationNo) : undefined,
    route: path.slice(0, 300),
    functionName: functionName ? String(functionName).slice(0, 80) : undefined,
    httpStatus: httpStatus != null ? Number(httpStatus) : undefined,
    fingerprint: fingerprint ? String(fingerprint).slice(0, 200) : undefined,
    source: 'client',
  });
}

export function reportPortalFunctionFailure(functionName, status, errorMessage, extra = {}) {
  if (functionName === 'reportOperationalEvent' || functionName === 'submitProductFeedback') return;
  const { severity, code } = classifyPortalFailure(functionName, status, errorMessage);
  reportClientOperationalEvent({
    severity,
    code,
    message: `${functionName} failed (${status}): ${errorMessage || 'unknown'}`,
    functionName,
    httpStatus: status,
    fingerprint: `${code}:${functionName}:${status}:${extra.corporateId || ''}`,
    ...extra,
  });
}
