import { useState, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import {
  Pencil, Loader2, Send, Trash2, Check, X, Copy, ExternalLink,
  Clock, Store, Users, FileText, Search, Building2, CreditCard,
  CheckCircle2, AlertCircle, Eye, BarChart2, Zap,
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

// Align with live portal (2026-07-10): Locations → Banking → Signing → Submitted.
// "agreement" / Step1Agreement is retired; map legacy track values in ApplicationRow.
const STEP_ORDER = ['locations', 'banking', 'verification', 'submitted'];
const STEP_LABELS_MAP = { locations: 'Locations', banking: 'Banking', verification: 'Signing', submitted: 'Submitted' };

function normalizeTrackStep(step) {
  if (!step) return 'locations';
  if (step === 'agreement' || step === 'quote') return 'locations';
  if (step === 'verify') return 'verification';
  return STEP_ORDER.includes(step) ? step : 'locations';
}

function formatDuration(totalSeconds) {
  // Adaptive units: seconds under 1m, then minutes, then hours.
  const s = Math.max(0, Math.floor(Number(totalSeconds) || 0));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const mins = m % 60;
  return mins ? `${h}h ${mins}m` : `${h}h`;
}

function formatActivityAt(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch {
    return '—';
  }
}

const ACTIVITY_EVENT_LABELS = {
  invite_sent: 'Invite email sent',
  portal_open: 'Portal opened',
  session_tick: 'Session time',
};

function PortalActivityPanel({ activity }) {
  const a = activity || {};
  const recent = Array.isArray(a.recent) ? a.recent : [];
  const hasAny = (a.invitesSent || a.merchantOpens || a.agentOpens || a.merchantSeconds);
  const stats = [
    { label: 'Invites sent', value: a.invitesSent || 0, sub: a.lastInviteAt ? `Last ${formatActivityAt(a.lastInviteAt)}` : 'None yet' },
    { label: 'Merchant opens', value: a.merchantOpens || 0, sub: a.merchantLastOpenAt ? `Last ${formatActivityAt(a.merchantLastOpenAt)}` : 'None yet' },
    { label: 'Merchant time', value: formatDuration(a.merchantSeconds), sub: 'Time in portal' },
    { label: 'Agent opens', value: a.agentOpens || 0, sub: a.agentLastOpenAt ? `Last ${formatActivityAt(a.agentLastOpenAt)}` : 'None yet' },
  ];

  return (
    <div>
      <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-2">Portal activity</p>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
        {stats.map(st => (
          <div key={st.label} className="rounded-xl border border-white/8 bg-white/[0.02] px-2.5 py-2">
            <p className="text-[9px] font-semibold text-gray-500 uppercase tracking-wider">{st.label}</p>
            <p className="text-sm font-bold text-white mt-0.5">{st.value}</p>
            <p className="text-[9px] text-gray-600 mt-0.5 truncate">{st.sub}</p>
          </div>
        ))}
      </div>
      {recent.length > 0 && (
        <div className="rounded-xl border border-white/8 bg-[#111318]/50 divide-y divide-white/5 max-h-40 overflow-y-auto">
          {recent.slice(0, 12).map((ev, i) => (
            <div key={`${ev.at}-${i}`} className="flex items-center gap-2 px-3 py-1.5">
              <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full border ${
                ev.actor === 'agent'
                  ? 'text-amber-400 border-amber-500/30 bg-amber-500/10'
                  : 'text-blue-400 border-blue-500/30 bg-blue-500/10'
              }`}>
                {ev.actor === 'agent' ? 'Agent' : 'Merchant'}
              </span>
              <p className="text-[11px] text-gray-300 flex-1 truncate">
                {ACTIVITY_EVENT_LABELS[ev.type] || ev.type}
                {ev.detail ? ` · ${ev.detail}` : ''}
              </p>
              <p className="text-[10px] text-gray-600 flex-shrink-0">{formatActivityAt(ev.at)}</p>
            </div>
          ))}
        </div>
      )}
      {!hasAny && (
        <p className="text-[11px] text-gray-600">No portal activity recorded yet. Sends, opens, and time-in-app will appear here.</p>
      )}
    </div>
  );
}

function humanizeMspError(err) {
  const raw = typeof err === 'string' ? err : (err?.message || err?.description || JSON.stringify(err));
  const s = String(raw).toLowerCase();
  if (s.includes('deposit') || s.includes('routing') || s.includes('bank') || s.includes('account_no')) return 'Missing Bank Details';
  if (s.includes('highest_ticket') || s.includes('highest ticket')) return 'Highest Ticket Validation Failure';
  if (s.includes('average_sales') || s.includes('average transaction') || s.includes('avg sale')) return 'Average Sale Validation Failure';
  if (s.includes('monthly_sales') || s.includes('monthly volume')) return 'Monthly Volume Validation Failure';
  if (s.includes('firearm')) return 'Firearm verification (template) — omit from PUT';
  return raw;
}

function signerMissingFields(s) {
  const miss = [];
  if (!s.firstName || !s.lastName) miss.push('Name');
  if (!s.signerEmail) miss.push('Email');
  if (s.ownershipPercentage == null || s.ownershipPercentage === '') miss.push('Ownership %');
  if (s.isPrimarySigner) {
    if (!s.dobYear || !s.dobMonth || !s.dobDay) miss.push('DOB');
    const ssnDigits = String(s.ssn || '').replace(/\D/g, '');
    if (ssnDigits.length < 9) miss.push('SSN');
    if (!s.homeStreet) miss.push('Home street');
    if (!s.homeCity) miss.push('Home city');
    if (!s.homeState) miss.push('Home state');
    if (!s.homeZip) miss.push('Home ZIP');
    if (!s.titleType && !s.title) miss.push('Title');
    // corporatePhone is collected but not required for identityStatus Verified
  }
  return miss;
}

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
// Portal funnel: Locations → Banking → Signing → Submitted
function StepTracker({ currentStep, completedSteps, missingByStep }) {
  const activeStep = normalizeTrackStep(currentStep);
  const SHORT = { locations: 'Loc', banking: 'Bank', verification: 'Sign', submitted: 'Done' };
  return (
    <div className="flex items-start gap-0">
      {STEP_ORDER.map((step, i) => {
        const done = !!(completedSteps?.[step] || completedSteps?.[step === 'verification' ? 'verify' : step])
          || activeStep === 'submitted';
        const active = activeStep === step && !done;
        const miss = missingByStep?.[step] || 0;
        return (
          <div key={step} className="flex items-start">
            <div
              className="flex flex-col items-center w-9"
              title={`${STEP_LABELS_MAP[step]}${active ? ' · current' : ''}${miss ? ` · ${miss} missing` : ''}`}
            >
              <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-bold border transition-all ${
                done   ? 'bg-green-500 border-green-500 text-white' :
                active ? 'bg-amber-500 border-amber-400 text-black ring-2 ring-amber-400/50' :
                         'bg-transparent border-gray-700 text-gray-600'
              }`}>
                {done ? '✓' : (miss > 0 ? miss : i + 1)}
              </div>
              <span className={`mt-0.5 text-[8px] font-semibold leading-none ${
                active ? 'text-amber-400' : done ? 'text-green-500/80' : 'text-gray-600'
              }`}>
                {SHORT[step]}
              </span>
            </div>
            {i < STEP_ORDER.length - 1 && (
              <div className={`w-3 h-0.5 mt-2.5 flex-shrink-0 ${done ? 'bg-green-500/40' : active ? 'bg-amber-500/60' : 'bg-gray-700'}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

/** Infer funnel position from track record + live entity data (track alone can lag).
 *  Sign (verification) is COMPLETE only after submit — identity verified + bank linked
 *  means ready to sign, not signed. */
function resolvePipelineProgress({ profile, track, locations, signers }) {
  const p = track?.prefilledData || {};
  const appStatus = p.applicationStatus || profile?.applicationStatus || 'Incomplete';
  const completed = { ...(p.completedSteps || {}) };

  if (appStatus === 'Submitted' || p.currentStep === 'submitted') {
    return {
      currentStep: 'submitted',
      completedSteps: { locations: true, banking: true, verification: true, submitted: true },
      appStatus,
    };
  }

  // Never treat signing as done from stale track flags — only Submitted means signed
  delete completed.verification;
  delete completed.verify;
  delete completed.submitted;

  const locs = locations || [];
  const detailLoaded = locs.length > 0 || (signers || []).length > 0;
  const hasLocs = locs.length > 0;
  const allBanked = hasLocs && locs.every(l => l.bankDetails?.routingNumber);

  if (hasLocs) completed.locations = true;
  if (allBanked) completed.banking = true;
  // verification stays incomplete until Submitted

  let step = normalizeTrackStep(p.currentStep || 'locations');

  // Only upgrade from live data once detail has been loaded for this row
  if (detailLoaded) {
    if (allBanked) step = 'verification'; // ready to sign (or mid-signing) — active, not done
    else if (hasLocs) step = 'banking';
    else step = 'locations';
  } else if (step === 'submitted' || completed.verification || completed.verify) {
    // Stale track claimed signing done without Submitted — hold on Sign
    step = 'verification';
  }

  return { currentStep: step, completedSteps: completed, appStatus };
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
  ].map(humanizeMspError).filter(Boolean);

  const localIssues = [];
  if (!mid.mccCode) localIssues.push('Missing MCC code');
  if (!mid.monthlyCardSales) localIssues.push('Missing monthly volume');
  if (!mid.avgSaleAmount) localIssues.push('Missing avg sale amount');
  if (!mid.highestTicketAmount) localIssues.push('Missing highest ticket');
  if (mid.cardPresentPct == null || mid.cardPresentPct === '') localIssues.push('Missing card split');
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
  const [quotes, setQuotes]           = useState([]);
  const [selectedQuoteId, setSelectedQuoteId] = useState(null);
  const [loadingQuotes, setLoadingQuotes] = useState(false);
  const [selectingQuote, setSelectingQuote] = useState(false);
  const [loading, setLoading]         = useState(true);
  const [saving, setSaving]           = useState(false);
  const [error, setError]             = useState('');
  const [syncMsg, setSyncMsg]         = useState('');
  const [activeTab, setActiveTab]     = useState('locations');

  useEffect(() => { loadData(); }, []);

  const fetchLists = async () => {
    const [locRes, conRes, sigRes] = await Promise.all([
      base44.functions.invoke('listLocations', { corporateId }),
      base44.functions.invoke('manageMerchantID', { action: 'list', corporateId }),
      base44.functions.invoke('manageSigner', { action: 'list', corporateId }),
    ]);
    const locs = locRes.data?.locations || [];
    const mids = conRes.data?.merchantIDs || [];
    const sigs = sigRes.data?.signers || [];
    setLocations(locs);
    setMids(mids);
    setSigners(sigs);
    return { locs, mids, sigs };
  };

  const fetchQuotes = async () => {
    setLoadingQuotes(true);
    try {
      const res = await base44.functions.invoke('getHubspotQuote', { action: 'list', corporateId });
      if (res.data?.error) throw new Error(res.data.error);
      // Safety: unique by id in case HubSpot associations still duplicate
      const raw = res.data?.quotes || [];
      const seen = new Set();
      const unique = [];
      for (const q of raw) {
        const id = String(q.id);
        if (seen.has(id)) continue;
        seen.add(id);
        unique.push(q);
      }
      setQuotes(unique);
      setSelectedQuoteId(res.data?.selectedQuoteId || null);
    } catch (err) {
      setError(err.message || 'Failed to load HubSpot quotes');
    } finally {
      setLoadingQuotes(false);
    }
  };

  const selectAll = ({ locs, mids, sigs }) => {
    setSelLocs(new Set(locs.map(l => l.id || l.locationId)));
    setSelMids(new Set(mids.map(c => c.id)));
    setSelSigners(new Set(sigs.map(s => s.id)));
  };

  const loadData = async () => {
    setLoading(true); setError('');
    try {
      let lists = await fetchLists();
      if (!lists.locs.length && !lists.sigs.length) {
        setSyncMsg('Nothing in Base44 yet — pulling this deal from HubSpot…');
        const syncRes = await base44.functions.invoke('syncFromHubspot', { dealId: corporateId });
        if (syncRes.data?.error) throw new Error(syncRes.data.error);
        lists = await fetchLists();
      }
      if (!stage) selectAll(lists);
      await fetchQuotes();
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Failed to load merchant data');
    } finally {
      setSyncMsg('');
      setLoading(false);
    }
  };

  const handleHubspotSync = async () => {
    setLoading(true); setError('');
    setSyncMsg('Syncing from HubSpot…');
    try {
      const res = await base44.functions.invoke('syncFromHubspot', { dealId: corporateId });
      if (res.data?.error) throw new Error(res.data.error);
      const lists = await fetchLists();
      if (!stage) selectAll(lists);
      await fetchQuotes();
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'HubSpot sync failed');
    } finally {
      setSyncMsg('');
      setLoading(false);
    }
  };

  const toggle = (id, setFn) => setFn(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  const handleSelectQuote = async (quoteId) => {
    setSelectingQuote(true); setError('');
    try {
      const res = await base44.functions.invoke('getHubspotQuote', {
        action: 'select',
        corporateId,
        quoteId,
      });
      if (res.data?.error) throw new Error(res.data.error);
      setSelectedQuoteId(quoteId);
    } catch (err) {
      setError(err.message || 'Failed to select quote');
    } finally {
      setSelectingQuote(false);
    }
  };

  const handleSave = async () => {
    setSaving(true); setError('');
    try {
      const payload = {
        label: label || 'Application',
        includedLocationIds: [...selLocs],
        includedMidIds: [...selMids],
        includedSignerIds: [...selSigners],
        status: stage?.status === 'sent' ? 'sent' : 'ready',
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
    { key: 'quotes',    label: 'Quotes',    count: selectedQuoteId ? 1 : 0, total: quotes.length, icon: FileText },
  ];

  const formatMoney = (n) => (n == null || Number.isNaN(n) ? '—' : `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 px-6 py-4 border-b border-white/8">
        <button onClick={onClose} className="p-1.5 text-gray-500 hover:text-white rounded-lg transition-colors" title="Close">
          <X className="w-4 h-4" />
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-[10px] text-gray-500 uppercase tracking-wider">{merchantName}</p>
          <p className="text-sm font-bold text-white">{stage?.id ? 'Edit Application' : 'Configure Application'}</p>
        </div>
        <button onClick={handleHubspotSync} disabled={loading || saving} title="Pull the latest deal, contact, and company data from HubSpot"
          className="flex items-center gap-1.5 text-[11px] font-semibold text-gray-400 hover:text-white border border-white/10 hover:border-white/20 px-2.5 py-2 rounded-xl transition-all disabled:opacity-40">
          <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} /> HubSpot Sync
        </button>
        <button onClick={handleSave} disabled={saving}
          className="flex items-center gap-2 bg-amber-500 hover:bg-amber-400 disabled:bg-gray-700 disabled:text-gray-500 text-black font-bold text-sm px-4 py-2 rounded-xl transition-all">
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>

      {loading ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-3">
          <Loader2 className="w-6 h-6 text-amber-400 animate-spin" />
          {syncMsg && <p className="text-xs text-gray-400">{syncMsg}</p>}
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto">
          <div className="px-6 pt-5 pb-4 border-b border-white/5">
            <label className={labelCls}>Internal label (optional)</label>
            <input value={label} onChange={e => setLabel(e.target.value)} placeholder="e.g. Main application" className={inputCls} />
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
                          <div className="ml-6 mt-1.5 space-y-1.5">
                            {locMids.map(mid => (
                              <CheckRow key={mid.id} checked={selMids.has(mid.id)} onChange={() => toggle(mid.id, setSelMids)} color="blue">
                                <CreditCard className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" />
                                <div className="flex-1 min-w-0">
                                  <p className="text-xs font-semibold text-white truncate">{mid.dbaName || mid.merchantName}</p>
                                  <p className="text-[10px] text-gray-500">{mid.mccCode ? `MCC ${mid.mccCode}` : 'No MCC'} · {mid.applicationStepStatus || 'In Review'}</p>
                                </div>
                              </CheckRow>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
              </>
            )}
            {activeTab === 'signers' && (
              <>
                <p className="text-[11px] text-gray-500">Selected signers are included in this application's invite scope.</p>
                {signers.length === 0
                  ? <p className="text-xs text-gray-600 italic py-4 text-center">No signers found.</p>
                  : signers.map(s => (
                    <CheckRow key={s.id} checked={selSigners.has(s.id)} onChange={() => toggle(s.id, setSelSigners)} color="purple">
                      <Users className="w-3.5 h-3.5 text-purple-400 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-white truncate">{s.firstName} {s.lastName}</p>
                        <p className="text-[10px] text-gray-500 truncate">{s.signerEmail}</p>
                      </div>
                      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full border ${(s.identityStatus === 'Verified' || s.identityStatus === 'Signed') ? 'text-green-400 border-green-500/30' : 'text-gray-500 border-gray-500/20'}`}>
                        {s.identityStatus || 'Pending'}
                      </span>
                    </CheckRow>
                  ))
                }
              </>
            )}
            {activeTab === 'quotes' && (
              <>
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[11px] text-gray-500">
                    Pick which HubSpot quote appears in the merchant portal for equipment signing.
                  </p>
                  <button
                    onClick={fetchQuotes}
                    disabled={loadingQuotes || selectingQuote}
                    className="flex items-center gap-1 text-[10px] font-semibold text-gray-400 hover:text-white border border-white/10 px-2 py-1 rounded-lg disabled:opacity-40"
                  >
                    <RefreshCw className={`w-3 h-3 ${loadingQuotes ? 'animate-spin' : ''}`} /> Refresh
                  </button>
                </div>
                {loadingQuotes ? (
                  <div className="flex items-center justify-center py-8 gap-2">
                    <Loader2 className="w-4 h-4 text-amber-400 animate-spin" />
                    <span className="text-xs text-gray-500">Loading quotes…</span>
                  </div>
                ) : quotes.length === 0 ? (
                  <p className="text-xs text-gray-600 italic py-4 text-center">
                    No quotes associated with this HubSpot deal yet. Create/publish a quote in HubSpot, then Refresh.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {quotes.map(q => {
                      const selected = String(selectedQuoteId) === String(q.id);
                      return (
                        <button
                          key={q.id}
                          type="button"
                          disabled={selectingQuote}
                          onClick={() => handleSelectQuote(q.id)}
                          className={`w-full text-left rounded-xl border px-3 py-3 transition-all ${
                            selected
                              ? 'border-amber-500/40 bg-amber-500/10'
                              : 'border-white/10 hover:border-white/20 bg-white/[0.02]'
                          } disabled:opacity-50`}
                        >
                          <div className="flex items-start gap-2.5">
                            <div className={`mt-0.5 w-4 h-4 rounded-full border flex items-center justify-center flex-shrink-0 ${
                              selected ? 'border-amber-400 bg-amber-500' : 'border-white/30'
                            }`}>
                              {selected && <Check className="w-2.5 h-2.5 text-black" />}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <p className="text-sm font-semibold text-white truncate">{q.title}</p>
                                {selected && (
                                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                                    Selected
                                  </span>
                                )}
                              </div>
                              <p className="text-[10px] text-gray-500 mt-0.5">
                                {formatMoney(q.amount)}
                                {q.esignStatus ? ` · ${q.esignStatus}` : ''}
                                {q.paymentStatus ? ` · Pay ${q.paymentStatus}` : ''}
                                {q.status ? ` · ${q.status}` : ''}
                              </p>
                              {q.quoteUrl ? (
                                <a
                                  href={q.quoteUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  onClick={e => e.stopPropagation()}
                                  className="inline-flex items-center gap-1 text-[10px] text-blue-400 hover:text-blue-300 mt-1"
                                >
                                  Open quote <ExternalLink className="w-3 h-3" />
                                </a>
                              ) : (
                                <p className="text-[10px] text-amber-500/80 mt-1">No public signing link yet</p>
                              )}
                            </div>
                          </div>
                        </button>
                      );
                    })}
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
        setLink(res.data.link || '');
        onSent(res.data.stage);
      } else {
        const directLink = `${publicUrl}/?corporateId=${corporateId}`;
        const res = await base44.functions.invoke('sendResumeLink', { email, corporateId, link: directLink });
        if (res.data?.error) throw new Error(res.data.error);
        // Resume-link path doesn't go through manageStagedApplication send — log invite here
        await base44.functions.invoke('manageStagedApplication', {
          action: 'trackProgress',
          corporateId,
          data: { activityEvent: { type: 'invite_sent', actor: 'agent', email } },
        }).catch(() => {});
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
function ApplicationRow({ corporateId, merchantName, profile, trackStage, adminStages, publicUrl, onEdit, onSend, onDeleteMerchant }) {
  const [expanded, setExpanded]         = useState(false);
  const [mids, setMids]                 = useState([]);
  const [locations, setLocations]       = useState([]);
  const [signers, setSigners]           = useState([]);
  const [mspStatuses, setMspStatuses]   = useState({});
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [loadingMsp, setLoadingMsp]     = useState(false);
  const [copied, setCopied]             = useState(null);
  const [impersonating, setImpersonating] = useState(false);

  const p = trackStage?.prefilledData || {};
  const missingByStep = p.missingByStep || p.missingCounts || {};
  const lastSeen = p.lastSeenAt
    ? new Date(p.lastSeenAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    : null;

  const linkStage = adminStages.find(s => s.status === 'sent')
    || adminStages.find(s => s.status === 'ready')
    || adminStages[0]
    || null;

  const pipeline = resolvePipelineProgress({
    profile,
    track: trackStage,
    locations,
    signers,
  });
  const { currentStep, completedSteps, appStatus } = pipeline;

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
        const [midRes, sigRes, locRes] = await Promise.all([
          base44.functions.invoke('manageMerchantID', { action: 'list', corporateId }),
          base44.functions.invoke('manageSigner', { action: 'list', corporateId }),
          base44.functions.invoke('listLocations', { corporateId }),
        ]);
        const loadedMids = midRes.data?.merchantIDs || [];
        setMids(loadedMids);
        setSigners(sigRes.data?.signers || []);
        setLocations(locRes.data?.locations || []);

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

  const openMerchantView = async (e) => {
    e?.stopPropagation?.();
    setImpersonating(true);
    try {
      const res = await base44.functions.invoke('manageStagedApplication', {
        action: 'impersonate',
        corporateId,
      });
      if (res.data?.error || !res.data?.portalUrl) {
        throw new Error(res.data?.error || 'Impersonation failed');
      }
      window.open(res.data.portalUrl, '_blank', 'noopener,noreferrer');
    } catch (err) {
      console.error('[impersonate]', err);
      alert(err.message || 'Could not open merchant portal');
    } finally {
      setImpersonating(false);
    }
  };

  const copyInviteLink = async (e, stage) => {
    e.stopPropagation();
    try {
      if (stage?.id) {
        const res = await base44.functions.invoke('manageStagedApplication', {
          action: 'getInviteLink',
          stageId: stage.id,
        });
        if (res.data?.error || !res.data?.link) throw new Error(res.data?.error || 'No invite link');
        await navigator.clipboard.writeText(res.data.link);
      } else {
        // No staged invite — copy corporateId entry URL (admin must be logged in)
        await navigator.clipboard.writeText(`${publicUrl}/?corporateId=${corporateId}`);
      }
      setCopied(stage?.id || 'link');
      setTimeout(() => setCopied(null), 2000);
    } catch (err) {
      console.error('[getInviteLink]', err);
      alert(err.message || 'Could not copy invite link');
    }
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
            {!isSubmitted && currentStep === 'banking' && (
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40">
                Bottleneck: Banking
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 mt-0.5 flex-wrap">
            {(p.signerEmail || profile?.signerEmail) && <p className="text-[10px] text-gray-500 truncate">{p.signerEmail || profile?.signerEmail}</p>}
            {(p.pricingTier || profile?.pricingTier) && <span className="text-[10px] text-gray-600">{p.pricingTier || profile?.pricingTier}</span>}
            {lastSeen && <p className="hidden sm:flex items-center gap-1 text-[10px] text-gray-600"><Clock className="w-2.5 h-2.5" /> {lastSeen}</p>}
          </div>
        </div>

        {/* Step tracker */}
        <div className="hidden md:flex flex-col items-center gap-0.5 flex-shrink-0 px-1">
          <StepTracker currentStep={currentStep} completedSteps={completedSteps} missingByStep={missingByStep} />
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
          <button onClick={openMerchantView} disabled={impersonating} title="Open merchant portal (30-min session)"
            className="flex items-center gap-1 text-[10px] font-semibold px-2 py-1 rounded-lg border transition-all bg-amber-500/10 text-amber-300 border-amber-500/25 hover:bg-amber-500/20 disabled:opacity-40">
            {impersonating ? <Loader2 className="w-3 h-3 animate-spin" /> : <Eye className="w-3 h-3" />}
            View
          </button>
          <button onClick={(e) => copyInviteLink(e, linkStage)} title="Copy invite link"
            className={`flex items-center gap-1 text-[10px] font-semibold px-2 py-1 rounded-lg border transition-all ${copied === (linkStage?.id || 'link') ? 'bg-green-500/15 text-green-400 border-green-500/30' : 'bg-blue-500/10 text-blue-400 border-blue-500/20 hover:bg-blue-500/20'}`}>
            {copied === (linkStage?.id || 'link') ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
            {copied === (linkStage?.id || 'link') ? 'Copied!' : 'Copy'}
          </button>
          <button onClick={() => onSend(linkStage, corporateId, p.signerEmail || profile?.signerEmail || '')}
            className="flex items-center gap-1 text-[10px] font-semibold px-2 py-1 rounded-lg border transition-all bg-white/5 text-gray-400 border-white/10 hover:bg-green-500/10 hover:text-green-400 hover:border-green-500/20">
            <Send className="w-3 h-3" /> Send
          </button>
          <button onClick={() => onEdit(corporateId, merchantName, linkStage)}
            title="Edit locations, signers & prefill"
            className="flex items-center gap-1 text-[10px] font-semibold px-2 py-1 rounded-lg border transition-all bg-white/5 text-gray-300 border-white/10 hover:bg-amber-500/10 hover:text-amber-300 hover:border-amber-500/25">
            <Pencil className="w-3 h-3" />
            Edit
          </button>
          <button onClick={() => onDeleteMerchant({ corporateId, merchantName })} title="Delete merchant permanently (all data)"
            className="p-1.5 text-gray-700 hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-colors">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

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
              <PortalActivityPanel activity={p.activity} />

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
                    {signers.map(s => {
                      const miss = signerMissingFields(s);
                      const verified = s.identityStatus === 'Verified' || s.identityStatus === 'Signed';
                      const hasIssues = !verified && miss.length > 0;
                      return (
                        <div key={s.id} className={`px-3 py-2 rounded-xl border ${
                          verified ? 'border-green-500/20 bg-green-500/5' :
                          hasIssues ? 'border-red-500/20 bg-red-500/5' :
                          'border-white/8 bg-white/[0.02]'
                        }`}>
                          <div className="flex items-center gap-2.5">
                            <Users className={`w-3.5 h-3.5 flex-shrink-0 ${verified ? 'text-green-400' : hasIssues ? 'text-red-400' : 'text-gray-500'}`} />
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-semibold text-white">{s.firstName} {s.lastName}</p>
                              <p className="text-[10px] text-gray-500">{s.signerEmail}</p>
                            </div>
                            <div className="flex items-center gap-1.5 flex-shrink-0">
                              {s.isPrimarySigner && <span className="text-[9px] font-bold text-amber-400 bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.5 rounded-full">Primary</span>}
                              <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full border ${verified ? 'text-green-400 border-green-500/30 bg-green-500/10' : 'text-gray-500 border-gray-500/20 bg-gray-500/10'}`}>
                                {s.identityStatus || 'Pending'}
                              </span>
                              {hasIssues && (
                                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-red-500/15 text-red-400 border border-red-500/30">
                                  {miss.length} missing
                                </span>
                              )}
                            </div>
                          </div>
                          {hasIssues && (
                            <div className="mt-2 ml-6 space-y-1">
                              {miss.map(m => (
                                <div key={m} className="flex items-start gap-1.5">
                                  <XCircle className="w-3 h-3 text-red-400 flex-shrink-0 mt-0.5" />
                                  <p className="text-[11px] text-red-300">Missing {m}</p>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
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
    const adminForCorp = allStages.filter(s => s.corporateId === id && s.label !== '__auto_track__');
    const existing = adminForCorp.find(s => s.status === 'sent')
      || adminForCorp.find(s => s.status === 'ready')
      || adminForCorp[0]
      || null;
    setEditing({ corporateId: id, merchantName: merchantNames[id] || id, stage: existing });
  };

  const handleStageSaved = (stage) => {
    setAllStages(prev => {
      const idx = prev.findIndex(s => s.id === stage.id);
      if (idx >= 0) { const next = [...prev]; next[idx] = stage; return next; }
      return [stage, ...prev];
    });
    setEditing(null);
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
        {/* Full-width list — editor is an overlay so it never crushes this column */}
        <div className="flex flex-col flex-1 min-w-0 border-r border-white/8">
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
                    onEdit={(corpId, name, stage) => setEditing({ corporateId: corpId, merchantName: name, stage: stage || null })}
                    onSend={(stage, corpId, email) => setSending({ stage, corporateId: corpId, prefillEmail: email })}
                    onDeleteMerchant={(info) => { setDeleteMerchantConfirm(info); setDeleteMerchantTyped(''); setDeleteMerchantError(''); }}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Edit overlay — does not shrink the applications list */}
      {showEditor && (
        <div className="fixed inset-0 z-[9000] flex justify-end bg-black/60 backdrop-blur-sm" onClick={() => setEditing(null)}>
          <div
            className="w-full max-w-xl h-full bg-[#161b23] border-l border-white/10 shadow-2xl flex flex-col"
            onClick={e => e.stopPropagation()}
          >
            <StageEditor
              stage={editing.stage}
              corporateId={editing.corporateId}
              merchantName={editing.merchantName}
              onSaved={handleStageSaved}
              onClose={() => setEditing(null)}
            />
          </div>
        </div>
      )}

      {sending && (
        <SendModal
          stage={sending.stage}
          corporateId={sending.corporateId}
          prefillEmail={sending.prefillEmail}
          publicUrl={publicUrl}
          onSent={async (s) => {
            if (s) setAllStages(prev => prev.map(x => x.id === s.id ? s : x));
            try {
              const stagesRes = await base44.functions.invoke('manageStagedApplication', { action: 'list' });
              if (stagesRes.data?.stages) setAllStages(stagesRes.data.stages);
            } catch (_) { /* keep local state */ }
          }}
          onClose={() => setSending(null)} />
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
