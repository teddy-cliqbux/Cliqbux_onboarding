# Review package Task 7
Base: e92167b2ad48ddf0024ac6fe79db939fe56d1732
Head: b51885e74af801441ac05f3b7bbd5ddcc3cf7cba
## Commits
b51885e feat(uw): Deal Room underwriting requests panel for W-9

## Stat
 .../deal-room/UnderwritingRequestsPanel.jsx        | 710 +++++++++++++++++++++
 src/pages/ApplicationDealRoom.jsx                  |  10 +
 2 files changed, 720 insertions(+)

## Diff
```diff
diff --git a/src/components/deal-room/UnderwritingRequestsPanel.jsx b/src/components/deal-room/UnderwritingRequestsPanel.jsx
new file mode 100644
index 0000000..17ac61f
--- /dev/null
+++ b/src/components/deal-room/UnderwritingRequestsPanel.jsx
@@ -0,0 +1,710 @@
+import { useCallback, useEffect, useMemo, useState } from 'react';
+import {
+  Loader2, FileText, Plus, Send, RefreshCw, X, Download, Mail,
+} from 'lucide-react';
+import { base44 } from '@/api/base44Client';
+import { buildW9Prefill } from '@/lib/w9Prefill';
+
+const FN = 'manageUnderwritingRequest';
+
+const inputCls =
+  'w-full bg-cb-bg border border-cb-border rounded-cb px-3 py-2 text-cb-body text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-cb-accent';
+
+const TAX_LABELS = {
+  individual: 'Individual / sole prop',
+  c_corp: 'C Corporation',
+  s_corp: 'S Corporation',
+  partnership: 'Partnership',
+  trust: 'Trust / estate',
+  llc: 'LLC',
+  other: 'Other',
+};
+
+const UNSIGNED = new Set(['draft', 'sent', 'opened', 'send_failed']);
+const SIGNED = new Set(['signed', 'sent_to_elavon']);
+
+function formatWhen(iso) {
+  if (!iso) return '';
+  try {
+    return new Date(iso).toLocaleString(undefined, {
+      month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
+    });
+  } catch {
+    return iso;
+  }
+}
+
+function statusDotClass(status) {
+  const s = String(status || '');
+  if (s === 'signed' || s === 'sent_to_elavon') return 'bg-cb-success';
+  if (s === 'send_failed') return 'bg-cb-danger';
+  if (s === 'opened') return 'bg-sky-400';
+  if (s === 'sent') return 'bg-cb-accent';
+  if (s === 'draft') return 'bg-gray-500';
+  if (s === 'cancelled' || s === 'expired') return 'bg-gray-600';
+  return 'bg-gray-500';
+}
+
+function statusLabel(status) {
+  const map = {
+    draft: 'Draft',
+    sent: 'Sent',
+    opened: 'Opened',
+    signed: 'Signed',
+    sent_to_elavon: 'Sent to Elavon',
+    cancelled: 'Cancelled',
+    expired: 'Expired',
+    send_failed: 'Send failed',
+  };
+  return map[status] || status || 'ΓÇö';
+}
+
+function signerDisplayName(s) {
+  return [s?.firstName, s?.lastName].filter(Boolean).join(' ').trim() || s?.signerEmail || 'Signer';
+}
+
+function isControlPerson(s) {
+  if (!s || s.isPortalAdmin === true) return false;
+  if (s.isAuthorizedSigner === true) return true;
+  if (s.isAuthorizedSigner == null && s.isPrimarySigner === true) return true;
+  return false;
+}
+
+function channelsFromChecks(wantEmail, wantSms) {
+  if (wantEmail && wantSms) return 'both';
+  if (wantSms) return 'sms';
+  return 'email';
+}
+
+function invokeUw(payload) {
+  return base44.functions.invoke(FN, payload);
+}
+
+/**
+ * Deal Room MID panel: list / create+send W-9 requests, download signed PDF, forward to Elavon.
+ */
+export default function UnderwritingRequestsPanel({
+  corporateId,
+  mid,
+  legalEntities = [],
+  signers = [],
+  profile,
+  locations = [],
+}) {
+  const midId = mid?.id || '';
+
+  const [loading, setLoading] = useState(true);
+  const [error, setError] = useState('');
+  const [requests, setRequests] = useState([]);
+  const [elavonDocsToHint, setElavonDocsToHint] = useState('');
+  const [busyId, setBusyId] = useState('');
+  const [formOpen, setFormOpen] = useState(false);
+
+  const [legalEntityId, setLegalEntityId] = useState('');
+  const [recipientId, setRecipientId] = useState('');
+  const [recipientName, setRecipientName] = useState('');
+  const [recipientEmail, setRecipientEmail] = useState('');
+  const [recipientPhone, setRecipientPhone] = useState('');
+  const [wantEmail, setWantEmail] = useState(true);
+  const [wantSms, setWantSms] = useState(false);
+  const [agentNote, setAgentNote] = useState('');
+  const [creating, setCreating] = useState(false);
+
+  const [elavonModal, setElavonModal] = useState(null); // { requestId, to, subject, bodyText }
+  const [sendingElavon, setSendingElavon] = useState(false);
+
+  const load = useCallback(async () => {
+    if (!corporateId || !midId) return;
+    setLoading(true);
+    setError('');
+    try {
+      const res = await invokeUw({ action: 'list', corporateId, midId });
+      if (res.data?.code === 'ENTITY_SCHEMA_MISSING') {
+        setError(res.data.error || 'UnderwritingRequest entity not published yet.');
+        setRequests([]);
+        return;
+      }
+      if (res.data?.error) throw new Error(res.data.error);
+      setRequests(res.data?.requests || []);
+      if (res.data?.elavonDocsToHint) setElavonDocsToHint(res.data.elavonDocsToHint);
+    } catch (err) {
+      setError(err?.response?.data?.error || err?.message || 'Could not load requests');
+      setRequests([]);
+    } finally {
+      setLoading(false);
+    }
+  }, [corporateId, midId]);
+
+  useEffect(() => {
+    load();
+  }, [load]);
+
+  // Default entity + recipient when opening form / when lists change
+  useEffect(() => {
+    if (!legalEntityId && legalEntities.length === 1) {
+      setLegalEntityId(legalEntities[0].entityId || '');
+    }
+  }, [legalEntities, legalEntityId]);
+
+  useEffect(() => {
+    if (recipientId || !signers.length) return;
+    const control = signers.find(isControlPerson) || signers[0];
+    if (control) {
+      setRecipientId(control.id);
+      setRecipientName(signerDisplayName(control));
+      setRecipientEmail(String(control.signerEmail || '').trim());
+      setRecipientPhone(String(control.corporatePhone || '').trim());
+    }
+  }, [signers, recipientId]);
+
+  const selectedEntity = useMemo(
+    () => legalEntities.find((e) => String(e.entityId) === String(legalEntityId)) || null,
+    [legalEntities, legalEntityId],
+  );
+
+  const controlPerson = useMemo(
+    () => signers.find(isControlPerson) || signers[0] || null,
+    [signers],
+  );
+
+  const locationFallback = useMemo(() => {
+    if (!mid?.locationId) return locations[0] || null;
+    return locations.find((l) => String(l.id) === String(mid.locationId)) || locations[0] || null;
+  }, [mid?.locationId, locations]);
+
+  const prefillPreview = useMemo(() => {
+    if (!selectedEntity) return null;
+    return buildW9Prefill({
+      legalEntity: selectedEntity,
+      controlPerson,
+      locationFallback,
+    });
+  }, [selectedEntity, controlPerson, locationFallback]);
+
+  const onPickRecipient = (id) => {
+    setRecipientId(id);
+    const s = signers.find((x) => String(x.id) === String(id));
+    if (!s) return;
+    setRecipientName(signerDisplayName(s));
+    setRecipientEmail(String(s.signerEmail || '').trim());
+    setRecipientPhone(String(s.corporatePhone || '').trim());
+  };
+
+  const resetForm = () => {
+    setAgentNote('');
+    setWantEmail(true);
+    setWantSms(false);
+    setFormOpen(false);
+  };
+
+  const createAndSend = async () => {
+    if (!corporateId || !midId || creating) return;
+    if (!legalEntityId) {
+      setError('Select a legal entity');
+      return;
+    }
+    if (!recipientName.trim()) {
+      setError('Recipient name is required');
+      return;
+    }
+    if (!wantEmail && !wantSms) {
+      setError('Pick at least one channel (email or SMS)');
+      return;
+    }
+    const channels = channelsFromChecks(wantEmail, wantSms);
+    if ((channels === 'email' || channels === 'both') && !recipientEmail.trim()) {
+      setError('Email required when Email channel is selected');
+      return;
+    }
+    if ((channels === 'sms' || channels === 'both') && !recipientPhone.trim()) {
+      setError('Phone required when SMS channel is selected');
+      return;
+    }
+
+    setCreating(true);
+    setError('');
+    try {
+      const createRes = await invokeUw({
+        action: 'create',
+        corporateId,
+        midId,
+        legalEntityId,
+        recipientName: recipientName.trim(),
+        recipientEmail: recipientEmail.trim() || undefined,
+        recipientPhone: recipientPhone.trim() || undefined,
+        channels,
+        agentNote: agentNote.trim() || undefined,
+      });
+      if (createRes.data?.error) throw new Error(createRes.data.error);
+      const requestId = createRes.data?.request?.id;
+      if (!requestId) throw new Error('Create succeeded but no request id returned');
+
+      const sendRes = await invokeUw({ action: 'send', requestId });
+      if (sendRes.data?.error) {
+        const warn = sendRes.data?.warnings || sendRes.data?.results?.errors;
+        throw new Error(
+          sendRes.data.error
+            + (warn?.length ? ` ΓÇö ${warn.join('; ')}` : ''),
+        );
+      }
+      if (sendRes.data?.elavonDocsToHint) setElavonDocsToHint(sendRes.data.elavonDocsToHint);
+      resetForm();
+      await load();
+    } catch (err) {
+      setError(err?.response?.data?.error || err?.message || 'Create & Send failed');
+      await load();
+    } finally {
+      setCreating(false);
+    }
+  };
+
+  const runAction = async (requestId, action) => {
+    if (!requestId || busyId) return;
+    setBusyId(`${action}:${requestId}`);
+    setError('');
+    try {
+      const res = await invokeUw({ action, requestId });
+      if (res.data?.error) throw new Error(res.data.error);
+      await load();
+    } catch (err) {
+      setError(err?.response?.data?.error || err?.message || `${action} failed`);
+    } finally {
+      setBusyId('');
+    }
+  };
+
+  const downloadSigned = async (requestId) => {
+    if (!requestId || busyId) return;
+    setBusyId(`dl:${requestId}`);
+    setError('');
+    try {
+      const res = await invokeUw({ action: 'getSignedUrl', requestId });
+      if (res.data?.error) throw new Error(res.data.error);
+      const url = res.data?.signedPdfUrl;
+      if (!url) throw new Error('No signed PDF URL');
+      if (res.data?.elavonDocsToHint) setElavonDocsToHint(res.data.elavonDocsToHint);
+      window.open(url, '_blank', 'noopener,noreferrer');
+    } catch (err) {
+      setError(err?.response?.data?.error || err?.message || 'Download failed');
+    } finally {
+      setBusyId('');
+    }
+  };
+
+  const openElavonModal = async (req) => {
+    setError('');
+    const awb = (mid?.elavonAwb || '').trim();
+    const dba = mid?.dbaName || mid?.merchantName || profile?.legalName || 'Merchant';
+    setElavonModal({
+      requestId: req.id,
+      to: elavonDocsToHint || '',
+      subject: awb
+        ? `W-9 ΓÇö AWB ${awb} ΓÇö ${dba}`
+        : `W-9 ΓÇö ${dba}`,
+      bodyText: [
+        'Hello,',
+        '',
+        `Please find attached the signed W-9 for ${dba}.`,
+        awb ? `AWB: ${awb}` : null,
+        mid?.elavonMID ? `MID: ${mid.elavonMID}` : null,
+        '',
+        'Thank you,',
+        'CliqBux Underwriting',
+      ].filter((line) => line !== null).join('\n'),
+    });
+  };
+
+  const submitElavon = async () => {
+    if (!elavonModal || sendingElavon) return;
+    const { requestId, to, subject, bodyText } = elavonModal;
+    if (!to.trim()) {
+      setError('To address is required');
+      return;
+    }
+    if (!subject.trim() || !bodyText.trim()) {
+      setError('Subject and body are required');
+      return;
+    }
+    setSendingElavon(true);
+    setError('');
+    try {
+      const res = await invokeUw({
+        action: 'sendToElavon',
+        requestId,
+        to: to.trim(),
+        subject: subject.trim(),
+        bodyText: bodyText.trim(),
+      });
+      if (res.data?.error) throw new Error(res.data.error);
+      if (res.data?.elavonDocsToHint) setElavonDocsToHint(res.data.elavonDocsToHint);
+      setElavonModal(null);
+      await load();
+    } catch (err) {
+      setError(err?.response?.data?.error || err?.message || 'Send to Elavon failed');
+    } finally {
+      setSendingElavon(false);
+    }
+  };
+
+  if (!midId) return null;
+
+  return (
+    <div className="rounded-cb border border-cb-border bg-cb-bg p-3 space-y-3">
+      <div className="flex flex-wrap items-center justify-between gap-2">
+        <p className="text-cb-caption text-gray-500 flex items-center gap-1.5">
+          <FileText className="w-3.5 h-3.5" /> Underwriting requests
+        </p>
+        <div className="flex items-center gap-2">
+          <button
+            type="button"
+            onClick={load}
+            disabled={loading}
+            className="text-gray-500 hover:text-white p-1"
+            aria-label="Refresh requests"
+          >
+            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
+          </button>
+          <button
+            type="button"
+            onClick={() => setFormOpen((v) => !v)}
+            className="flex items-center gap-1.5 text-cb-caption font-medium px-2.5 py-1.5 rounded-cb border border-cb-border text-gray-300 hover:text-white hover:border-cb-border-strong"
+          >
+            <Plus className="w-3.5 h-3.5" />
+            New W-9
+          </button>
+        </div>
+      </div>
+
+      {error && (
+        <p className="text-cb-caption text-cb-danger whitespace-pre-wrap">{error}</p>
+      )}
+
+      {formOpen && (
+        <div className="rounded-cb border border-cb-border bg-cb-surface-raised p-3 space-y-3">
+          <p className="text-cb-body text-white font-medium">New W-9 request</p>
+
+          <div>
+            <label className="block text-cb-caption text-gray-500 mb-1.5">Legal entity</label>
+            <select
+              value={legalEntityId}
+              onChange={(e) => setLegalEntityId(e.target.value)}
+              className={inputCls}
+            >
+              <option value="">Select entityΓÇª</option>
+              {legalEntities.map((e) => (
+                <option key={e.entityId} value={e.entityId}>
+                  {e.legalBusinessName || 'Entity'}
+                  {e.federalEIN ? ` ┬╖ EIN ${e.federalEIN}` : ''}
+                </option>
+              ))}
+            </select>
+          </div>
+
+          {prefillPreview && (
+            <div className="rounded-cb border border-cb-border bg-cb-bg px-3 py-2 space-y-1">
+              <p className="text-cb-caption text-gray-500">Prefill preview (server confirms on create)</p>
+              <p className="text-cb-caption text-gray-300">
+                <span className="text-white">{prefillPreview.name || 'ΓÇö'}</span>
+                {prefillPreview.businessName && prefillPreview.businessName !== prefillPreview.name && (
+                  <> ┬╖ DBA/legal {prefillPreview.businessName}</>
+                )}
+              </p>
+              <p className="text-cb-caption text-gray-400">
+                {TAX_LABELS[prefillPreview.taxClassification] || prefillPreview.taxClassification || 'Tax class ?'}
+                {prefillPreview.llcTaxClass ? ` (${prefillPreview.llcTaxClass})` : ''}
+                {' ┬╖ '}
+                TIN {prefillPreview.tin
+                  ? `ΓÇóΓÇóΓÇóΓÇó${String(prefillPreview.tin).replace(/\D/g, '').slice(-4)}`
+                  : 'not on file'}
+              </p>
+              {(prefillPreview.address || prefillPreview.city) && (
+                <p className="text-cb-caption text-gray-500">
+                  {[prefillPreview.address, prefillPreview.city, prefillPreview.state, prefillPreview.zip]
+                    .filter(Boolean)
+                    .join(', ')}
+                </p>
+              )}
+            </div>
+          )}
+
+          <div>
+            <label className="block text-cb-caption text-gray-500 mb-1.5">Recipient</label>
+            <select
+              value={recipientId}
+              onChange={(e) => onPickRecipient(e.target.value)}
+              className={inputCls}
+            >
+              <option value="">Select signerΓÇª</option>
+              {signers.map((s) => (
+                <option key={s.id} value={s.id}>
+                  {signerDisplayName(s)}
+                  {isControlPerson(s) ? ' (Control Person)' : ''}
+                </option>
+              ))}
+            </select>
+          </div>
+
+          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
+            <div>
+              <label className="block text-cb-caption text-gray-500 mb-1.5">Name</label>
+              <input
+                value={recipientName}
+                onChange={(e) => setRecipientName(e.target.value)}
+                className={inputCls}
+                placeholder="Recipient name"
+              />
+            </div>
+            <div>
+              <label className="block text-cb-caption text-gray-500 mb-1.5">Email</label>
+              <input
+                type="email"
+                value={recipientEmail}
+                onChange={(e) => setRecipientEmail(e.target.value)}
+                className={inputCls}
+                placeholder="name@company.com"
+              />
+            </div>
+            <div className="sm:col-span-2">
+              <label className="block text-cb-caption text-gray-500 mb-1.5">Phone (E.164 preferred)</label>
+              <input
+                type="tel"
+                value={recipientPhone}
+                onChange={(e) => setRecipientPhone(e.target.value)}
+                className={inputCls}
+                placeholder="+1ΓÇª"
+              />
+            </div>
+          </div>
+
+          <div>
+            <p className="text-cb-caption text-gray-500 mb-1.5">Channels</p>
+            <div className="flex flex-wrap gap-3">
+              <label className="flex items-center gap-2 text-cb-caption text-gray-300 cursor-pointer">
+                <input
+                  type="checkbox"
+                  checked={wantEmail}
+                  onChange={(e) => setWantEmail(e.target.checked)}
+                  className="rounded border-cb-border"
+                />
+                Email
+              </label>
+              <label className="flex items-center gap-2 text-cb-caption text-gray-300 cursor-pointer">
+                <input
+                  type="checkbox"
+                  checked={wantSms}
+                  onChange={(e) => setWantSms(e.target.checked)}
+                  className="rounded border-cb-border"
+                />
+                SMS
+              </label>
+            </div>
+          </div>
+
+          <div>
+            <label className="block text-cb-caption text-gray-500 mb-1.5">Agent note (optional)</label>
+            <textarea
+              value={agentNote}
+              onChange={(e) => setAgentNote(e.target.value)}
+              rows={2}
+              placeholder="Shown in the email/SMS and on the merchant W-9 page"
+              className={`${inputCls} resize-y`}
+            />
+          </div>
+
+          <div className="flex flex-wrap justify-end gap-2">
+            <button
+              type="button"
+              onClick={() => setFormOpen(false)}
+              className="text-cb-caption font-medium px-3 py-2 rounded-cb border border-cb-border text-gray-400 hover:text-white"
+            >
+              Cancel
+            </button>
+            <button
+              type="button"
+              onClick={createAndSend}
+              disabled={creating || !legalEntities.length}
+              className="flex items-center gap-1.5 bg-cb-accent text-cb-bg font-semibold text-cb-caption px-3 py-2 rounded-cb hover:opacity-90 disabled:opacity-40"
+            >
+              {creating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
+              Create &amp; Send
+            </button>
+          </div>
+          {!legalEntities.length && (
+            <p className="text-cb-caption text-gray-600">Add a legal entity on this deal before requesting a W-9.</p>
+          )}
+        </div>
+      )}
+
+      {loading && requests.length === 0 ? (
+        <p className="text-cb-caption text-gray-600 flex items-center gap-2 py-2">
+          <Loader2 className="w-3.5 h-3.5 animate-spin" /> LoadingΓÇª
+        </p>
+      ) : requests.length === 0 ? (
+        <p className="text-cb-caption text-gray-600 py-1">
+          No W-9 requests on this MID yet.
+        </p>
+      ) : (
+        <ul className="space-y-2">
+          {requests.map((req) => {
+            const st = String(req.status || '');
+            const busy = busyId.endsWith(`:${req.id}`);
+            return (
+              <li
+                key={req.id}
+                className="rounded-cb border border-cb-border bg-cb-surface-raised px-3 py-2.5"
+              >
+                <div className="flex flex-wrap items-start justify-between gap-2">
+                  <div className="min-w-0 flex-1">
+                    <div className="flex flex-wrap items-center gap-2 text-cb-caption mb-0.5">
+                      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${statusDotClass(st)}`} />
+                      <span className="text-cb-accent uppercase tracking-wide">{req.type || 'w9'}</span>
+                      <span className="text-gray-400">{statusLabel(st)}</span>
+                    </div>
+                    <p className="text-cb-body text-white truncate">
+                      {req.recipientName || 'ΓÇö'}
+                      {req.recipientEmail && (
+                        <span className="text-gray-500 text-cb-caption"> ┬╖ {req.recipientEmail}</span>
+                      )}
+                    </p>
+                    <p className="text-cb-caption text-gray-600 mt-0.5">
+                      {req.sentAt && <>Sent {formatWhen(req.sentAt)}</>}
+                      {req.openedAt && <> ┬╖ Opened {formatWhen(req.openedAt)}</>}
+                      {req.signedAt && <> ┬╖ Signed {formatWhen(req.signedAt)}</>}
+                      {req.sentToElavonAt && <> ┬╖ Elavon {formatWhen(req.sentToElavonAt)}</>}
+                      {!req.sentAt && !req.signedAt && req.created_date && (
+                        <>Created {formatWhen(req.created_date)}</>
+                      )}
+                      {req.tinMasked && <> ┬╖ TIN {req.tinMasked}</>}
+                    </p>
+                    {req.lastError && st === 'send_failed' && (
+                      <p className="text-cb-caption text-cb-danger mt-1">{req.lastError}</p>
+                    )}
+                  </div>
+                  <div className="flex flex-wrap gap-1.5 flex-shrink-0">
+                    {SIGNED.has(st) && (
+                      <>
+                        <button
+                          type="button"
+                          onClick={() => downloadSigned(req.id)}
+                          disabled={busy}
+                          className="flex items-center gap-1 text-cb-caption font-medium px-2 py-1.5 rounded-cb border border-cb-border text-gray-300 hover:text-white disabled:opacity-40"
+                        >
+                          {busyId === `dl:${req.id}`
+                            ? <Loader2 className="w-3 h-3 animate-spin" />
+                            : <Download className="w-3 h-3" />}
+                          Download
+                        </button>
+                        <button
+                          type="button"
+                          onClick={() => openElavonModal(req)}
+                          disabled={busy}
+                          className="flex items-center gap-1 text-cb-caption font-medium px-2 py-1.5 rounded-cb bg-cb-accent text-cb-bg hover:opacity-90 disabled:opacity-40"
+                        >
+                          <Mail className="w-3 h-3" />
+                          Send to Elavon
+                        </button>
+                      </>
+                    )}
+                    {UNSIGNED.has(st) && (
+                      <>
+                        <button
+                          type="button"
+                          onClick={() => runAction(req.id, st === 'draft' ? 'send' : 'resend')}
+                          disabled={busy}
+                          className="flex items-center gap-1 text-cb-caption font-medium px-2 py-1.5 rounded-cb border border-cb-border text-gray-300 hover:text-white disabled:opacity-40"
+                        >
+                          {busyId === `send:${req.id}` || busyId === `resend:${req.id}`
+                            ? <Loader2 className="w-3 h-3 animate-spin" />
+                            : <RefreshCw className="w-3 h-3" />}
+                          {st === 'draft' ? 'Send' : 'Resend'}
+                        </button>
+                        <button
+                          type="button"
+                          onClick={() => runAction(req.id, 'cancel')}
+                          disabled={busy}
+                          className="flex items-center gap-1 text-cb-caption font-medium px-2 py-1.5 rounded-cb border border-cb-border text-gray-500 hover:text-cb-danger disabled:opacity-40"
+                        >
+                          {busyId === `cancel:${req.id}`
+                            ? <Loader2 className="w-3 h-3 animate-spin" />
+                            : <X className="w-3 h-3" />}
+                          Cancel
+                        </button>
+                      </>
+                    )}
+                  </div>
+                </div>
+              </li>
+            );
+          })}
+        </ul>
+      )}
+
+      {elavonModal && (
+        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
+          <div className="w-full max-w-lg bg-cb-surface-raised border border-cb-border rounded-cb shadow-cb-overlay p-4 sm:p-5 space-y-3">
+            <div className="flex items-center justify-between gap-2">
+              <h3 className="font-display text-cb-title text-white">Send W-9 to Elavon</h3>
+              <button
+                type="button"
+                onClick={() => setElavonModal(null)}
+                className="text-gray-500 hover:text-white p-1"
+                aria-label="Close"
+              >
+                <X className="w-4 h-4" />
+              </button>
+            </div>
+            <p className="text-cb-caption text-gray-500">
+              Emails from underwriting@ via Gmail with the signed PDF attached.
+              {!elavonDocsToHint && ' Set UNDERWRITING_ELAVON_DOCS_TO to prefill To.'}
+            </p>
+            <div>
+              <label className="block text-cb-caption text-gray-500 mb-1.5">To</label>
+              <input
+                type="email"
+                value={elavonModal.to}
+                onChange={(e) => setElavonModal((m) => ({ ...m, to: e.target.value }))}
+                className={inputCls}
+                placeholder="Elavon docs inbox"
+              />
+            </div>
+            <div>
+              <label className="block text-cb-caption text-gray-500 mb-1.5">Subject</label>
+              <input
+                value={elavonModal.subject}
+                onChange={(e) => setElavonModal((m) => ({ ...m, subject: e.target.value }))}
+                className={inputCls}
+              />
+            </div>
+            <div>
+              <label className="block text-cb-caption text-gray-500 mb-1.5">Body</label>
+              <textarea
+                value={elavonModal.bodyText}
+                onChange={(e) => setElavonModal((m) => ({ ...m, bodyText: e.target.value }))}
+                rows={6}
+                className={`${inputCls} resize-y`}
+              />
+            </div>
+            <div className="flex justify-end gap-2 pt-1">
+              <button
+                type="button"
+                onClick={() => setElavonModal(null)}
+                className="text-cb-caption font-medium px-3 py-2 rounded-cb border border-cb-border text-gray-400 hover:text-white"
+              >
+                Cancel
+              </button>
+              <button
+                type="button"
+                onClick={submitElavon}
+                disabled={sendingElavon}
+                className="flex items-center gap-1.5 bg-cb-accent text-cb-bg font-semibold text-cb-caption px-4 py-2 rounded-cb hover:opacity-90 disabled:opacity-40"
+              >
+                {sendingElavon ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
+                Send
+              </button>
+            </div>
+          </div>
+        </div>
+      )}
+    </div>
+  );
+}
diff --git a/src/pages/ApplicationDealRoom.jsx b/src/pages/ApplicationDealRoom.jsx
index 6865dff..0f7766e 100644
--- a/src/pages/ApplicationDealRoom.jsx
+++ b/src/pages/ApplicationDealRoom.jsx
@@ -14,6 +14,7 @@ import { lifecycleLabel, lifecycleDotClass } from '@/lib/signerLifecycle';
 import { TIER_LABELS } from '@/lib/pricingPresets';
 import InstallerRunbook from '@/components/merchant-center/InstallerRunbook';
 import HandoffPanel from '@/components/deal-room/HandoffPanel';
+import UnderwritingRequestsPanel from '@/components/deal-room/UnderwritingRequestsPanel';
 import { HANDOFF_STAGE_LABELS } from '@/lib/onboardingFacts';
 
 const inputCls = 'w-full bg-cb-bg border border-cb-border rounded-cb px-3.5 py-2.5 text-cb-body text-white placeholder:text-gray-500 transition-colors hover:border-cb-border-strong focus:outline-none focus:ring-2 focus:ring-cb-accent focus:border-transparent';
@@ -765,6 +766,15 @@ export default function ApplicationDealRoom() {
                         </button>
                       </div>
 
+                      <UnderwritingRequestsPanel
+                        corporateId={corporateId}
+                        mid={selectedMid}
+                        legalEntities={data.legalEntities || []}
+                        signers={data.signers || []}
+                        profile={profile}
+                        locations={data.locations || []}
+                      />
+
                       <div className="rounded-cb border border-cb-border bg-cb-bg p-3 space-y-2">
                         <p className="text-cb-caption text-gray-500">Log email / note on this MID</p>
                         <div className="flex flex-wrap gap-2">

```
