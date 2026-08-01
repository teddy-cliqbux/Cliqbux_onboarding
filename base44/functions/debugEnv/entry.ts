import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  // Admin-only: requires a Base44 workspace session. Merchant portal tokens
  // are deliberately NOT accepted here.
  const base44 = createClientFromRequest(req);
  let adminUser: any = null;
  try { adminUser = await base44.auth.me(); } catch { /* no session */ }
  if (!adminUser) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const publicUrl = Deno.env.get('PUBLIC_APP_URL');
  const appId = Deno.env.get('BASE44_APP_ID');
  const quoKey = Deno.env.get('QUO_API_KEY');
  const quoFrom = Deno.env.get('QUO_FROM_NUMBER');
  return Response.json({
    PUBLIC_APP_URL: publicUrl || 'NOT_SET',
    BASE44_APP_ID: appId || 'NOT_SET',
    resolved: publicUrl && publicUrl.startsWith('http') ? publicUrl.replace(/\/$/, '') : (appId ? `https://${appId}.base44.app` : 'https://onboarding.cliqbux.com'),
    // Presence only — never echo secrets or the from-number value
    QUO_API_KEY: quoKey ? 'set' : 'NOT_SET',
    QUO_FROM_NUMBER: quoFrom ? 'set' : 'NOT_SET',
  });
});
