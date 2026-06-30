import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// manageStagedApplication — CRUD for StagedApplication records
// Actions: list, get, create, update, delete, send
// POST /functions/manageStagedApplication

function generateToken(): string {
  const arr = new Uint8Array(24);
  crypto.getRandomValues(arr);
  return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const { action, stageId, corporateId, data } = body;

    const publicUrl = (Deno.env.get('PUBLIC_APP_URL') || 'https://onboarding.cliqbux.com').replace(/\/$/, '');

    if (action === 'list') {
      // List all staged apps for a corporateId (or all if admin)
      const filter: any = {};
      if (corporateId) filter.corporateId = corporateId;
      const stages = await base44.asServiceRole.entities.StagedApplication.filter(filter, '-created_date', 100);
      return Response.json({ success: true, stages });
    }

    if (action === 'get') {
      if (!stageId) return Response.json({ error: 'stageId required' }, { status: 400 });
      const stage = await base44.asServiceRole.entities.StagedApplication.get(stageId);
      return Response.json({ success: true, stage });
    }

    if (action === 'create') {
      if (!corporateId) return Response.json({ error: 'corporateId required' }, { status: 400 });
      const token = generateToken();
      const stage = await base44.asServiceRole.entities.StagedApplication.create({
        corporateId,
        status: 'draft',
        label: data?.label || 'New Staged Application',
        includedLocationIds: data?.includedLocationIds || [],
        includedConceptIds: data?.includedConceptIds || [],
        includedSignerIds: data?.includedSignerIds || [],
        prefilledData: data?.prefilledData || {},
        accessToken: token,
      });
      return Response.json({ success: true, stage });
    }

    if (action === 'update') {
      if (!stageId) return Response.json({ error: 'stageId required' }, { status: 400 });
      const updated = await base44.asServiceRole.entities.StagedApplication.update(stageId, data);
      return Response.json({ success: true, stage: updated });
    }

    if (action === 'delete') {
      if (!stageId) return Response.json({ error: 'stageId required' }, { status: 400 });
      await base44.asServiceRole.entities.StagedApplication.delete(stageId);
      return Response.json({ success: true });
    }

    if (action === 'send') {
      if (!stageId) return Response.json({ error: 'stageId required' }, { status: 400 });
      const stage = await base44.asServiceRole.entities.StagedApplication.get(stageId);
      if (!stage) return Response.json({ error: 'Stage not found' }, { status: 404 });

      const toEmail = data?.email || stage.sentToEmail;
      if (!toEmail) return Response.json({ error: 'email required' }, { status: 400 });

      const link = `${publicUrl}/?stageId=${stage.id}&token=${stage.accessToken}`;

      await base44.asServiceRole.integrations.Core.SendEmail({
        to: toEmail,
        subject: 'Your Cliqbux Merchant Application',
        body: `
<div style="font-family: Inter, sans-serif; background: #111318; color: #e5e7eb; padding: 40px; max-width: 600px; margin: 0 auto; border-radius: 16px;">
  <div style="margin-bottom: 24px;">
    <span style="font-size: 24px; font-weight: 800; color: #f0ad4e;">cliqbux</span>
  </div>
  <h2 style="font-size: 20px; font-weight: 700; color: #ffffff; margin-bottom: 8px;">Your merchant application is ready</h2>
  <p style="color: #9ca3af; margin-bottom: 24px;">Click the button below to complete your onboarding. The link is secure and unique to your account.</p>
  <a href="${link}" style="display: inline-block; background: #f0ad4e; color: #000; font-weight: 700; padding: 14px 28px; border-radius: 12px; text-decoration: none; font-size: 15px;">
    Complete My Application →
  </a>
  <p style="color: #6b7280; font-size: 12px; margin-top: 32px;">If you did not expect this email, you can ignore it. Questions? Reply to this email.</p>
</div>
        `.trim(),
      });

      const updated = await base44.asServiceRole.entities.StagedApplication.update(stageId, {
        status: 'sent',
        sentAt: new Date().toISOString(),
        sentToEmail: toEmail,
      });

      return Response.json({ success: true, stage: updated, link });
    }

    return Response.json({ error: `Unknown action: ${action}` }, { status: 400 });

  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});