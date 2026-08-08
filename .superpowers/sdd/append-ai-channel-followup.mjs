import fs from 'fs';
import { execSync } from 'child_process';

// Append correction note to current HEAD AI_CHANNEL without rewriting
const base = execSync('git show HEAD:AI_CHANNEL.md', { maxBuffer: 20 * 1024 * 1024 });
let prefix = Buffer.from(base);
if (prefix[prefix.length - 1] !== 0x0a) {
  prefix = Buffer.concat([prefix, Buffer.from('\n')]);
}

const entry = Buffer.from(
  [
    '',
    '---',
    '**[CURSOR]** — 2026-08-07',
    '**Type:** Note',
    '**Re:** #23 follow-up — sync inlined manageMerchantAccount CTA labels',
    '',
    'Final review found `manageMerchantAccount` still returned “Open/Fix in Deal Room” (inlined `buildPrimaryCta`; Account home hero CTA). Updated to **Underwriting Room**; `kind` still `deal_room`.',
    '',
    '**Redeploy:** frontend + `manageMerchantAccount` (not frontend-only after this follow-up). Still do **not** set `MSP_SUBMIT_ENABLED`.',
    '---',
    '',
  ].join('\n'),
  'utf8',
);

fs.writeFileSync('AI_CHANNEL.md', Buffer.concat([prefix, entry]));
const written = fs.readFileSync('AI_CHANNEL.md');
console.log('prefixMatch:', written.subarray(0, base.length).equals(base));
