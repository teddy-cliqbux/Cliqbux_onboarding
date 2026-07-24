import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// ─── demoteApplication ────────────────────────────────────────────────────────
// Unlock portal forms after signing packages exist by fully retracting those
// MSPWare applications (void draft + clear mspApplicationNo). Draft-only apps
// without a signature package are left alone.
//
// Auth (2026-07-23):
//   - Plain merchants: never
//   - Workspace session OR impersonation JWT (imp:true): OK if nobody has signed
//   - After anyone signed (Base44 roster OR MSPWare package): workspace admin
//     whose email is in UNLOCK_ADMIN_EMAILS only (impersonation alone is not enough —
//     imp JWTs carry the merchant email, not the agent’s)
//
// Fail-closed: if any packaged app cannot be voided, do not unlock.
//
// POST /functions/demoteApplication
// Body: { corporateId, reason?: string }

const MSP_BASE = Deno.env.get('MSP_BASE_URL') || 'https://api.msppulsepoint.com/v2';
const BOARDING_LOCKED = ['Pending MID', 'Active', 'Active (Existing)'];
const SIGNED_STATUSES = new Set(['application signed', 'Signed']);
const REVOKE_REASON = 'Application demoted for modifications';

function __b64uDecode(str: string): Uint8Array {
  const pad = (4 - (str.length % 4)) % 4;
  const bin = atob(str.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat(pad));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

type PortalActor = {
  actor: 'merchant' | 'admin';
  corporateId?: string;
  email?: string;
  imp?: boolean;
};

async function getPortalActor(req: Request, base44: any): Promise<PortalActor | null> {
  try {
    const m = (req.headers.get('Authorization') || '').match(/^Bearer\s+(.+)$/i);
    const parts = m ? m[1].split('.') : [];
    const secret = Deno.env.get('MERCHANT_JWT_SECRET');
    if (parts.length === 3 && secret) {
      const key = await crypto.subtle.importKey(
        'raw',
        new TextEncoder().encode(secret),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['verify'],
      );
      const ok = await crypto.subtle.verify(
        'HMAC',
        key,
        __b64uDecode(parts[2]),
        new TextEncoder().encode(`${parts[0]}.${parts[1]}`),
      );
      if (ok) {
        const payload = JSON.parse(new TextDecoder().decode(__b64uDecode(parts[1])));
        if (payload.corporateId && typeof payload.exp === 'number' && Date.now() < payload.exp * 1000) {
          return {
            actor: 'merchant',
            corporateId: String(payload.corporateId),
            email: payload.email ? String(payload.email) : undefined,
            imp: payload.imp === true,
          };
        }
      }
    }
  } catch { /* fall through */ }
  try {
    const user = await base44.auth.me();
    if (user) {
      return {
        actor: 'admin',
        email: user.email ? String(user.email) : undefined,
      };
    }
  } catch { /* no session */ }
  return null;
}

function getMspHeaders() {
  const apiKey = Deno.env.get('MSP_APP_KEY');
  const appId = Deno.env.get('MSP_APP_ID') || 'cliqbux';
  if (!apiKey) throw new Error('MSP_APP_KEY is not set');
  return { 'X-API-KEY': apiKey, 'X-App-ID': appId, 'Content-Type': 'application/json' };
}

function isSigSigned(s: any): boolean {
  const st = String(s?.status || s?.signerstatus || '').toLowerCase();
  return st === 'signed' || st === 'complete' || st === 'completed';
}

function parseAllowlist(): Set<string> {
  const raw = Deno.env.get('UNLOCK_ADMIN_EMAILS') || '';
  return new Set(
    raw.split(/[,;\s]+/).map((e) => e.trim().toLowerCase()).filter(Boolean),
  );
}

function isAllowlistedAdmin(email?: string): boolean {
  if (!email) return false;
  const list = parseAllowlist();
  if (list.size === 0) return false;
  return list.has(String(email).trim().toLowerCase());
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const corporateId = String(body.corporateId || '').trim();
    const reason = String(body.reason || REVOKE_REASON).slice(0, 500);

    if (!corporateId) {
      return Response.json({ error: 'corporateId required' }, { status: 400 });
    }

    const actor = await getPortalActor(req, base44);
    if (!actor || (actor.actor === 'merchant' && actor.corporateId !== corporateId)) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Plain merchants never unlock
    if (actor.actor === 'merchant' && !actor.imp) {
      return Response.json({
        error: 'Forms are locked while the merchant agreement is out for signature. Contact Cliqbux to unlock and make changes.',
        code: 'UNLOCK_MERCHANT_FORBIDDEN',
      }, { status: 403 });
    }

    const profiles = await base44.asServiceRole.entities.MerchantCorporateProfile.filter(
      { corporateId }, '-created_date', 1,
    );
    const profile = profiles?.[0];
    if (!profile) {
      return Response.json({ error: 'Merchant profile not found' }, { status: 404 });
    }

    const mids = await base44.asServiceRole.entities.MerchantMID.filter({ corporateId }) || [];
    const boardingLocked = mids.filter((m: any) => BOARDING_LOCKED.includes(m.applicationStepStatus));
    if (boardingLocked.length) {
      return Response.json({
        error: 'Cannot unlock — one or more MIDs are already submitted to Elavon (Pending MID / Active). Contact Cliqbux support.',
        code: 'BOARDING_LOCKED',
        lockedMids: boardingLocked.map((m: any) => ({
          id: m.id,
          dbaName: m.dbaName || m.merchantName,
          applicationStepStatus: m.applicationStepStatus,
          mspApplicationNo: m.mspApplicationNo,
        })),
      }, { status: 422 });
    }

    const mspHeaders = getMspHeaders();
    const signers = await base44.asServiceRole.entities.MerchantSigners.filter({ corporateId }) || [];
    const rosterAnyoneSigned = signers.some((s: any) => SIGNED_STATUSES.has(String(s.identityStatus || '')));

    // Inspect packages first — also drives post-sign allowlist gate
    const packageInspect: Array<{
      mid: any;
      appNo: string;
      packageExists: boolean;
      anyoneSigned: boolean;
      inspectError?: string;
    }> = [];

    for (const mid of mids) {
      const appNo = mid.mspApplicationNo ? String(mid.mspApplicationNo) : null;
      if (!appNo) continue;

      let packageExists = false;
      let anyoneSigned = false;
      let inspectError: string | undefined;
      try {
        const statusRes = await fetch(`${MSP_BASE}/applications/${appNo}/signatures`, { headers: mspHeaders });
        if (statusRes.status === 404) {
          packageExists = false;
        } else if (statusRes.ok) {
          const statusData = await statusRes.json().catch(() => ({}));
          const pkgSigners = statusData?.signers || [];
          const envelope = String(statusData?.envelopeStatus || statusData?.status || '').toLowerCase();
          // Live BoldSign package: signers present, or MSP reports an envelope/status
          packageExists = pkgSigners.length > 0
            || (statusData?.success === true && !!envelope && envelope !== 'none')
            || ['new', 'sent', 'out for signature', 'pending', 'inprogress', 'in progress'].includes(envelope);
          anyoneSigned = pkgSigners.some(isSigSigned);
        } else {
          inspectError = `HTTP ${statusRes.status}`;
        }
      } catch (e: any) {
        inspectError = e?.message || String(e);
      }

      packageInspect.push({ mid, appNo, packageExists, anyoneSigned, inspectError });
    }

    const mspAnyoneSigned = packageInspect.some((r) => r.anyoneSigned);
    const anyoneSigned = rosterAnyoneSigned || mspAnyoneSigned;

    if (anyoneSigned) {
      // Post-sign: workspace allowlist only (not impersonation)
      if (actor.actor !== 'admin' || !isAllowlistedAdmin(actor.email)) {
        return Response.json({
          error: anyoneSigned && actor.imp
            ? 'Someone has already signed. Only a Cliqbux admin can unlock — use Applications / Deal Room while logged into the workspace (UNLOCK_ADMIN_EMAILS).'
            : 'Someone has already signed. Only an allowlisted Cliqbux admin can unlock this application.',
          code: 'UNLOCK_ADMIN_REQUIRED',
          anyoneSigned: true,
          rosterAnyoneSigned,
          mspAnyoneSigned,
        }, { status: 403 });
      }
    }

    // Fail-closed if we could not inspect a MID that has an app number
    const hardInspectFail = packageInspect.filter((r) => r.inspectError);
    if (hardInspectFail.length) {
      // Retry: if GET signatures failed, try GET application — if 404, treat as no package
      for (const row of hardInspectFail) {
        try {
          const appRes = await fetch(`${MSP_BASE}/applications/${row.appNo}`, { headers: mspHeaders });
          if (appRes.status === 404) {
            row.packageExists = false;
            row.inspectError = undefined;
          }
        } catch { /* keep error */ }
      }
      const stillBad = packageInspect.filter((r) => r.inspectError);
      if (stillBad.length) {
        return Response.json({
          error: 'Could not verify MSPWare signature packages. Unlock aborted so live signing links are not left active. Retry or void the app in MSPWare.',
          code: 'MSP_INSPECT_FAILED',
          mids: stillBad.map((r) => ({
            midId: r.mid.id,
            mspApplicationNo: r.appNo,
            error: r.inspectError,
          })),
        }, { status: 502 });
      }
    }

    const toVoid = packageInspect.filter((r) => r.packageExists);
    const midResults: any[] = [];

    for (const row of toVoid) {
      const { mid, appNo, anyoneSigned: pkgSigned } = row;
      const result: Record<string, any> = {
        midId: mid.id,
        dbaName: mid.dbaName || mid.merchantName,
        mspApplicationNo: appNo,
        packageExists: true,
        anyoneSigned: pkgSigned,
        signatureRevoke: 'pending',
        draftAction: 'pending',
      };

      // 1) Revoke BoldSign package
      try {
        const delRes = await fetch(`${MSP_BASE}/applications/${appNo}/signatures`, {
          method: 'DELETE',
          headers: mspHeaders,
          body: JSON.stringify({ reason }),
        });
        if (delRes.ok || delRes.status === 404) {
          result.signatureRevoke = delRes.status === 404 ? 'already_gone' : 'revoked';
          result.signatureRevokeHttp = delRes.status;
        } else {
          const txt = await delRes.text().catch(() => '');
          result.signatureRevoke = 'failed';
          result.signatureRevokeHttp = delRes.status;
          result.signatureRevokeBody = txt.slice(0, 200);
        }
      } catch (e: any) {
        result.signatureRevoke = 'unreachable';
        result.signatureRevokeError = e?.message || String(e);
      }

      // 2) Always void the MSPWare application (decision B + packaged-only scope)
      let voided = false;
      try {
        const voidRes = await fetch(`${MSP_BASE}/applications/${appNo}`, {
          method: 'DELETE',
          headers: mspHeaders,
        });
        if (voidRes.ok || voidRes.status === 404) {
          voided = true;
          result.draftAction = voidRes.status === 404 ? 'cleared_404' : 'voided_and_cleared';
          result.draftHttp = voidRes.status;
        } else {
          const cancelRes = await fetch(`${MSP_BASE}/applications/${appNo}`, {
            method: 'PATCH',
            headers: mspHeaders,
            body: JSON.stringify({ status: 'Cancelled' }),
          });
          if (cancelRes.ok || cancelRes.status === 404) {
            voided = true;
            result.draftAction = 'cancelled_and_cleared';
            result.draftHttp = cancelRes.status;
          } else {
            const txt = await cancelRes.text().catch(() => '');
            result.draftAction = 'void_failed';
            result.draftHttp = cancelRes.status;
            result.draftBody = txt.slice(0, 200);
          }
        }
      } catch (e: any) {
        result.draftAction = 'void_unreachable';
        result.draftError = e?.message || String(e);
      }

      if (!voided) {
        midResults.push(result);
        return Response.json({
          error: `Could not retract MSPWare application ${appNo} (${mid.dbaName || mid.merchantName || mid.id}). Unlock aborted — forms stay locked.`,
          code: 'MSP_VOID_FAILED',
          mids: [...midResults],
        }, { status: 502 });
      }

      await base44.asServiceRole.entities.MerchantMID.update(mid.id, {
        mspApplicationNo: null,
        applicationStepStatus: 'Ready to Submit',
      });
      result.mspApplicationNo = null;
      midResults.push(result);
    }

    // Record draft-only MIDs we intentionally kept
    for (const mid of mids) {
      const appNo = mid.mspApplicationNo ? String(mid.mspApplicationNo) : null;
      if (!appNo) continue;
      if (toVoid.some((r) => r.mid.id === mid.id)) continue;
      midResults.push({
        midId: mid.id,
        dbaName: mid.dbaName || mid.merchantName,
        mspApplicationNo: appNo,
        packageExists: false,
        signatureRevoke: 'skipped_no_package',
        draftAction: 'kept_draft_only',
      });
    }

    // Reset signed → verified (KYC kept)
    const signerResets: any[] = [];
    for (const s of signers) {
      if (!SIGNED_STATUSES.has(String(s.identityStatus || ''))) continue;
      const updated = await base44.asServiceRole.entities.MerchantSigners.update(s.id, {
        identityStatus: 'verified',
        signedAt: null,
      });
      signerResets.push({
        id: s.id,
        email: s.signerEmail,
        from: s.identityStatus,
        to: updated?.identityStatus || 'verified',
      });
    }

    const prevStatus = profile.applicationStatus;
    const prevLock = profile.portalLockStatus || 'unlocked';
    const profilePatch: Record<string, any> = {
      portalLockStatus: 'unlocked',
      pricingContractSnapshot: null,
    };
    if (prevStatus === 'Submitted') {
      profilePatch.applicationStatus = 'Incomplete';
    }
    const updatedProfile = await base44.asServiceRole.entities.MerchantCorporateProfile.update(
      profile.id,
      profilePatch,
    );

    try {
      const stages = await base44.asServiceRole.entities.StagedApplication.filter({ corporateId });
      const auto = (stages || []).find((st: any) => st.label === '__auto_track__');
      if (auto) {
        let pre = auto.prefilledData || {};
        if (typeof pre === 'string') {
          try { pre = JSON.parse(pre); } catch { pre = {}; }
        }
        const events = Array.isArray(pre.activity) ? pre.activity.slice(-40) : [];
        events.push({
          type: 'application_demoted',
          at: new Date().toISOString(),
          actor: actor.actor,
          imp: !!actor.imp,
          email: actor.email || null,
          anyoneSigned,
          reason,
        });
        await base44.asServiceRole.entities.StagedApplication.update(auto.id, {
          prefilledData: {
            ...pre,
            applicationStatus: updatedProfile.applicationStatus,
            portalLockStatus: 'unlocked',
            activity: events,
          },
        });
      }
    } catch (trackErr: any) {
      console.warn('[demoteApplication] auto-track update failed:', trackErr?.message);
    }

    console.log(
      `[demoteApplication] corporateId=${corporateId} by ${actor.actor}` +
      `${actor.imp ? '(imp)' : ''} email=${actor.email || '-'} ` +
      `voided=${toVoid.length} keptDrafts=${midResults.filter((r) => r.draftAction === 'kept_draft_only').length} ` +
      `lock ${prevLock}→unlocked`,
    );

    return Response.json({
      success: true,
      hubspotBypass: !/^\d+$/.test(corporateId),
      reason,
      anyoneSigned,
      previous: { applicationStatus: prevStatus, portalLockStatus: prevLock },
      profile: {
        corporateId,
        applicationStatus: updatedProfile.applicationStatus,
        portalLockStatus: updatedProfile.portalLockStatus || 'unlocked',
      },
      mids: midResults,
      signerResets,
      message: 'Application unlocked. Packaged MSPWare apps were retracted. Run Prepare form, then Sign again.',
    });
  } catch (error: any) {
    console.error('[demoteApplication]', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
