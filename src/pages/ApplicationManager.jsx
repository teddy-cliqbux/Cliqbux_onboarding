import { useState, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import { Link } from 'react-router-dom';
import {
  Plus, Loader2, Send, Trash2, Check, X, Copy, ExternalLink,
  Clock, Store, Users, FileText, Search, Building2, CreditCard,
  ArrowLeft, CheckCircle2, AlertCircle, Eye, BarChart2, Zap,
  ChevronDown, ChevronRight, XCircle, RefreshCw
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

const STEP_ORDER = ['agreement', 'locations', 'banking', 'verification', 'submitted'];
const STEP_LABELS_MAP = { agreement: 'Agreement', locations: 'Locations', banking: 'Banking', verification: 'Signing', submitted: 'Submitted' };

const PREFILL_FIELDS = [
  // 2026-07-06: simplified to match Cliqbux's 4-template model (see AGENTS.md
  // Critical Lesson #12). Self_Swiped/Self_Keyed kept as-is — dormant/on hold,
  // not deprecated (Elavon doesn't support self-serve flat rate yet).
  { key: 'pricingTier', label: 'Pricing Tier', type: 'select', options: ['CUSTOM_FLAT_RATE', 'CUSTOM_INTERCHANGE_PLUS', 'SELF_SERVE_CASH_DISCOUNT', 'Self_Swiped', 'Self_Keyed'] },
  { key: 'legalName', label: 'Legal Business Name', type: 'text', placeholder: 'Override legal name…' },
  { key: 'productDescription', label: 'Product Description', type: 'text', placeholder: 'Override product description…' },
  { key: 'establishmentYear', label: 'Year Established', type: 'text', placeholder: 'e.g. 2018' },
  { key: 'ownershipType', label: 'Ownership Type', type: 'select', options: ['SOLE_PROPRIETOR', 'LIMITED_COMPANY', 'CORPORATION', 'GENERAL_PARTNERSHIP', 'LIMITED_PARTNERSHIP', 'NON_PROFIT'] },
  { key: 'taxClassType', label: 'Tax Classification', type: 'select', options: ['SOLE_PROP', 'LLC_CORPORATION', 'LLC_PARTNERSHIP', 'CORPORATION', 'PARTNERSHIP'] },
];

// ── Shared Badges ─────────────────────────────────────────────────────────────
function MidStatusBadge({ status }) {
  const map = {
    'Active':            'bg-green-500/15 text-green-400 border-green-500/30',
    'Active (Existing)': 'bg-green-500/15 text-green-400 border-green-500/30',
    'Pending MID':       'bg-amber-500/15 text-amber-400 border-amber-500/30',
    'Ready to Submit':   'bg-blue-500/15 text-blue-400 border-blue-500/30',
    'In Review':         'bg-white/5 text-gray-400 border-white/10',
    'Error':             'bg-red-500/15 text-red-400 border-red-500/30',
  };
  return (
    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full border ${map[status] || map['In Review']}`}>
      {status || 'In Review'}
    </span>
  );
}

function HealthBadge({ score }) {
  if (score === 100) return <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-green-500/15 text-green-400 border border-green-500/30">{score}%</span>;
  if (score >= 80)  return <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-500/15 text-blue-400 border border-blue-500/30">{score}%</span>;
  if (score >= 50)  return <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/30">{score}%</span>;
  return <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-500/15 text-red-400 border border-red-500/30">{score ?? '?'}%</span>;
}

function ProgressBar({ pct }) {
  const barColor = pct === 100 ? 'bg-green-500' : pct >= 80 ? 'bg-blue-500' : pct >= 50 ? 'bg-amber-500' : 'bg-red-500';
  return (
    <div className="w-full h-1 bg-white/8 rounded-full overflow-hidden">
      <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${Math.max(0, Math.min(100, pct || 0))}%` }} />
    </div>
  );
}

// ── Step Tracker ──────────────────────────────────────────────────────────────
function StepTracker({ currentStep, completedSteps }) {
  return (
    <div className="flex items-center gap-0.5">
      {STEP_ORDER.map((step, i) => {
        const done = completedSteps?.[step] || currentStep === 'submitted';
        const active = currentStep === step && !done;
        return (
          <div key={step} className="flex items-center">
            <div title={STEP_LABELS_MAP[step]} className={`w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-bold border transition-all ${
              done   ? 'bg-green-500 border-green-500 text-white' :
              active ? 'bg-blue-500 border-blue-500 text-white' :
                       'bg-transparent border-gray-700 text-gray-700'
            }`}>
              {done ? '✓' : i + 1}
            </div>
            {i < STEP_ORDER.length - 1 && <div className={`w-2 h-px ${done ? 'bg-green-500/40' : 'bg-gray-700'}`} />}
          </div>
        );
      })}
    </div>
  );
}

