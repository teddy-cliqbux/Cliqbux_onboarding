import { useState, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import {
  Pencil, Loader2, Send, Trash2, Check, X, Copy, ExternalLink,
  Clock, Store, Users, FileText, Search, Building2, CreditCard,
  CheckCircle2, AlertCircle, Eye, BarChart2, Zap, LayoutDashboard,
  ChevronDown, ChevronRight, XCircle, RefreshCw
} from 'lucide-react';
import {
  lifecycleLabel,
  lifecycleBadgeClass,
  isVerifiedOrHigher,
  isApplicationSigned,
} from '@/lib/signerLifecycle';

const inputCls = 'w-full bg-cb-bg border border-cb-border rounded-cb px-3.5 py-2.5 text-cb-body text-white placeholder:text-gray-500 transition-colors hover:border-cb-border-strong focus:outline-none focus:ring-2 focus:ring-cb-accent focus:border-transparent';
const labelCls = 'block text-cb-caption uppercase text-gray-500 mb-1.5';

const STAGE_COLORS = { draft: '#6b7280', ready: '#FEAC27', sent: '#4ADE80' };
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
  invite_sent: 'Portal invite sent',
  signer_invite_sent: 'Signer link sent',
  signer_link_opened: 'Signer link opened',
  portal_open: 'Portal opened',
  session_tick: 'Session time',
};

function activityActorLabel(actor) {
  if (actor === 'agent') return 'Agent';
  if (actor === 'signer') return 'Signer';
  return 'Merchant';
}

function activityActorDot(actor) {
  if (actor === 'agent') return 'bg-cb-accent';
  if (actor === 'signer') return 'bg-sky-400';
  return 'bg-gray-500';
}

