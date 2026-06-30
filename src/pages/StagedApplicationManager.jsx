import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import {
  Plus, Loader2, Send, Trash2, Check, X, Copy, ExternalLink,
  Clock, Store, Users, FileText, Edit2, Search,
  Building2, CreditCard, ArrowLeft, Link, CheckCircle2,
  AlertCircle, Eye, BarChart2, Zap
} from 'lucide-react';

const inputCls = 'w-full bg-[#111318] border border-white/20 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent';
const labelCls = 'block text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5';

const STATUS_STYLES = {
  draft: 'bg-gray-500/15 text-gray-400 border border-gray-500/30',
  ready: 'bg-blue-500/15 text-blue-400 border border-blue-500/30',
  sent:  'bg-green-500/15 text-green-400 border border-green-500/30',
};
const STAGE_COLORS = { draft: '#6b7280', ready: '#3b82f6', sent: '#22c55e' };
const STAGE_LABELS = { draft: 'Draft', ready: 'Ready', sent: 'Sent' };

const PREFILL_FIELDS = [
  { key: 'pricingTier', label: 'Pricing Tier', type: 'select', options: ['Standard', 'Premium', 'Custom', 'Self_Swiped', 'Self_Keyed', 'Self_CashDiscount'] },
  { key: 'legalName', label: 'Legal Business Name', type: 'text', placeholder: 'Override legal name…' },
  { key: 'productDescription', label: 'Product Description', type: 'text', placeholder: 'Override product description…' },
  { key: 'establishmentYear', label: 'Year Established', type: 'text', placeholder: 'e.g. 2018' },
  { key: 'ownershipType', label: 'Ownership Type', type: 'select', options: ['SOLE_PROPRIETOR', 'LIMITED_COMPANY', 'CORPORATION', 'GENERAL_PARTNERSHIP', 'LIMITED_PARTNERSHIP', 'NON_PROFIT'] },
  { key: 'taxClassType', label: 'Tax Classification', type: 'select', options: ['SOLE_PROP', 'LLC_CORPORATION', 'LLC_PARTNERSHIP', 'CORPORATION', 'PARTNERSHIP'] },
];

