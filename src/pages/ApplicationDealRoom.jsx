/**
 * ApplicationDealRoom — /admin/applications/:corporateId
 * Internal collaboration: notes, tasks, per-MID AWB + underwriting@ message threads.
 * Admin-only. Merchants never see this.
 */
import { useState, useEffect, useCallback } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import {
  ArrowLeft, Loader2, Plus, Check, Trash2, Eye, LayoutDashboard,
  Building2, Users, CreditCard, FileText, AlertCircle, Mail, RefreshCw, Send,
} from 'lucide-react';
import { lifecycleLabel, lifecycleDotClass } from '@/lib/signerLifecycle';
import { TIER_LABELS } from '@/lib/pricingPresets';

const inputCls = 'w-full bg-cb-bg border border-cb-border rounded-cb px-3.5 py-2.5 text-cb-body text-white placeholder:text-gray-500 transition-colors hover:border-cb-border-strong focus:outline-none focus:ring-2 focus:ring-cb-accent focus:border-transparent';

function formatWhen(iso) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function directionLabel(d) {
  if (d === 'outbound') return 'Sent';
  if (d === 'internal') return 'Logged';
  return 'Received';
}

export default function ApplicationDealRoom() {
  const { corporateId: rawId } = useParams();
  const corporateId = decodeURIComponent(rawId || '').trim();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [data, setData] = useState(null);

  const [noteDraft, setNoteDraft] = useState('');
  const [taskDraft, setTaskDraft] = useState('');
  const [taskAssignee, setTaskAssignee] = useState('');
  const [savingNote, setSavingNote] = useState(false);
  const [savingTask, setSavingTask] = useState(false);
  const [busyId, setBusyId] = useState('');
  const [impersonating, setImpersonating] = useState(false);

  const [selectedMidId, setSelectedMidId] = useState('');
  const [awbDraft, setAwbDraft] = useState('');
  const [savingAwb, setSavingAwb] = useState(false);
  const [uwSubject, setUwSubject] = useState('');
  const [uwBody, setUwBody] = useState('');
  const [uwDirection, setUwDirection] = useState('inbound');
  const [loggingUw, setLoggingUw] = useState(false);
  const [requestingStatus, setRequestingStatus] = useState(false);
  const [syncingMail, setSyncingMail] = useState(false);
  const [syncMsg, setSyncMsg] = useState('');

  const load = useCallback(async () => {
    if (!corporateId) return;
    setLoading(true);
    setError('');
    try {
      const res = await base44.functions.invoke('manageApplicationDesk', {
        action: 'get',
        corporateId,
      });
      if (res.data?.error) throw new Error(res.data.error);
      setData(res.data);
      const mids = res.data?.mids || [];
      setSelectedMidId((prev) => {
        if (prev && mids.some((m) => m.id === prev)) return prev;
        return mids[0]?.id || '';
      });
    } catch (err) {
      console.error('[DealRoom]', err);
      setError(err?.response?.data?.error || err.message || 'Could not load deal room');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [corporateId]);

  useEffect(() => { load(); }, [load]);

  const selectedMid = (data?.mids || []).find((m) => m.id === selectedMidId) || null;

  useEffect(() => {
    setAwbDraft(selectedMid?.elavonAwb || '');
  }, [selectedMid?.id, selectedMid?.elavonAwb]);

  const profile = data?.profile;
  const account = data?.account;
  const title = profile?.legalName || account?.name || corporateId;
  const uwMessages = data?.uwMessages || [];
  const midMessages = selectedMidId
    ? uwMessages.filter((m) => m.midId === selectedMidId)
    : [];

  const openPortal = async (destination = 'portal') => {
    setImpersonating(true);
    setError('');
    try {
      const res = await base44.functions.invoke('manageStagedApplication', {
        action: 'impersonate',
        corporateId,
        destination,
      });
      if (res.data?.error || !res.data?.portalUrl) {
        throw new Error(res.data?.error || 'Impersonation failed');
      }
      window.open(res.data.portalUrl, '_blank', 'noopener,noreferrer');
    } catch (err) {
      setError(err?.response?.data?.error || err.message || 'Could not open portal');
    } finally {
      setImpersonating(false);
    }
  };

  const addNote = async () => {
    if (!noteDraft.trim() || savingNote) return;
    setSavingNote(true);
    setError('');
    try {
      const res = await base44.functions.invoke('manageApplicationDesk', {
        action: 'addNote',
        corporateId,
        body: noteDraft.trim(),
      });
      if (res.data?.error) throw new Error(res.data.error);
      setNoteDraft('');
      await load();
    } catch (err) {
      setError(err?.response?.data?.error || err.message || 'Could not save note');
    } finally {
      setSavingNote(false);
    }
  };

  const addTask = async () => {
    if (!taskDraft.trim() || savingTask) return;
    setSavingTask(true);
    setError('');
    try {
      const res = await base44.functions.invoke('manageApplicationDesk', {
        action: 'addTask',
        corporateId,
        body: taskDraft.trim(),
        assignee: taskAssignee.trim(),
      });
      if (res.data?.error) throw new Error(res.data.error);
      setTaskDraft('');
      setTaskAssignee('');
      await load();
    } catch (err) {
      setError(err?.response?.data?.error || err.message || 'Could not add task');
    } finally {
      setSavingTask(false);
    }
  };

  const toggleTask = async (item) => {
    setBusyId(item.id);
    try {
      const next = item.status === 'done' ? 'open' : 'done';
      const res = await base44.functions.invoke('manageApplicationDesk', {
        action: 'updateTask',
        corporateId,
        itemId: item.id,
        status: next,
      });
      if (res.data?.error) throw new Error(res.data.error);
      await load();
    } catch (err) {
      setError(err?.response?.data?.error || err.message || 'Could not update task');
    } finally {
      setBusyId('');
    }
  };

  const deleteItem = async (item) => {
    if (!window.confirm(item.type === 'task' ? 'Delete this task?' : 'Delete this note?')) return;
    setBusyId(item.id);
    try {
      const res = await base44.functions.invoke('manageApplicationDesk', {
        action: 'deleteItem',
        corporateId,
        itemId: item.id,
      });
      if (res.data?.error) throw new Error(res.data.error);
      await load();
    } catch (err) {
      setError(err?.response?.data?.error || err.message || 'Could not delete');
    } finally {
      setBusyId('');
    }
  };

  const saveAwb = async () => {
    if (!selectedMidId || savingAwb) return;
    setSavingAwb(true);
    setError('');
    try {
      const res = await base44.functions.invoke('manageApplicationDesk', {
        action: 'setMidAwb',
        corporateId,
        midId: selectedMidId,
        elavonAwb: awbDraft.trim(),
      });
      if (res.data?.error) throw new Error(res.data.error);
      await load();
    } catch (err) {
      setError(err?.response?.data?.error || err.message || 'Could not save AWB');
    } finally {
      setSavingAwb(false);
    }
  };

  const logUwMessage = async () => {
    if (!selectedMidId || !uwBody.trim() || loggingUw) return;
    setLoggingUw(true);
    setError('');
    try {
      const res = await base44.functions.invoke('manageApplicationDesk', {
        action: 'logUwMessage',
        corporateId,
        midId: selectedMidId,
        subject: uwSubject.trim(),
        bodyText: uwBody.trim(),
        direction: uwDirection,
      });
      if (res.data?.error) throw new Error(res.data.error);
      setUwSubject('');
      setUwBody('');
      await load();
    } catch (err) {
      setError(err?.response?.data?.error || err.message || 'Could not log message');
    } finally {
      setLoggingUw(false);
    }
  };

  const requestStatus = async () => {
    if (!selectedMidId || requestingStatus) return;
    setRequestingStatus(true);
    setError('');
    try {
      const res = await base44.functions.invoke('manageApplicationDesk', {
        action: 'requestStatusInquiry',
        corporateId,
        midId: selectedMidId,
      });
      if (res.data?.error) throw new Error(res.data.error);
      if (res.data?.mailto) {
        window.open(res.data.mailto, '_blank', 'noopener,noreferrer');
      }
      setSyncMsg(
        `Status request logged for AWB ${res.data.awb}. Send from underwriting@, then Sync inbox for Elavon’s automated reply (no DBA/MID in auto-replies).`
      );
      await load();
    } catch (err) {
      setError(err?.response?.data?.error || err.message || 'Could not start status request');
    } finally {
      setRequestingStatus(false);
    }
  };

  const openEscalation = (which) => {
    const awb = (selectedMid?.elavonAwb || awbDraft || '').trim();
    if (!awb) {
      setError('Save an AWB on this MID before escalating, or use FulSer without AWB from your mail client.');
      return;
    }
    const addr = which === 'msp' ? 'MSPFulSer@elavon.com' : 'FulSerCenter@elavon.com';
    const mailto = `mailto:${addr}?subject=${encodeURIComponent(`Escalation AWB ${awb}`)}`;
    window.open(mailto, '_blank', 'noopener,noreferrer');
  };

  const deleteUw = async (messageId) => {
    if (!window.confirm('Delete this underwriting message?')) return;
    setBusyId(messageId);
    try {
      const res = await base44.functions.invoke('manageApplicationDesk', {
        action: 'deleteUwMessage',
        corporateId,
        messageId,
      });
      if (res.data?.error) throw new Error(res.data.error);
      await load();
    } catch (err) {
      setError(err?.response?.data?.error || err.message || 'Could not delete message');
    } finally {
      setBusyId('');
    }
  };

  const syncMail = async () => {
    setSyncingMail(true);
    setSyncMsg('');
    setError('');
    try {
      const res = await base44.functions.invoke('syncUnderwritingMail', {
        corporateId,
        maxResults: 40,
      });
      if (res.data?.error) throw new Error(res.data.error);
      const created = res.data?.created ?? 0;
      const unmatched = res.data?.unmatched ?? 0;
      const skipped = res.data?.skippedDup ?? 0;
      setSyncMsg(`Synced: ${created} new · ${skipped} already filed · ${unmatched} unmatched (need AWB on MID)`);
      await load();
    } catch (err) {
      setError(err?.response?.data?.error || err.message || 'Mail sync failed');
    } finally {
      setSyncingMail(false);
    }
  };

  const notes = data?.notes || [];
  const tasks = data?.tasks || [];
  const openTasks = tasks.filter((t) => t.status !== 'done');
  const doneTasks = tasks.filter((t) => t.status === 'done');
  const pricingLabel = profile?.pricingTier
    ? (TIER_LABELS[profile.pricingTier] || profile.pricingTier)
    : '—';

  return (
    <div className="min-h-screen bg-cb-bg text-white">
      <header className="border-b border-cb-border bg-cb-surface px-4 sm:px-6 py-4">
        <div className="max-w-6xl mx-auto flex flex-wrap items-start gap-4">
          <button
            type="button"
            onClick={() => navigate('/admin/applications')}
            className="flex items-center gap-1.5 text-cb-caption text-gray-400 hover:text-white mt-1"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Applications
          </button>
          <div className="flex-1 min-w-0">
            <p className="text-cb-caption text-gray-500 mb-0.5">Deal room</p>
            <h1 className="font-display text-cb-display text-white truncate">{title}</h1>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-cb-caption text-gray-500">
              <span className="font-mono">{corporateId}</span>
              {account?.name && (
                <span className="inline-flex items-center gap-1">
                  <Building2 className="w-3 h-3" /> {account.name}
                </span>
              )}
              {profile?.applicationStatus && <span>{profile.applicationStatus}</span>}
              <span>{pricingLabel}</span>
              {profile?.portalLockStatus && profile.portalLockStatus !== 'unlocked' && (
                <span className="text-cb-accent">Lock: {profile.portalLockStatus}</span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              type="button"
              onClick={() => openPortal('portal')}
              disabled={impersonating}
              className="flex items-center gap-1.5 text-cb-caption font-semibold px-3 py-2 rounded-cb border border-cb-border text-gray-300 hover:text-white hover:border-cb-border-strong disabled:opacity-40"
            >
              {impersonating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Eye className="w-3.5 h-3.5" />}
              Open portal
            </button>
            <button
              type="button"
              onClick={() => openPortal('dashboard')}
              disabled={impersonating}
              className="flex items-center gap-1.5 text-cb-caption font-semibold px-3 py-2 rounded-cb bg-cb-accent text-cb-bg hover:opacity-90 disabled:opacity-40"
            >
              <LayoutDashboard className="w-3.5 h-3.5" /> Dashboard
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
        {error && (
          <div className="mb-4 rounded-cb border border-cb-danger/30 bg-cb-surface-raised px-4 py-3 flex gap-2">
            <AlertCircle className="w-4 h-4 text-cb-danger flex-shrink-0 mt-0.5" />
            <p className="text-cb-caption text-gray-300 flex-1">{error}</p>
            <button type="button" onClick={() => setError('')} className="text-cb-caption text-gray-500 hover:text-white">Dismiss</button>
          </div>
        )}

        {loading && (
          <div className="flex items-center gap-2 text-cb-caption text-gray-500 py-16 justify-center">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading deal room…
          </div>
        )}

        {!loading && data && (
          <div className="space-y-6">
            {/* Underwriting / per-MID AWB threads */}
            <section className="bg-cb-surface border border-cb-border rounded-cb p-4 sm:p-5">
              <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                <h2 className="font-display text-cb-title text-white flex items-center gap-2">
                  <Mail className="w-4 h-4 text-gray-500" /> Underwriting by MID
                </h2>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={syncMail}
                    disabled={syncingMail}
                    title={data.gmailSyncConfigured
                      ? 'Pull underwriting@ inbox and match by AWB'
                      : 'Gmail env not set — configure UNDERWRITING_GMAIL_* or log emails manually'}
                    className="flex items-center gap-1.5 text-cb-caption font-medium px-2.5 py-1.5 rounded-cb border border-cb-border text-gray-300 hover:text-white hover:border-cb-border-strong disabled:opacity-40"
                  >
                    {syncingMail ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                    Sync inbox
                  </button>
                </div>
              </div>
              {syncMsg && <p className="text-cb-caption text-cb-success mb-3">{syncMsg}</p>}
              {!data.gmailSyncConfigured && (
                <p className="text-cb-caption text-gray-600 mb-3">
                  Inbox sync needs Gmail OAuth env vars for underwriting@cliqbux.com. Until then, set each MID’s AWB and log emails below.
                </p>
              )}

              {(data.mids || []).length === 0 ? (
                <p className="text-cb-caption text-gray-600">No MIDs on this deal yet.</p>
              ) : (
                <>
                  <div className="flex flex-wrap gap-2 mb-4">
                    {(data.mids || []).map((m) => {
                      const count = uwMessages.filter((msg) => msg.midId === m.id).length;
                      const active = m.id === selectedMidId;
                      return (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => setSelectedMidId(m.id)}
                          className={`text-cb-caption px-3 py-1.5 rounded-cb border transition-all ${
                            active
                              ? 'border-cb-accent bg-cb-accent-muted text-cb-accent'
                              : 'border-cb-border text-gray-400 hover:text-white hover:border-cb-border-strong'
                          }`}
                        >
                          {m.dbaName || m.merchantName || 'MID'}
                          {m.elavonAwb ? ` · AWB ${m.elavonAwb}` : ' · no AWB'}
                          {count > 0 && ` · ${count}`}
                        </button>
                      );
                    })}
                  </div>

                  {selectedMid && (
                    <div className="space-y-4">
                      <div className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-end">
                        <div className="flex-1">
                          <label className="block text-cb-caption text-gray-500 mb-1.5">Elavon AWB</label>
                          <input
                            value={awbDraft}
                            onChange={(e) => setAwbDraft(e.target.value)}
                            placeholder="Paste AWB from Elavon underwriting"
                            className={inputCls}
                          />
                        </div>
                        <button
                          type="button"
                          onClick={saveAwb}
                          disabled={savingAwb}
                          className="flex items-center justify-center gap-1.5 bg-cb-accent text-cb-bg font-semibold text-cb-caption px-4 py-2.5 rounded-cb hover:opacity-90 disabled:opacity-40"
                        >
                          {savingAwb ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                          Save AWB
                        </button>
                      </div>
                      <p className="text-cb-caption text-gray-600">
                        Status: {selectedMid.applicationStepStatus || '—'}
                        {selectedMid.mspApplicationNo && <> · MSP #{selectedMid.mspApplicationNo}</>}
                        {selectedMid.elavonMID && <> · MID {selectedMid.elavonMID}</>}
                      </p>
                      <p className="text-cb-caption text-gray-600">
                        Apps submitted after Jul 7, 2026: request status via ApplicationStatus@elavon.com with{' '}
                        <span className="text-gray-400">AWB in the subject</span> — one AWB per email. Auto-replies omit DBA, legal name, MID, and data-entry pends.
                      </p>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={requestStatus}
                          disabled={requestingStatus || !(awbDraft || selectedMid.elavonAwb)}
                          className="flex items-center gap-1.5 bg-cb-accent text-cb-bg font-semibold text-cb-caption px-3 py-2 rounded-cb hover:opacity-90 disabled:opacity-40"
                        >
                          {requestingStatus ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                          Request status
                        </button>
                        <button
                          type="button"
                          onClick={() => openEscalation('msp')}
                          className="flex items-center gap-1.5 text-cb-caption font-medium px-3 py-2 rounded-cb border border-cb-border text-gray-300 hover:text-white hover:border-cb-border-strong"
                        >
                          Escalate MSPFulSer
                        </button>
                        <button
                          type="button"
                          onClick={() => openEscalation('ful')}
                          className="flex items-center gap-1.5 text-cb-caption font-medium px-3 py-2 rounded-cb border border-cb-border text-gray-300 hover:text-white hover:border-cb-border-strong"
                        >
                          Escalate FulSer
                        </button>
                      </div>

                      <div className="rounded-cb border border-cb-border bg-cb-bg p-3 space-y-2">
                        <p className="text-cb-caption text-gray-500">Log email / note on this MID</p>
                        <div className="flex flex-wrap gap-2">
                          {['inbound', 'outbound', 'internal'].map((d) => (
                            <button
                              key={d}
                              type="button"
                              onClick={() => setUwDirection(d)}
                              className={`text-cb-caption px-2.5 py-1 rounded-cb border ${
                                uwDirection === d
                                  ? 'border-cb-accent text-cb-accent bg-cb-accent-muted'
                                  : 'border-cb-border text-gray-500'
                              }`}
                            >
                              {directionLabel(d)}
                            </button>
                          ))}
                        </div>
                        <input
                          value={uwSubject}
                          onChange={(e) => setUwSubject(e.target.value)}
                          placeholder="Subject (optional)"
                          className={inputCls}
                        />
                        <textarea
                          value={uwBody}
                          onChange={(e) => setUwBody(e.target.value)}
                          placeholder="Paste email body or underwriting note…"
                          rows={3}
                          className={`${inputCls} resize-y`}
                        />
                        <div className="flex justify-end">
                          <button
                            type="button"
                            onClick={logUwMessage}
                            disabled={!uwBody.trim() || loggingUw}
                            className="flex items-center gap-1.5 bg-cb-accent text-cb-bg font-semibold text-cb-caption px-3 py-2 rounded-cb hover:opacity-90 disabled:opacity-40"
                          >
                            {loggingUw ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                            Add to thread
                          </button>
                        </div>
                      </div>

                      <ul className="space-y-3">
                        {midMessages.length === 0 && (
                          <li className="text-cb-caption text-gray-600 py-2">
                            No messages on this MID yet. Set AWB, then sync inbox or log manually.
                          </li>
                        )}
                        {midMessages.map((msg) => (
                          <li key={msg.id} className="rounded-cb border border-cb-border bg-cb-surface-raised px-3 py-3">
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-2 text-cb-caption text-gray-500 mb-1">
                                  <span className="text-cb-accent">{directionLabel(msg.direction)}</span>
                                  <span>{msg.source}</span>
                                  <span>{formatWhen(msg.messageDate || msg.created_date)}</span>
                                  {msg.elavonAwb && <span className="font-mono">AWB {msg.elavonAwb}</span>}
                                </div>
                                {msg.subject && (
                                  <p className="text-cb-body text-white font-medium mb-1">{msg.subject}</p>
                                )}
                                <p className="text-cb-body text-gray-300 whitespace-pre-wrap">{msg.bodyText}</p>
                                {(msg.fromAddress || msg.toAddress) && (
                                  <p className="text-cb-caption text-gray-600 mt-2">
                                    {msg.fromAddress && <>From {msg.fromAddress}</>}
                                    {msg.fromAddress && msg.toAddress && ' · '}
                                    {msg.toAddress && <>To {msg.toAddress}</>}
                                  </p>
                                )}
                              </div>
                              <button
                                type="button"
                                onClick={() => deleteUw(msg.id)}
                                disabled={busyId === msg.id}
                                className="text-gray-600 hover:text-cb-danger p-1 flex-shrink-0"
                                aria-label="Delete message"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </>
              )}
            </section>

            <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
              <div className="lg:col-span-3 space-y-6">
                <section className="bg-cb-surface border border-cb-border rounded-cb p-4 sm:p-5">
                  <div className="flex items-center justify-between mb-3">
                    <h2 className="font-display text-cb-title text-white">Tasks</h2>
                    <span className="text-cb-caption text-gray-500">{openTasks.length} open</span>
                  </div>
                  <div className="flex flex-col sm:flex-row gap-2 mb-4">
                    <input
                      value={taskDraft}
                      onChange={(e) => setTaskDraft(e.target.value)}
                      placeholder="Add a task…"
                      className={`${inputCls} flex-1`}
                      onKeyDown={(e) => e.key === 'Enter' && addTask()}
                    />
                    <input
                      value={taskAssignee}
                      onChange={(e) => setTaskAssignee(e.target.value)}
                      placeholder="Owner (optional)"
                      className={`${inputCls} sm:w-40`}
                      onKeyDown={(e) => e.key === 'Enter' && addTask()}
                    />
                    <button
                      type="button"
                      onClick={addTask}
                      disabled={!taskDraft.trim() || savingTask}
                      className="flex items-center justify-center gap-1.5 bg-cb-accent text-cb-bg font-semibold text-cb-caption px-3 py-2.5 rounded-cb hover:opacity-90 disabled:opacity-40"
                    >
                      {savingTask ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                      Add
                    </button>
                  </div>
                  <ul className="space-y-2">
                    {openTasks.length === 0 && doneTasks.length === 0 && (
                      <li className="text-cb-caption text-gray-600 py-2">No tasks yet.</li>
                    )}
                    {[...openTasks, ...doneTasks].map((t) => (
                      <li
                        key={t.id}
                        className={`flex items-start gap-3 rounded-cb border border-cb-border px-3 py-2.5 ${
                          t.status === 'done' ? 'opacity-60' : 'bg-cb-surface-raised'
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => toggleTask(t)}
                          disabled={busyId === t.id}
                          aria-label={t.status === 'done' ? 'Mark open' : 'Mark done'}
                          className={`mt-0.5 w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${
                            t.status === 'done'
                              ? 'bg-cb-success border-cb-success text-cb-bg'
                              : 'border-cb-border-strong hover:border-cb-accent'
                          }`}
                        >
                          {busyId === t.id ? (
                            <Loader2 className="w-2.5 h-2.5 animate-spin" />
                          ) : t.status === 'done' ? (
                            <Check className="w-2.5 h-2.5" />
                          ) : null}
                        </button>
                        <div className="flex-1 min-w-0">
                          <p className={`text-cb-body ${t.status === 'done' ? 'line-through text-gray-500' : 'text-white'}`}>
                            {t.body}
                          </p>
                          <p className="text-cb-caption text-gray-600 mt-0.5">
                            {t.assignee && <span>{t.assignee} · </span>}
                            {t.authorName || t.authorEmail} · {formatWhen(t.created_date || t.createdAt)}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => deleteItem(t)}
                          disabled={busyId === t.id}
                          className="text-gray-600 hover:text-cb-danger p-1"
                          aria-label="Delete task"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>

                <section className="bg-cb-surface border border-cb-border rounded-cb p-4 sm:p-5">
                  <h2 className="font-display text-cb-title text-white mb-3">Internal notes</h2>
                  <div className="flex flex-col gap-2 mb-4">
                    <textarea
                      value={noteDraft}
                      onChange={(e) => setNoteDraft(e.target.value)}
                      placeholder="Add a note for sales, CS, or underwriting…"
                      rows={3}
                      className={`${inputCls} resize-y min-h-[5rem]`}
                    />
                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={addNote}
                        disabled={!noteDraft.trim() || savingNote}
                        className="flex items-center gap-1.5 bg-cb-accent text-cb-bg font-semibold text-cb-caption px-3 py-2 rounded-cb hover:opacity-90 disabled:opacity-40"
                      >
                        {savingNote ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                        Post note
                      </button>
                    </div>
                  </div>
                  <ul className="space-y-3">
                    {notes.length === 0 && (
                      <li className="text-cb-caption text-gray-600 py-2">No notes yet.</li>
                    )}
                    {notes.map((n) => (
                      <li key={n.id} className="rounded-cb border border-cb-border bg-cb-surface-raised px-3 py-3">
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-cb-body text-gray-200 whitespace-pre-wrap flex-1">{n.body}</p>
                          <button
                            type="button"
                            onClick={() => deleteItem(n)}
                            disabled={busyId === n.id}
                            className="text-gray-600 hover:text-cb-danger p-1 flex-shrink-0"
                            aria-label="Delete note"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        <p className="text-cb-caption text-gray-600 mt-2">
                          {n.authorName || n.authorEmail} · {formatWhen(n.created_date || n.createdAt)}
                        </p>
                      </li>
                    ))}
                  </ul>
                </section>
              </div>

              <aside className="lg:col-span-2 space-y-4">
                <section className="bg-cb-surface border border-cb-border rounded-cb p-4">
                  <h2 className="font-display text-cb-title text-white mb-3 flex items-center gap-2">
                    <CreditCard className="w-4 h-4 text-gray-500" /> MIDs
                  </h2>
                  {(data.mids || []).length === 0 && (
                    <p className="text-cb-caption text-gray-600">No MIDs yet.</p>
                  )}
                  <ul className="space-y-2">
                    {(data.mids || []).map((m) => (
                      <li key={m.id} className="rounded-cb border border-cb-border px-3 py-2">
                        <p className="text-cb-body text-white truncate">{m.dbaName || m.merchantName || 'MID'}</p>
                        <p className="text-cb-caption text-gray-500 mt-0.5">
                          {m.applicationStepStatus || '—'}
                          {m.elavonAwb && <> · AWB {m.elavonAwb}</>}
                          {m.mspApplicationNo && <> · App #{m.mspApplicationNo}</>}
                          {m.elavonMID && <> · MID {m.elavonMID}</>}
                        </p>
                      </li>
                    ))}
                  </ul>
                </section>

                <section className="bg-cb-surface border border-cb-border rounded-cb p-4">
                  <h2 className="font-display text-cb-title text-white mb-3 flex items-center gap-2">
                    <Users className="w-4 h-4 text-gray-500" /> Signers
                  </h2>
                  {(data.signers || []).length === 0 && (
                    <p className="text-cb-caption text-gray-600">No signers yet.</p>
                  )}
                  <ul className="space-y-2">
                    {(data.signers || []).map((s) => (
                      <li key={s.id} className="flex items-center gap-2 text-cb-caption">
                        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${lifecycleDotClass(s.identityStatus)}`} />
                        <span className="text-white truncate">{s.firstName} {s.lastName}</span>
                        <span className="text-gray-600 truncate">{lifecycleLabel(s.identityStatus)}</span>
                      </li>
                    ))}
                  </ul>
                </section>

                <section className="bg-cb-surface border border-cb-border rounded-cb p-4">
                  <h2 className="font-display text-cb-title text-white mb-3 flex items-center gap-2">
                    <FileText className="w-4 h-4 text-gray-500" /> Legal entities
                  </h2>
                  {(data.legalEntities || []).length === 0 && (
                    <p className="text-cb-caption text-gray-600">None on file.</p>
                  )}
                  <ul className="space-y-2">
                    {(data.legalEntities || []).map((e) => (
                      <li key={e.entityId} className="text-cb-caption">
                        <span className="text-white">{e.legalBusinessName || 'Entity'}</span>
                        {e.federalEIN && <span className="text-gray-600"> · EIN {e.federalEIN}</span>}
                      </li>
                    ))}
                  </ul>
                </section>

                <Link
                  to="/admin/applications"
                  className="inline-flex text-cb-caption text-cb-accent hover:underline px-1"
                >
                  ← Back to applications list
                </Link>
              </aside>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
