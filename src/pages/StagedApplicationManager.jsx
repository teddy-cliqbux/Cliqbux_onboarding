import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import {
  Plus, Loader2, Send, Trash2, ChevronDown, ChevronRight,
  CheckCircle2, Store, Users, FileText, Edit2, X, Check,
  Copy, ExternalLink, Clock, AlertCircle
} from 'lucide-react';

const inputCls = 'w-full bg-[#111318] border border-white/20 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent';
const labelCls = 'block text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5';

const STATUS_STYLES = {
  draft:  'bg-gray-500/15 text-gray-400 border-gray-500/30',
  ready:  'bg-blue-500/15 text-blue-400 border-blue-500/30',
  sent:   'bg-green-500/15 text-green-400 border-green-500/30',
};

function StatusBadge({ status }) {
  return (
    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${STATUS_STYLES[status] || STATUS_STYLES.draft}`}>
      {status}
    </span>
  );
}

// ── Stage Editor ──────────────────────────────────────────────────────────────

function StageEditor({ stage, corporateId, onSaved, onClose }) {
  const [label, setLabel] = useState(stage?.label || '');
  const [locations, setLocations] = useState([]);
  const [concepts, setConcepts] = useState([]);
  const [signers, setSigners] = useState([]);
  const [selectedLocIds, setSelectedLocIds] = useState(stage?.includedLocationIds || []);
  const [selectedConceptIds, setSelectedConceptIds] = useState(stage?.includedConceptIds || []);
  const [selectedSignerIds, setSelectedSignerIds] = useState(stage?.includedSignerIds || []);
  const [prefilledData, setPrefilledData] = useState(
    stage?.prefilledData ? JSON.stringify(stage.prefilledData, null, 2) : '{}'
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [locRes, conRes, sigRes] = await Promise.all([
        base44.functions.invoke('listLocations', { corporateId }),
        base44.functions.invoke('manageMerchantID', { action: 'list', corporateId }),
        base44.functions.invoke('manageSigner', { action: 'list', corporateId }),
      ]);
      setLocations(locRes.data?.locations || []);
      setConcepts(conRes.data?.merchantIDs || []);
      setSigners(sigRes.data?.signers || []);
    } catch (_) {}
    finally { setLoading(false); }
  };

  const toggleItem = (id, list, setList) => {
    setList(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const handleSave = async () => {
    setSaving(true); setError('');
    try {
      let parsedPrefill = {};
      try { parsedPrefill = JSON.parse(prefilledData); } catch { throw new Error('Prefilled Data must be valid JSON'); }

      const payload = {
        label: label || 'Staged Application',
        includedLocationIds: selectedLocIds,
        includedConceptIds: selectedConceptIds,
        includedSignerIds: selectedSignerIds,
        prefilledData: parsedPrefill,
        status: 'ready',
      };

      let res;
      if (stage?.id) {
        res = await base44.functions.invoke('manageStagedApplication', { action: 'update', stageId: stage.id, data: payload });
      } else {
        res = await base44.functions.invoke('manageStagedApplication', { action: 'create', corporateId, data: payload });
      }
      if (res.data?.error) throw new Error(res.data.error);
      onSaved(res.data.stage);
    } catch (err) { setError(err.message || 'Save failed'); }
    finally { setSaving(false); }
  };

  if (loading) return (
    <div className="flex items-center justify-center py-16">
      <Loader2 className="w-6 h-6 text-amber-400 animate-spin" />
    </div>
  );

  const locationsForSelected = locations.filter(l => selectedLocIds.includes(l.id || l.locationId));
  const conceptsForSelectedLocs = concepts.filter(c => selectedLocIds.includes(c.locationId));

  return (
    <div className="space-y-6">
      {/* Label */}
      <div>
        <label className={labelCls}>Application Label (internal)</label>
        <input value={label} onChange={e => setLabel(e.target.value)} placeholder="e.g. Main Street Locations" className={inputCls} />
      </div>

      {/* Locations */}
      <div>
        <p className={labelCls + ' mb-2'}>Included Locations ({selectedLocIds.length} of {locations.length})</p>
        <div className="space-y-1.5">
          {locations.length === 0 && <p className="text-xs text-gray-500 italic">No locations found for this merchant.</p>}
          {locations.map(loc => {
            const id = loc.id || loc.locationId;
            const checked = selectedLocIds.includes(id);
            return (
              <label key={id} className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border cursor-pointer transition-all ${checked ? 'border-amber-500/40 bg-amber-500/8' : 'border-white/10 hover:border-white/20'}`}>
                <div className={`w-4 h-4 rounded flex items-center justify-center flex-shrink-0 border ${checked ? 'bg-amber-500 border-amber-500' : 'border-white/30'}`}>
                  {checked && <Check className="w-2.5 h-2.5 text-black" />}
                </div>
                <input type="checkbox" className="hidden" checked={checked} onChange={() => toggleItem(id, selectedLocIds, setSelectedLocIds)} />
                <Store className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-white truncate">{loc.dbaName}</p>
                  <p className="text-[10px] text-gray-500 truncate">{loc.businessAddress}</p>
                </div>
              </label>
            );
          })}
        </div>
      </div>

      {/* MIDs — only for selected locations */}
      {selectedLocIds.length > 0 && (
        <div>
          <p className={labelCls + ' mb-2'}>Included MIDs ({selectedConceptIds.length} selected)</p>
          <p className="text-[10px] text-gray-500 mb-2">Only showing MIDs under selected locations.</p>
          <div className="space-y-1.5">
            {conceptsForSelectedLocs.length === 0 && <p className="text-xs text-gray-500 italic">No MIDs found for selected locations.</p>}
            {conceptsForSelectedLocs.map(c => {
              const checked = selectedConceptIds.includes(c.id);
              return (
                <label key={c.id} className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border cursor-pointer transition-all ${checked ? 'border-blue-500/40 bg-blue-500/8' : 'border-white/10 hover:border-white/20'}`}>
                  <div className={`w-4 h-4 rounded flex items-center justify-center flex-shrink-0 border ${checked ? 'bg-blue-500 border-blue-500' : 'border-white/30'}`}>
                    {checked && <Check className="w-2.5 h-2.5 text-white" />}
                  </div>
                  <input type="checkbox" className="hidden" checked={checked} onChange={() => toggleItem(c.id, selectedConceptIds, setSelectedConceptIds)} />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-white truncate">{c.dbaName || c.merchantName}</p>
                    <p className="text-[10px] text-gray-500">{c.mccCode || 'No MCC'} · {c.applicationStepStatus || 'In Review'}</p>
                  </div>
                </label>
              );
            })}
          </div>
        </div>
      )}

      {/* Signers */}
      <div>
        <p className={labelCls + ' mb-2'}>Required Signers ({selectedSignerIds.length} of {signers.length})</p>
        <div className="space-y-1.5">
          {signers.length === 0 && <p className="text-xs text-gray-500 italic">No signers found.</p>}
          {signers.map(s => {
            const checked = selectedSignerIds.includes(s.id);
            return (
              <label key={s.id} className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border cursor-pointer transition-all ${checked ? 'border-purple-500/40 bg-purple-500/8' : 'border-white/10 hover:border-white/20'}`}>
                <div className={`w-4 h-4 rounded flex items-center justify-center flex-shrink-0 border ${checked ? 'bg-purple-500 border-purple-500' : 'border-white/30'}`}>
                  {checked && <Check className="w-2.5 h-2.5 text-white" />}
                </div>
                <input type="checkbox" className="hidden" checked={checked} onChange={() => toggleItem(s.id, selectedSignerIds, setSelectedSignerIds)} />
                <Users className="w-3.5 h-3.5 text-purple-400 flex-shrink-0" />
                <div className="flex-1">
                  <p className="text-sm font-semibold text-white">{s.firstName} {s.lastName}</p>
                  <p className="text-[10px] text-gray-500">{s.signerEmail} · {s.identityStatus || 'Pending'}</p>
                </div>
                {s.isPrimarySigner && <span className="text-[9px] font-bold text-amber-400 bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.5 rounded-full">Primary</span>}
              </label>
            );
          })}
        </div>
      </div>

      {/* Prefilled Data */}
      <div>
        <label className={labelCls}>Prefilled Data Override (JSON)</label>
        <p className="text-[10px] text-gray-500 mb-1.5">Any keys here will override the merchant profile when the portal loads. E.g. <code className="text-amber-400">{"{ \"pricingTier\": \"Premium\" }"}</code></p>
        <textarea
          value={prefilledData}
          onChange={e => setPrefilledData(e.target.value)}
          rows={4}
          className={`${inputCls} font-mono text-xs`}
        />
      </div>

      {error && <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-sm text-red-300">{error}</div>}

      <div className="flex gap-3 pt-1">
        <button onClick={handleSave} disabled={saving}
          className="flex items-center gap-2 bg-amber-500/20 border border-amber-500/30 text-amber-300 hover:bg-amber-500/30 disabled:opacity-50 font-bold text-sm px-5 py-2.5 rounded-xl transition-all">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
          {saving ? 'Saving…' : 'Save Application'}
        </button>
        <button onClick={onClose} className="px-5 py-2.5 border border-white/15 text-gray-300 font-semibold text-sm rounded-xl hover:text-white">Cancel</button>
      </div>
    </div>
  );
}

