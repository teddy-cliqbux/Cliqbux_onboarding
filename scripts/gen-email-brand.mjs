import fs from 'fs';

const b64 = fs.readFileSync('public/brand/cliqbux-mark-email.b64.txt', 'utf8').trim();

const helperSrc = `/**
 * Canonical email brand assets for Resend.
 *
 * Base44 bundles each function in isolation — copy CLIQBUX_EMAIL_LOGO_B64,
 * CLIQBUX_EMAIL_LOGO_CID, emailLogoHeaderHtml(), and resendInlineLogoAttachment()
 * into any function that sends mail (same pattern as helpers/auth.ts).
 *
 * Do NOT hotlink /brand/*.png in email HTML: Base44 static hosting often
 * returns 403/500 to mail clients, which render as a white "…" broken-image pill.
 * Inline CID attachments work in Gmail / Apple Mail / Outlook without remote fetch.
 *
 * Source PNG: public/brand/cliqbux-mark-email.png (55x62). Regenerate b64 if the mark changes.
 */
export const CLIQBUX_EMAIL_LOGO_CID = 'cliqbux-logo';

export const CLIQBUX_EMAIL_LOGO_B64 = '${b64}';

/** Dark-header lockup: shield (cid) + white wordmark. Table layout for Outlook. */
export function emailLogoHeaderHtml(): string {
  return \`<table cellpadding="0" cellspacing="0" role="presentation" align="center" style="margin:0 auto;">
  <tr>
    <td style="padding:0 12px 0 0;vertical-align:middle;">
      <img src="cid:\${CLIQBUX_EMAIL_LOGO_CID}" width="28" height="31" alt="Cliqbux" style="display:block;border:0;outline:none;text-decoration:none;width:28px;height:31px;" />
    </td>
    <td style="vertical-align:middle;color:#ffffff;font-size:20px;font-weight:700;letter-spacing:-0.03em;font-family:Poppins,Inter,Arial,sans-serif;line-height:1;">cliqbux</td>
  </tr>
</table>\`;
}

/** Resend attachments[] entry — content_id makes the image available as cid:… */
export function resendInlineLogoAttachment() {
  return {
    filename: 'cliqbux-mark.png',
    content: CLIQBUX_EMAIL_LOGO_B64,
    content_id: CLIQBUX_EMAIL_LOGO_CID,
  };
}
`;

fs.writeFileSync('base44/functions/helpers/emailBrand.ts', helperSrc);

// Snippet to paste into each email function (no export keyword)
const inlineBlock = `// --- email brand (copied from helpers/emailBrand.ts — Base44 cannot import helpers) ---
const CLIQBUX_EMAIL_LOGO_CID = 'cliqbux-logo';
const CLIQBUX_EMAIL_LOGO_B64 = '${b64}';
function emailLogoHeaderHtml(): string {
  return \`<table cellpadding="0" cellspacing="0" role="presentation" align="center" style="margin:0 auto;">
  <tr>
    <td style="padding:0 12px 0 0;vertical-align:middle;">
      <img src="cid:\${CLIQBUX_EMAIL_LOGO_CID}" width="28" height="31" alt="Cliqbux" style="display:block;border:0;outline:none;text-decoration:none;width:28px;height:31px;" />
    </td>
    <td style="vertical-align:middle;color:#ffffff;font-size:20px;font-weight:700;letter-spacing:-0.03em;font-family:Poppins,Inter,Arial,sans-serif;line-height:1;">cliqbux</td>
  </tr>
</table>\`;
}
function resendInlineLogoAttachment() {
  return {
    filename: 'cliqbux-mark.png',
    content: CLIQBUX_EMAIL_LOGO_B64,
    content_id: CLIQBUX_EMAIL_LOGO_CID,
  };
}
// --- end email brand ---`;

fs.writeFileSync('scripts/_email-brand-inline.txt', inlineBlock);
console.log('wrote helpers/emailBrand.ts + scripts/_email-brand-inline.txt', helperSrc.length);
