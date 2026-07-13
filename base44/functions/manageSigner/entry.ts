import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// ─── Portal auth (inlined) ─────────────────────────────────────────────────────────────────────
// Base44 bundles each function in isolation, so this is duplicated from
// base44/functions/helpers/auth.ts — keep both copies in sync.
// getPortalActor returns { actor: 'merchant', corporateId } when the request
// carries a valid merchant JWT (issued by validateResumeToken, createHubspotDeal,
// or manageStagedApplication 'validate'), { actor: 'admin' } when it carries a
// Base44 workspace session, or null when neither. Callers must 401 on null and
// enforce corporateId match for merchant actors.
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
  } catch { /* invalid merchant token — fall through to workspace check */ }
  try {
    const user = await base44.auth.me();
    if (user) return { actor: 'admin' };
  } catch { /* no workspace session */ }
  return null;
}


function generateToken() {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

function getVerifyBaseUrl() {
  const configured = Deno.env.get('PUBLIC_APP_URL');
  const appId = Deno.env.get('BASE44_APP_ID');
  if (configured && configured.startsWith('http')) return configured.replace(/\/$/, '');
  if (appId) return `https://${appId}.base44.app`;
  return 'https://onboarding.cliqbux.com';
}

// --- email brand (copied from helpers/emailBrand.ts — Base44 cannot import helpers) ---
const CLIQBUX_EMAIL_LOGO_CID = 'cliqbux-logo';
const CLIQBUX_EMAIL_LOGO_B64 = 'iVBORw0KGgoAAAANSUhEUgAAADcAAAA+CAYAAACP1IOOAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAA/HSURBVGhD7VoJdFRVtn0ZKikqNaUSMhGQFkFQlgO26IdWmclclSKEocHuFhW6AT8ahXaAiB34jEEgQaaAMTVkKJJUAgKtQmUOZATDYJOkmRRsgyDKEEjV/uvcVxUqL2GShI9r/bPWXXlV79XJ3e+cu8+59xyO6zoRRT+leGLPmtAhBZ9oE6o/DS+sTx/VdGhdUFNZgrT4q4SgDzZN93tpYJ/AHsIfPnAi5rjA/5n+1BO5yyOml28IM9akhjcczwyHzRIDHBgPHIgFyiIBszdgdgPyPHFVJ0Fjsuynuo9lJV8t8N+YMS9QExej6M1xQWKh/vspnuHP9XjEtGLsmAPG8HdrU0OKDhnCfjq/UwPsnwDUTgSqo4HySKA4CrBEwWbRwFoQhuuZMkDHAXoOMHKAiQPMLgwsMjxxar3k2oFEZUPZYnm6Pi545rSx8pc4jpMLJ9CZIk+c88LTFVu0kxpM2nXVaaMaTuSOvmorjAWqJgM1McB+LVCiBgojYSugEeU01LAV8OBaMuSw6TjY9O0HA5vJATkckO8GmLxwbrMn6j6Wfb9/uc+uPR/4vLfqlYde6BvsHSSc4G1F6ekZrA0b0GtO7PNPJ01/cvJh3fi5VVsiio6ZIr47v1sN7J8I1E4AqrRAeRRQqIbNQhN3BtLRuDNwzuO60QVWgwuQwQHZrrxlzWJcTvNCfbLsQtliv4NFSwKWfvIn1eToQarJU0N6hL48XPkYx3GyNqC2fTx6Ql1WhOWQfsTl49mhzWd3RMNWNI63SI0G2KcFijV2q9A6IjdTo6UgClb2nRCMcNw9OJveBTYDB9BwWFbvAqS7ANvIlQmwCC3pEjRtkeOHrUqc/ERqPbRKeiptdo8lHOcv4bIXjZxxff8U4GAMsC8aKIsGSqOAIgIQBWuBGiiIgM1CQzBhS0cu2NG4e3BkNQaOAOldYTVwsOpdYdO5su9b7KCRzvHWpZHpBuS4A9sVSJmuyuJOmtUlODCBTRRsssJJOdxOeO9uxt2D63AYOvjOaVhpzercgFwXHF/r/TNXvXV0EyqjOwHArUYngbvNIOuSZZHFodmgaOIqN434ERWaDibUmeM+gaN1qnNnLnpNL27iKlJGnkOl1j6JO7XcnTCk86CXp4GtMBQ2e5wTTqyzBnQ8wzYbCNzm0XZwNOHbgwNRP1ubEWywAM3uOX6rhpXdi2SkhLIooIIylMlARQSQ6wuY3YFcimN2QrBPiiZHb5+5F7smInH6TKRC104MKhx0n2JlM1mukoGjNXdn4GyFYbAVhMFKYYC5GllFDRRHAmVqoIJCyHigRotrRWqcyg63NmSO/KYubVzqljcHLUya5veWJcEvpW6l8nDDGom1WecFmD2BPHc+nhHjGW+QB9LsE6eYR+tJ52b/3B7YPYNjoaEwCiiNBPZrGAjUjANKYnA2LwL1GaGnv9ZrcsvWj3hr5YzHJ0wPf/ERjuPc2wRWXlwohVs2KUC7b7HP7NKl/ruPJ8lONm3wBEwSO2AXINtO8w6w5Ha6G9YUjjsHR+GhTANyW+yPBqpjgOrJQNk4/GdnGI5lqZsO68Z9WbUpMn7FjGen/Tmi3+85jpMIUdyFiOM04kFJU3xmVyzxWXokyafkxFrxL1dTPYHcbkC+Jw+WDZdWwHcBzk4WlnCgXIszOREtR/RR/z6cHn75qDGsvCxl9Oq0BSNfjpsyYLAXx3kLZ9fZEtLHu0fCRGlYxhyfD2pXdE8/skZ1onaF8rvalfJzyBTBZnCFjYI7MaU92HcIDiwLoXWkZlnKme1RzXEx/cM4jusWEODRS/iPf42kzgmYUrY8cHbyVGVszDOqUZwkwEf4zK2lvxfH9VJynLJn6ULvarZ9IjJiRGPPRzsEx1iOT7tQOQH1xtA6oep7le8+Cz6G3Z5oMUpwZqMMx9ZIfjiRJCmpWtlra85c1Yc5c33HvDLCb5hPr17+wt8KJW2mciVyJHbLubJU7eaWc4Ajyq+ciEZT5EGhwnuVn40BlWzNOLY3dJ3rCuSLALMI1kwxvt+kxLG1sgv1q6Q1lQmq3LwFv3tv5KOivkJd6TMVycgRoyWdXPIG0XQI7gahRABV49GwLeJrocJ7lYuGoEoiA+f41UoEznu6LMdWRwTslODwGsXpv0fK+zjr0s3yZeAoKXDEQJZQO4J4W3AR/BbGogaqxqHR1PngfjIGM8u1Y7kOaN0xGOidEmTNUSU56zKQ5XI9WwM66bhucGMv57JOev4m4DRdBu7CTcDdajBweR4oiPdOddbF3JLAtQZ8N1hpV2B2QX2i77nfBDg2cbM7CuZLU5x1CcG1UFigdC7XC9lvBb73mwDHW84dlvhbg7PRet0hxhcLuldwHOf6AIPjE2lHkkznJ5Z4ZRtwGX/1S0Z2NwaKseUOd1QvUZ4e0lvWjz3wYIPjh9XoApg9UDBf3gacbhZZzssOzAPFC5Wnhj6mGtD6wAMLznF+QjsBxpYifJUg3+qsS/cGxblusJlEqFnmX/w7ZUBP5/sPDDgGgAARIbAYR6xHcc4DLFDnyJA3V77ZWVf6G5Jk7PTA0UQpOE7SLsjfd3CXjD34DIVA0GaVDmDNIiDfAzB54NJnEtSvkaF+reRYY5LctCc+cGXe/Ee1MYOkYc/0lbTJQw3MLcW4kuaOI6ul39Su7anXvyN/d3h/dn55/8Gd+bT3N7Q+Lm6VUZ3gUkOSpObgMm9zzZqH306bpQiLC1c8Hqj0+UMvedBTsf8l+/3MEJfXChJUM0/pHl6ti1PNddbVypbEkjkuwHZ3IMcDx9Ypr37xj8B59x3c7tUDB5Ws8nlhaO/uo0SiAY8EKRRPaJ51ez5hqirG/GbPvx9P9NlSnySvaUyS/3xhqxTI8mBkgj1eKFqgMDjrahcK2Fol8nHFhVRpy30HN3Os75gd83z+UZ+s2NywQVX97yTp1YtbxUAWbUbFfI2A3JbWHTtfoU0pFUpEKLhNnGMHufR8lhuuGW+aW3YduBMbe/4LX9ARgivvSrTu7McIRCp0QNRij1uUK7YY7SfPLP1qGwqE4Gx6N34/l+6KqzdPnLsO3KUMnlDasGQra/LbFse1I9Png7gHLLcFx7+Ym2x5uh7czULBrQYPTnQH4G55hvL/4O5J/o/B8bU3KjA2msIfKHDFwi0PC+J3DC7SCVz0gwUuT4SihQLLOcA5PffbBJfvjs/ny3TOuu4JXH1W+AFnZZ0hvwoci3NybJgZHOesyzjLe/UtwfElrA7WXGU0jmWENjgr6wy5Fbg2dQBHfKNMZZcYFUtUh/v16yd11pXxhuJTCu6tRRMHOCo+8uCG8yUsC1VrbtQKUKTG5cJoZHw05D1nhfcqHYOjQ1U3PhuhIE59KlkubKfwnxQ5ij8KNKufCQx21jNjbM8/HF0nvUipVovBvbVWzhKBTA5X9ZImrnLjyAuoIHDRbdsu6NSZCv/l41GXqdm5aNqTQ5yV/1rpGJx9Ug5LbRfju03Kq1++r8p/M8T/ReffSznpQ9lxysRvU+RXYHKHLc3dftLsyl4O05HhgmsGSRN3KC3iNKqo6hnerlzFqjyFEawj6Nw/1fjqk5CNgx/rc2Mb/yukI3BsQiayVDec2CC9XLrcP3nWpF6PCn+7Ybrs9Zol8vMwe7GXQHlocwbf7cCKIHp3Xl8Wh18MknNcY0aUGQcnsP4SVjW1EwsPMJoVRawEslQNHIxFfXbUxa3xQ+NvUnO7rTiDY0RBOwCzGA1J8ks73vdfr31J1Q7U+1rVyOplvnusJinfSkXZP61NSrB1brCSS7MdgSusVBPP41C3xOcX7qNXH5/aXBIL7KPqDlV5KEOh0m8kWhg4YlAeOFWBqDkAVRPQaI4u35AwNEQ4kdvJRX1wJXJpc0ktFWIcWSu7kP2O3+qxT3Z/SPhs5ADfPnsW+m754VM5kOdmB3VjnfIFft4lCSDtIlgTzg4JUmeo1jMlafFD48/ujrlMlkFJJGx7NUBBGEDdQu1cNYp9T4XIX4piUa0fa3xjyhOPCyd2M7mQ1rMBuyQ48rHibN67fvN7qlSBwmc4Ti4zxPm835is/BHbPYBt/PZHuEYJIO0C2Fqj3UCeG342yJHxtiq7TRH0o9eeH1i9JeTzK0XRwAGq+ESz9qd24JjL0gvQAvRsbSxO71A3m5YNWyeVShVt5tiBZMf3XVi4rPcsjvPvLrxHsuwvyj9WJyqPkKsSKL7zwV5/EwDkQwc1DrgB26SoSZQfXDI1KFqos1U2JQyNOJwVfgiVk/lSsaCUTG7KmJWui0LtpWUtUBuDb7drj6YsGPY3oc47kdfC/AfvXei/q9lIDQCubD0yt3MAY2tKAI42uvm0XhU/ZLwdRAFeJNTbkXjsWT/6zRP5miYcmMQ69PjeLw2slnGsjQpUVrZXYSnwg+p7ldQ/NgmVqep9H7zydKRQaUfS1zs46PMPfVecTlE08z2XfLXGQe9EGvzxgb2Lge6RC+aLcGazzLr3w+7rh/TryLVvI38MGdijJDVy44//JMuMB4oiYS0IR0tRCKyMbKIZ2Thblp6hbr/zX8Zg19rQzNfHD2p7UNoqT7vr5vj/rT5ZcZq5YFZbq7A+LuZ69JmA8QV+6l+xZnihcJGydF5UwAtCrXcti15/dkSFfkwp9o0HKslyZElH11FbcIxdiXSosfTrGJwya8+bVwxbumL2i0/NVE9RvTy8z8Mrp8r+WrVUtQ/bZDxrtiMLvkGNiIKneHvLhrkbDq2SH095vfufhXO8ZzEtHzXlqCnsFGvzLSe3jGDNNjfA8fkp9tK61PKMuz8CqIzFuZ0TcTYv8vzJLT2u2NLFQK6otZmGxat24FxwzejKHx7ldsOJdYpLufP8FnHc7UnrXkSZnTg86dv8qCssdJQSED7Z5l2UmkxpLVLTqf0vxcmycUB5KJCjtG8uKS7xrRUUiNuAIxZk1O6Knz7zwt7Fful/eimgXXDvMpk77bH+BRtGf36JCKY2hqVpVhb8qXuWd1VyX743jNYq3Wvbtec43eITZ8e1vRZukqJksXfd4sl+4cL/fd8kdf6wMV8bxtaxnq/9sfbuWg2uFxHxkOvyViWLOsBZ7eBYnLLnlmRFZLmydXVwjXfT1pmB/32n1N7VIkqLHzy/Pif0HGonMVe1WsJgtWiZFa2F1AJyo9+SZRvEfOyM0t6kvd0dp9dLrcbZvoZgz+C77z7vanlxYGCPXYljPjuzazxwcBxALmqPhe3AORLnPBGupsvw5QJFyewQ7+eEOh84iX918HOlKaEl1lItO65gIcJCcTG81S1ZY1quGBXLVCeSXlVNFup44CX5nWemHzKOOYlqio/U9T4WMFOGL6IOoSvGOFV8V1N7V4syc/GIlccyNN/biqPONW7p9b0lwWfDqL6q/sIHO1v+F4QtTXw6RkMKAAAAAElFTkSuQmCC';
function emailLogoHeaderHtml(): string {
  return `<table cellpadding="0" cellspacing="0" role="presentation" align="center" style="margin:0 auto;">
  <tr>
    <td style="padding:0 12px 0 0;vertical-align:middle;">
      <img src="cid:${CLIQBUX_EMAIL_LOGO_CID}" width="28" height="31" alt="Cliqbux" style="display:block;border:0;outline:none;text-decoration:none;width:28px;height:31px;" />
    </td>
    <td style="vertical-align:middle;color:#ffffff;font-size:20px;font-weight:700;letter-spacing:-0.03em;font-family:Poppins,Inter,Arial,sans-serif;line-height:1;">cliqbux</td>
  </tr>
</table>`;
}
function resendInlineLogoAttachment() {
  return {
    filename: 'cliqbux-mark.png',
    content: CLIQBUX_EMAIL_LOGO_B64,
    content_id: CLIQBUX_EMAIL_LOGO_CID,
  };
}
// --- end email brand ---

async function sendViaResend(to: string, subject: string, html: string): Promise<void> {
  const apiKey = Deno.env.get('RESEND_API_KEY');
  if (!apiKey) throw new Error('RESEND_API_KEY not set');
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: 'Cliqbux Onboarding <onboarding@onboarding.cliqbuxpos.com>',
      to,
      subject,
      html,
      attachments: [resendInlineLogoAttachment()],
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Resend error ${res.status}: ${err}`);
  }
}

// Unified remote loop (2026-07-13): one email = identity KYC + BoldSign session.
// Link uses intent=sign so /verify routes Verified signers straight into their iframe.
function buildInviteEmail(firstName: string, verifyUrl: string, businessName: string | null): string {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:Inter,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:40px 16px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
        <tr>
          <td style="background:#111827;padding:28px 40px;text-align:center;">
            ${emailLogoHeaderHtml()}
          </td>
        </tr>
        <tr>
          <td style="padding:36px 40px;">
            <p style="margin:0 0 8px;font-size:13px;font-weight:600;color:#6B7280;text-transform:uppercase;letter-spacing:0.06em;">Action Required</p>
            <h1 style="margin:0 0 16px;font-size:22px;font-weight:800;color:#111827;line-height:1.3;">Verify Identity &amp; Sign Your Agreement</h1>
            <p style="margin:0 0 24px;font-size:15px;color:#374151;line-height:1.6;">
              Hi ${firstName},<br><br>
              You've been added as a <strong>beneficial owner</strong> on the <strong>${businessName || 'Cliqbux'}</strong> merchant application. One secure link covers both steps: confirm your identity, then sign the Merchant Processing Agreement — no second email.
            </p>
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td align="center" style="padding:8px 0 28px;">
                  <a href="${verifyUrl}" target="_blank" style="display:inline-block;background:#111827;color:#ffffff;font-size:15px;font-weight:700;padding:14px 36px;border-radius:10px;text-decoration:none;letter-spacing:0.01em;">
                    Verify &amp; Sign →
                  </a>
                </td>
              </tr>
            </table>
            <p style="margin:0 0 8px;font-size:13px;color:#6B7280;line-height:1.6;">
              This link is unique to you — please do not share it. It expires after 7 days.
            </p>
            <hr style="border:none;border-top:1px solid #E5E7EB;margin:24px 0;">
            <p style="margin:0;font-size:12px;color:#9CA3AF;">
              Having trouble? Copy and paste this link into your browser:<br>
              <span style="color:#3B82F6;word-break:break-all;">${verifyUrl}</span>
            </p>
          </td>
        </tr>
        <tr>
          <td style="background:#F9FAFB;border-top:1px solid #E5E7EB;padding:20px 40px;text-align:center;">
            <p style="margin:0;font-size:12px;color:#9CA3AF;">© ${new Date().getFullYear()} Cliqbux · onboarding.cliqbux.com</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function buildSigningInviteUrl(token: string): string {
  return `${getVerifyBaseUrl()}/verify?token=${encodeURIComponent(token)}&intent=sign`;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const { action, corporateId, signerId, signerData, sendInvite } = body;

    if (!corporateId) return Response.json({ error: 'corporateId required' }, { status: 400 });

    const actor = await getPortalActor(req, base44);
    if (!actor || (actor.actor === 'merchant' && actor.corporateId !== String(corporateId))) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }


    // --- CREATE ---
    if (action === 'create') {
      const token = generateToken();
      let record;
      try {
        record = await base44.asServiceRole.entities.MerchantSigners.create({
          corporateId,
          firstName: signerData.firstName,
          lastName: signerData.lastName,
          signerEmail: signerData.signerEmail,
          ownershipPercentage: Number(signerData.ownershipPercentage) || 0,
          isPrimarySigner: signerData.isPrimarySigner || false,
          identityStatus: 'Pending Invitation',
          verifyToken: token,
          dobYear: signerData.dobYear || '',
          dobMonth: signerData.dobMonth || '',
          dobDay: signerData.dobDay || '',
          ssn: signerData.ssn || '',
          homeStreet: signerData.homeStreet || '',
          homeCity: signerData.homeCity || '',
          homeState: signerData.homeState || '',
          homeZip: signerData.homeZip || '',
          corporatePhone: signerData.corporatePhone || '',
        });
      } catch (createErr: any) {
        console.error('[manageSigner] create failed:', createErr.message);
        return Response.json({ error: `Failed to create signer record: ${createErr.message}` }, { status: 500 });
      }

      let emailError: string | null = null;
      if (sendInvite) {
        try {
          const verifyUrl = buildSigningInviteUrl(token);
          await sendViaResend(
            signerData.signerEmail,
            `Action Required: Verify & Sign — ${signerData.legalName || 'Cliqbux'} Merchant Application`,
            buildInviteEmail(signerData.firstName, verifyUrl, signerData.legalName)
          );
          await base44.asServiceRole.entities.MerchantSigners.update(record.id, { identityStatus: 'Sent', verifyTokenSentAt: new Date().toISOString() });
          record.identityStatus = 'Sent';
        } catch (emailErr: any) {
          console.error('[manageSigner] email send failed:', emailErr.message);
          emailError = emailErr.message;
        }
      }

      return Response.json({ success: true, signer: record, ...(emailError ? { emailError } : {}) });
    }

    // --- UPDATE ---
    if (action === 'update') {
      if (!signerId) return Response.json({ error: 'signerId required' }, { status: 400 });
      const ALLOWED = ['firstName','lastName','signerEmail','ownershipPercentage','isPrimarySigner',
        'identityStatus','dobYear','dobMonth','dobDay','ssn','homeStreet','homeCity','homeState','homeZip','corporatePhone','idDocumentUrl','titleType'];
      const update: Record<string, any> = {};
      for (const key of ALLOWED) {
        if (signerData[key] !== undefined) update[key] = signerData[key];
      }
      const updated = await base44.asServiceRole.entities.MerchantSigners.update(signerId, update);
      return Response.json({ success: true, signer: updated });
    }

    // --- SEND INVITE (unified Verify + Sign remote loop) ---
    // Same action name as before — URL now includes intent=sign so /verify
    // continues into the BoldSign iframe after KYC. Do not split into two emails.
    if (action === 'sendInvite' || action === 'sendSigningInvite') {
      if (!signerId) return Response.json({ error: 'signerId required' }, { status: 400 });
      const signers = await base44.asServiceRole.entities.MerchantSigners.filter({ corporateId });
      const signer = signers.find((s: any) => s.id === signerId);
      if (!signer) return Response.json({ error: 'Signer not found' }, { status: 404 });

      // Resolve business name for the email subject/body
      let businessName: string | null = null;
      try {
        const profiles = await base44.asServiceRole.entities.MerchantCorporateProfile.filter({ corporateId });
        businessName = profiles?.[0]?.legalName || null;
      } catch { /* non-fatal */ }

      const token = signer.verifyToken || generateToken();
      const verifyUrl = buildSigningInviteUrl(token);

      await sendViaResend(
        signer.signerEmail,
        `Action Required: Verify & Sign — ${businessName || 'Cliqbux'} Merchant Application`,
        buildInviteEmail(signer.firstName, verifyUrl, businessName)
      );

      const updated = await base44.asServiceRole.entities.MerchantSigners.update(signerId, {
        identityStatus: 'Sent',
        verifyToken: token,
        verifyTokenSentAt: new Date().toISOString()
      });
      return Response.json({ success: true, signer: updated });
    }

    // --- MARK SIGNED (local persistence — never poll MSPWare from admin list UIs) ---
    if (action === 'markSigned') {
      if (!signerId) return Response.json({ error: 'signerId required' }, { status: 400 });
      const signers = await base44.asServiceRole.entities.MerchantSigners.filter({ corporateId });
      const signer = signers.find((s: any) => s.id === signerId);
      if (!signer) return Response.json({ error: 'Signer not found' }, { status: 404 });
      if (signer.identityStatus === 'Signed') {
        return Response.json({ success: true, signer });
      }
      const updated = await base44.asServiceRole.entities.MerchantSigners.update(signerId, {
        identityStatus: 'Signed',
      });
      return Response.json({ success: true, signer: updated });
    }

    // --- DELETE ---
    if (action === 'delete') {
      if (!signerId) return Response.json({ error: 'signerId required' }, { status: 400 });
      await base44.asServiceRole.entities.MerchantSigners.delete(signerId);
      return Response.json({ success: true });
    }

    // --- LIST ---
    if (action === 'list') {
      const signers = await base44.asServiceRole.entities.MerchantSigners.filter({ corporateId });
      return Response.json({ success: true, signers });
    }

    // --- INLINE VERIFY ---
    if (action === 'inlineVerify') {
      if (!signerId) return Response.json({ error: 'signerId required' }, { status: 400 });
      const ALLOWED = ['dobYear','dobMonth','dobDay','ssn','homeStreet','homeCity','homeState','homeZip','corporatePhone','idDocumentUrl','titleType'];
      const update: Record<string, any> = { identityStatus: 'Verified' };
      for (const key of ALLOWED) {
        if (signerData && signerData[key] !== undefined) update[key] = signerData[key];
      }
      const updated = await base44.asServiceRole.entities.MerchantSigners.update(signerId, update);
      return Response.json({ success: true, signer: updated });
    }

    // --- LOOKUP BY EMAIL ---
    if (action === 'lookupByEmail') {
      const { signerEmail } = body;
      if (!signerEmail) return Response.json({ found: false });
      const allMatches = await base44.asServiceRole.entities.MerchantSigners.filter({ signerEmail });
      const prior = allMatches.find((s: any) =>
        s.corporateId !== corporateId &&
        s.identityStatus === 'Verified' &&
        s.dobYear && s.ssn
      );
      if (!prior) return Response.json({ found: false });
      return Response.json({
        found: true,
        signerData: {
          dobMonth: prior.dobMonth || '',
          dobDay: prior.dobDay || '',
          dobYear: prior.dobYear || '',
          ssn: prior.ssn || '',
          homeStreet: prior.homeStreet || '',
          homeCity: prior.homeCity || '',
          homeState: prior.homeState || '',
          homeZip: prior.homeZip || '',
          corporatePhone: prior.corporatePhone || '',
          idDocumentUrl: prior.idDocumentUrl || '',
        }
      });
    }

    return Response.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});