// ── Pipeline Overview ─────────────────────────────────────────────────────────
function PipelineOverview({ onQuickCreate }) {
  const [allStages, setAllStages] = useState([]);
  const [loading, setLoading]     = useState(true);
  const [quickId, setQuickId]     = useState('');

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const res = await base44.functions.invoke('manageStagedApplication', { action: 'list' });
        setAllStages(res.data?.stages || []);
      } catch (_) {}
      finally { setLoading(false); }
    })();
  }, []);

  const counts = allStages.reduce((acc, s) => {
    acc[s.status] = (acc[s.status] || 0) + 1;
    return acc;
  }, {});

  const chartData = ['draft', 'ready', 'sent']
    .filter(k => counts[k])
    .map(k => ({ name: STAGE_LABELS[k], value: counts[k], color: STAGE_COLORS[k] }));

  const handleQuickCreate = () => {
    if (!quickId.trim()) return;
    onQuickCreate(quickId.trim());
    setQuickId('');
  };

  return (
    <div className="border-b border-white/8 bg-[#161b23] px-6 py-4 flex flex-wrap items-center gap-8">
      {/* Donut + stats */}
      <div className="flex items-center gap-4">
        {chartData.length > 0 ? (
          <div className="w-20 h-14 flex-shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={chartData} dataKey="value" cx="50%" cy="50%" innerRadius={18} outerRadius={30} strokeWidth={0}>
                  {chartData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                </Pie>
                <Tooltip
                  contentStyle={{ background: '#1c2128', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 11 }}
                  itemStyle={{ color: '#e5e7eb' }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="w-9 h-9 rounded-xl bg-amber-500/10 flex items-center justify-center flex-shrink-0">
            <BarChart2 className="w-4 h-4 text-amber-400" />
          </div>
        )}
        <div>
          <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1">Pipeline Overview</p>
          <div className="flex items-center gap-3">
            <span className="text-xl font-bold text-white">{allStages.length}</span>
            <span className="text-xs text-gray-500">total</span>
            {loading && <Loader2 className="w-3 h-3 text-gray-600 animate-spin" />}
          </div>
          <div className="flex items-center gap-3 mt-1">
            {['draft', 'ready', 'sent'].map(k => (
              <span key={k} className="flex items-center gap-1 text-[11px]">
                <span className="w-2 h-2 rounded-full" style={{ background: STAGE_COLORS[k] }} />
                <span className="text-gray-400">{counts[k] || 0} {STAGE_LABELS[k]}</span>
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Divider */}
      <div className="hidden sm:block w-px h-10 bg-white/8 flex-shrink-0" />

      {/* Quick create */}
      <div className="flex-shrink-0">
        <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Quick Start — New Stage</p>
        <div className="flex gap-2 items-center">
          <input
            value={quickId}
            onChange={e => setQuickId(e.target.value)}
            placeholder="Enter Corporate ID…"
            onKeyDown={e => e.key === 'Enter' && handleQuickCreate()}
            className="bg-[#111318] border border-white/20 rounded-xl px-3 py-2 text-sm text-white placeholder:text-gray-600 focus:outline-none focus:ring-2 focus:ring-amber-500 w-48"
          />
          <button
            onClick={handleQuickCreate}
            disabled={!quickId.trim()}
            className="flex items-center gap-1.5 bg-amber-500 hover:bg-amber-400 disabled:bg-gray-700 disabled:text-gray-500 text-black font-bold text-xs px-3 py-2 rounded-xl transition-all flex-shrink-0"
          >
            <Zap className="w-3 h-3" /> Create
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Checkbox Row ──────────────────────────────────────────────────────────────
function CheckRow({ checked, onChange, color = 'amber', children }) {
  const colors = {
    amber:  { checked: 'bg-amber-500 border-amber-500',   ring: 'border-amber-500/40 bg-amber-500/5' },
    blue:   { checked: 'bg-blue-500 border-blue-500',     ring: 'border-blue-500/40 bg-blue-500/5' },
    purple: { checked: 'bg-purple-500 border-purple-500', ring: 'border-purple-500/40 bg-purple-500/5' },
  }[color];

  return (
    <label className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border cursor-pointer transition-all ${checked ? colors.ring : 'border-white/10 hover:border-white/20'}`}>
      <div className={`w-4 h-4 rounded flex items-center justify-center flex-shrink-0 border transition-all ${checked ? colors.checked : 'border-white/30'}`}>
        {checked && <Check className="w-2.5 h-2.5 text-white" />}
      </div>
      <input type="checkbox" className="hidden" checked={checked} onChange={onChange} />
      {children}
    </label>
  );
}

// ── Stage Editor ──────────────────────────────────────────────────────────────
function StageEditor({ stage, corporateId, merchantName, onSaved, onClose }) {
  const [label, setLabel]             = useState(stage?.label || '');
  const [locations, setLocations]     = useState([]);
  const [concepts, setConcepts]       = useState([]);
  const [signers, setSigners]         = useState([]);
  const [selLocs, setSelLocs]         = useState(new Set(stage?.includedLocationIds || []));
  const [selConcepts, setSelConcepts] = useState(new Set(stage?.includedConceptIds || []));
  const [selSigners, setSelSigners]   = useState(new Set(stage?.includedSignerIds || []));
  const [prefill, setPrefill]         = useState(stage?.prefilledData || {});
  const [loading, setLoading]         = useState(true);
  const [saving, setSaving]           = useState(false);
  const [error, setError]             = useState('');
  const [activeTab, setActiveTab]     = useState('locations');

  useEffect(() => { loadData(); }, []);

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
      if (!stage) {
        setSelLocs(new Set((locRes.data?.locations || []).map(l => l.id || l.locationId)));
        setSelConcepts(new Set((conRes.data?.merchantIDs || []).map(c => c.id)));
        setSelSigners(new Set((sigRes.data?.signers || []).map(s => s.id)));
      }
    } catch (_) {}
    finally { setLoading(false); }
  };

  const toggle = (id, setFn) => setFn(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  const setPrefillField = (key, value) => {
    setPrefill(prev => {
      const next = { ...prev };
      if (!value) delete next[key]; else next[key] = value;
      return next;
    });
  };

  const handleSave = async () => {
    setSaving(true); setError('');
    try {
      const payload = {
        label: label || 'Staged Application',
        includedLocationIds: [...selLocs],
        includedConceptIds: [...selConcepts],
        includedSignerIds: [...selSigners],
        prefilledData: prefill,
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

  const tabs = [
    { key: 'locations', label: 'Locations', count: selLocs.size, total: locations.length, icon: Store },
    { key: 'signers',   label: 'Signers',   count: selSigners.size, total: signers.length, icon: Users },
    { key: 'prefill',   label: 'Prefill',   count: Object.keys(prefill).length, icon: FileText },
  ];

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 px-6 py-4 border-b border-white/8">
        <button onClick={onClose} className="p-1.5 text-gray-500 hover:text-white rounded-lg transition-colors">
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-[10px] text-gray-500 uppercase tracking-wider">{merchantName}</p>
          <p className="text-sm font-bold text-white">{stage?.id ? 'Edit Stage' : 'New Stage'}</p>
        </div>
        <button onClick={handleSave} disabled={saving}
          className="flex items-center gap-2 bg-amber-500 hover:bg-amber-400 disabled:bg-gray-700 disabled:text-gray-500 text-black font-bold text-sm px-4 py-2 rounded-xl transition-all">
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
          {saving ? 'Saving…' : 'Save Stage'}
        </button>
      </div>

      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="w-6 h-6 text-amber-400 animate-spin" />
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto">
          <div className="px-6 pt-5 pb-4 border-b border-white/5">
            <label className={labelCls}>Stage Label (internal)</label>
            <input value={label} onChange={e => setLabel(e.target.value)}
              placeholder="e.g. Downtown Locations — Phase 1" className={inputCls} />
          </div>

          <div className="flex border-b border-white/8 px-6 gap-1 pt-2">
            {tabs.map(t => (
              <button key={t.key} onClick={() => setActiveTab(t.key)}
                className={`flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-t-lg border-b-2 transition-all -mb-px ${
                  activeTab === t.key ? 'border-amber-500 text-amber-400' : 'border-transparent text-gray-500 hover:text-gray-300'
                }`}>
                <t.icon className="w-3.5 h-3.5" />
                {t.label}
                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${activeTab === t.key ? 'bg-amber-500/20 text-amber-400' : 'bg-white/8 text-gray-500'}`}>
                  {t.count}{t.total !== undefined ? `/${t.total}` : ''}
                </span>
              </button>
            ))}
          </div>

          <div className="px-6 py-5 space-y-3">
            {activeTab === 'locations' && (
              <>
                <p className="text-[11px] text-gray-500">Only selected locations will appear in the merchant's portal.</p>
                {locations.length === 0
                  ? <p className="text-xs text-gray-600 italic py-4 text-center">No locations found.</p>
                  : locations.map(loc => {
                    const id = loc.id || loc.locationId;
                    const locConcepts = concepts.filter(c => c.locationId === id);
                    return (
                      <div key={id}>
                        <CheckRow checked={selLocs.has(id)} onChange={() => toggle(id, setSelLocs)} color="amber">
                          <Store className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-white truncate">{loc.dbaName}</p>
                            <p className="text-[10px] text-gray-500 truncate">{loc.businessAddress}</p>
                          </div>
                          <span className="text-[9px] text-gray-600 flex-shrink-0">{locConcepts.length} MID{locConcepts.length !== 1 ? 's' : ''}</span>
                        </CheckRow>
                        {selLocs.has(id) && locConcepts.length > 0 && (
                          <div className="ml-8 mt-1 space-y-1">
                            {locConcepts.map(c => (
                              <CheckRow key={c.id} checked={selConcepts.has(c.id)} onChange={() => toggle(c.id, setSelConcepts)} color="blue">
                                <CreditCard className="w-3 h-3 text-blue-400 flex-shrink-0" />
                                <div className="flex-1 min-w-0">
                                  <p className="text-xs font-semibold text-white truncate">{c.dbaName || c.merchantName}</p>
                                  <p className="text-[10px] text-gray-500">{c.mccCode || 'No MCC'} · {c.applicationStepStatus || 'In Review'}</p>
                                </div>
                              </CheckRow>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })
                }
              </>
            )}

            {activeTab === 'signers' && (
              <>
                <p className="text-[11px] text-gray-500">Only selected signers will be required to verify their identity.</p>
                {signers.length === 0
                  ? <p className="text-xs text-gray-600 italic py-4 text-center">No signers found.</p>
                  : signers.map(s => (
                    <CheckRow key={s.id} checked={selSigners.has(s.id)} onChange={() => toggle(s.id, setSelSigners)} color="purple">
                      <Users className="w-3.5 h-3.5 text-purple-400 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-white">{s.firstName} {s.lastName}</p>
                        <p className="text-[10px] text-gray-500">{s.signerEmail}</p>
                      </div>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        {s.isPrimarySigner && <span className="text-[9px] font-bold text-amber-400 bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.5 rounded-full">Primary</span>}
                        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full border ${s.identityStatus === 'Verified' ? 'text-green-400 border-green-500/30 bg-green-500/10' : 'text-gray-500 border-gray-500/20 bg-gray-500/10'}`}>
                          {s.identityStatus || 'Pending'}
                        </span>
                      </div>
                    </CheckRow>
                  ))
                }
              </>
            )}

            {activeTab === 'prefill' && (
              <>
                <p className="text-[11px] text-gray-500">These values will override the merchant's profile when they open the portal. Leave blank to use existing data.</p>
                <div className="space-y-3">
                  {PREFILL_FIELDS.map(field => (
                    <div key={field.key}>
                      <label className={labelCls}>{field.label}</label>
                      {field.type === 'select' ? (
                        <select value={prefill[field.key] || ''} onChange={e => setPrefillField(field.key, e.target.value)}
                          className={inputCls} style={{ colorScheme: 'dark' }}>
                          <option value="">(no override)</option>
                          {field.options.map(o => <option key={o} value={o}>{o}</option>)}
                        </select>
                      ) : (
                        <input type="text" value={prefill[field.key] || ''}
                          onChange={e => setPrefillField(field.key, e.target.value)}
                          placeholder={field.placeholder || ''} className={inputCls} />
                      )}
                    </div>
                  ))}
                </div>
                {Object.keys(prefill).length > 0 && (
                  <div className="mt-4 bg-[#111318] border border-white/10 rounded-xl px-4 py-3">
                    <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-2">Active Overrides</p>
                    {Object.entries(prefill).map(([k, v]) => (
                      <div key={k} className="flex items-center justify-between py-0.5">
                        <span className="text-xs text-gray-400 font-mono">{k}</span>
                        <span className="text-xs text-amber-400 font-semibold">{String(v)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>

          {error && (
            <div className="mx-6 mb-4 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-sm text-red-300 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" /> {error}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Send Modal ────────────────────────────────────────────────────────────────
function SendModal({ stage, publicUrl, onSent, onClose }) {
  const [email, setEmail]     = useState(stage.sentToEmail || '');
  const [sending, setSending] = useState(false);
  const [sent, setSent]       = useState(false);
  const [link, setLink]       = useState('');
  const [copied, setCopied]   = useState(false);
  const [error, setError]     = useState('');

  const handleSend = async () => {
    if (!email.trim()) { setError('Email is required'); return; }
    setSending(true); setError('');
    try {
      const res = await base44.functions.invoke('manageStagedApplication', { action: 'send', stageId: stage.id, data: { email } });
      if (res.data?.error) throw new Error(res.data.error);
      setLink(res.data.link || `${publicUrl}/?stageId=${stage.id}&token=${stage.accessToken}`);
      setSent(true);
      onSent(res.data.stage);
    } catch (err) { setError(err.message || 'Failed to send'); }
    finally { setSending(false); }
  };

  const copyLink = () => { navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 2000); };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 px-4" onClick={onClose}>
      <div className="bg-[#1c2128] border border-white/10 rounded-2xl shadow-2xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-green-500/15 flex items-center justify-center"><Send className="w-4 h-4 text-green-400" /></div>
            <div>
              <h3 className="font-bold text-white text-sm">Send to Merchant</h3>
              <p className="text-[10px] text-gray-500 truncate max-w-[200px]">{stage.label}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 text-gray-500 hover:text-white rounded-lg"><X className="w-4 h-4" /></button>
        </div>
        {sent ? (
          <div className="space-y-4">
            <div className="flex items-center gap-2 bg-green-500/10 border border-green-500/20 rounded-xl px-4 py-3">
              <CheckCircle2 className="w-4 h-4 text-green-400 flex-shrink-0" />
              <p className="text-sm text-green-300 font-semibold">Sent to {email}</p>
            </div>
            <div>
              <label className={labelCls}>Magic Link</label>
              <div className="flex items-center gap-2 bg-[#111318] border border-white/15 rounded-xl px-3.5 py-2.5">
                <p className="text-xs text-gray-400 flex-1 truncate font-mono">{link}</p>
                <button onClick={copyLink} className="flex-shrink-0 text-amber-400 hover:text-amber-300">
                  {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
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
              <input value={email} onChange={e => setEmail(e.target.value)} placeholder="merchant@example.com"
                className={inputCls} autoFocus onKeyDown={e => e.key === 'Enter' && handleSend()} />
            </div>
            {error && <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-sm text-red-300">{error}</div>}
            <div className="flex gap-3">
              <button onClick={handleSend} disabled={sending}
                className="flex-1 flex items-center justify-center gap-2 bg-green-600 hover:bg-green-500 disabled:bg-gray-700 disabled:text-gray-500 text-white font-bold text-sm py-2.5 rounded-xl transition-all">
                {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                {sending ? 'Sending…' : 'Send Link'}
              </button>
              <button onClick={onClose} className="px-4 border border-white/15 text-gray-300 font-semibold text-sm py-2.5 rounded-xl hover:text-white">Cancel</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Progress Track Card (auto-created for merchants who opened the portal) ─────
const STEP_ORDER = ['agreement', 'locations', 'banking', 'verification', 'submitted'];
const STEP_LABELS = { agreement: 'Agreement', locations: 'Locations', banking: 'Banking', verification: 'Signing', submitted: 'Submitted' };

function ProgressTrackCard({ stage }) {
  const p = stage.prefilledData || {};
  const completed = p.completedSteps || {};
  const currentStep = p.currentStep || 'agreement';
  const lastSeen = p.lastSeenAt ? new Date(p.lastSeenAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : null;

  return (
    <div className="bg-[#1c2128] border border-blue-500/20 rounded-2xl p-4">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-500/15 text-blue-400 border border-blue-500/30">In Progress</span>
            {p.pricingTier && <span className="text-[10px] text-gray-500">{p.pricingTier}</span>}
          </div>
          {p.signerEmail && <p className="text-[11px] text-gray-400 truncate">{p.signerEmail}</p>}
        </div>
        {lastSeen && (
          <p className="text-[10px] text-gray-600 flex items-center gap-1 flex-shrink-0">
            <Clock className="w-2.5 h-2.5" /> {lastSeen}
          </p>
        )}
      </div>
      {/* Step progress dots */}
      <div className="flex items-center gap-1">
        {STEP_ORDER.map((step, i) => {
          const done = completed[step] || p.applicationStatus === 'Submitted';
          const active = currentStep === step;
          return (
            <div key={step} className="flex items-center gap-1 flex-1 min-w-0">
              <div className={`flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold border transition-all ${
                done ? 'bg-green-500 border-green-500 text-white' :
                active ? 'bg-blue-500 border-blue-500 text-white' :
                'bg-transparent border-gray-600 text-gray-600'
              }`}>
                {done ? '✓' : i + 1}
              </div>
              {i < STEP_ORDER.length - 1 && <div className={`flex-1 h-px ${done ? 'bg-green-500/40' : 'bg-gray-700'}`} />}
            </div>
          );
        })}
      </div>
      <div className="flex mt-1">
        {STEP_ORDER.map((step) => (
          <div key={step} className="flex-1 min-w-0">
            <p className={`text-[8px] truncate ${currentStep === step ? 'text-blue-400 font-semibold' : 'text-gray-600'}`}>{STEP_LABELS[step]}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Stage Card ────────────────────────────────────────────────────────────────
function StageCard({ stage, publicUrl, onEdit, onSend, onDelete }) {
  const [copied, setCopied] = useState(false);
  const link = `${publicUrl}/?stageId=${stage.id}&token=${stage.accessToken}`;

  const copyLink = (e) => {
    e.stopPropagation();
    navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Auto-tracked progress records render differently
  if (stage.label === '__auto_track__') {
    return <ProgressTrackCard stage={stage} />;
  }

  return (
    <div className="bg-[#1c2128] border border-white/10 rounded-2xl p-4 hover:border-white/20 transition-all group">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1.5">
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${STATUS_STYLES[stage.status] || STATUS_STYLES.draft}`}>
              {stage.status}
            </span>
            <h3 className="text-sm font-bold text-white truncate">{stage.label || 'Untitled Stage'}</h3>
          </div>
          {stage.sentAt && (
            <p className="text-[10px] text-green-400 flex items-center gap-1">
              <Clock className="w-2.5 h-2.5" /> Sent {new Date(stage.sentAt).toLocaleDateString()} → {stage.sentToEmail}
            </p>
          )}
        </div>
        <div className="flex items-center gap-0.5 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
          <button onClick={() => onEdit(stage)} title="Edit" className="p-1.5 text-gray-500 hover:text-amber-400 rounded-lg transition-colors"><Edit2 className="w-3.5 h-3.5" /></button>
          <button onClick={copyLink} title="Copy application link"
            className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-bold transition-all ${copied ? 'bg-green-500/20 text-green-400' : 'bg-blue-500/15 text-blue-400 hover:bg-blue-500/25'}`}>
            {copied ? <><Check className="w-3 h-3" /> Copied!</> : <><Copy className="w-3 h-3" /> Copy Link</>}
          </button>
          <a href={link} target="_blank" rel="noreferrer" title="Preview" className="p-1.5 text-gray-500 hover:text-gray-200 rounded-lg transition-colors"><Eye className="w-3.5 h-3.5" /></a>
          <button onClick={() => onSend(stage)} title="Send to merchant" className="p-1.5 text-gray-500 hover:text-green-400 rounded-lg transition-colors"><Send className="w-3.5 h-3.5" /></button>
          <button onClick={() => onDelete(stage)} title="Delete" className="p-1.5 text-gray-500 hover:text-red-400 rounded-lg transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>
        </div>
      </div>
      <div className="flex items-center gap-4 text-[10px] text-gray-500">
        <span className="flex items-center gap-1"><Store className="w-3 h-3" />{(stage.includedLocationIds || []).length} locations</span>
        <span className="flex items-center gap-1"><CreditCard className="w-3 h-3" />{(stage.includedConceptIds || []).length} MIDs</span>
        <span className="flex items-center gap-1"><Users className="w-3 h-3" />{(stage.includedSignerIds || []).length} signers</span>
        {Object.keys(stage.prefilledData || {}).length > 0 && (
          <span className="flex items-center gap-1"><FileText className="w-3 h-3" />{Object.keys(stage.prefilledData).length} overrides</span>
        )}
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function StagedApplicationManager() {
  const [inputId, setInputId]               = useState('');
  const [corporateId, setCorporateId]       = useState('');
  const [merchantName, setMerchantName]     = useState('');
  const [stages, setStages]                 = useState([]);
  const [allStages, setAllStages]           = useState([]); // all stages across all merchants
  const [merchantNames, setMerchantNames]   = useState({}); // corporateId → legalName
  const [loadingAll, setLoadingAll]         = useState(true);
  const [loading, setLoading]               = useState(false);
  const [editing, setEditing]               = useState(null);
  const [sending, setSending]               = useState(null);
  const [deleteConfirm, setDeleteConfirm]   = useState(null);
  const [filterStatus, setFilterStatus]     = useState('all');
  const [searchText, setSearchText]         = useState('');

  const publicUrl = (import.meta.env.VITE_PUBLIC_URL || window.location.origin).replace(/\/$/, '');

  // Load all staged applications on mount
  useEffect(() => {
    (async () => {
      setLoadingAll(true);
      try {
        const res = await base44.functions.invoke('manageStagedApplication', { action: 'list' });
        const loaded = res.data?.stages || [];
        setAllStages(loaded);

        // Fetch merchant names for each unique corporateId
        const uniqueIds = [...new Set(loaded.map(s => s.corporateId).filter(Boolean))];
        const nameMap = {};
        await Promise.all(uniqueIds.map(async (id) => {
          try {
            const r = await base44.functions.invoke('getMerchantData', { corporateId: id });
            nameMap[id] = r.data?.profile?.legalName || id;
          } catch (_) { nameMap[id] = id; }
        }));
        setMerchantNames(nameMap);
      } catch (_) {}
      finally { setLoadingAll(false); }
    })();
  }, []);

  const loadMerchant = async (id) => {
    if (!id.trim()) return;
    setLoading(true);
    setCorporateId('');
    setMerchantName('');
    setStages([]);
    setEditing(null);
    try {
      const [profileRes, stagesRes] = await Promise.all([
        base44.functions.invoke('getMerchantData', { corporateId: id.trim() }),
        base44.functions.invoke('manageStagedApplication', { action: 'list', corporateId: id.trim() }),
      ]);
      setCorporateId(id.trim());
      const name = profileRes.data?.profile?.legalName || id.trim();
      setMerchantName(name);
      setMerchantNames(prev => ({ ...prev, [id.trim()]: name }));
      setStages(stagesRes.data?.stages || []);
    } catch (_) {}
    finally { setLoading(false); }
  };

  const handleQuickCreate = async (id) => {
    setInputId(id);
    await loadMerchant(id);
    setEditing('new');
  };

  const handleStageSaved = (stage) => {
    // Update per-merchant list
    setStages(prev => {
      const idx = prev.findIndex(s => s.id === stage.id);
      if (idx >= 0) { const next = [...prev]; next[idx] = stage; return next; }
      return [stage, ...prev];
    });
    // Update global list
    setAllStages(prev => {
      const idx = prev.findIndex(s => s.id === stage.id);
      if (idx >= 0) { const next = [...prev]; next[idx] = stage; return next; }
      return [stage, ...prev];
    });
    setEditing(null);
  };

  const handleDelete = async (stage) => {
    setDeleteConfirm(null);
    try {
      await base44.functions.invoke('manageStagedApplication', { action: 'delete', stageId: stage.id });
      setStages(prev => prev.filter(s => s.id !== stage.id));
      setAllStages(prev => prev.filter(s => s.id !== stage.id));
    } catch (_) {}
  };

  const showEditor = editing !== null;

  // Determine what to show in the left panel: filtered per-merchant view or all-merchant view
  const isFiltered = !!corporateId;
  const displayStages = isFiltered ? stages : allStages;
  const filtered = displayStages.filter(s => {
    const matchStatus = filterStatus === 'all' || s.status === filterStatus;
    const name = merchantNames[s.corporateId] || s.corporateId || '';
    const matchSearch = !searchText || s.label?.toLowerCase().includes(searchText.toLowerCase()) || name.toLowerCase().includes(searchText.toLowerCase());
    return matchStatus && matchSearch;
  });

  // Separate auto-tracked "in progress" records from admin-created stages
  const isAutoTrack = (s) => s.label === '__auto_track__';

  // Group by corporateId when showing all
  const grouped = isFiltered
    ? { [corporateId]: filtered }
    : filtered.reduce((acc, s) => {
        const key = s.corporateId || 'unknown';
        if (!acc[key]) acc[key] = [];
        acc[key].push(s);
        return acc;
      }, {});

  return (
    <div className="min-h-screen bg-[#111318] flex flex-col">
      {/* Pipeline overview bar */}
      <PipelineOverview onQuickCreate={handleQuickCreate} />

      {/* Two-panel workspace */}
      <div className="flex flex-1 min-h-0">
        {/* Left panel */}
        <div className={`flex flex-col transition-all duration-300 ${showEditor ? 'w-[420px] flex-shrink-0' : 'flex-1'} border-r border-white/8`}>
          <div className="px-6 py-5 border-b border-white/8 flex-shrink-0">
            <div className="flex items-center justify-between mb-1">
              <div>
                <p className="text-[10px] font-mono text-amber-500 uppercase tracking-widest mb-1">Admin Tool</p>
                <h1 className="text-xl font-bold text-white">Staged Applications</h1>
              </div>
              {isFiltered && (
                <button onClick={() => { setCorporateId(''); setMerchantName(''); setStages([]); setInputId(''); setEditing(null); }}
                  className="text-xs text-gray-400 hover:text-white border border-white/10 px-3 py-1.5 rounded-xl transition-colors flex items-center gap-1">
                  <X className="w-3 h-3" /> Show All
                </button>
              )}
            </div>
          </div>

          {/* Toolbar */}
          <div className="px-6 py-3 border-b border-white/5 flex-shrink-0 space-y-2">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500" />
              <input value={searchText} onChange={e => setSearchText(e.target.value)}
                placeholder={isFiltered ? 'Search stages…' : 'Search by merchant or label…'}
                className={`${inputCls} pl-9 text-xs py-2`} />
            </div>
            {/* Filter + jump-to-merchant */}
            <div className="flex gap-2">
              <div className="flex gap-1 flex-1">
                {['all', 'draft', 'ready', 'sent'].map(s => (
                  <button key={s} onClick={() => setFilterStatus(s)}
                    className={`flex-1 text-[10px] font-bold px-2 py-1.5 rounded-lg capitalize transition-all ${filterStatus === s ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' : 'text-gray-500 hover:text-gray-300 border border-white/8'}`}>
                    {s}
                  </button>
                ))}
              </div>
              <div className="flex gap-1">
                <input value={inputId} onChange={e => setInputId(e.target.value)}
                  placeholder="Corp ID…"
                  className="bg-[#111318] border border-white/20 rounded-xl px-2.5 py-1.5 text-[11px] text-white placeholder:text-gray-600 focus:outline-none focus:ring-1 focus:ring-amber-500 w-28"
                  onKeyDown={e => e.key === 'Enter' && loadMerchant(inputId)} />
                <button onClick={() => loadMerchant(inputId)} disabled={loading || !inputId.trim()}
                  className="flex items-center gap-1 bg-amber-500/20 border border-amber-500/30 text-amber-300 hover:bg-amber-500/30 disabled:opacity-40 font-bold text-[11px] px-2.5 py-1.5 rounded-xl transition-all flex-shrink-0">
                  {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Go'}
                </button>
              </div>
            </div>
          </div>

          {/* Stages list */}
          <div className="flex-1 overflow-y-auto">
            {(loadingAll && !isFiltered) ? (
              <div className="flex items-center justify-center py-20">
                <Loader2 className="w-6 h-6 text-gray-500 animate-spin" />
              </div>
            ) : Object.keys(grouped).length === 0 ? (
              <div className="text-center py-16 px-8">
                <FileText className="w-7 h-7 text-gray-600 mx-auto mb-3" />
                <p className="text-gray-500 text-sm">{allStages.length === 0 ? 'No staged applications yet. Use Quick Start above to create one.' : 'No results match your filter.'}</p>
              </div>
            ) : (
              <div className="px-4 py-4 space-y-5">
                {Object.entries(grouped).map(([cid, cStages]) => (
                  <div key={cid}>
                    {/* Merchant group header */}
                    <div className="flex items-center gap-2 mb-2 px-1">
                      <Building2 className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
                      <p className="text-xs font-bold text-amber-300 truncate flex-1">{merchantNames[cid] || cid}</p>
                      <span className="text-[10px] text-gray-600 font-mono flex-shrink-0">{cid}</span>
                      <button onClick={() => { setInputId(cid); loadMerchant(cid); setEditing('new'); }}
                        title="New stage for this merchant"
                        className="flex-shrink-0 flex items-center gap-0.5 text-[10px] text-amber-500/70 hover:text-amber-400 transition-colors">
                        <Plus className="w-3 h-3" />
                      </button>
                    </div>
                    <div className="space-y-2">
                      {cStages.map(s => (
                        <StageCard key={s.id} stage={s} publicUrl={publicUrl}
                          onEdit={(stage) => { setCorporateId(cid); setMerchantName(merchantNames[cid] || cid); setEditing(stage); }}
                          onSend={setSending}
                          onDelete={setDeleteConfirm} />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Add new button when filtered to a merchant */}
          {isFiltered && !loadingAll && (
            <div className="px-4 py-3 border-t border-white/8 flex-shrink-0">
              <button onClick={() => setEditing('new')}
                className="w-full flex items-center justify-center gap-2 border border-dashed border-amber-500/30 hover:border-amber-500/60 text-amber-400 hover:text-amber-300 rounded-xl py-2.5 text-xs font-semibold transition-all">
                <Plus className="w-3.5 h-3.5" /> New Stage for {merchantName}
              </button>
            </div>
          )}
        </div>

        {/* Right panel — editor */}
        {showEditor && (
          <div className="flex-1 flex flex-col bg-[#161b23] overflow-hidden">
            <StageEditor
              stage={editing === 'new' ? null : editing}
              corporateId={corporateId}
              merchantName={merchantName}
              onSaved={handleStageSaved}
              onClose={() => setEditing(null)}
            />
          </div>
        )}
      </div>

      {/* Send modal */}
      {sending && (
        <SendModal stage={sending} publicUrl={publicUrl}
          onSent={s => setStages(prev => prev.map(x => x.id === s.id ? s : x))}
          onClose={() => setSending(null)} />
      )}

      {/* Delete confirm */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 px-4" onClick={() => setDeleteConfirm(null)}>
          <div className="bg-[#1c2128] border border-white/10 rounded-2xl shadow-2xl w-full max-w-sm p-6" onClick={e => e.stopPropagation()}>
            <h3 className="font-bold text-white mb-2">Delete this stage?</h3>
            <p className="text-sm text-gray-400 mb-5">"{deleteConfirm.label}" will be removed permanently. Any sent links will stop working.</p>
            <div className="flex gap-3">
              <button onClick={() => handleDelete(deleteConfirm)} className="flex-1 bg-red-500 hover:bg-red-400 text-white font-bold text-sm py-2.5 rounded-xl transition-all">Delete</button>
              <button onClick={() => setDeleteConfirm(null)} className="flex-1 border border-white/15 text-gray-300 font-semibold text-sm py-2.5 rounded-xl hover:text-white">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}