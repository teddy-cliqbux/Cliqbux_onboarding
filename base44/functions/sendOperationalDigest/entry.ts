/**
 * sendOperationalDigest — email Teddy a daily digest of non-filed OperationalEvents.
 *
 * POST body: { dryRun?: boolean }  — admin only
 *
 * Selects events where digestedAt is empty AND githubIssueUrl is empty,
 * from the last 48h (or all undigested). Marks digestedAt after send.
 *
 * Env: FEEDBACK_DIGEST_TO (required), RESEND_API_KEY, PUBLIC_APP_URL (optional)
 *
 * See docs/superpowers/specs/2026-07-29-feedback-fix-loop-design.md
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    let user: any = null;
    try {
      user = await base44.auth.me();
    } catch { /* */ }
    if (!user) {
      return Response.json({ error: 'Unauthorized — admin only' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const dryRun = Boolean(body.dryRun);
    const to = Deno.env.get('FEEDBACK_DIGEST_TO');
    if (!to && !dryRun) {
      return Response.json({ error: 'FEEDBACK_DIGEST_TO env var not set' }, { status: 500 });
    }

    const srv = base44.asServiceRole;
    let rows: any[] = [];
    try {
      rows = await srv.entities.OperationalEvent.list('-created_date', 200);
    } catch (e: any) {
      return Response.json({
        error: 'ENTITY_SCHEMA_MISSING',
        hint: 'Publish OperationalEvent entity in Base44.',
        detail: e?.message,
      }, { status: 503 });
    }

    const undigested = (Array.isArray(rows) ? rows : []).filter((r) => {
      if (r.digestedAt) return false;
      if (r.githubIssueUrl) return false; // already promoted to an issue
      return true;
    });

    if (undigested.length === 0) {
      return Response.json({ success: true, sent: false, count: 0, reason: 'No undigested events' });
    }

    const lines = undigested.slice(0, 80).map((r) => {
      const when = r.lastSeenAt || r.created_date || '';
      return `<li><strong>${escapeHtml(r.code)}</strong> (${escapeHtml(r.severity || '?')})`
        + ` ×${r.occurrenceCount || 1}`
        + (r.corporateId ? ` — corp ${escapeHtml(String(r.corporateId))}` : '')
        + (r.functionName ? ` — <code>${escapeHtml(r.functionName)}</code>` : '')
        + `<br/><span style="color:#666">${escapeHtml(String(r.message || '').slice(0, 200))}</span>`
        + (when ? `<br/><span style="color:#999;font-size:12px">${escapeHtml(String(when))}</span>` : '')
        + `</li>`;
    });

    const html = `
      <div style="font-family:Inter,Arial,sans-serif;max-width:640px;margin:0 auto;color:#111">
        <h2 style="margin:0 0 8px">Cliqbux operational digest</h2>
        <p style="color:#555;margin:0 0 16px">${undigested.length} undigested event(s) (not auto-filed to GitHub).</p>
        <ul style="padding-left:18px;line-height:1.5">${lines.join('')}</ul>
        <p style="color:#888;font-size:12px;margin-top:24px">
          High-severity / boarding-critical events auto-create GitHub issues.
          Triage with <code>needs-triage</code> → <code>ready-for-agent</code>.
          See docs/agents/feedback-fix-loop-runbook.md
        </p>
      </div>
    `;

    if (dryRun) {
      return Response.json({
        success: true,
        dryRun: true,
        count: undigested.length,
        sample: undigested.slice(0, 5).map((r) => ({ code: r.code, severity: r.severity, corporateId: r.corporateId })),
      });
    }

    const apiKey = Deno.env.get('RESEND_API_KEY');
    if (!apiKey) {
      return Response.json({ error: 'RESEND_API_KEY not set' }, { status: 500 });
    }

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'Cliqbux Onboarding <onboarding@onboarding.cliqbuxpos.com>',
        to: [to],
        subject: `Cliqbux digest: ${undigested.length} operational event(s)`,
        html,
      }),
    });
    if (!res.ok) {
      const err = await res.text();
      return Response.json({ error: `Resend failed: ${res.status} ${err}` }, { status: 502 });
    }

    const stamped = new Date().toISOString();
    let marked = 0;
    for (const r of undigested) {
      try {
        await srv.entities.OperationalEvent.update(r.id, { digestedAt: stamped });
        marked += 1;
      } catch (e) {
        console.error('[sendOperationalDigest] mark failed', r.id, e);
      }
    }

    return Response.json({ success: true, sent: true, count: undigested.length, marked, to });
  } catch (err: any) {
    console.error('[sendOperationalDigest]', err);
    return Response.json({ error: err?.message || 'Internal error' }, { status: 500 });
  }
});

function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
