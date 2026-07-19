/**
 * ApplicationDealRoom — /admin/applications/:corporateId
 * Internal post-signing collaboration: notes, tasks, read-only snapshot.
 * Admin-only. Merchants never see this.
 */
import { useState, useEffect, useCallback } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import {
  ArrowLeft, Loader2, Plus, Check, Trash2, Eye, LayoutDashboard,
  Building2, Users, CreditCard, FileText, AlertCircle,
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
    } catch (err) {
      console.error('[DealRoom]', err);
      setError(err?.response?.data?.error || err.message || 'Could not load deal room');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [corporateId]);

  useEffect(() => { load(); }, [load]);

  const profile = data?.profile;
  const account = data?.account;
  const title = profile?.legalName || account?.name || corporateId;

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
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
            {/* Notes + Tasks */}
            <div className="lg:col-span-3 space-y-6">
              {/* Tasks */}
              <section className="bg-cb-surface border border-cb-border rounded-cb p-4 sm:p-5">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="font-display text-cb-title text-white">Tasks</h2>
                  <span className="text-cb-caption text-gray-500">
                    {openTasks.length} open
                  </span>
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

              {/* Notes */}
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

            {/* Snapshot */}
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
                        {m.mspApplicationNo && <> · App #{m.mspApplicationNo}</>}
                        {m.elavonMID && <> · MID {m.elavonMID}</>}
                        {m.mccCode && <> · MCC {m.mccCode}</>}
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
                      <span className="text-white truncate">
                        {s.firstName} {s.lastName}
                      </span>
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

              <p className="text-cb-caption text-gray-600 px-1">
                Email feed and per-MID AWB history come in a later phase.
              </p>
              <Link
                to="/admin/applications"
                className="inline-flex text-cb-caption text-cb-accent hover:underline px-1"
              >
                ← Back to applications list
              </Link>
            </aside>
          </div>
        )}
      </main>
    </div>
  );
}
