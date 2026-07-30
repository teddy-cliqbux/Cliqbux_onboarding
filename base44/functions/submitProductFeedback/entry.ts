/**
 * submitProductFeedback — in-product bug / enhancement intake.
 *
 * POST body: {
 *   type: 'bug' | 'enhancement',
 *   title: string,
 *   description: string,
 *   corporateId?: string,
 *   expected?: string,
 *   steps?: string,
 *   route?: string,
 *   userAgent?: string,
 *   screenshotUrl?: string,      // https from UploadFile
 *   screenshotBase64?: string    // optional JPEG data URL / base64, max ~1.5MB
 * }
 *
 * Creates a GitHub Issue with needs-triage + bug|enhancement.
 * Merchants may only file under their JWT corporateId.
 *
 * Env: GITHUB_FEEDBACK_TOKEN, GITHUB_FEEDBACK_REPO
 *
 * See docs/superpowers/specs/2026-07-29-feedback-fix-loop-design.md
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

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
  } catch { /* */ }
  return null;
}

function githubRepo(): string {
  return Deno.env.get('GITHUB_FEEDBACK_REPO') || 'teddy-cliqbux/Cliqbux_onboarding';
}

const MAX_SCREENSHOT_BYTES = Math.floor(1.5 * 1024 * 1024);

function sanitizeScreenshotUrl(raw: unknown): string | undefined {
  if (raw == null || raw === '') return undefined;
  const url = String(raw).trim();
  if (!url.startsWith('https://')) return undefined;
  if (url.length > 2000) return undefined;
  return url;
}

/** Decode data URL or raw base64 JPEG; return bytes or null if invalid/too large. */
function decodeScreenshotBase64(raw: unknown): Uint8Array | null {
  if (raw == null || raw === '') return null;
  let b64 = String(raw).trim();
  const dataUrl = /^data:image\/(jpeg|jpg|png);base64,/i.exec(b64);
  if (dataUrl) b64 = b64.slice(dataUrl[0].length);
  if (!/^[A-Za-z0-9+/=\s]+$/.test(b64) || b64.length < 32) return null;
  try {
    const bin = atob(b64.replace(/\s/g, ''));
    if (bin.length > MAX_SCREENSHOT_BYTES) return null;
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  } catch {
    return null;
  }
}

async function uploadScreenshotBytes(base44: any, bytes: Uint8Array): Promise<string | undefined> {
  try {
    const file = new File([bytes], `feedback-${Date.now()}.jpg`, { type: 'image/jpeg' });
    const srv = base44.asServiceRole;
    if (srv?.integrations?.Core?.UploadFile) {
      const up = await srv.integrations.Core.UploadFile({ file });
      const url = up?.file_url;
      if (url && String(url).startsWith('https://')) return String(url);
    }
  } catch (e) {
    console.warn('[submitProductFeedback] screenshot upload via service role failed', e);
  }
  return undefined;
}

