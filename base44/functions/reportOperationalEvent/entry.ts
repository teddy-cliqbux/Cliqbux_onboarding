/**
 * reportOperationalEvent — Detection layer: store event, tiered GitHub filing.
 *
 * POST body: {
 *   severity?: 'low'|'medium'|'high',
 *   code: string,
 *   message: string,
 *   corporateId?, midId?, mspApplicationNo?, route?, functionName?, httpStatus?,
 *   fingerprint?, source?: 'client'|'server'
 * }
 *
 * High / boarding-critical → create GitHub issue (bug + needs-triage) unless
 * an open-ish event with the same fingerprint was filed in the last 24h.
 * All events persist as OperationalEvent for the daily digest.
 *
 * Env: GITHUB_FEEDBACK_TOKEN, GITHUB_FEEDBACK_REPO (default teddy-cliqbux/Cliqbux_onboarding)
 *
 * See docs/superpowers/specs/2026-07-29-feedback-fix-loop-design.md
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// ─── Portal auth (inlined) ───────────────────────────────────────────────────
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

const BOARDING_CRITICAL = new Set([
  'CLIENT_CRASH',
  'RATE_LIMIT',
  'MSP_FORM_INCOMPLETE',
  'MSP_VALIDATION',
  'MSP_DRAFT_CREATE_FAILED',
  'SIGNING_FAILED',
  'FORMS_LOCKED',
  'HTTP_5XX_BOARDING',
]);

const DEDUPE_MS = 24 * 60 * 60 * 1000;

function scrubMessage(raw: string): string {
  return String(raw || '')
    .replace(/Bearer\s+[A-Za-z0-9\-._~+/=]+/gi, 'Bearer [REDACTED]')
    .replace(/\b\d{3}-?\d{2}-?\d{4}\b/g, '[REDACTED-SSN]')
    .slice(0, 500);
}

function resolveSeverity(code: string, severity?: string): 'low' | 'medium' | 'high' {
  if (BOARDING_CRITICAL.has(code)) return 'high';
  if (severity === 'high' || severity === 'medium' || severity === 'low') return severity;
  return 'medium';
}

function githubRepo(): string {
  return Deno.env.get('GITHUB_FEEDBACK_REPO') || 'teddy-cliqbux/Cliqbux_onboarding';
}

async function createGithubIssue(opts: {
  title: string;
  body: string;
  labels: string[];
}): Promise<{ number: number; html_url: string } | null> {
  const token = Deno.env.get('GITHUB_FEEDBACK_TOKEN');
  if (!token) {
    console.warn('[reportOperationalEvent] GITHUB_FEEDBACK_TOKEN not set — skip issue create');
    return null;
  }
  const repo = githubRepo();
  const res = await fetch(`https://api.github.com/repos/${repo}/issues`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      title: opts.title.slice(0, 200),
      body: opts.body,
      labels: opts.labels,
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    console.error('[reportOperationalEvent] GitHub issue failed', res.status, err);
    return null;
  }
  const data = await res.json();
  return { number: data.number, html_url: data.html_url };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const actor = await getPortalActor(req, base44);
    if (!actor) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const code = String(body.code || '').trim().slice(0, 64);
    if (!code) {
      return Response.json({ error: 'code required' }, { status: 400 });
    }

    let corporateId = body.corporateId != null ? String(body.corporateId) : undefined;
    if (actor.actor === 'merchant') {
      // Merchants may only attach their own corporateId
      if (corporateId && corporateId !== actor.corporateId) {
        return Response.json({ error: 'Unauthorized' }, { status: 401 });
      }
      corporateId = actor.corporateId;
    }

    const severity = resolveSeverity(code, body.severity);
    const message = scrubMessage(body.message || code);
    const fingerprint = String(
      body.fingerprint ||
        `${code}:${body.functionName || ''}:${body.httpStatus || ''}:${corporateId || ''}`
    ).slice(0, 200);
    const now = new Date().toISOString();
    const srv = base44.asServiceRole;

    // Dedupe: bump occurrence if same fingerprint seen recently
    let existing: any = null;
    try {
      const rows = await srv.entities.OperationalEvent.filter({ fingerprint });
      const list = Array.isArray(rows) ? rows : [];
      existing = list
        .filter((r: any) => r.lastSeenAt && Date.now() - new Date(r.lastSeenAt).getTime() < DEDUPE_MS)
        .sort((a: any, b: any) => String(b.lastSeenAt).localeCompare(String(a.lastSeenAt)))[0] || null;
    } catch (e: any) {
      // Entity may not be published yet
      if (String(e?.message || e).includes('not found') || String(e?.message || e).includes('ENTITY')) {
        return Response.json({
          error: 'ENTITY_SCHEMA_MISSING',
          hint: 'Publish OperationalEvent entity in Base44, then retry.',
        }, { status: 503 });
      }
      throw e;
    }

    let record = existing;
    if (existing) {
      record = await srv.entities.OperationalEvent.update(existing.id, {
        occurrenceCount: (existing.occurrenceCount || 1) + 1,
        lastSeenAt: now,
        message,
        route: body.route ? String(body.route).slice(0, 300) : existing.route,
      });
    } else {
      record = await srv.entities.OperationalEvent.create({
        fingerprint,
        severity,
        code,
        message,
        corporateId,
        midId: body.midId != null ? String(body.midId) : undefined,
        mspApplicationNo: body.mspApplicationNo != null ? String(body.mspApplicationNo) : undefined,
        route: body.route ? String(body.route).slice(0, 300) : undefined,
        functionName: body.functionName ? String(body.functionName).slice(0, 80) : undefined,
        httpStatus: body.httpStatus != null ? Number(body.httpStatus) : undefined,
        source: body.source === 'server' ? 'server' : 'client',
        actor: actor.actor,
        occurrenceCount: 1,
        lastSeenAt: now,
      });
    }

    let githubIssueUrl = record.githubIssueUrl || null;
    let githubIssueNumber = record.githubIssueNumber || null;

    // Tiered filing: high severity and not already filed in dedupe window
    if (severity === 'high' && !githubIssueUrl) {
      const title = `[auto] ${code}${corporateId ? ` — corp ${corporateId}` : ''}`;
      const issueBody = [
        '> *Auto-filed by reportOperationalEvent (Detection layer). Triage before assigning to an agent.*',
        '',
        '## What happened',
        message,
        '',
        '## Context',
        `- **code:** \`${code}\``,
        `- **severity:** ${severity}`,
        `- **corporateId:** ${corporateId || '(none)'}`,
        `- **midId:** ${body.midId || '(none)'}`,
        `- **mspApplicationNo:** ${body.mspApplicationNo || '(none)'}`,
        `- **function:** ${body.functionName || '(none)'}`,
        `- **httpStatus:** ${body.httpStatus ?? '(none)'}`,
        `- **route:** ${body.route || '(none)'}`,
        `- **fingerprint:** \`${fingerprint}\``,
        `- **occurrences (24h window):** ${record.occurrenceCount || 1}`,
        '',
        '## What I expected',
        'Boarding / portal operation should succeed without this failure.',
        '',
        '## Steps to reproduce',
        '1. Open the merchant (corporateId above) in the portal or Applications desk.',
        '2. Retry the action that hit this function/code.',
        '3. Confirm MSP form status / network response if boarding-related.',
      ].join('\n');

      const created = await createGithubIssue({
        title,
        body: issueBody,
        labels: ['bug', 'needs-triage'],
      });
      if (created) {
        githubIssueUrl = created.html_url;
        githubIssueNumber = created.number;
        record = await srv.entities.OperationalEvent.update(record.id, {
          githubIssueUrl,
          githubIssueNumber,
        });
      }
    }

    return Response.json({
      success: true,
      id: record.id,
      fingerprint,
      severity,
      filedIssue: Boolean(githubIssueUrl && !existing?.githubIssueUrl),
      githubIssueUrl,
      githubIssueNumber,
      occurrenceCount: record.occurrenceCount || 1,
    });
  } catch (err: any) {
    console.error('[reportOperationalEvent]', err);
    return Response.json({ error: err?.message || 'Internal error' }, { status: 500 });
  }
});
