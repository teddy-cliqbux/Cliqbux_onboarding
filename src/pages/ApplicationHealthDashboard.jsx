import { useState, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import {
  Loader2, AlertTriangle, CheckCircle2, Clock, CreditCard,
  Building2, Users, ChevronDown, ChevronRight, RefreshCw,
  AlertCircle, XCircle, Search, BarChart2, ArrowLeft, ExternalLink
} from 'lucide-react';
import { Link } from 'react-router-dom';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STEP_ORDER = ['agreement', 'locations', 'banking', 'verification', 'submitted'];
const STEP_LABELS = { agreement: 'Agreement', locations: 'Locations', banking: 'Banking', verification: 'Signing', submitted: 'Submitted' };

function stepIndex(step) {
  const i = STEP_ORDER.indexOf(step);
  return i === -1 ? 0 : i;
}

function HealthBadge({ score }) {
  if (score === 100) return <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-green-500/15 text-green-400 border border-green-500/30">100%</span>;
  if (score >= 80)  return <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-500/15 text-blue-400 border border-blue-500/30">{score}%</span>;
  if (score >= 50)  return <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/30">{score}%</span>;
  return <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-500/15 text-red-400 border border-red-500/30">{score ?? '?'}%</span>;
}

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

// ─── Progress Bar ─────────────────────────────────────────────────────────────

function ProgressBar({ pct, color = 'amber' }) {
  const colors = {
    green:  'bg-green-500',
    amber:  'bg-amber-500',
    blue:   'bg-blue-500',
    red:    'bg-red-500',
  };
  const barColor = pct === 100 ? colors.green : pct >= 80 ? colors.blue : pct >= 50 ? colors.amber : colors.red;
  return (
    <div className="w-full h-1 bg-white/8 rounded-full overflow-hidden">
      <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${Math.max(0, Math.min(100, pct || 0))}%` }} />
    </div>
  );
}

// ─── Step Tracker (compact) ───────────────────────────────────────────────────

function StepTracker({ currentStep, completedSteps }) {
  return (
    <div className="flex items-center gap-0.5">
      {STEP_ORDER.map((step, i) => {
        const done = completedSteps?.[step] || currentStep === 'submitted';
        const active = currentStep === step && !done;
        return (
          <div key={step} className="flex items-center">
            <div title={STEP_LABELS[step]} className={`w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-bold border transition-all ${
              done   ? 'bg-green-500 border-green-500 text-white' :
              active ? 'bg-blue-500 border-blue-500 text-white' :
                       'bg-transparent border-gray-700 text-gray-700'
            }`}>
              {done ? '✓' : i + 1}
            </div>
            {i < STEP_ORDER.length - 1 && <div className={`w-3 h-px ${done ? 'bg-green-500/40' : 'bg-gray-700'}`} />}
          </div>
        );
      })}
    </div>
  );
}

// ─── MID Detail Row ───────────────────────────────────────────────────────────

function MidRow({ mid, isLoading, mspStatus }) {
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
  const hasIssues = allErrors.length > 0 || (pct !== null && pct < 100);
  const isDone = ['Active', 'Active (Existing)', 'Pending MID'].includes(mid.applicationStepStatus);

  return (
    <div className={`border rounded-xl overflow-hidden transition-all ${
      isDone ? 'border-green-500/15 bg-green-500/5' :
      hasIssues ? 'border-red-500/20 bg-red-500/5' :
      'border-white/8 bg-white/[0.02]'
    }`}>
      <div className="flex items-center gap-2.5 px-3 py-2.5 cursor-pointer" onClick={() => !isLoading && setOpen(o => !o)}>
        <CreditCard className={`w-3.5 h-3.5 flex-shrink-0 ${isDone ? 'text-green-400' : hasIssues ? 'text-red-400' : 'text-blue-400'}`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-xs font-semibold text-white truncate">{mid.dbaName || mid.merchantName || '—'}</p>
            <MidStatusBadge status={mid.applicationStepStatus} />
          </div>
          {pct !== null && (
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
          {isLoading && <Loader2 className="w-3 h-3 text-gray-500 animate-spin" />}
          {!isLoading && pct !== null && <HealthBadge score={pct} />}
          {!isLoading && allErrors.length > 0 && (
            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-red-500/15 text-red-400 border border-red-500/30">
              {allErrors.length} issue{allErrors.length !== 1 ? 's' : ''}
            </span>
          )}
          {!isLoading && mid.mspApplicationNo && (
            <button onClick={e => { e.stopPropagation(); setOpen(o => !o); }}
              className="text-gray-600 hover:text-gray-300 transition-colors">
              {open ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
            </button>
          )}
        </div>
      </div>

      {open && (
        <div className="border-t border-white/8 px-3 py-3 space-y-2.5 bg-[#111318]/40">
          {/* IDs */}
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {mid.mspApplicationNo && (
              <p className="text-[10px] text-gray-500">MSP App: <span className="font-mono text-gray-400">{mid.mspApplicationNo}</span></p>
            )}
            {mid.elavonMID && (
              <p className="text-[10px] text-gray-500">MID: <span className="font-mono text-green-400">{mid.elavonMID}</span></p>
            )}
          </div>

          {/* Validation errors */}
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

          {/* Signatures error */}
          {mspStatus?.signaturesError && (
            <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg px-2.5 py-2">
              <p className="text-[10px] font-bold text-amber-400 mb-0.5">Signing Package Error</p>
              <p className="text-[11px] text-amber-300">{mspStatus.signaturesError}</p>
            </div>
          )}

          {/* No issues */}
          {allErrors.length === 0 && !mspStatus?.signaturesError && pct === 100 && (
            <div className="flex items-center gap-1.5 text-[11px] text-green-400">
              <CheckCircle2 className="w-3 h-3" /> Form complete — ready to sign
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Merchant Card ────────────────────────────────────────────────────────────

function MerchantCard({ corporateId, merchantName, trackStage }) {
  const [expanded, setExpanded] = useState(false);
  const [mids, setMids]         = useState([]);
  const [signers, setSigners]   = useState([]);
  const [mspStatuses, setMspStatuses] = useState({}); // mspApplicationNo → status data
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [loadingMsp, setLoadingMsp]       = useState(false);

  const p = trackStage?.prefilledData || {};
  const currentStep = p.currentStep || 'agreement';
  const completedSteps = p.completedSteps || {};
  const lastSeen = p.lastSeenAt
    ? new Date(p.lastSeenAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    : null;
  const appStatus = p.applicationStatus || 'Incomplete';

  // Derive overall health from local MID data before MSP is loaded
  const midsWithMcc      = mids.filter(m => m.mccCode && m.monthlyCardSales).length;
  const midsActive       = mids.filter(m => ['Active', 'Active (Existing)', 'Pending MID'].includes(m.applicationStepStatus)).length;
  const signersVerified  = signers.filter(s => s.identityStatus === 'Verified').length;

  // Aggregate MSP completion
  const mspValues = Object.values(mspStatuses);
  const avgMspPct = mspValues.length > 0
    ? Math.round(mspValues.reduce((s, v) => s + (v?.percent_complete != null ? parseFloat(String(v.percent_complete)) : 0), 0) / mspValues.length)
    : null;

  const totalErrors = mspValues.reduce((s, v) => {
    const errs = [
      ...(v?.completion_errors || []),
      ...(v?.data_errors || []),
      ...(v?.rule_violations || []),
      ...(v?.errors || []),
    ];
    return s + errs.length;
  }, 0);

  const isSubmitted = appStatus === 'Submitted' || currentStep === 'submitted';
  const isStuck = !isSubmitted && lastSeen && (Date.now() - new Date(p.lastSeenAt).getTime()) > 3 * 24 * 60 * 60 * 1000;

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

        // Fetch MSP form status for each MID that has an application number
        const midsWithApp = loadedMids.filter(m => m.mspApplicationNo);
        if (midsWithApp.length > 0) {
          setLoadingMsp(true);
          const statuses = {};
          await Promise.all(midsWithApp.map(async (mid) => {
            try {
              const res = await base44.functions.invoke('getMSPFormStatus', {
                corporateId,
                applicationNo: mid.mspApplicationNo,
              });
              statuses[mid.mspApplicationNo] = res.data;
            } catch (_) {
              statuses[mid.mspApplicationNo] = null;
            }
          }));
          setMspStatuses(statuses);
          setLoadingMsp(false);
        }
      } catch (_) {}
      finally { setLoadingDetail(false); }
    }
  };

  const borderColor = isSubmitted
    ? 'border-green-500/25'
    : totalErrors > 0
    ? 'border-red-500/30'
    : isStuck
    ? 'border-amber-500/25'
    : 'border-white/10';

  return (
    <div className={`bg-[#1c2128] border ${borderColor} rounded-2xl overflow-hidden transition-all hover:border-white/20`}>
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3.5 cursor-pointer" onClick={handleExpand}>
        <button className="text-gray-500 flex-shrink-0">
          {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </button>

        <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${
          isSubmitted ? 'bg-green-500/15' : totalErrors > 0 ? 'bg-red-500/15' : 'bg-amber-500/10'
        }`}>
          <Building2 className={`w-3.5 h-3.5 ${isSubmitted ? 'text-green-400' : totalErrors > 0 ? 'text-red-400' : 'text-amber-400'}`} />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-bold text-white truncate">{merchantName || corporateId}</p>
            <span className="text-[10px] font-mono text-gray-600">{corporateId}</span>
            {isStuck && (
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/30">Stuck</span>
            )}
          </div>
          <div className="flex items-center gap-3 mt-0.5 flex-wrap">
            {p.signerEmail && <p className="text-[10px] text-gray-500 truncate">{p.signerEmail}</p>}
            {lastSeen && (
              <p className="flex items-center gap-1 text-[10px] text-gray-600">
                <Clock className="w-2.5 h-2.5" /> {lastSeen}
              </p>
            )}
          </div>
        </div>

        {/* Step tracker */}
        {trackStage && (
          <div className="hidden md:flex flex-col items-end gap-1.5 flex-shrink-0">
            <StepTracker currentStep={currentStep} completedSteps={completedSteps} />
            <p className="text-[10px] text-gray-500">{STEP_LABELS[currentStep] || currentStep}</p>
          </div>
        )}

        {/* Health indicators */}
        <div className="flex items-center gap-2 flex-shrink-0 ml-2">
          {totalErrors > 0 && (
            <div className="flex items-center gap-1 text-[10px] font-bold text-red-400 bg-red-500/10 border border-red-500/20 px-2 py-0.5 rounded-full">
              <XCircle className="w-3 h-3" /> {totalErrors}
            </div>
          )}
          {avgMspPct !== null && <HealthBadge score={avgMspPct} />}
          {isSubmitted && <CheckCircle2 className="w-4 h-4 text-green-400" />}
        </div>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div className="border-t border-white/8 bg-[#111318]/50">
          {loadingDetail ? (
            <div className="flex items-center justify-center py-8 gap-2">
              <Loader2 className="w-4 h-4 text-gray-500 animate-spin" />
              <span className="text-xs text-gray-500">Loading…</span>
            </div>
          ) : (
            <div className="p-4 space-y-4">
              {/* Summary row */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label: 'Current Step',    value: STEP_LABELS[currentStep] || currentStep, color: 'text-blue-400' },
                  { label: 'MIDs Ready',      value: `${midsWithMcc}/${mids.length}`,         color: midsWithMcc === mids.length && mids.length > 0 ? 'text-green-400' : 'text-amber-400' },
                  { label: 'MIDs Active',     value: `${midsActive}/${mids.length}`,           color: midsActive === mids.length && mids.length > 0 ? 'text-green-400' : 'text-gray-400' },
                  { label: 'Signers Verified',value: `${signersVerified}/${signers.length}`,   color: signersVerified === signers.length && signers.length > 0 ? 'text-green-400' : 'text-gray-400' },
                ].map(stat => (
                  <div key={stat.label} className="bg-[#1c2128] border border-white/8 rounded-xl px-3 py-2.5">
                    <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">{stat.label}</p>
                    <p className={`text-sm font-bold mt-0.5 ${stat.color}`}>{stat.value}</p>
                  </div>
                ))}
              </div>

              {/* MIDs section */}
              {mids.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">
                      MIDs {loadingMsp && <Loader2 className="inline w-3 h-3 animate-spin ml-1" />}
                    </p>
                    {avgMspPct !== null && (
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-gray-500">Avg form completion:</span>
                        <HealthBadge score={avgMspPct} />
                      </div>
                    )}
                  </div>
                  <div className="space-y-2">
                    {mids.map(mid => (
                      <MidRow
                        key={mid.id}
                        mid={mid}
                        isLoading={loadingMsp && !!mid.mspApplicationNo && !mspStatuses[mid.mspApplicationNo]}
                        mspStatus={mid.mspApplicationNo ? mspStatuses[mid.mspApplicationNo] : null}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Signers section */}
              {signers.length > 0 && (
                <div>
                  <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-2">Signers</p>
                  <div className="space-y-1.5">
                    {signers.map(s => (
                      <div key={s.id} className={`flex items-center gap-2.5 px-3 py-2 rounded-xl border ${
                        s.identityStatus === 'Verified' ? 'border-green-500/20 bg-green-500/5' : 'border-white/8 bg-white/[0.02]'
                      }`}>
                        <Users className={`w-3.5 h-3.5 flex-shrink-0 ${s.identityStatus === 'Verified' ? 'text-green-400' : 'text-gray-500'}`} />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold text-white">{s.firstName} {s.lastName}</p>
                          <p className="text-[10px] text-gray-500">{s.signerEmail}</p>
                        </div>
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          {s.isPrimarySigner && (
                            <span className="text-[9px] font-bold text-amber-400 bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.5 rounded-full">Primary</span>
                          )}
                          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full border ${
                            s.identityStatus === 'Verified'
                              ? 'text-green-400 border-green-500/30 bg-green-500/10'
                              : 'text-gray-500 border-gray-500/20 bg-gray-500/10'
                          }`}>
                            {s.identityStatus || 'Pending'}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* No data */}
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

// ─── Summary Stats Bar ────────────────────────────────────────────────────────

function SummaryBar({ merchants }) {
  const total       = merchants.length;
  const submitted   = merchants.filter(m => (m.trackStage?.prefilledData?.applicationStatus === 'Submitted') || m.trackStage?.prefilledData?.currentStep === 'submitted').length;
  const inProgress  = merchants.filter(m => {
    const step = m.trackStage?.prefilledData?.currentStep;
    return step && step !== 'submitted' && step !== 'agreement';
  }).length;
  const notStarted  = merchants.filter(m => !m.trackStage?.prefilledData?.currentStep || m.trackStage?.prefilledData?.currentStep === 'agreement').length;
  const stuckCount  = merchants.filter(m => {
    const p = m.trackStage?.prefilledData;
    return p?.lastSeenAt && (Date.now() - new Date(p.lastSeenAt).getTime()) > 3 * 24 * 60 * 60 * 1000 && p?.applicationStatus !== 'Submitted';
  }).length;

  const stats = [
    { label: 'Total',       value: total,      color: 'text-white' },
    { label: 'Submitted',   value: submitted,   color: 'text-green-400' },
    { label: 'In Progress', value: inProgress,  color: 'text-blue-400' },
    { label: 'Not Started', value: notStarted,  color: 'text-gray-400' },
    { label: 'Stuck (3d+)', value: stuckCount,  color: 'text-amber-400' },
  ];

  return (
    <div className="flex flex-wrap gap-6 px-6 py-4 border-b border-white/8 bg-[#161b23]">
      {stats.map(s => (
        <div key={s.label}>
          <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">{s.label}</p>
          <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
        </div>
      ))}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ApplicationHealthDashboard() {
  const [merchants, setMerchants]     = useState([]);
  const [merchantNames, setMerchantNames] = useState({});
  const [loading, setLoading]         = useState(true);
  const [searchText, setSearchText]   = useState('');
  const [stepFilter, setStepFilter]   = useState('all');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await base44.functions.invoke('manageStagedApplication', { action: 'list' });
      const stages = res.data?.stages || [];

      // Group by corporateId — only take the auto-track record per merchant
      const grouped = {};
      for (const s of stages) {
        const cid = s.corporateId || 'unknown';
        if (!grouped[cid]) grouped[cid] = { track: null };
        if (s.label === '__auto_track__') grouped[cid].track = s;
      }

      const entries = Object.entries(grouped).map(([cid, { track }]) => ({
        corporateId: cid,
        trackStage: track,
      }));

      setMerchants(entries);

      // Resolve merchant names
      const nameMap = {};
      await Promise.all(entries.map(async ({ corporateId }) => {
        try {
          const r = await base44.functions.invoke('getMerchantData', { corporateId });
          nameMap[corporateId] = r.data?.profile?.legalName || corporateId;
        } catch (_) { nameMap[corporateId] = corporateId; }
      }));
      setMerchantNames(nameMap);
    } catch (_) {}
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = merchants.filter(m => {
    const name = (merchantNames[m.corporateId] || m.corporateId).toLowerCase();
    const matchesSearch = !searchText || name.includes(searchText.toLowerCase()) || m.corporateId.includes(searchText);
    if (!matchesSearch) return false;

    if (stepFilter === 'all') return true;
    if (stepFilter === 'submitted') return m.trackStage?.prefilledData?.applicationStatus === 'Submitted' || m.trackStage?.prefilledData?.currentStep === 'submitted';
    if (stepFilter === 'stuck') {
      const p = m.trackStage?.prefilledData;
      return p?.lastSeenAt && (Date.now() - new Date(p.lastSeenAt).getTime()) > 3 * 24 * 60 * 60 * 1000 && p?.applicationStatus !== 'Submitted';
    }
    return m.trackStage?.prefilledData?.currentStep === stepFilter;
  });

  // Sort: stuck first, then by most recent lastSeenAt
  const sorted = [...filtered].sort((a, b) => {
    const aStuck = a.trackStage?.prefilledData?.lastSeenAt ? (Date.now() - new Date(a.trackStage.prefilledData.lastSeenAt).getTime()) > 3 * 24 * 60 * 60 * 1000 : false;
    const bStuck = b.trackStage?.prefilledData?.lastSeenAt ? (Date.now() - new Date(b.trackStage.prefilledData.lastSeenAt).getTime()) > 3 * 24 * 60 * 60 * 1000 : false;
    if (aStuck && !bStuck) return -1;
    if (!aStuck && bStuck) return 1;
    const aT = a.trackStage?.prefilledData?.lastSeenAt ? new Date(a.trackStage.prefilledData.lastSeenAt).getTime() : 0;
    const bT = b.trackStage?.prefilledData?.lastSeenAt ? new Date(b.trackStage.prefilledData.lastSeenAt).getTime() : 0;
    return bT - aT;
  });

  const STEP_FILTERS = [
    { key: 'all',          label: 'All' },
    { key: 'agreement',    label: 'Agreement' },
    { key: 'locations',    label: 'Locations' },
    { key: 'banking',      label: 'Banking' },
    { key: 'verification', label: 'Signing' },
    { key: 'submitted',    label: 'Submitted' },
    { key: 'stuck',        label: '⚠ Stuck' },
  ];

  return (
    <div className="min-h-screen bg-[#111318] flex flex-col">
      {/* Top nav */}
      <div className="border-b border-white/8 bg-[#161b23] px-6 py-4 flex items-center gap-4">
        <Link to="/admin/staged" className="flex items-center gap-2 text-gray-500 hover:text-white transition-colors text-sm">
          <ArrowLeft className="w-4 h-4" /> Pipeline
        </Link>
        <div className="w-px h-5 bg-white/10" />
        <div className="flex items-center gap-2">
          <BarChart2 className="w-4 h-4 text-amber-400" />
          <h1 className="text-sm font-bold text-white">Application Health</h1>
        </div>
        <div className="flex-1" />
        <button onClick={load} disabled={loading}
          className="flex items-center gap-1.5 text-[11px] font-semibold text-gray-500 hover:text-white border border-white/10 hover:border-white/20 px-2.5 py-1.5 rounded-lg transition-all disabled:opacity-40">
          <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      {/* Stats */}
      {!loading && <SummaryBar merchants={merchants} />}

      {/* Toolbar */}
      <div className="px-6 py-3 border-b border-white/5 flex flex-wrap items-center gap-3 bg-[#161b23]">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500" />
          <input
            value={searchText}
            onChange={e => setSearchText(e.target.value)}
            placeholder="Search by name or Corp ID…"
            className="w-full bg-[#111318] border border-white/15 rounded-xl pl-9 pr-3.5 py-2 text-sm text-white placeholder:text-gray-600 focus:outline-none focus:ring-1 focus:ring-amber-500"
          />
        </div>
        <div className="flex items-center gap-1 flex-wrap">
          {STEP_FILTERS.map(f => (
            <button key={f.key} onClick={() => setStepFilter(f.key)}
              className={`text-[11px] font-semibold px-2.5 py-1.5 rounded-lg border transition-all ${
                stepFilter === f.key
                  ? 'bg-amber-500/20 border-amber-500/40 text-amber-300'
                  : 'bg-transparent border-white/10 text-gray-500 hover:text-white hover:border-white/20'
              }`}>
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto px-4 py-5">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <Loader2 className="w-7 h-7 text-gray-500 animate-spin" />
            <p className="text-sm text-gray-500">Loading applications…</p>
          </div>
        ) : sorted.length === 0 ? (
          <div className="text-center py-16">
            <AlertCircle className="w-8 h-8 text-gray-600 mx-auto mb-3" />
            <p className="text-gray-500 text-sm">No applications match your filters.</p>
          </div>
        ) : (
          <div className="max-w-4xl mx-auto space-y-3">
            {sorted.map(m => (
              <MerchantCard
                key={m.corporateId}
                corporateId={m.corporateId}
                merchantName={merchantNames[m.corporateId] || m.corporateId}
                trackStage={m.trackStage}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}