async function createGithubIssue(opts: {
  title: string;
  body: string;
  labels: string[];
}): Promise<{ number: number; html_url: string } | null> {
  const token = Deno.env.get('GITHUB_FEEDBACK_TOKEN');
  if (!token) {
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
    throw new Error(`GitHub issue failed (${res.status}): ${err}`);
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
    const type = body.type === 'enhancement' ? 'enhancement' : body.type === 'bug' ? 'bug' : null;
    if (!type) {
      return Response.json({ error: 'type must be bug or enhancement' }, { status: 400 });
    }
    const title = String(body.title || '').trim();
    const description = String(body.description || '').trim();
    if (!title || title.length < 3) {
      return Response.json({ error: 'title required (min 3 characters)' }, { status: 400 });
    }
    if (!description || description.length < 10) {
      return Response.json({ error: 'description required (min 10 characters)' }, { status: 400 });
    }

    let corporateId = body.corporateId != null ? String(body.corporateId) : undefined;
    if (actor.actor === 'merchant') {
      if (corporateId && corporateId !== actor.corporateId) {
        return Response.json({ error: 'Unauthorized' }, { status: 401 });
      }
      corporateId = actor.corporateId;
    }

    const route = body.route ? String(body.route).slice(0, 300) : undefined;
    const userAgent = body.userAgent ? String(body.userAgent).slice(0, 300) : undefined;
    const expected = body.expected ? String(body.expected).slice(0, 1000) : undefined;
    const steps = body.steps ? String(body.steps).slice(0, 2000) : undefined;

    let screenshotUrl = sanitizeScreenshotUrl(body.screenshotUrl);
    if (!screenshotUrl && body.screenshotBase64) {
      const bytes = decodeScreenshotBase64(body.screenshotBase64);
      if (bytes) {
        screenshotUrl = await uploadScreenshotBytes(base44, bytes);
      }
    }

    const prefix = type === 'bug' ? '[feedback:bug]' : '[feedback:idea]';
    const issueTitle = `${prefix} ${title}`.slice(0, 200);
    const issueParts = [
      '> *Submitted via in-product Help & Feedback. Durable user report — triage before assigning.*',
      '',
      '## What happened',
      description.slice(0, 4000),
      '',
      '## What I expected',
      expected || '(not provided)',
      '',
      '## Steps to reproduce',
      steps || '(not provided — ask reporter if needed)',
      '',
      '## Additional context',
      `- **Reporter:** ${actor.actor}${corporateId ? ` (corporateId ${corporateId})` : ''}`,
      `- **Route:** ${route || '(none)'}`,
      `- **User-Agent:** ${userAgent || '(none)'}`,
      `- **Type:** ${type}`,
    ];
    if (screenshotUrl) {
      issueParts.push('', '## Screenshot', `![feedback screenshot](${screenshotUrl})`);
    }
    const issueBody = issueParts.join('\n');

    const hasToken = Boolean(Deno.env.get('GITHUB_FEEDBACK_TOKEN')?.trim());

    // Persist always (GitHub or queue) so a missing env var never drops the report.
    const persistQueued = async (extra: Record<string, unknown> = {}) => {
      try {
        const summary = [
          title,
          description.slice(0, 1500),
          expected ? `Expected: ${expected}` : '',
          screenshotUrl ? `Screenshot: ${screenshotUrl}` : '',
        ].filter(Boolean).join('\n---\n').slice(0, 4000);
        await base44.asServiceRole.entities.OperationalEvent.create({
          fingerprint: `feedback:queued:${type}:${Date.now()}:${corporateId || 'none'}`,
          severity: 'medium',
          code: type === 'bug' ? 'USER_BUG_REPORT_QUEUED' : 'USER_ENHANCEMENT_QUEUED',
          message: summary,
          corporateId,
          route,
          source: 'feedback',
          actor: actor.actor,
          occurrenceCount: 1,
          lastSeenAt: new Date().toISOString(),
          // Leave digestedAt empty so daily digest surfaces it until GitHub is wired
          ...extra,
        });
        return true;
      } catch (e) {
        console.warn('[submitProductFeedback] queue OperationalEvent failed', e);
        return false;
      }
    };

    if (!hasToken) {
      const queued = await persistQueued();
      return Response.json({
        success: true,
        queued: true,
        githubConfigured: false,
        screenshotAttached: Boolean(screenshotUrl),
        // Client treats issueUrl as success receipt — use a stable local marker
        issueUrl: queued
          ? 'queued://operational-event (GitHub token not set yet)'
          : undefined,
        message:
          'Your feedback was saved. GitHub filing is not set up yet — add GITHUB_FEEDBACK_TOKEN in Base44 (issues:write PAT), then redeploy submitProductFeedback.',
        error: queued
          ? undefined
          : 'Could not save feedback (OperationalEvent missing?). Add GITHUB_FEEDBACK_TOKEN in Base44 and publish the OperationalEvent entity.',
        hint: 'Base44 Dashboard → Settings → Environment → GITHUB_FEEDBACK_TOKEN = GitHub PAT with issues:write on teddy-cliqbux/Cliqbux_onboarding',
      }, { status: queued ? 200 : 503 });
    }

    const created = await createGithubIssue({
      title: issueTitle,
      body: issueBody,
      labels: [type === 'bug' ? 'bug' : 'enhancement', 'needs-triage'],
    });

    if (!created) {
      const queued = await persistQueued();
      return Response.json({
        success: queued,
        queued: true,
        error: queued
          ? undefined
          : 'Failed to create GitHub issue and could not queue locally',
        message: queued
          ? 'GitHub issue create failed; your feedback was saved for the daily digest.'
          : undefined,
        issueUrl: queued ? 'queued://operational-event (GitHub create failed)' : undefined,
        screenshotAttached: Boolean(screenshotUrl),
      }, { status: queued ? 200 : 502 });
    }

    // Best-effort OperationalEvent breadcrumb (non-blocking)
    try {
      await base44.asServiceRole.entities.OperationalEvent.create({
        fingerprint: `feedback:${type}:${created.number}`,
        severity: 'low',
        code: type === 'bug' ? 'USER_BUG_REPORT' : 'USER_ENHANCEMENT',
        message: title.slice(0, 500),
        corporateId,
        route,
        source: 'feedback',
        actor: actor.actor,
        githubIssueUrl: created.html_url,
        githubIssueNumber: created.number,
        occurrenceCount: 1,
        lastSeenAt: new Date().toISOString(),
        digestedAt: new Date().toISOString(), // already filed — skip digest noise
      });
    } catch (e) {
      console.warn('[submitProductFeedback] OperationalEvent create skipped', e);
    }

    return Response.json({
      success: true,
      issueNumber: created.number,
      issueUrl: created.html_url,
      screenshotAttached: Boolean(screenshotUrl),
      githubConfigured: true,
    });
  } catch (err: any) {
    console.error('[submitProductFeedback]', err);
    return Response.json({ error: err?.message || 'Internal error' }, { status: 500 });
  }
});