// ── MID Row with MSP progress bar ─────────────────────────────────────────────
function MidRow({ mid, mspStatus, isLoadingMsp }) {
  const [open, setOpen] = useState(false);

  const pct = mspStatus?.percent_complete != null ? Math.round(parseFloat(String(mspStatus.percent_complete))) : null;
  const errors = [
    ...(mspStatus?.completion_errors || []),
    ...(mspStatus?.data_errors || []),
    ...(mspStatus?.rule_violations || []),
    ...(mspStatus?.errors || []),
  ].map(e => typeof e === 'string' ? e : e?.message || e?.description || JSON.stringify(e)).filter(Boolean);

  const localIssues = [];
  if (!mid.mccCode) localIssues.push('Missing MCC code');
  if (!mid.monthlyCardSales) localIssues.push('Missing monthly volume');
  if (!mid.avgSaleAmount) localIssues.push('Missing avg sale amount');
  const allErrors = [...new Set([...localIssues, ...errors])];
  const isDone = ['Active', 'Active (Existing)', 'Pending MID'].includes(mid.applicationStepStatus);
  const hasIssues = allErrors.length > 0 || (pct !== null && pct < 100 && !isDone);

  return (
    <div className={`border rounded-xl overflow-hidden transition-all ${
      isDone ? 'border-green-500/15 bg-green-500/5' :
      hasIssues ? 'border-red-500/20 bg-red-500/5' :
      'border-white/8 bg-white/[0.02]'
    }`}>
      <div className="flex items-center gap-2.5 px-3 py-2.5 cursor-pointer" onClick={() => setOpen(o => !o)}>
        <CreditCard className={`w-3.5 h-3.5 flex-shrink-0 ${isDone ? 'text-green-400' : hasIssues ? 'text-red-400' : 'text-blue-400'}`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-xs font-semibold text-white truncate">{mid.dbaName || '—'}</p>
            <MidStatusBadge status={mid.applicationStepStatus} />
          </div>
          {pct !== null && !isDone && (
            <div className="flex items-center gap-2 mt-1">
              <ProgressBar pct={pct} />
              <span className="text-[10px] text-gray-500 flex-shrink-0 w-8">{pct}%</span>
            </div>
          )}
          {pct === null && !isDone && (
            <p className="text-[10px] text-gray-600 mt-0.5">{mid.mccCode ? `MCC ${mid.mccCode}` : 'No MCC'}{mid.monthlyCardSales ? ` · $${Number(mid.monthlyCardSales).toLocaleString()}/mo` : ''}</p>
          )}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {isLoadingMsp && <Loader2 className="w-3 h-3 text-gray-500 animate-spin" />}
          {!isLoadingMsp && pct !== null && !isDone && <HealthBadge score={pct} />}
          {mid.elavonMID && <p className="text-[10px] font-mono text-green-400">{mid.elavonMID}</p>}
          {allErrors.length > 0 && (
            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-red-500/15 text-red-400 border border-red-500/30">
              {allErrors.length} issue{allErrors.length !== 1 ? 's' : ''}
            </span>
          )}
          {(mid.mspApplicationNo || allErrors.length > 0) && (
            <button onClick={e => { e.stopPropagation(); setOpen(o => !o); }} className="text-gray-600 hover:text-gray-300">
              {open ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
            </button>
          )}
        </div>
      </div>

      {open && (
        <div className="border-t border-white/8 px-3 py-3 space-y-2 bg-[#111318]/40">
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {mid.mspApplicationNo && (
              <p className="text-[10px] text-gray-500">MSP App: <span className="font-mono text-gray-400">{mid.mspApplicationNo}</span></p>
            )}
            {mid.elavonMID && (
              <p className="text-[10px] text-gray-500">MID: <span className="font-mono text-green-400">{mid.elavonMID}</span></p>
            )}
          </div>
          {allErrors.length > 0 && (
            <div className="space-y-1">
              <p className="text-[10px] font-bold text-red-400 uppercase tracking-wider">Validation Issues</p>
              {allErrors.map((err, i) => (
                <div key={i} className="flex items-start gap-1.5">
                  <XCircle className="w-3 h-3 text-red-400 flex-shrink-0 mt-0.5" />
                  <p className="text-[11px] text-red-300">{err}</p>
                </div>
              ))}
            </div>
          )}
          {allErrors.length === 0 && pct === 100 && (
            <div className="flex items-center gap-1.5 text-[11px] text-green-400">
              <CheckCircle2 className="w-3 h-3" /> Form complete — ready to sign
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Pipeline Overview Bar ─────────────────────────────────────────────────────
function PipelineOverview({ profiles, stages, loading, onRefresh, onQuickCreate }) {
  const [quickId, setQuickId] = useState('');

  const counts = stages.reduce((acc, s) => {
    if (s.label !== '__auto_track__') acc[s.status] = (acc[s.status] || 0) + 1;
    return acc;
  }, {});

  const submitted  = profiles.filter(p => p.applicationStatus === 'Submitted').length;
  const inProgress = profiles.filter(p => p.applicationStatus === 'Quote Signed' || p.applicationStatus === 'Pricing Selected').length;
  const notStarted = profiles.filter(p => !p.applicationStatus || p.applicationStatus === 'Incomplete').length;

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
      {/* Pie + stage counts */}
      <div className="flex items-center gap-4">
        {chartData.length > 0 ? (
          <div className="w-20 h-14 flex-shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={chartData} dataKey="value" cx="50%" cy="50%" innerRadius={18} outerRadius={30} strokeWidth={0}>
                  {chartData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                </Pie>
                <Tooltip contentStyle={{ background: '#1c2128', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 11 }} itemStyle={{ color: '#e5e7eb' }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="w-9 h-9 rounded-xl bg-amber-500/10 flex items-center justify-center flex-shrink-0">
            <BarChart2 className="w-4 h-4 text-amber-400" />
          </div>
        )}
        <div>
          <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1">Applications</p>
          <div className="flex items-center gap-3">
            <span className="text-xl font-bold text-white">{profiles.length}</span>
            {loading && <Loader2 className="w-3 h-3 text-gray-600 animate-spin" />}
          </div>
          <div className="flex items-center gap-3 mt-1">
            <span className="text-[11px] text-green-400">{submitted} submitted</span>
            <span className="text-[11px] text-blue-400">{inProgress} in progress</span>
            <span className="text-[11px] text-gray-500">{notStarted} not started</span>
          </div>
        </div>
      </div>

      <div className="hidden sm:block w-px h-10 bg-white/8 flex-shrink-0" />

      {/* Quick create */}
      <div className="flex-shrink-0">
        <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Quick Stage — Corp ID</p>
        <div className="flex gap-2 items-center">
          <input value={quickId} onChange={e => setQuickId(e.target.value)} placeholder="Enter Corporate ID…"
            onKeyDown={e => e.key === 'Enter' && handleQuickCreate()}
            className="bg-[#111318] border border-white/20 rounded-xl px-3 py-2 text-sm text-white placeholder:text-gray-600 focus:outline-none focus:ring-2 focus:ring-amber-500 w-48" />
          <button onClick={handleQuickCreate} disabled={!quickId.trim()}
            className="flex items-center gap-1.5 bg-amber-500 hover:bg-amber-400 disabled:bg-gray-700 disabled:text-gray-500 text-black font-bold text-xs px-3 py-2 rounded-xl transition-all flex-shrink-0">
            <Zap className="w-3 h-3" /> Create
          </button>
        </div>
      </div>

      <div className="ml-auto flex-shrink-0">
        <button onClick={onRefresh} disabled={loading}
          className="flex items-center gap-1.5 text-[11px] font-semibold text-gray-500 hover:text-white border border-white/10 hover:border-white/20 px-2.5 py-1.5 rounded-lg transition-all disabled:opacity-40">
          <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
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
  const [mids, setMids]               = useState([]);
  const [signers, setSigners]         = useState([]);
  const [selLocs, setSelLocs]         = useState(new Set(stage?.includedLocationIds || []));
  const [selMids, setSelMids]         = useState(new Set(stage?.includedMidIds || []));
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
      setMids(conRes.data?.merchantIDs || []);
      setSigners(sigRes.data?.signers || []);
      if (!stage) {
        setSelLocs(new Set((locRes.data?.locations || []).map(l => l.id || l.locationId)));
        setSelMids(new Set((conRes.data?.merchantIDs || []).map(c => c.id)));
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
    setPrefill(prev => { const n = { ...prev }; if (!value) delete n[key]; else n[key] = value; return n; });
  };

  const handleSave = async () => {
    setSaving(true); setError('');
    try {
      const payload = {
        label: label || 'Staged Application',
        includedLocationIds: [...selLocs],
        includedMidIds: [...selMids],
        includedSignerIds: [...selSigners],
        prefilledData: prefill,
        status: 'ready',
      };
      const res = stage?.id
        ? await base44.functions.invoke('manageStagedApplication', { action: 'update', stageId: stage.id, data: payload })
        : await base44.functions.invoke('manageStagedApplication', { action: 'create', corporateId, data: payload });
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
            <input value={label} onChange={e => setLabel(e.target.value)} placeholder="e.g. Downtown Locations — Phase 1" className={inputCls} />
          </div>
          <div className="flex border-b border-white/8 px-6 gap-1 pt-2">
            {tabs.map(t => (
              <button key={t.key} onClick={() => setActiveTab(t.key)}
                className={`flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-t-lg border-b-2 transition-all -mb-px ${activeTab === t.key ? 'border-amber-500 text-amber-400' : 'border-transparent text-gray-500 hover:text-gray-300'}`}>
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
                    const locMids = mids.filter(c => c.locationId === id);
                    return (
                      <div key={id}>
                        <CheckRow checked={selLocs.has(id)} onChange={() => toggle(id, setSelLocs)} color="amber">
                          <Store className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-white truncate">{loc.dbaName}</p>
                            <p className="text-[10px] text-gray-500 truncate">{loc.businessAddress}</p>
                          </div>
                          <span className="text-[9px] text-gray-600 flex-shrink-0">{locMids.length} MID{locMids.length !== 1 ? 's' : ''}</span>
                        </CheckRow>
                        {selLocs.has(id) && locMids.length > 0 && (
                          <div className="ml-8 mt-1 space-y-1">
                            {locMids.map(c => (
                              <CheckRow key={c.id} checked={selMids.has(c.id)} onChange={() => toggle(c.id, setSelMids)} color="blue">
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
                <p className="text-[11px] text-gray-500">These values override the merchant's profile when they open the portal.</p>
                <div className="space-y-3">
                  {PREFILL_FIELDS.map(field => (
                    <div key={field.key}>
                      <label className={labelCls}>{field.label}</label>
                      {field.type === 'select' ? (
                        <select value={prefill[field.key] || ''} onChange={e => setPrefillField(field.key, e.target.value)} className={inputCls} style={{ colorScheme: 'dark' }}>
                          <option value="">(no override)</option>
                          {field.options.map(o => <option key={o} value={o}>{o}</option>)}
                        </select>
                      ) : (
                        <input type="text" value={prefill[field.key] || ''} onChange={e => setPrefillField(field.key, e.target.value)} placeholder={field.placeholder || ''} className={inputCls} />
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
function SendModal({ stage, corporateId, prefillEmail, publicUrl, onSent, onClose }) {
  const [email, setEmail]     = useState(stage?.sentToEmail || stage?.prefilledData?.signerEmail || prefillEmail || '');
  const [sending, setSending] = useState(false);
  const [sent, setSent]       = useState(false);
  const [link, setLink]       = useState('');
  const [copied, setCopied]   = useState(false);
  const [error, setError]     = useState('');

  const handleSend = async () => {
    if (!email.trim()) { setError('Email is required'); return; }
    setSending(true); setError('');
    try {
      if (stage) {
        const res = await base44.functions.invoke('manageStagedApplication', { action: 'send', stageId: stage.id, data: { email } });
        if (res.data?.error) throw new Error(res.data.error);
        setLink(res.data.link || `${publicUrl}/?stageId=${stage.id}&token=${stage.accessToken}`);
        onSent(res.data.stage);
      } else {
        const directLink = `${publicUrl}/?corporateId=${corporateId}`;
        const res = await base44.functions.invoke('sendResumeLink', { email, corporateId, link: directLink });
        if (res.data?.error) throw new Error(res.data.error);
        setLink(directLink);
        onSent(null);
      }
      setSent(true);
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
              <p className="text-[10px] text-gray-500 truncate max-w-[200px]">{stage?.label || 'Direct link'}</p>
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
                <a href={link} target="_blank" rel="noreferrer" className="flex-shrink-0 text-gray-500 hover:text-white"><ExternalLink className="w-3.5 h-3.5" /></a>
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

// ── Application Row ───────────────────────────────────────────────────────────
function ApplicationRow({ corporateId, merchantName, profile, trackStage, adminStages, publicUrl, onEdit, onSend, onDelete, onDeleteMerchant }) {
  const [expanded, setExpanded]         = useState(false);
  const [mids, setMids]                 = useState([]);
  const [signers, setSigners]           = useState([]);
  const [mspStatuses, setMspStatuses]   = useState({});
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [loadingMsp, setLoadingMsp]     = useState(false);
  const [copied, setCopied]             = useState(null);

  const p = trackStage?.prefilledData || {};
  const appStatus = p.applicationStatus || profile?.applicationStatus || 'Incomplete';
  const currentStep = p.currentStep || (
    appStatus === 'Submitted' ? 'submitted' :
    (appStatus === 'Quote Signed' || appStatus === 'Pricing Selected') ? 'locations' : 'agreement'
  );
  const completedSteps = p.completedSteps || { ...(appStatus !== 'Incomplete' ? { agreement: true } : {}) };
  const lastSeen = p.lastSeenAt
    ? new Date(p.lastSeenAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    : null;

  const linkStage = adminStages[0] || null;
  const portalLink = linkStage
    ? `${publicUrl}/?stageId=${linkStage.id}&token=${linkStage.accessToken}`
    : `${publicUrl}/?corporateId=${corporateId}`;

  const isSubmitted = appStatus === 'Submitted' || currentStep === 'submitted';
  const isStuck = !isSubmitted && p.lastSeenAt && (Date.now() - new Date(p.lastSeenAt).getTime()) > 3 * 24 * 60 * 60 * 1000;

  // Aggregate MSP health
  const mspValues = Object.values(mspStatuses);
  const avgMspPct = mspValues.length > 0
    ? Math.round(mspValues.reduce((s, v) => s + (v?.percent_complete != null ? parseFloat(String(v.percent_complete)) : 0), 0) / mspValues.length)
    : null;
  const totalErrors = mspValues.reduce((s, v) => s + ([...(v?.completion_errors||[]), ...(v?.data_errors||[]), ...(v?.rule_violations||[]), ...(v?.errors||[])]).length, 0);

  const handleExpand = async () => {
    const next = !expanded;
    setExpanded(next);
    if (next && mids.length === 0) {
      setLoadingDetail(true);
      try {
        const [midRes, sigRes] = await Promise.all([
          base44.functions.invoke('manageMerchantID', { action: 'list', corporateId }),
          base44.functions.invoke('manageSigner', { action: 'list', corporateId }),
        ]);
        const loadedMids = midRes.data?.merchantIDs || [];
        setMids(loadedMids);
        setSigners(sigRes.data?.signers || []);

        const midsWithApp = loadedMids.filter(m => m.mspApplicationNo);
        if (midsWithApp.length > 0) {
          setLoadingMsp(true);
          const statuses = {};
          await Promise.all(midsWithApp.map(async mid => {
            try {
              const res = await base44.functions.invoke('getMSPFormStatus', { corporateId, applicationNo: mid.mspApplicationNo });
              statuses[mid.mspApplicationNo] = res.data;
            } catch (_) { statuses[mid.mspApplicationNo] = null; }
          }));
          setMspStatuses(statuses);
          setLoadingMsp(false);
        }
      } catch (_) {}
      finally { setLoadingDetail(false); }
    }
  };

  const copyLink = (e) => {
    e.stopPropagation();
    navigator.clipboard.writeText(portalLink);
    setCopied('link');
    setTimeout(() => setCopied(null), 2000);
  };

  const borderColor = isSubmitted ? 'border-green-500/25' : totalErrors > 0 ? 'border-red-500/30' : isStuck ? 'border-amber-500/25' : 'border-white/10';

  return (
    <div className={`bg-[#1c2128] border ${borderColor} rounded-2xl overflow-hidden hover:border-white/20 transition-all`}>
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 cursor-pointer" onClick={handleExpand}>
        <button className="text-gray-500 flex-shrink-0">
          {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </button>
        <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${isSubmitted ? 'bg-green-500/15' : totalErrors > 0 ? 'bg-red-500/15' : 'bg-amber-500/10'}`}>
          <Building2 className={`w-3.5 h-3.5 ${isSubmitted ? 'text-green-400' : totalErrors > 0 ? 'text-red-400' : 'text-amber-400'}`} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-bold text-white truncate">{merchantName || corporateId}</p>
            <span className="text-[10px] font-mono text-gray-600">{corporateId}</span>
            {isStuck && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/30">Stuck</span>}
          </div>
          <div className="flex items-center gap-3 mt-0.5 flex-wrap">
            {(p.signerEmail || profile?.signerEmail) && <p className="text-[10px] text-gray-500 truncate">{p.signerEmail || profile?.signerEmail}</p>}
            {(p.pricingTier || profile?.pricingTier) && <span className="text-[10px] text-gray-600">{p.pricingTier || profile?.pricingTier}</span>}
            {lastSeen && <p className="hidden sm:flex items-center gap-1 text-[10px] text-gray-600"><Clock className="w-2.5 h-2.5" /> {lastSeen}</p>}
          </div>
        </div>

        {/* Step tracker */}
        <div className="hidden md:flex flex-col items-end gap-1 flex-shrink-0">
          <StepTracker currentStep={currentStep} completedSteps={completedSteps} />
          <p className="text-[10px] text-gray-500">{STEP_LABELS_MAP[currentStep] || currentStep}</p>
        </div>

        {/* Health + actions */}
        <div className="flex items-center gap-1.5 flex-shrink-0 ml-1" onClick={e => e.stopPropagation()}>
          {totalErrors > 0 && (
            <div className="flex items-center gap-1 text-[10px] font-bold text-red-400 bg-red-500/10 border border-red-500/20 px-2 py-0.5 rounded-full">
              <XCircle className="w-3 h-3" /> {totalErrors}
            </div>
          )}
          {avgMspPct !== null && <HealthBadge score={avgMspPct} />}
          {isSubmitted && <CheckCircle2 className="w-4 h-4 text-green-400" />}
          <button onClick={copyLink} title="Copy portal link"
            className={`flex items-center gap-1 text-[10px] font-semibold px-2 py-1 rounded-lg border transition-all ${copied === 'link' ? 'bg-green-500/15 text-green-400 border-green-500/30' : 'bg-blue-500/10 text-blue-400 border-blue-500/20 hover:bg-blue-500/20'}`}>
            {copied === 'link' ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
            {copied === 'link' ? 'Copied!' : 'Copy'}
          </button>
          <button onClick={() => onSend(linkStage, corporateId, p.signerEmail || profile?.signerEmail || '')}
            className="flex items-center gap-1 text-[10px] font-semibold px-2 py-1 rounded-lg border transition-all bg-white/5 text-gray-400 border-white/10 hover:bg-green-500/10 hover:text-green-400 hover:border-green-500/20">
            <Send className="w-3 h-3" /> Send
          </button>
          <button onClick={() => onEdit(corporateId, merchantName)} title="New stage"
            className="p-1.5 text-gray-600 hover:text-amber-400 rounded-lg transition-colors">
            <Plus className="w-3.5 h-3.5" />
          </button>
          {trackStage && (
            <button onClick={() => onDelete(trackStage)} title="Delete tracking record"
              className="p-1.5 text-gray-600 hover:text-red-400 rounded-lg transition-colors">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
          <button onClick={() => onDeleteMerchant({ corporateId, merchantName })} title="Delete merchant permanently (all data)"
            className="p-1.5 text-gray-700 hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-colors">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Admin stages chips */}
      {adminStages.length > 0 && (
        <div className="border-t border-white/5 px-4 py-2 flex flex-wrap gap-2">
          {adminStages.map(s => {
            const link = `${publicUrl}/?stageId=${s.id}&token=${s.accessToken}`;
            return (
              <div key={s.id} className="flex items-center gap-1.5 bg-[#111318] border border-white/8 rounded-lg px-2.5 py-1.5">
                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${STATUS_STYLES[s.status] || STATUS_STYLES.draft}`}>{s.status}</span>
                <span className="text-xs text-gray-300 font-medium truncate max-w-[120px]">{s.label}</span>
                <button onClick={() => { navigator.clipboard.writeText(link); setCopied(s.id); setTimeout(() => setCopied(null), 2000); }}
                  className={`ml-1 ${copied === s.id ? 'text-green-400' : 'text-gray-600 hover:text-blue-400'} transition-colors`}>
                  {copied === s.id ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                </button>
                <a href={link} target="_blank" rel="noreferrer" className="text-gray-600 hover:text-gray-300"><Eye className="w-3 h-3" /></a>
                <button onClick={() => onSend(s, corporateId, s.sentToEmail || p.signerEmail || '')} className="text-gray-600 hover:text-green-400 transition-colors"><Send className="w-3 h-3" /></button>
                <button onClick={() => onDelete(s)} className="text-gray-600 hover:text-red-400 transition-colors"><Trash2 className="w-3 h-3" /></button>
              </div>
            );
          })}
        </div>
      )}

      {/* Expanded detail */}
      {expanded && (
        <div className="border-t border-white/5 bg-[#111318]/60">
          {loadingDetail ? (
            <div className="flex items-center justify-center py-6 gap-2">
              <Loader2 className="w-4 h-4 text-gray-500 animate-spin" />
              <span className="text-xs text-gray-500">Loading…</span>
            </div>
          ) : (
            <div className="p-4 space-y-4">
              {/* MIDs */}
              {mids.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">
                      MIDs ({mids.length}) {loadingMsp && <Loader2 className="inline w-3 h-3 animate-spin ml-1" />}
                    </p>
                    {avgMspPct !== null && (
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-gray-500">Avg form:</span>
                        <HealthBadge score={avgMspPct} />
                      </div>
                    )}
                  </div>
                  <div className="space-y-2">
                    {mids.map(mid => (
                      <MidRow
                        key={mid.id}
                        mid={mid}
                        isLoadingMsp={loadingMsp && !!mid.mspApplicationNo && !mspStatuses[mid.mspApplicationNo]}
                        mspStatus={mid.mspApplicationNo ? mspStatuses[mid.mspApplicationNo] : null}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Signers */}
              {signers.length > 0 && (
                <div>
                  <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-2">Signers</p>
                  <div className="space-y-1.5">
                    {signers.map(s => (
                      <div key={s.id} className={`flex items-center gap-2.5 px-3 py-2 rounded-xl border ${s.identityStatus === 'Verified' ? 'border-green-500/20 bg-green-500/5' : 'border-white/8 bg-white/[0.02]'}`}>
                        <Users className={`w-3.5 h-3.5 flex-shrink-0 ${s.identityStatus === 'Verified' ? 'text-green-400' : 'text-gray-500'}`} />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold text-white">{s.firstName} {s.lastName}</p>
                          <p className="text-[10px] text-gray-500">{s.signerEmail}</p>
                        </div>
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          {s.isPrimarySigner && <span className="text-[9px] font-bold text-amber-400 bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.5 rounded-full">Primary</span>}
                          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full border ${s.identityStatus === 'Verified' ? 'text-green-400 border-green-500/30 bg-green-500/10' : 'text-gray-500 border-gray-500/20 bg-gray-500/10'}`}>
                            {s.identityStatus || 'Pending'}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {mids.length === 0 && signers.length === 0 && (
                <p className="text-xs text-gray-600 text-center py-4">No MIDs or signers found for this merchant.</p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function ApplicationManager() {
  const [profiles, setProfiles]           = useState([]);
  const [allStages, setAllStages]         = useState([]);
  const [merchantNames, setMerchantNames] = useState({});
  const [loading, setLoading]             = useState(true);
  const [searching, setSearching]         = useState(false);
  const [editing, setEditing]             = useState(null);
  const [sending, setSending]             = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [deleteMerchantConfirm, setDeleteMerchantConfirm] = useState(null); // { corporateId, merchantName }
  const [deleteMerchantTyped, setDeleteMerchantTyped]     = useState('');
  const [deletingMerchant, setDeletingMerchant]           = useState(false);
  const [deleteMerchantError, setDeleteMerchantError]     = useState('');
  const [searchText, setSearchText]       = useState('');
  const [jumpId, setJumpId]               = useState('');

  const publicUrl = (import.meta.env.VITE_PUBLIC_URL || window.location.origin).replace(/\/$/, '');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [profilesRes, stagesRes] = await Promise.all([
        base44.entities.MerchantCorporateProfile.list('-updated_date', 200),
        base44.functions.invoke('manageStagedApplication', { action: 'list' }),
      ]);
      const loadedProfiles = profilesRes || [];
      const loadedStages = stagesRes.data?.stages || [];
      setProfiles(loadedProfiles);
      setAllStages(loadedStages);
      const nameMap = {};
      for (const p of loadedProfiles) nameMap[p.corporateId] = p.legalName || p.corporateId;
      setMerchantNames(nameMap);
    } catch (_) {}
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleQuickCreate = (id) => {
    setEditing({ corporateId: id, merchantName: merchantNames[id] || id, stage: null });
  };

  const handleStageSaved = (stage) => {
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
      setAllStages(prev => prev.filter(s => s.id !== stage.id));
    } catch (_) {}
  };

  const handleDeleteMerchant = async () => {
    if (!deleteMerchantConfirm) return;
    setDeletingMerchant(true);
    setDeleteMerchantError('');
    try {
      const res = await base44.functions.invoke('deleteMerchant', {
        corporateId: deleteMerchantConfirm.corporateId,
        confirmDelete: true,
      });
      if (res.data?.error) throw new Error(res.data.error);
      setProfiles(prev => prev.filter(p => p.corporateId !== deleteMerchantConfirm.corporateId));
      setAllStages(prev => prev.filter(s => s.corporateId !== deleteMerchantConfirm.corporateId));
      setDeleteMerchantConfirm(null);
      setDeleteMerchantTyped('');
    } catch (err) {
      setDeleteMerchantError(err.message || 'Failed to delete merchant.');
    } finally {
      setDeletingMerchant(false);
    }
  };

  const handleJump = async () => {
    if (!jumpId.trim()) return;
    setSearching(true);
    try {
      const r = await base44.functions.invoke('getMerchantData', { corporateId: jumpId.trim() });
      const name = r.data?.profile?.legalName || jumpId.trim();
      setMerchantNames(prev => ({ ...prev, [jumpId.trim()]: name }));
      // If not in profiles, add a synthetic entry so it appears
      setProfiles(prev => {
        if (prev.find(p => p.corporateId === jumpId.trim())) return prev;
        return [r.data?.profile || { corporateId: jumpId.trim(), legalName: name }, ...prev];
      });
      setSearchText(jumpId.trim());
    } catch (_) { setSearchText(jumpId.trim()); }
    finally { setSearching(false); }
  };

  // Build grouped map: corporateId → { profile, track, admin[] }
  const trackMap = {};
  const adminMap = {};
  for (const s of allStages) {
    const key = s.corporateId;
    if (!key) continue;
    if (s.label === '__auto_track__') trackMap[key] = s;
    else { if (!adminMap[key]) adminMap[key] = []; adminMap[key].push(s); }
  }

  const filtered = profiles.filter(p => {
    if (!searchText) return true;
    const name = (merchantNames[p.corporateId] || p.corporateId).toLowerCase();
    return name.includes(searchText.toLowerCase()) || p.corporateId?.includes(searchText);
  });

  // Sort: submitted last, stuck + active first, then by updated
  const sorted = [...filtered].sort((a, b) => {
    const aTrack = trackMap[a.corporateId];
    const bTrack = trackMap[b.corporateId];
    const aStuck = aTrack?.prefilledData?.lastSeenAt && (Date.now() - new Date(aTrack.prefilledData.lastSeenAt).getTime()) > 3 * 24 * 60 * 60 * 1000 && a.applicationStatus !== 'Submitted';
    const bStuck = bTrack?.prefilledData?.lastSeenAt && (Date.now() - new Date(bTrack.prefilledData.lastSeenAt).getTime()) > 3 * 24 * 60 * 60 * 1000 && b.applicationStatus !== 'Submitted';
    if (aStuck && !bStuck) return -1;
    if (!aStuck && bStuck) return 1;
    const aT = aTrack?.prefilledData?.lastSeenAt ? new Date(aTrack.prefilledData.lastSeenAt).getTime() : 0;
    const bT = bTrack?.prefilledData?.lastSeenAt ? new Date(bTrack.prefilledData.lastSeenAt).getTime() : 0;
    return bT - aT;
  });

  const showEditor = editing !== null;

  return (
    <div className="min-h-screen bg-[#111318] flex flex-col">
      <PipelineOverview profiles={profiles} stages={allStages} loading={loading} onRefresh={load} onQuickCreate={handleQuickCreate} />

      <div className="flex flex-1 min-h-0">
        {/* Left panel */}
        <div className={`flex flex-col transition-all duration-300 ${showEditor ? 'w-[440px] flex-shrink-0' : 'flex-1'} border-r border-white/8`}>
          <div className="px-6 py-4 border-b border-white/8 flex-shrink-0">
            <p className="text-[10px] font-mono text-amber-500 uppercase tracking-widest mb-1">Admin Tool</p>
            <h1 className="text-xl font-bold text-white">Applications</h1>
          </div>

          {/* Toolbar */}
          <div className="px-4 py-3 border-b border-white/5 flex-shrink-0 flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500" />
              <input value={searchText} onChange={e => setSearchText(e.target.value)}
                placeholder="Search by name or Corp ID…"
                className={`${inputCls} pl-9 text-xs py-2`} />
            </div>
            <input value={jumpId} onChange={e => setJumpId(e.target.value)}
              placeholder="Corp ID…"
              className="bg-[#111318] border border-white/20 rounded-xl px-2.5 py-1.5 text-[11px] text-white placeholder:text-gray-600 focus:outline-none focus:ring-1 focus:ring-amber-500 w-28"
              onKeyDown={e => e.key === 'Enter' && handleJump()} />
            <button onClick={handleJump} disabled={searching || !jumpId.trim()}
              className="flex items-center gap-1 bg-amber-500/20 border border-amber-500/30 text-amber-300 hover:bg-amber-500/30 disabled:opacity-40 font-bold text-[11px] px-2.5 py-1.5 rounded-xl transition-all flex-shrink-0">
              {searching ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Go'}
            </button>
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center py-20">
                <Loader2 className="w-6 h-6 text-gray-500 animate-spin" />
              </div>
            ) : sorted.length === 0 ? (
              <div className="text-center py-16 px-8">
                <FileText className="w-7 h-7 text-gray-600 mx-auto mb-3" />
                <p className="text-gray-500 text-sm">{profiles.length === 0 ? 'No applications yet.' : 'No results match your search.'}</p>
              </div>
            ) : (
              <div className="px-4 py-4 space-y-2">
                {sorted.map(profile => (
                  <ApplicationRow
                    key={profile.corporateId}
                    corporateId={profile.corporateId}
                    merchantName={merchantNames[profile.corporateId] || profile.legalName || profile.corporateId}
                    profile={profile}
                    trackStage={trackMap[profile.corporateId] || null}
                    adminStages={adminMap[profile.corporateId] || []}
                    publicUrl={publicUrl}
                    onEdit={(corpId, name) => setEditing({ corporateId: corpId, merchantName: name, stage: null })}
                    onSend={(stage, corpId, email) => setSending({ stage, corporateId: corpId, prefillEmail: email })}
                    onDelete={setDeleteConfirm}
                    onDeleteMerchant={(info) => { setDeleteMerchantConfirm(info); setDeleteMerchantTyped(''); setDeleteMerchantError(''); }}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right panel — editor */}
        {showEditor && (
          <div className="flex-1 flex flex-col bg-[#161b23] overflow-hidden">
            <StageEditor
              stage={editing.stage}
              corporateId={editing.corporateId}
              merchantName={editing.merchantName}
              onSaved={handleStageSaved}
              onClose={() => setEditing(null)}
            />
          </div>
        )}
      </div>

      {sending && (
        <SendModal
          stage={sending.stage}
          corporateId={sending.corporateId}
          prefillEmail={sending.prefillEmail}
          publicUrl={publicUrl}
          onSent={s => s && setAllStages(prev => prev.map(x => x.id === s.id ? s : x))}
          onClose={() => setSending(null)} />
      )}

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

      {deleteMerchantConfirm && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 px-4"
          onClick={() => { if (!deletingMerchant) { setDeleteMerchantConfirm(null); setDeleteMerchantTyped(''); } }}>
          <div className="bg-[#1c2128] border border-red-500/30 rounded-2xl shadow-2xl w-full max-w-sm p-6" onClick={e => e.stopPropagation()}>
            <h3 className="font-bold text-white mb-2">Permanently delete this merchant?</h3>
            <p className="text-sm text-gray-400 mb-1">
              <span className="text-white font-semibold">{deleteMerchantConfirm.merchantName}</span> ({deleteMerchantConfirm.corporateId})
            </p>
            <p className="text-xs text-gray-500 mb-4">
              This permanently deletes the corporate profile, all locations, all MIDs, and all signers from our database.
              This does not touch any application already drafted in MSPWare. This cannot be undone.
            </p>
            <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
              Type DELETE to confirm
            </label>
            <input
              value={deleteMerchantTyped}
              onChange={e => setDeleteMerchantTyped(e.target.value)}
              placeholder="DELETE"
              className="w-full bg-[#111318] border border-white/20 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder:text-gray-600 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent mb-4"
            />
            {deleteMerchantError && (
              <p className="text-xs text-red-400 mb-3">{deleteMerchantError}</p>
            )}
            <div className="flex gap-3">
              <button
                onClick={handleDeleteMerchant}
                disabled={deleteMerchantTyped !== 'DELETE' || deletingMerchant}
                className="flex-1 flex items-center justify-center gap-2 bg-red-500 hover:bg-red-400 disabled:bg-gray-700 disabled:text-gray-500 text-white font-bold text-sm py-2.5 rounded-xl transition-all">
                {deletingMerchant ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Delete Permanently'}
              </button>
              <button
                onClick={() => { setDeleteMerchantConfirm(null); setDeleteMerchantTyped(''); }}
                disabled={deletingMerchant}
                className="flex-1 border border-white/15 text-gray-300 font-semibold text-sm py-2.5 rounded-xl hover:text-white disabled:opacity-40">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