function PortalActivityPanel({ activity }) {
  const a = activity || {};
  const recent = Array.isArray(a.recent) ? a.recent : [];
  const hasAny = (
    a.invitesSent || a.merchantOpens || a.agentOpens || a.merchantSeconds
    || a.signerInvitesSent || a.signerLinkOpens
  );
  const stats = [
    { label: 'Portal invites', value: a.invitesSent || 0, sub: a.lastInviteAt ? `Last ${formatActivityAt(a.lastInviteAt)}` : 'None yet' },
    { label: 'Signer links sent', value: a.signerInvitesSent || 0, sub: a.signerLastInviteAt ? `Last ${formatActivityAt(a.signerLastInviteAt)}` : 'None yet' },
    { label: 'Signer links opened', value: a.signerLinkOpens || 0, sub: a.signerLastOpenAt ? `Last ${formatActivityAt(a.signerLastOpenAt)}` : 'None yet' },
    { label: 'Merchant opens', value: a.merchantOpens || 0, sub: a.merchantLastOpenAt ? `Last ${formatActivityAt(a.merchantLastOpenAt)}` : 'None yet' },
    { label: 'Merchant time', value: formatDuration(a.merchantSeconds), sub: 'Time in portal' },
    { label: 'Agent opens', value: a.agentOpens || 0, sub: a.agentLastOpenAt ? `Last ${formatActivityAt(a.agentLastOpenAt)}` : 'None yet' },
  ];

  return (
    <div>
      <p className="text-cb-caption uppercase text-gray-500 mb-2">Portal activity</p>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-3">
        {stats.map(st => (
          <div key={st.label} className="rounded-cb border border-cb-border bg-cb-surface-raised px-2.5 py-2">
            <p className="text-cb-caption uppercase text-gray-500">{st.label}</p>
            <p className="text-cb-body font-semibold text-white mt-0.5">{st.value}</p>
            <p className="text-cb-caption text-gray-600 mt-0.5 truncate">{st.sub}</p>
          </div>
        ))}
      </div>
      {recent.length > 0 && (
        <div className="rounded-cb border border-cb-border bg-cb-bg/50 divide-y divide-cb-border max-h-40 overflow-y-auto">
          {recent.slice(0, 12).map((ev, i) => (
            <div key={`${ev.at}-${i}`} className="flex items-center gap-2 px-3 py-1.5">
              <span className="inline-flex items-center gap-1.5 text-cb-caption text-gray-400 whitespace-nowrap">
                <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${activityActorDot(ev.actor)}`} />
                {activityActorLabel(ev.actor)}
              </span>
              <p className="text-cb-caption text-gray-300 flex-1 truncate">
                {ACTIVITY_EVENT_LABELS[ev.type] || ev.type}
                {ev.detail ? ` · ${ev.detail}` : ''}
              </p>
              <p className="text-cb-caption text-gray-600 flex-shrink-0">{formatActivityAt(ev.at)}</p>
            </div>
          ))}
        </div>
      )}
      {!hasAny && (
        <p className="text-cb-caption text-gray-600">No portal activity recorded yet. Sends, opens, and time-in-app will appear here.</p>
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
  const dot = {
    'Active':            'bg-cb-success',
    'Active (Existing)': 'bg-cb-success',
    'Pending MID':       'bg-cb-accent',
    'Ready to Submit':   'bg-cb-accent',
    'In Review':         'bg-gray-500',
    'Error':             'bg-cb-danger',
  };
  return (
    <span className="inline-flex items-center gap-1.5 text-cb-caption text-gray-400 whitespace-nowrap">
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${dot[status] || dot['In Review']}`} />
      {status || 'In Review'}
    </span>
  );
}

function HealthBadge({ score }) {
  const color = score === 100 ? 'text-cb-success'
    : score >= 50 ? 'text-cb-accent'
    : 'text-cb-danger';
  return <span className={`text-cb-caption font-medium ${color}`}>{score ?? '?'}%</span>;
}

function ProgressBar({ pct }) {
  const barColor = pct === 100 ? 'bg-cb-success' : 'bg-cb-accent';
  return (
    <div className="w-full h-1 bg-cb-border rounded-full overflow-hidden">
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
                done   ? 'bg-cb-accent border-cb-accent text-cb-bg' :
                active ? 'bg-cb-accent-muted border-cb-accent text-cb-accent' :
                         'bg-transparent border-gray-700 text-gray-600'
              }`}>
                {done ? '✓' : (miss > 0 ? miss : i + 1)}
              </div>
              <span className={`mt-0.5 text-[8px] font-semibold leading-none ${
                active ? 'text-cb-accent' : done ? 'text-gray-400' : 'text-gray-600'
              }`}>
                {SHORT[step]}
              </span>
            </div>
            {i < STEP_ORDER.length - 1 && (
              <div className={`w-3 h-0.5 mt-2.5 flex-shrink-0 ${done ? 'bg-cb-accent/40' : active ? 'bg-cb-accent/60' : 'bg-gray-700'}`} />
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
    <div className={`border rounded-cb overflow-hidden transition-all ${
      isDone ? 'border-cb-border bg-cb-surface-raised' :
      hasIssues ? 'border-cb-danger/30 bg-cb-surface-raised' :
      'border-cb-border bg-cb-surface-raised'
    }`}>
      <div className="flex items-center gap-2.5 px-3 py-2.5 cursor-pointer" onClick={() => setOpen(o => !o)}>
        <CreditCard className="w-3.5 h-3.5 flex-shrink-0 text-gray-400" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-cb-body font-semibold text-white truncate">{mid.dbaName || '—'}</p>
            <MidStatusBadge status={mid.applicationStepStatus} />
          </div>
          {pct !== null && !isDone && (
            <div className="flex items-center gap-2 mt-1">
              <ProgressBar pct={pct} />
              <span className="text-cb-caption text-gray-500 flex-shrink-0 w-8">{pct}%</span>
            </div>
          )}
          {pct === null && !isDone && (
            <p className="text-cb-caption text-gray-600 mt-0.5">{mid.mccCode ? `MCC ${mid.mccCode}` : 'No MCC'}{mid.monthlyCardSales ? ` · $${Number(mid.monthlyCardSales).toLocaleString()}/mo` : ''}</p>
          )}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {isLoadingMsp && <Loader2 className="w-3 h-3 text-gray-500 animate-spin" />}
          {!isLoadingMsp && pct !== null && !isDone && <HealthBadge score={pct} />}
          {mid.elavonMID && <p className="text-cb-caption font-mono text-cb-success">{mid.elavonMID}</p>}
          {allErrors.length > 0 && (
            <span className="inline-flex items-center gap-1.5 text-cb-caption text-cb-danger whitespace-nowrap">
              <span className="w-1.5 h-1.5 rounded-full flex-shrink-0 bg-cb-danger" />
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
        <div className="border-t border-cb-border px-3 py-3 space-y-2 bg-cb-bg/40">
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {mid.mspApplicationNo && (
              <p className="text-cb-caption text-gray-500">MSP App: <span className="font-mono text-gray-400">{mid.mspApplicationNo}</span></p>
            )}
            {mid.elavonMID && (
              <p className="text-cb-caption text-gray-500">MID: <span className="font-mono text-cb-success">{mid.elavonMID}</span></p>
            )}
          </div>
          {allErrors.length > 0 && (
            <div className="space-y-1">
              <p className="text-cb-caption uppercase text-cb-danger">Validation Issues</p>
              {allErrors.map((err, i) => (
                <div key={i} className="flex items-start gap-1.5">
                  <XCircle className="w-3 h-3 text-cb-danger flex-shrink-0 mt-0.5" />
                  <p className="text-cb-caption text-gray-300">{err}</p>
                </div>
              ))}
            </div>
          )}
          {allErrors.length === 0 && pct === 100 && (
            <div className="flex items-center gap-1.5 text-cb-caption text-cb-success">
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
    <div className="border-b border-cb-border bg-cb-surface px-6 py-4 flex flex-wrap items-center gap-8">
      {/* Pie + stage counts */}
      <div className="flex items-center gap-4">
        {chartData.length > 0 ? (
          <div className="w-20 h-14 flex-shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={chartData} dataKey="value" cx="50%" cy="50%" innerRadius={18} outerRadius={30} strokeWidth={0}>
                  {chartData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                </Pie>
                <Tooltip contentStyle={{ background: '#1A212C', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, fontSize: 11 }} itemStyle={{ color: '#e5e7eb' }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="w-9 h-9 rounded-cb bg-cb-accent-muted flex items-center justify-center flex-shrink-0">
            <BarChart2 className="w-4 h-4 text-cb-accent" />
          </div>
        )}
        <div>
          <p className="text-cb-caption uppercase text-gray-500 mb-1">Applications</p>
          <div className="flex items-center gap-3">
            <span className="text-cb-title font-display text-white">{profiles.length}</span>
            {loading && <Loader2 className="w-3 h-3 text-gray-600 animate-spin" />}
          </div>
          <div className="flex items-center gap-3 mt-1">
            <span className="text-cb-caption text-cb-success">{submitted} submitted</span>
            <span className="text-cb-caption text-cb-accent">{inProgress} in progress</span>
            <span className="text-cb-caption text-gray-500">{notStarted} not started</span>
          </div>
        </div>
      </div>

      <div className="hidden sm:block w-px h-10 bg-cb-border flex-shrink-0" />

      {/* Quick create */}
      <div className="flex-shrink-0">
        <p className="text-cb-caption uppercase text-gray-500 mb-1.5">Quick Stage — Corp ID</p>
        <div className="flex gap-2 items-center">
          <input value={quickId} onChange={e => setQuickId(e.target.value)} placeholder="Enter Corporate ID…"
            onKeyDown={e => e.key === 'Enter' && handleQuickCreate()}
            className="bg-cb-bg border border-cb-border rounded-cb px-3 py-2 text-cb-body text-white placeholder:text-gray-600 hover:border-cb-border-strong focus:outline-none focus:ring-2 focus:ring-cb-accent w-48" />
          <button onClick={handleQuickCreate} disabled={!quickId.trim()}
            className="flex items-center gap-1.5 bg-cb-accent hover:opacity-90 disabled:bg-gray-700 disabled:text-gray-500 text-cb-bg font-semibold text-cb-caption px-3 py-2 rounded-cb transition-opacity flex-shrink-0">
            <Zap className="w-3 h-3" /> Create
          </button>
        </div>
      </div>

      <div className="ml-auto flex-shrink-0">
        <button onClick={onRefresh} disabled={loading}
          className="flex items-center gap-1.5 text-cb-caption font-medium text-gray-400 hover:text-white border border-cb-border hover:border-cb-border-strong px-2.5 py-1.5 rounded-cb transition-all disabled:opacity-40">
          <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>
    </div>
  );
}

// ── Checkbox Row ──────────────────────────────────────────────────────────────
function CheckRow({ checked, onChange, children }) {
  return (
    <label className={`flex items-center gap-3 px-3 py-2.5 rounded-cb border cursor-pointer transition-all ${checked ? 'border-cb-accent/40 bg-cb-accent-muted' : 'border-cb-border hover:border-cb-border-strong'}`}>
      <div className={`w-4 h-4 rounded flex items-center justify-center flex-shrink-0 border transition-all ${checked ? 'bg-cb-accent border-cb-accent' : 'border-cb-border-strong'}`}>
        {checked && <Check className="w-2.5 h-2.5 text-cb-bg" />}
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
      <div className="flex items-center gap-3 px-6 py-4 border-b border-cb-border">
        <button onClick={onClose} className="p-1.5 text-gray-500 hover:text-white rounded-cb transition-colors" title="Close">
          <X className="w-4 h-4" />
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-cb-caption uppercase text-gray-500">{merchantName}</p>
          <p className="text-cb-body font-semibold text-white">{stage?.id ? 'Edit Application' : 'Configure Application'}</p>
        </div>
        <button onClick={handleHubspotSync} disabled={loading || saving} title="Pull the latest deal, contact, and company data from HubSpot"
          className="flex items-center gap-1.5 text-cb-caption font-medium text-gray-400 hover:text-white border border-cb-border hover:border-cb-border-strong px-2.5 py-2 rounded-cb transition-all disabled:opacity-40">
          <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} /> HubSpot Sync
        </button>
        <button onClick={handleSave} disabled={saving}
          className="flex items-center gap-2 bg-cb-accent hover:opacity-90 disabled:bg-gray-700 disabled:text-gray-500 text-cb-bg font-semibold text-cb-body px-4 py-2 rounded-cb transition-opacity">
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>

      {loading ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-3">
          <Loader2 className="w-6 h-6 text-cb-accent animate-spin" />
          {syncMsg && <p className="text-cb-body text-gray-400">{syncMsg}</p>}
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto">
          <div className="px-6 pt-5 pb-4 border-b border-cb-border">
            <label className={labelCls}>Internal label (optional)</label>
            <input value={label} onChange={e => setLabel(e.target.value)} placeholder="e.g. Main application" className={inputCls} />
          </div>
          <div className="flex border-b border-cb-border px-6 gap-1 pt-2">
            {tabs.map(t => (
              <button key={t.key} onClick={() => setActiveTab(t.key)}
                className={`flex items-center gap-1.5 px-3 py-2 text-cb-body font-medium rounded-t-lg border-b-2 transition-all -mb-px ${activeTab === t.key ? 'border-cb-accent text-cb-accent' : 'border-transparent text-gray-500 hover:text-gray-300'}`}>
                <t.icon className="w-3.5 h-3.5" />
                {t.label}
                <span className={`text-cb-caption ${activeTab === t.key ? 'text-cb-accent' : 'text-gray-500'}`}>
                  {t.count}{t.total !== undefined ? `/${t.total}` : ''}
                </span>
              </button>
            ))}
          </div>
          <div className="px-6 py-5 space-y-3">
            {activeTab === 'locations' && (
              <>
                <p className="text-cb-caption text-gray-500">Only selected locations will appear in the merchant's portal.</p>
                {locations.length === 0
                  ? <p className="text-cb-body text-gray-600 italic py-4 text-center">No locations found.</p>
                  : locations.map(loc => {
                    const id = loc.id || loc.locationId;
                    const locMids = mids.filter(c => c.locationId === id);
                    return (
                      <div key={id}>
                        <CheckRow checked={selLocs.has(id)} onChange={() => toggle(id, setSelLocs)}>
                          <Store className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-cb-body font-semibold text-white truncate">{loc.dbaName}</p>
                            <p className="text-cb-caption text-gray-500 truncate">{loc.businessAddress}</p>
                          </div>
                          <span className="text-cb-caption text-gray-600 flex-shrink-0">{locMids.length} MID{locMids.length !== 1 ? 's' : ''}</span>
                        </CheckRow>
                        {selLocs.has(id) && locMids.length > 0 && (
                          <div className="ml-6 mt-1.5 space-y-1.5">
                            {locMids.map(mid => (
                              <CheckRow key={mid.id} checked={selMids.has(mid.id)} onChange={() => toggle(mid.id, setSelMids)}>
                                <CreditCard className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                                <div className="flex-1 min-w-0">
                                  <p className="text-cb-body font-semibold text-white truncate">{mid.dbaName || mid.merchantName}</p>
                                  <p className="text-cb-caption text-gray-500">{mid.mccCode ? `MCC ${mid.mccCode}` : 'No MCC'} · {mid.applicationStepStatus || 'In Review'}</p>
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
                <p className="text-cb-caption text-gray-500">Selected signers are included in this application's invite scope.</p>
                {signers.length === 0
                  ? <p className="text-cb-body text-gray-600 italic py-4 text-center">No signers found.</p>
                  : signers.map(s => (
                    <CheckRow key={s.id} checked={selSigners.has(s.id)} onChange={() => toggle(s.id, setSelSigners)}>
                      <Users className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-cb-body font-semibold text-white truncate">{s.firstName} {s.lastName}</p>
                        <p className="text-cb-caption text-gray-500 truncate">{s.signerEmail}</p>
                      </div>
                      <span className="inline-flex items-center gap-1.5 text-cb-caption text-gray-400 whitespace-nowrap">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold capitalize ${lifecycleBadgeClass(s.identityStatus)}`}>
                          {lifecycleLabel(s.identityStatus)}
                        </span>
                      </span>
                    </CheckRow>
                  ))
                }
              </>
            )}
            {activeTab === 'quotes' && (
              <>
                <div className="flex items-center justify-between gap-2">
                  <p className="text-cb-caption text-gray-500">
                    Pick which HubSpot quote appears in the merchant portal for equipment signing.
                  </p>
                  <button
                    onClick={fetchQuotes}
                    disabled={loadingQuotes || selectingQuote}
                    className="flex items-center gap-1 text-cb-caption font-medium text-gray-400 hover:text-white border border-cb-border hover:border-cb-border-strong px-2 py-1 rounded-cb disabled:opacity-40"
                  >
                    <RefreshCw className={`w-3 h-3 ${loadingQuotes ? 'animate-spin' : ''}`} /> Refresh
                  </button>
                </div>
                {loadingQuotes ? (
                  <div className="flex items-center justify-center py-8 gap-2">
                    <Loader2 className="w-4 h-4 text-cb-accent animate-spin" />
                    <span className="text-cb-body text-gray-500">Loading quotes…</span>
                  </div>
                ) : quotes.length === 0 ? (
                  <p className="text-cb-body text-gray-600 italic py-4 text-center">
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
                          className={`w-full text-left rounded-cb border px-3 py-3 transition-all ${
                            selected
                              ? 'border-cb-accent/40 bg-cb-accent-muted'
                              : 'border-cb-border hover:border-cb-border-strong bg-cb-surface-raised'
                          } disabled:opacity-50`}
                        >
                          <div className="flex items-start gap-2.5">
                            <div className={`mt-0.5 w-4 h-4 rounded-full border flex items-center justify-center flex-shrink-0 ${
                              selected ? 'border-cb-accent bg-cb-accent' : 'border-cb-border-strong'
                            }`}>
                              {selected && <Check className="w-2.5 h-2.5 text-cb-bg" />}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <p className="text-cb-body font-semibold text-white truncate">{q.title}</p>
                                {selected && (
                                  <span className="inline-flex items-center gap-1.5 text-cb-caption text-cb-accent whitespace-nowrap">
                                    <span className="w-1.5 h-1.5 rounded-full flex-shrink-0 bg-cb-accent" />
                                    Selected
                                  </span>
                                )}
                              </div>
                              <p className="text-cb-caption text-gray-500 mt-0.5">
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
                                  className="inline-flex items-center gap-1 text-cb-caption text-cb-accent hover:opacity-80 mt-1"
                                >
                                  Open quote <ExternalLink className="w-3 h-3" />
                                </a>
                              ) : (
                                <p className="text-cb-caption text-gray-500 mt-1">No public signing link yet</p>
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
            <div className="mx-6 mb-4 bg-cb-surface-raised border border-cb-danger/30 border-l-2 border-l-cb-danger rounded-cb px-4 py-3 text-cb-body text-gray-300 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0 text-cb-danger" /> {error}
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
      <div className="bg-cb-surface-raised border border-cb-border rounded-cb shadow-cb-overlay w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-cb bg-cb-accent-muted flex items-center justify-center"><Send className="w-4 h-4 text-cb-accent" /></div>
            <div>
              <h3 className="font-semibold text-white text-cb-body">Send to Merchant</h3>
              <p className="text-cb-caption text-gray-500 truncate max-w-[200px]">{stage?.label || 'Direct link'}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 text-gray-500 hover:text-white rounded-cb"><X className="w-4 h-4" /></button>
        </div>
        {sent ? (
          <div className="space-y-4">
            <div className="flex items-center gap-2 bg-cb-surface border border-cb-border border-l-2 border-l-cb-success rounded-cb px-4 py-3">
              <CheckCircle2 className="w-4 h-4 text-cb-success flex-shrink-0" />
              <p className="text-cb-body text-white font-semibold">Sent to {email}</p>
            </div>
            <div>
              <label className={labelCls}>Magic Link</label>
              <div className="flex items-center gap-2 bg-cb-bg border border-cb-border rounded-cb px-3.5 py-2.5">
                <p className="text-cb-caption text-gray-400 flex-1 truncate font-mono">{link}</p>
                <button onClick={copyLink} className="flex-shrink-0 text-cb-accent hover:opacity-80">
                  {copied ? <Check className="w-3.5 h-3.5 text-cb-success" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
                <a href={link} target="_blank" rel="noreferrer" className="flex-shrink-0 text-gray-500 hover:text-white"><ExternalLink className="w-3.5 h-3.5" /></a>
              </div>
            </div>
            <button onClick={onClose} className="w-full border border-cb-border text-gray-400 font-medium text-cb-body py-2.5 rounded-cb hover:text-white hover:border-cb-border-strong">Done</button>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <label className={labelCls}>Recipient Email</label>
              <input value={email} onChange={e => setEmail(e.target.value)} placeholder="merchant@example.com"
                className={inputCls} autoFocus onKeyDown={e => e.key === 'Enter' && handleSend()} />
            </div>
            {error && <div className="bg-cb-surface border border-cb-danger/30 border-l-2 border-l-cb-danger rounded-cb px-4 py-3 text-cb-body text-gray-300">{error}</div>}
            <div className="flex gap-3">
              <button onClick={handleSend} disabled={sending}
                className="flex-1 flex items-center justify-center gap-2 bg-cb-accent hover:opacity-90 disabled:bg-gray-700 disabled:text-gray-500 text-cb-bg font-semibold text-cb-body py-2.5 rounded-cb transition-opacity">
                {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                {sending ? 'Sending…' : 'Send Link'}
              </button>
              <button onClick={onClose} className="px-4 border border-cb-border text-gray-400 font-medium text-cb-body py-2.5 rounded-cb hover:text-white hover:border-cb-border-strong">Cancel</button>
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
  const [openingDashboard, setOpeningDashboard] = useState(false);
  const [signerLinkBusy, setSignerLinkBusy] = useState({}); // { [signerId]: 'copy' | 'send' }

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

  const copySignerDirectLink = async (e, signer) => {
    e?.stopPropagation?.();
    if (!signer?.id) return;
    setSignerLinkBusy(prev => ({ ...prev, [signer.id]: 'copy' }));
    try {
      const res = await base44.functions.invoke('manageSigner', {
        action: 'getSigningInviteLink',
        corporateId,
        signerId: signer.id,
      });
      if (res.data?.error || !res.data?.link) throw new Error(res.data?.error || 'No link');
      await navigator.clipboard.writeText(res.data.link);
      setCopied(signer.id);
      setTimeout(() => setCopied(null), 2000);
    } catch (err) {
      console.error('[getSigningInviteLink]', err);
      alert(err.message || 'Could not copy signer link');
    } finally {
      setSignerLinkBusy(prev => {
        const next = { ...prev };
        delete next[signer.id];
        return next;
      });
    }
  };

  const sendSignerInvite = async (e, signer) => {
    e?.stopPropagation?.();
    if (!signer?.id) return;
    setSignerLinkBusy(prev => ({ ...prev, [signer.id]: 'send' }));
    try {
      const res = await base44.functions.invoke('manageSigner', {
        action: 'sendSigningInvite',
        corporateId,
        signerId: signer.id,
      });
      if (res.data?.error) throw new Error(res.data.error);
      // Refresh local signer row status
      setSigners(prev => prev.map(s => (s.id === signer.id ? { ...s, ...res.data.signer } : s)));
    } catch (err) {
      console.error('[sendSigningInvite]', err);
      alert(err.message || 'Could not send invite email');
    } finally {
      setSignerLinkBusy(prev => {
        const next = { ...prev };
        delete next[signer.id];
        return next;
      });
    }
  };

  const revertSignerToVerified = async (e, signer) => {
    e?.stopPropagation?.();
    if (!signer?.id) return;
    if (!window.confirm(`Mark ${signer.firstName} ${signer.lastName} as Verified only?\n\nUse this when they completed identity but have not signed BoldSign yet.`)) return;
    setSignerLinkBusy(prev => ({ ...prev, [signer.id]: 'revert' }));
    try {
      const res = await base44.functions.invoke('manageSigner', {
        action: 'setLifecycleStatus',
        corporateId,
        signerId: signer.id,
        status: 'verified',
      });
      if (res.data?.error) throw new Error(res.data.error);
      setSigners(prev => prev.map(s => (s.id === signer.id ? { ...s, ...res.data.signer } : s)));
    } catch (err) {
      console.error('[setLifecycleStatus]', err);
      alert(err.message || 'Could not update signer status');
    } finally {
      setSignerLinkBusy(prev => {
        const next = { ...prev };
        delete next[signer.id];
        return next;
      });
    }
  };

  const openMerchantView = async (e) => {
    e?.stopPropagation?.();
    setImpersonating(true);
    try {
      const res = await base44.functions.invoke('manageStagedApplication', {
        action: 'impersonate',
        corporateId,
        destination: 'portal',
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

  const openPostSignDashboard = async (e) => {
    e?.stopPropagation?.();
    setOpeningDashboard(true);
    try {
      const res = await base44.functions.invoke('manageStagedApplication', {
        action: 'impersonate',
        corporateId,
        destination: 'dashboard',
      });
      if (res.data?.error || !res.data?.portalUrl) {
        throw new Error(res.data?.error || 'Could not open dashboard');
      }
      window.open(res.data.portalUrl, '_blank', 'noopener,noreferrer');
    } catch (err) {
      console.error('[impersonate dashboard]', err);
      alert(err.message || 'Could not open post-signing dashboard');
    } finally {
      setOpeningDashboard(false);
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

  const borderColor = isSubmitted ? 'border-cb-success/25' : totalErrors > 0 ? 'border-cb-danger/30' : isStuck ? 'border-cb-accent/25' : 'border-cb-border';

  return (
    <div className={`bg-cb-surface border ${borderColor} rounded-cb overflow-hidden hover:border-cb-border-strong transition-all`}>
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 cursor-pointer" onClick={handleExpand}>
        <button className="text-gray-500 flex-shrink-0">
          {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </button>
        <div className={`w-7 h-7 rounded-cb flex items-center justify-center flex-shrink-0 ${isSubmitted ? 'bg-cb-success/15' : totalErrors > 0 ? 'bg-cb-danger/15' : 'bg-cb-accent-muted'}`}>
          <Building2 className={`w-3.5 h-3.5 ${isSubmitted ? 'text-cb-success' : totalErrors > 0 ? 'text-cb-danger' : 'text-cb-accent'}`} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-cb-body font-semibold text-white truncate">{merchantName || corporateId}</p>
            <span className="text-cb-caption font-mono text-gray-600">{corporateId}</span>
            {isStuck && (
              <span className="inline-flex items-center gap-1.5 text-cb-caption text-gray-400 whitespace-nowrap">
                <span className="w-1.5 h-1.5 rounded-full flex-shrink-0 bg-cb-accent" />
                Stuck
              </span>
            )}
            {!isSubmitted && currentStep === 'banking' && (
              <span className="inline-flex items-center gap-1.5 text-cb-caption text-gray-400 whitespace-nowrap">
                <span className="w-1.5 h-1.5 rounded-full flex-shrink-0 bg-cb-accent" />
                Bottleneck: Banking
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 mt-0.5 flex-wrap">
            {(p.signerEmail || profile?.signerEmail) && <p className="text-cb-caption text-gray-500 truncate">{p.signerEmail || profile?.signerEmail}</p>}
            {(p.pricingTier || profile?.pricingTier) && <span className="text-cb-caption text-gray-600">{p.pricingTier || profile?.pricingTier}</span>}
            {lastSeen && <p className="hidden sm:flex items-center gap-1 text-cb-caption text-gray-600"><Clock className="w-2.5 h-2.5" /> {lastSeen}</p>}
          </div>
        </div>

        {/* Step tracker */}
        <div className="hidden md:flex flex-col items-center gap-0.5 flex-shrink-0 px-1">
          <StepTracker currentStep={currentStep} completedSteps={completedSteps} missingByStep={missingByStep} />
        </div>

        {/* Health + actions */}
        <div className="flex items-center gap-1.5 flex-shrink-0 ml-1" onClick={e => e.stopPropagation()}>
          {totalErrors > 0 && (
            <span className="inline-flex items-center gap-1.5 text-cb-caption text-cb-danger whitespace-nowrap">
              <span className="w-1.5 h-1.5 rounded-full flex-shrink-0 bg-cb-danger" />
              {totalErrors}
            </span>
          )}
          {avgMspPct !== null && <HealthBadge score={avgMspPct} />}
          {isSubmitted && <CheckCircle2 className="w-4 h-4 text-cb-success" />}
          <button onClick={openMerchantView} disabled={impersonating || openingDashboard} title="Open merchant portal as agent (30-min session — preview & edit live)"
            className="flex items-center gap-1 text-cb-caption font-medium px-2 py-1 rounded-cb border transition-all bg-cb-accent text-cb-bg border-cb-accent hover:opacity-90 disabled:opacity-40">
            {impersonating ? <Loader2 className="w-3 h-3 animate-spin" /> : <Eye className="w-3 h-3" />}
            Open portal
          </button>
          <button onClick={openPostSignDashboard} disabled={impersonating || openingDashboard}
            title="Open post-signing dashboard (agents can preview before merchant signs)"
            className="flex items-center gap-1 text-cb-caption font-medium px-2 py-1 rounded-cb border transition-all border-cb-border text-gray-300 hover:text-cb-accent hover:border-cb-accent/40 disabled:opacity-40">
            {openingDashboard ? <Loader2 className="w-3 h-3 animate-spin" /> : <LayoutDashboard className="w-3 h-3" />}
            Dashboard
          </button>
          <button onClick={(e) => copyInviteLink(e, linkStage)} title="Copy invite link"
            className={`flex items-center gap-1 text-cb-caption font-medium px-2 py-1 rounded-cb border transition-all ${copied === (linkStage?.id || 'link') ? 'border-cb-success/30 text-cb-success' : 'border-cb-border text-gray-400 hover:text-white hover:border-cb-border-strong'}`}>
            {copied === (linkStage?.id || 'link') ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
            {copied === (linkStage?.id || 'link') ? 'Copied!' : 'Copy Link'}
          </button>
          <button onClick={() => onSend(linkStage, corporateId, p.signerEmail || profile?.signerEmail || '')}
            className="flex items-center gap-1 text-cb-caption font-medium px-2 py-1 rounded-cb border transition-all border-cb-border text-gray-400 hover:text-white hover:border-cb-border-strong">
            <Send className="w-3 h-3" /> Send Link
          </button>
          <button onClick={() => onEdit(corporateId, merchantName, linkStage)}
            title="Edit locations, signers & Quotes"
            className="flex items-center gap-1 text-cb-caption font-medium px-2 py-1 rounded-cb border transition-all border-cb-border text-gray-400 hover:text-white hover:border-cb-border-strong">
            <Pencil className="w-3 h-3" />
            Edit
          </button>
          <button onClick={() => onDeleteMerchant({ corporateId, merchantName })} title="Delete merchant permanently (all data)"
            className="p-1.5 text-gray-600 hover:text-cb-danger rounded-cb transition-colors">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div className="border-t border-cb-border bg-cb-bg/60">
          {loadingDetail ? (
            <div className="flex items-center justify-center py-6 gap-2">
              <Loader2 className="w-4 h-4 text-gray-500 animate-spin" />
              <span className="text-cb-body text-gray-500">Loading…</span>
            </div>
          ) : (
            <div className="p-4 space-y-4">
              <PortalActivityPanel activity={p.activity} />

              {/* MIDs */}
              {mids.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-cb-caption uppercase text-gray-500">
                      MIDs ({mids.length}) {loadingMsp && <Loader2 className="inline w-3 h-3 animate-spin ml-1" />}
                    </p>
                    {avgMspPct !== null && (
                      <div className="flex items-center gap-2">
                        <span className="text-cb-caption text-gray-500">Avg form:</span>
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
                  <p className="text-cb-caption uppercase text-gray-500 mb-2">Signers</p>
                  <div className="space-y-1.5">
                    {signers.map(s => {
                      const miss = signerMissingFields(s);
                      const verified = isVerifiedOrHigher(s.identityStatus);
                      const hasIssues = !verified && miss.length > 0;
                      const busy = signerLinkBusy[s.id];
                      return (
                        <div key={s.id} className={`px-3 py-2 rounded-cb border ${
                          verified ? 'border-cb-border bg-cb-surface-raised' :
                          hasIssues ? 'border-cb-danger/30 bg-cb-surface-raised' :
                          'border-cb-border bg-cb-surface-raised'
                        }`}>
                          <div className="flex items-center gap-2.5">
                            <Users className="w-3.5 h-3.5 flex-shrink-0 text-gray-400" />
                            <div className="flex-1 min-w-0">
                              <p className="text-cb-body font-semibold text-white">{s.firstName} {s.lastName}</p>
                              <p className="text-cb-caption text-gray-500">{s.signerEmail}</p>
                            </div>
                            <div className="flex items-center gap-1.5 flex-shrink-0">
                              {s.isPrimarySigner && (
                                <span className="inline-flex items-center gap-1.5 text-cb-caption text-gray-400 whitespace-nowrap">
                                  <span className="w-1.5 h-1.5 rounded-full flex-shrink-0 bg-cb-accent" />
                                  Primary
                                </span>
                              )}
                              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold capitalize ${lifecycleBadgeClass(s.identityStatus)}`}>
                                {lifecycleLabel(s.identityStatus)}
                              </span>
                              {hasIssues && (
                                <span className="inline-flex items-center gap-1.5 text-cb-caption text-cb-danger whitespace-nowrap">
                                  <span className="w-1.5 h-1.5 rounded-full flex-shrink-0 bg-cb-danger" />
                                  {miss.length} missing
                                </span>
                              )}
                              <button
                                type="button"
                                onClick={(e) => copySignerDirectLink(e, s)}
                                disabled={!!busy}
                                title="Copy direct Verify & Sign link"
                                className="p-1.5 text-gray-500 hover:text-white rounded-cb transition-colors disabled:opacity-40"
                              >
                                {busy === 'copy' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : copied === s.id ? <Check className="w-3.5 h-3.5 text-cb-success" /> : <Copy className="w-3.5 h-3.5" />}
                              </button>
                              <button
                                type="button"
                                onClick={(e) => sendSignerInvite(e, s)}
                                disabled={!!busy}
                                title="Email Verify & Sign invite"
                                className="p-1.5 text-gray-500 hover:text-cb-accent rounded-cb transition-colors disabled:opacity-40"
                              >
                                {busy === 'send' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                              </button>
                              {isApplicationSigned(s.identityStatus) && (
                                <button
                                  type="button"
                                  onClick={(e) => revertSignerToVerified(e, s)}
                                  disabled={!!busy}
                                  title="Correct status: verified but not signed"
                                  className="text-[10px] font-semibold text-amber-400/90 hover:text-amber-300 px-1.5 py-1 rounded-cb border border-amber-500/30 disabled:opacity-40"
                                >
                                  {busy === 'revert' ? <Loader2 className="w-3 h-3 animate-spin" /> : '→ Verified'}
                                </button>
                              )}
                            </div>
                          </div>
                          {hasIssues && (
                            <div className="mt-2 ml-6 space-y-1">
                              {miss.map(m => (
                                <div key={m} className="flex items-start gap-1.5">
                                  <XCircle className="w-3 h-3 text-cb-danger flex-shrink-0 mt-0.5" />
                                  <p className="text-cb-caption text-gray-300">Missing {m}</p>
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
                <p className="text-cb-body text-gray-600 text-center py-4">No MIDs or signers found for this merchant.</p>
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
    <div className="min-h-screen bg-cb-bg flex flex-col">
      <PipelineOverview profiles={profiles} stages={allStages} loading={loading} onRefresh={load} onQuickCreate={handleQuickCreate} />

      <div className="flex flex-1 min-h-0">
        {/* Full-width list — editor is an overlay so it never crushes this column */}
        <div className="flex flex-col flex-1 min-w-0 border-r border-cb-border">
          <div className="px-6 py-4 border-b border-cb-border flex-shrink-0">
            <p className="text-cb-caption uppercase text-cb-accent mb-1">Admin Tool</p>
            <h1 className="font-display text-cb-display text-white">Applications</h1>
          </div>

          {/* Toolbar */}
          <div className="px-4 py-3 border-b border-cb-border flex-shrink-0 flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500" />
              <input value={searchText} onChange={e => setSearchText(e.target.value)}
                placeholder="Search by name or Corp ID…"
                className={`${inputCls} pl-9 py-2`} />
            </div>
            <input value={jumpId} onChange={e => setJumpId(e.target.value)}
              placeholder="Corp ID…"
              className="bg-cb-bg border border-cb-border rounded-cb px-2.5 py-1.5 text-cb-caption text-white placeholder:text-gray-600 hover:border-cb-border-strong focus:outline-none focus:ring-1 focus:ring-cb-accent w-28"
              onKeyDown={e => e.key === 'Enter' && handleJump()} />
            <button onClick={handleJump} disabled={searching || !jumpId.trim()}
              className="flex items-center gap-1 bg-cb-accent hover:opacity-90 disabled:opacity-40 text-cb-bg font-semibold text-cb-caption px-2.5 py-1.5 rounded-cb transition-opacity flex-shrink-0">
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
                <p className="text-gray-500 text-cb-body">{profiles.length === 0 ? 'No applications yet.' : 'No results match your search.'}</p>
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
            className="w-full max-w-xl h-full bg-cb-surface border-l border-cb-border shadow-cb-overlay flex flex-col"
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
          <div className="bg-cb-surface-raised border border-cb-danger/30 rounded-cb shadow-cb-overlay w-full max-w-sm p-6" onClick={e => e.stopPropagation()}>
            <h3 className="font-semibold text-white mb-2">Permanently delete this merchant?</h3>
            <p className="text-cb-body text-gray-400 mb-1">
              <span className="text-white font-semibold">{deleteMerchantConfirm.merchantName}</span> ({deleteMerchantConfirm.corporateId})
            </p>
            <p className="text-cb-caption text-gray-500 mb-4">
              This permanently deletes the corporate profile, all locations, all MIDs, and all signers from our database.
              This does not touch any application already drafted in MSPWare. This cannot be undone.
            </p>
            <label className={labelCls}>
              Type DELETE to confirm
            </label>
            <input
              value={deleteMerchantTyped}
              onChange={e => setDeleteMerchantTyped(e.target.value)}
              placeholder="DELETE"
              className={`${inputCls} focus:ring-cb-danger mb-4`}
            />
            {deleteMerchantError && (
              <p className="text-cb-caption text-cb-danger mb-3">{deleteMerchantError}</p>
            )}
            <div className="flex gap-3">
              <button
                onClick={handleDeleteMerchant}
                disabled={deleteMerchantTyped !== 'DELETE' || deletingMerchant}
                className="flex-1 flex items-center justify-center gap-2 bg-cb-danger hover:opacity-90 disabled:bg-gray-700 disabled:text-gray-500 text-white font-semibold text-cb-body py-2.5 rounded-cb transition-opacity">
                {deletingMerchant ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Delete Permanently'}
              </button>
              <button
                onClick={() => { setDeleteMerchantConfirm(null); setDeleteMerchantTyped(''); }}
                disabled={deletingMerchant}
                className="flex-1 border border-cb-border text-gray-400 font-medium text-cb-body py-2.5 rounded-cb hover:text-white hover:border-cb-border-strong disabled:opacity-40">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
