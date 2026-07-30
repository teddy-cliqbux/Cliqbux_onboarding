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
 *   userAgent?: string
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

    const prefix = type === 'bug' ? '[feedback:bug]' : '[feedback:idea]';
    const issueTitle = `${prefix} ${title}`.slice(0, 200);
    const issueBody = [
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
    ].join('\n');

    if (!Deno.env.get('GITHUB_FEEDBACK_TOKEN')) {
      return Response.json({
        error: 'GITHUB_FEEDBACK_TOKEN not configured',
        hint: 'Add a fine-scoped GitHub PAT with issues:write to Base44 env, then redeploy.',
      }, { status: 503 });
    }

    const created = await createGithubIssue({
      title: issueTitle,
      body: issueBody,
      labels: [type === 'bug' ? 'bug' : 'enhancement', 'needs-triage'],
    });

    if (!created) {
      return Response.json({ error: 'Failed to create GitHub issue' }, { status: 502 });
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
    });
  } catch (err: any) {
    console.error('[submitProductFeedback]', err);
    return Response.json({ error: err?.message || 'Internal error' }, { status: 500 });
  }
});