// ── Send Modal ─────────────────────────────────────────────────────────────────

function SendModal({ stage, onSent, onClose }) {
  const [email, setEmail] = useState(stage.sentToEmail || '');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [link, setLink] = useState('');
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');

  const handleSend = async () => {
    if (!email.trim()) { setError('Email is required'); return; }
    setSending(true); setError('');
    try {
      const res = await base44.functions.invoke('manageStagedApplication', { action: 'send', stageId: stage.id, data: { email } });
      if (res.data?.error) throw new Error(res.data.error);
      setLink(res.data.link || '');
      setSent(true);
      onSent(res.data.stage);
    } catch (err) { setError(err.message || 'Failed to send'); }
    finally { setSending(false); }
  };

  const copyLink = () => {
    navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 px-4" onClick={onClose}>
      <div className="bg-[#1c2128] border border-white/10 rounded-2xl shadow-2xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-green-500/15 flex items-center justify-center"><Send className="w-4 h-4 text-green-400" /></div>
            <div>
              <h3 className="font-bold text-white text-sm">Send to Merchant</h3>
              <p className="text-[10px] text-gray-500">{stage.label}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white p-1.5 rounded-lg"><X className="w-4 h-4" /></button>
        </div>

        {sent ? (
          <div className="space-y-4">
            <div className="flex items-center gap-2 bg-green-500/10 border border-green-500/20 rounded-xl px-4 py-3">
              <CheckCircle2 className="w-4 h-4 text-green-400 flex-shrink-0" />
              <p className="text-sm text-green-300 font-semibold">Email sent to {email}</p>
            </div>
            <div>
              <label className={labelCls}>Magic Link (share directly)</label>
              <div className="flex items-center gap-2 bg-[#111318] border border-white/20 rounded-xl px-3.5 py-2.5">
                <p className="text-xs text-gray-400 flex-1 truncate font-mono">{link}</p>
                <button onClick={copyLink} className="flex-shrink-0 text-amber-400 hover:text-amber-300">
                  {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
                <a href={link} target="_blank" rel="noreferrer" className="flex-shrink-0 text-gray-500 hover:text-white">
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>
            </div>
            <button onClick={onClose} className="w-full border border-white/15 text-gray-300 font-semibold text-sm py-2.5 rounded-xl hover:text-white">Done</button>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <label className={labelCls}>Recipient Email</label>
              <input value={email} onChange={e => setEmail(e.target.value)} placeholder="merchant@example.com" className={inputCls} autoFocus
                onKeyDown={e => e.key === 'Enter' && handleSend()} />
            </div>
            {error && <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-sm text-red-300">{error}</div>}
            <div className="flex gap-3">
              <button onClick={handleSend} disabled={sending}
                className="flex-1 flex items-center justify-center gap-2 bg-green-600 hover:bg-green-500 disabled:bg-gray-700 disabled:text-gray-500 text-white font-bold text-sm py-2.5 rounded-xl transition-all">
                {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                {sending ? 'Sending…' : 'Send Link'}
              </button>
              <button onClick={onClose} className="px-4 border border-white/15 text-gray-300 font-semibold text-sm py-2.5 rounded-xl">Cancel</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Stage Card ─────────────────────────────────────────────────────────────────

function StageCard({ stage, onEdit, onSend, onDelete, onCopyLink }) {
  return (
    <div className="bg-[#1c2128] border border-white/10 rounded-2xl p-5 hover:border-white/20 transition-all">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <StatusBadge status={stage.status} />
            <h3 className="text-sm font-bold text-white truncate">{stage.label || 'Untitled Application'}</h3>
          </div>
          <p className="text-[10px] text-gray-500 font-mono">ID: {stage.id?.slice(0, 12)}…</p>
          {stage.sentAt && (
            <p className="text-[10px] text-green-400 mt-1 flex items-center gap-1">
              <Clock className="w-2.5 h-2.5" /> Sent {new Date(stage.sentAt).toLocaleDateString()} to {stage.sentToEmail}
            </p>
          )}
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <button onClick={() => onEdit(stage)} className="p-1.5 text-gray-500 hover:text-amber-400 rounded-lg transition-colors" title="Edit">
            <Edit2 className="w-3.5 h-3.5" />
          </button>
          <button onClick={() => onCopyLink(stage)} className="p-1.5 text-gray-500 hover:text-blue-400 rounded-lg transition-colors" title="Copy Link">
            <Copy className="w-3.5 h-3.5" />
          </button>
          <button onClick={() => onSend(stage)} className="p-1.5 text-gray-500 hover:text-green-400 rounded-lg transition-colors" title="Send">
            <Send className="w-3.5 h-3.5" />
          </button>
          <button onClick={() => onDelete(stage)} className="p-1.5 text-gray-500 hover:text-red-400 rounded-lg transition-colors" title="Delete">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
      <div className="flex items-center gap-3 text-[10px] text-gray-500">
        <span className="flex items-center gap-1"><Store className="w-3 h-3" />{(stage.includedLocationIds || []).length} locations</span>
        <span className="flex items-center gap-1"><FileText className="w-3 h-3" />{(stage.includedConceptIds || []).length} MIDs</span>
        <span className="flex items-center gap-1"><Users className="w-3 h-3" />{(stage.includedSignerIds || []).length} signers</span>
      </div>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────

export default function StagedApplicationManager() {
  const [corporateId, setCorporateId] = useState('');
  const [inputId, setInputId] = useState('');
  const [stages, setStages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState(null); // null | 'new' | stage object
  const [sending, setSending] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [copied, setCopied] = useState('');

  const publicUrl = (import.meta.env.VITE_PUBLIC_URL || window.location.origin).replace(/\/$/, '');

  const loadStages = async (id) => {
    setLoading(true);
    try {
      const res = await base44.functions.invoke('manageStagedApplication', { action: 'list', corporateId: id });
      setStages(res.data?.stages || []);
    } catch (_) {}
    finally { setLoading(false); }
  };

  const handleLoad = () => {
    if (!inputId.trim()) return;
    setCorporateId(inputId.trim());
    loadStages(inputId.trim());
  };

  const handleStageSaved = (stage) => {
    setStages(prev => {
      const idx = prev.findIndex(s => s.id === stage.id);
      if (idx >= 0) { const next = [...prev]; next[idx] = stage; return next; }
      return [stage, ...prev];
    });
    setEditing(null);
  };

  const handleStageSent = (stage) => {
    setStages(prev => prev.map(s => s.id === stage.id ? stage : s));
  };

  const handleDelete = async (stage) => {
    setDeleteConfirm(null);
    try {
      await base44.functions.invoke('manageStagedApplication', { action: 'delete', stageId: stage.id });
      setStages(prev => prev.filter(s => s.id !== stage.id));
    } catch (_) {}
  };

  const copyLink = (stage) => {
    const link = `${publicUrl}/?stageId=${stage.id}&token=${stage.accessToken}`;
    navigator.clipboard.writeText(link);
    setCopied(stage.id);
    setTimeout(() => setCopied(''), 2000);
  };

  return (
    <div className="min-h-screen bg-[#111318] p-6 md:p-10">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <p className="text-[10px] font-mono text-amber-500 uppercase tracking-widest mb-2">Admin Tool</p>
          <h1 className="text-2xl font-bold text-white mb-1">Staged Applications</h1>
          <p className="text-gray-400 text-sm">Pre-configure which locations, MIDs, and signers a merchant sees in their onboarding portal.</p>
        </div>

        {/* Corporate ID lookup */}
        <div className="bg-[#1c2128] border border-white/10 rounded-2xl p-5 mb-6">
          <label className={labelCls}>Merchant Corporate ID</label>
          <div className="flex gap-3">
            <input value={inputId} onChange={e => setInputId(e.target.value)}
              placeholder="e.g. 333351592657"
              className={inputCls}
              onKeyDown={e => e.key === 'Enter' && handleLoad()} />
            <button onClick={handleLoad} disabled={loading || !inputId.trim()}
              className="flex items-center gap-2 bg-amber-500/20 border border-amber-500/30 text-amber-300 hover:bg-amber-500/30 disabled:opacity-50 font-bold text-sm px-5 py-2.5 rounded-xl transition-all flex-shrink-0">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Load'}
            </button>
          </div>
        </div>

        {/* Stage editor overlay */}
        {editing !== null && (
          <div className="bg-[#1c2128] border border-amber-500/30 rounded-2xl p-6 mb-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="font-bold text-white">{editing === 'new' ? 'New Staged Application' : `Edit: ${editing.label}`}</h2>
              <button onClick={() => setEditing(null)} className="text-gray-500 hover:text-white p-1.5 rounded-lg"><X className="w-4 h-4" /></button>
            </div>
            <StageEditor
              stage={editing === 'new' ? null : editing}
              corporateId={corporateId}
              onSaved={handleStageSaved}
              onClose={() => setEditing(null)}
            />
          </div>
        )}

        {/* Stages list */}
        {corporateId && (
          <>
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm font-semibold text-gray-300">
                {stages.length} staged application{stages.length !== 1 ? 's' : ''} for <span className="text-amber-400 font-mono">{corporateId}</span>
              </p>
              <button onClick={() => setEditing('new')}
                className="flex items-center gap-2 bg-amber-500/20 border border-amber-500/30 text-amber-300 hover:bg-amber-500/30 font-bold text-sm px-4 py-2 rounded-xl transition-all">
                <Plus className="w-4 h-4" /> New Stage
              </button>
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 text-gray-500 animate-spin" /></div>
            ) : stages.length === 0 ? (
              <div className="text-center py-16 border border-dashed border-white/10 rounded-2xl">
                <FileText className="w-8 h-8 text-gray-600 mx-auto mb-3" />
                <p className="text-gray-500 text-sm">No staged applications yet.</p>
                <button onClick={() => setEditing('new')} className="mt-4 text-sm text-amber-400 hover:text-amber-300 underline">Create one</button>
              </div>
            ) : (
              <div className="space-y-3">
                {stages.map(s => (
                  <StageCard
                    key={s.id}
                    stage={s}
                    onEdit={setEditing}
                    onSend={setSending}
                    onDelete={setDeleteConfirm}
                    onCopyLink={copyLink}
                  />
                ))}
              </div>
            )}
          </>
        )}

        {/* Send modal */}
        {sending && (
          <SendModal stage={sending} onSent={handleStageSent} onClose={() => setSending(null)} />
        )}

        {/* Delete confirm */}
        {deleteConfirm && (
          <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 px-4" onClick={() => setDeleteConfirm(null)}>
            <div className="bg-[#1c2128] border border-white/10 rounded-2xl shadow-2xl w-full max-w-sm p-6" onClick={e => e.stopPropagation()}>
              <h3 className="font-bold text-white mb-2">Delete staged application?</h3>
              <p className="text-sm text-gray-400 mb-5">"{deleteConfirm.label}" will be permanently removed. Any sent links will stop working.</p>
              <div className="flex gap-3">
                <button onClick={() => handleDelete(deleteConfirm)} className="flex-1 bg-red-500 hover:bg-red-400 text-white font-bold text-sm py-2.5 rounded-xl">Delete</button>
                <button onClick={() => setDeleteConfirm(null)} className="flex-1 border border-white/15 text-gray-300 font-semibold text-sm py-2.5 rounded-xl">Cancel</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}