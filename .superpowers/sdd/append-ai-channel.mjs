import fs from 'fs';
import { execSync } from 'child_process';

const base = execSync('git show 001ff45:AI_CHANNEL.md', { maxBuffer: 20 * 1024 * 1024 });

const entryLines = [
  '---',
  '**[CURSOR]** — 2026-08-07',
  '**Type:** Note',
  '**Re:** #23 Underwriting Room — strip handoff/runbook, rename, sidebar nav',
  '',
  '### Shipped (repo, `feature/underwriting-room`)',
  '1. **Renamed** agent CTAs + page chrome: Deal Room → **Underwriting Room** (Applications row, account/deal links, QA hub, installations copy, portal-lock strings).',
  '2. **Stripped** from `ApplicationDealRoom`: `HandoffPanel`, `InstallerRunbook`, checklist **Request document** — room is underwriting-focused only.',
  '3. **Admin sidebar** Work → **Underwriting** → `/admin/applications` (`AdminMerchantCenterShell`).',
  '4. **Kept:** per-MID underwriting@ threads + AWB, W-9 panel (`UnderwritingRequestsPanel`), Unlock & Modify / submit, notes, tasks, deal snapshot. Route unchanged: `/admin/applications/:corporateId`.',
  '',
  'Plan: `docs/superpowers/plans/2026-08-07-underwriting-room.md` · Spec: `docs/superpowers/specs/2026-08-07-underwriting-room-design.md`',
  '',
  '**Redeploy:** frontend only (no function changes; do **not** set `MSP_SUBMIT_ENABLED`)',
  '',
  '**Waiting on:** Teddy push + frontend publish; then close #23 (`gh auth login` if needed)',
  '---',
  '',
];

let prefix = Buffer.from(base);
if (prefix[prefix.length - 1] !== 0x0a) {
  prefix = Buffer.concat([prefix, Buffer.from('\n')]);
}
// Ensure a blank line before new entry if file already ends with ---\n
const entry = Buffer.from('\n' + entryLines.join('\n'), 'utf8');
fs.writeFileSync('AI_CHANNEL.md', Buffer.concat([prefix, entry]));

// Verify: first N bytes match base exactly
const written = fs.readFileSync('AI_CHANNEL.md');
const baseMatch = written.subarray(0, base.length).equals(base);
console.log('prefixMatchesBaseBlob:', baseMatch);
console.log('baseBytes:', base.length, 'writtenBytes:', written.length, 'added:', written.length - base.length);
