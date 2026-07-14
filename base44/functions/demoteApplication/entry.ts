import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// ─── demoteApplication ────────────────────────────────────────────────────────
// Revokes outstanding MSPWare/BoldSign packages and unlocks portal forms so
// agents (or the merchant) can edit locations/MIDs/banking/signers, then
// regenerate agreements via signApplication.
//
// BoldSign is mediated by MSPWare — we do NOT call BoldSign's revoke API
// directly (no BoldSign API key in this stack). Invalidation path:
//   DELETE /applications/{no}/signatures  → voids the BoldSign envelope
// If that fails after anyone has signed, fall back to voiding the MSPWare
// draft (DELETE /applications/{no}) and clearing mspApplicationNo so a fresh
// draft can be created. Never clear mspApplicationNo except on explicit 404
// or intentional void in this demote path.
//
// POST /functions/demoteApplication
// Body: { corporateId, reason?: string }
//
// Auth: getPortalActor — merchant JWT (own corporateId) or admin session.
// Refuses demotion when any MID is already Pending MID / Active / Active (Existing).

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

async function getPortalActor(req: Request, base44: any): Promise<{ actor: 'merchant' | 'admin'; corporateId?: string } | null> {
  try {
    const m = (req.headers.get('Authorization') || '').match(/^Bearer\s+(.+)$/i);
    const parts = m ? m[1].split('.') : [];
    const secret = Deno.env.get('MERCHANT_JWT_SECRET');
    if (parts.length === 3 && secret) {
      const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
      const ok = await crypto.subtle.verify('HMAC', key, __b64uDecode(parts[2]), new TextEncoder().encode(`${parts[0]}.${parts[1]}`));
      if (ok) {
        const payload = JSON.parse(new TextDecoder().decode(__b64uDecode(parts[1])));
        if (payload.corporateId && typeof payload.exp === 'number' && Date.now() < payload.exp * 1000) {
          return { actor: 'merchant', corporateId: String(payload.corporateId) };
        }
      }
    }
  } catch { /* fall through */ }
  try {
    const user = await base44.auth.me();
    if (user) return { actor: 'admin' };
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

    const profiles = await base44.asServiceRole.entities.MerchantCorporateProfile.filter(
      { corporateId }, '-created_date', 1
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
    const midResults: any[] = [];

    for (const mid of mids) {
      const appNo = mid.mspApplicationNo ? String(mid.mspApplicationNo) : null;
      const row: Record<string, any> = {
        midId: mid.id,
        dbaName: mid.dbaName || mid.merchantName,
        mspApplicationNo: appNo,
        signatureRevoke: 'skipped_no_application',
        draftAction: 'kept',
      };

      if (!appNo) {
        midResults.push(row);
        continue;
      }

      // 1) Inspect signature package
      let anyoneSigned = false;
      let packageExists = false;
      try {
        const statusRes = await fetch(`${MSP_BASE}/applications/${appNo}/signatures`, { headers: mspHeaders });
        if (statusRes.status === 404) {
          row.signatureRevoke = 'no_package';
        } else if (statusRes.ok) {
          const statusData = await statusRes.json().catch(() => ({}));
          const signers = statusData?.signers || [];
          packageExists = !!statusData?.success && signers.length > 0;
          anyoneSigned = signers.some(isSigSigned);
          row.packageExists = packageExists;
          row.anyoneSigned = anyoneSigned;
        } else {
          row.signatureInspectHttp = statusRes.status;
        }
      } catch (e: any) {
        row.signatureInspectError = e?.message || String(e);
      }

      // 2) Revoke BoldSign package via MSPWare (invalidates signer links)
      if (packageExists || row.signatureRevoke !== 'no_package') {
        try {
          const delRes = await fetch(`${MSP_BASE}/applications/${appNo}/signatures`, {
            method: 'DELETE',
            headers: mspHeaders,
            // MSPWare may ignore body; reason is logged for audit + returned to caller
            body: JSON.stringify({ reason }),
          });
          if (delRes.ok || delRes.status === 404) {
            row.signatureRevoke = delRes.status === 404 ? 'already_gone' : 'revoked';
            row.signatureRevokeHttp = delRes.status;
          } else {
            const txt = await delRes.text().catch(() => '');
            row.signatureRevoke = 'failed';
            row.signatureRevokeHttp = delRes.status;
            row.signatureRevokeBody = txt.slice(0, 200);
          }
        } catch (e: any) {
          row.signatureRevoke = 'unreachable';
          row.signatureRevokeError = e?.message || String(e);
        }
      }

      // 3) If anyone had signed and revoke failed, void the MSPWare draft so
      //    signApplication can create a clean package (Critical Lesson #5: only
      //    clear mspApplicationNo on intentional void / 404 — this is intentional).
      const revokeFailed = row.signatureRevoke === 'failed' || row.signatureRevoke === 'unreachable';
      if (anyoneSigned && revokeFailed) {
        try {
          const voidRes = await fetch(`${MSP_BASE}/applications/${appNo}`, {
            method: 'DELETE',
            headers: mspHeaders,
          });
          if (voidRes.ok || voidRes.status === 404) {
            await base44.asServiceRole.entities.MerchantMID.update(mid.id, {
              mspApplicationNo: null,
              applicationStepStatus: 'Ready to Submit',
            });
            row.draftAction = voidRes.status === 404 ? 'cleared_404' : 'voided_and_cleared';
            row.mspApplicationNo = null;
          } else {
            // Fallback PATCH Cancelled — still clear local number so we don't reuse a stuck package
            const cancelRes = await fetch(`${MSP_BASE}/applications/${appNo}`, {
              method: 'PATCH',
              headers: mspHeaders,
              body: JSON.stringify({ status: 'Cancelled' }),
            });
            await base44.asServiceRole.entities.MerchantMID.update(mid.id, {
              mspApplicationNo: null,
              applicationStepStatus: 'Ready to Submit',
            });
            row.draftAction = cancelRes.ok ? 'cancelled_and_cleared' : 'cleared_local_only';
            row.mspApplicationNo = null;
          }
        } catch (e: any) {
          // Still unlock locally — merchant can edit; next sign may need admin retract
          await base44.asServiceRole.entities.MerchantMID.update(mid.id, {
            mspApplicationNo: null,
            applicationStepStatus: 'Ready to Submit',
          });
          row.draftAction = 'cleared_local_msp_unreachable';
          row.draftError = e?.message || String(e);
          row.mspApplicationNo = null;
        }
      } else if (mid.applicationStepStatus === 'Error') {
        // Leave draft number; form can be refilled after unlock
        row.draftAction = 'kept_error_status';
      }

      midResults.push(row);
    }

    // 4) Reset signers who completed agreement signing → verified (KYC preserved)
    const signers = await base44.asServiceRole.entities.MerchantSigners.filter({ corporateId }) || [];
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

    // 5) Unlock portal forms + demote Submitted → Incomplete
    const prevStatus = profile.applicationStatus;
    const prevLock = profile.portalLockStatus || 'unlocked';
    const profilePatch: Record<string, any> = {
      portalLockStatus: 'unlocked',
      // Clear frozen pricing so the next signing cycle re-compiles from live fees
      pricingContractSnapshot: null,
    };
    if (prevStatus === 'Submitted') {
      profilePatch.applicationStatus = 'Incomplete';
    }
    const updatedProfile = await base44.asServiceRole.entities.MerchantCorporateProfile.update(
      profile.id,
      profilePatch
    );

    // Best-effort auto-track breadcrumb (non-fatal)
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
      `[demoteApplication] corporateId=${corporateId} by ${actor.actor} ` +
      `lock ${prevLock}→unlocked status ${prevStatus}→${updatedProfile.applicationStatus} ` +
      `mids=${midResults.length} signerResets=${signerResets.length}`
    );

    return Response.json({
      success: true,
      hubspotBypass: !/^\d+$/.test(corporateId),
      reason,
      previous: { applicationStatus: prevStatus, portalLockStatus: prevLock },
      profile: {
        corporateId,
        applicationStatus: updatedProfile.applicationStatus,
        portalLockStatus: updatedProfile.portalLockStatus || 'unlocked',
      },
      mids: midResults,
      signerResets,
      message: 'Application unlocked. Signature links are invalid. Re-save any edits, then prepare signing again.',
    });
  } catch (error: any) {
    console.error('[demoteApplication]', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
