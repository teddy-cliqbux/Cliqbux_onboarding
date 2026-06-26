Deno.serve(async (_req) => {
  const publicUrl = Deno.env.get('PUBLIC_APP_URL');
  const appId = Deno.env.get('BASE44_APP_ID');
  return Response.json({
    PUBLIC_APP_URL: publicUrl || 'NOT_SET',
    BASE44_APP_ID: appId || 'NOT_SET',
    resolved: publicUrl && publicUrl.startsWith('http') ? publicUrl.replace(/\/$/, '') : (appId ? `https://${appId}.base44.app` : 'https://onboarding.cliqbux.com')
  });
});