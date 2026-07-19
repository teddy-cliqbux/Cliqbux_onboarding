import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { base44 } from '@/api/base44Client';
import {
  Pencil, Loader2, Send, Trash2, Check, X, Copy, ExternalLink,
  Clock, Store, Users, FileText, Search, Building2, CreditCard,
  CheckCircle2, AlertCircle, Eye, Zap, LayoutDashboard,
  ChevronDown, ChevronRight, XCircle, RefreshCw, Percent, Wrench
} from 'lucide-react';
import {
  lifecycleLabel,
  lifecycleDotClass,
  isVerifiedOrHigher,
  isApplicationSigned,
} from '@/lib/signerLifecycle';
import PricingEditorPanel from '@/components/pricing/PricingEditorPanel';
import { isPricingComplete, TIER_LABELS } from '@/lib/pricingPresets';
import {
  resolveApplicationRowMode,
  modeSortRank,
  readNudgeChannelPref,
  writeNudgeChannelPref,
} from '@/lib/applicationRowMode';
const inputCls = 'w-full bg-cb-bg border border-cb-border rounded-cb px-3.5 py-2.5 text-cb-body text-white placeholder:text-gray-500 transition-colors hover:border-cb-border-strong focus:outline-none focus:ring-2 focus:ring-cb-accent focus:border-transparent';
const labelCls = 'block text-cb-caption text-gray-500 mb-1.5';

function countMspErrors(status) {
  if (!status) return 0;
  return [
    ...(status.completion_errors || []),
    ...(status.data_errors || []),
    ...(status.rule_violations || []),
    ...(status.errors || []),
  ].length;
}

function countLocalMidIssues(mid) {
  let n = 0;
  if (!mid?.mccCode) n += 1;
  if (!mid?.monthlyCardSales) n += 1;
  if (!mid?.avgSaleAmount) n += 1;
  if (!mid?.highestTicketAmount) n += 1;
  if (mid?.cardPresentPct == null || mid?.cardPresentPct === '') n += 1;
  return n;
}

/** Prefer live profile tier; track prefilledData is a stale copy (Porky's STANDARD bug 2026-07-14). */
function displayPricingTier(profile, trackPrefill = {}) {
  const raw = profile?.pricingTier || trackPrefill?.pricingTier || '';
  if (!raw) return null;
  const key = String(raw).toUpperCase();
  return TIER_LABELS[key] || TIER_LABELS[raw] || raw;
}

/** Pure digits = HubSpot deal id. Anything else = local Quick Stage. */
function isHubSpotDealId(id) {
  return /^\d+$/.test(String(id || '').trim());
}

/** Mirror of manageStagedApplication.slugifyCorporateId — preview only; server is authoritative. */
function slugifyCorporateId(raw) {
  const slug = String(raw || '')
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[''`´]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
  return slug || 'merchant';
}

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
  invite_sent: 'Invite emailed',
  signer_invite_sent: 'Owner invite sent',
  signer_link_opened: 'Owner opened invite',
  portal_open: 'Opened portal',
  session_tick: 'Active in portal',
  nudge_sent: 'Reminder sent',
};

function activityActorLabel(actor) {
  if (actor === 'agent') return 'Agent';
  if (actor === 'signer') return 'Owner';
  return 'Merchant';
}

function activityActorDot(actor) {
  if (actor === 'agent') return 'bg-cb-accent';
  if (actor === 'signer') return 'bg-cb-accent';
  return 'bg-gray-500';
}

function PortalActivityPanel({ activity }) {
  const a = activity || {};
  const recent = Array.isArray(a.recent) ? a.recent : [];
  const hasAny = (
    a.invitesSent || a.merchantOpens || a.agentOpens || a.merchantSeconds
    || a.signerInvitesSent || a.signerLinkOpens
    || recent.length > 0
  );

  return (
    <div>
      <p className="text-cb-caption text-gray-500 mb-2">Portal activity</p>
      {hasAny && (
        <p className="text-cb-caption text-gray-400 mb-2">
          {a.merchantOpens || 0} merchant opens · {formatDuration(a.merchantSeconds)} in portal · {a.agentOpens || 0} agent opens
        </p>
      )}
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
        <p className="text-cb-caption text-gray-600">No opens or sends yet. Reminders and portal visits show up here.</p>
      )}
    </div>
  );
}

function humanizeMspError(err) {
  const raw = typeof err === 'string' ? err : (err?.message || err?.description || JSON.stringify(err));
  const s = String(raw).toLowerCase();
  if (s.includes('deposit') || s.includes('routing') || s.includes('bank') || s.includes('account_no')) return 'Missing bank details';
  if (s.includes('highest_ticket') || s.includes('highest ticket')) return 'Highest ticket amount needs adjusting';
  if (s.includes('average_sales') || s.includes('average transaction') || s.includes('avg sale')) return 'Average sale amount needs adjusting';
  if (s.includes('monthly_sales') || s.includes('monthly volume')) return 'Monthly volume needs adjusting';
  if (s.includes('firearm')) return 'Firearm field conflict — leave template default (do not send this field)';
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
              <div className={`w-5 h-5 rounded-full flex items-center justify-center text-cb-caption font-bold border transition-all ${
                done   ? 'bg-cb-accent border-cb-accent text-cb-bg' :
                active ? 'bg-cb-accent-muted border-cb-accent text-cb-accent' :
                         'bg-transparent border-gray-700 text-gray-600'
              }`}>
                {done ? '✓' : (miss > 0 ? miss : i + 1)}
              </div>
              <span className={`mt-0.5 text-cb-caption font-semibold leading-none ${
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

/** Mode status dots — stuck must not share gold with prep/waiting. */
function modeDotClass(mode) {
  if (mode === 'stuck') return 'bg-cb-danger';
  if (mode === 'underwriting') return 'bg-cb-success';
  if (mode === 'nudge') return 'bg-gray-500';
  return 'bg-cb-accent'; // prep
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
  if (!mid.mccCode && mid.mccHelpRequested) localIssues.push('Merchant asked for MCC help — set the real MCC before signing');
  else if (!mid.mccCode) localIssues.push('Missing MCC');
  if (!mid.monthlyCardSales) localIssues.push('Missing monthly volume');
  if (!mid.avgSaleAmount) localIssues.push('Missing average sale');
  if (!mid.highestTicketAmount) localIssues.push('Missing highest ticket');
  if (mid.cardPresentPct == null || mid.cardPresentPct === '') localIssues.push('Missing card-present split');
  const allErrors = [...new Set([...localIssues, ...errors])];
  const isDone = ['Active', 'Active (Existing)', 'Pending MID'].includes(mid.applicationStepStatus);
  const hasIssues = allErrors.length > 0 || (pct !== null && pct < 100 && !isDone);
  const canExpand = !!(mid.mspApplicationNo || allErrors.length > 0);

  const toggleOpen = () => { if (canExpand) setOpen((o) => !o); };
  const onKey = (e) => {
    if (!canExpand) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      toggleOpen();
    }
  };

  return (
    <div className={`border rounded-cb overflow-hidden transition-all ${
      isDone ? 'border-cb-border bg-cb-surface-raised' :
      hasIssues ? 'border-cb-danger/30 bg-cb-surface-raised' :
      'border-cb-border bg-cb-surface-raised'
    }`}>
      <button
        type="button"
        className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-cb-accent focus-visible:ring-inset"
        onClick={toggleOpen}
        onKeyDown={onKey}
        aria-expanded={canExpand ? open : undefined}
        aria-label={canExpand ? (open ? `Collapse ${mid.dbaName || 'MID'} details` : `Expand ${mid.dbaName || 'MID'} details`) : undefined}
        disabled={!canExpand}
      >
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
          {canExpand && (
            <span className="text-gray-600" aria-hidden>
              {open ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
            </span>
          )}
        </div>
      </button>

      {open && canExpand && (
        <div className="border-t border-cb-border px-3 py-3 space-y-2 bg-cb-bg/40">
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {mid.mspApplicationNo && (
              <p className="text-cb-caption text-gray-500">Application #: <span className="font-mono text-gray-400">{mid.mspApplicationNo}</span></p>
            )}
            {mid.elavonMID && (
              <p className="text-cb-caption text-gray-500">MID: <span className="font-mono text-cb-success">{mid.elavonMID}</span></p>
            )}
          </div>
          {allErrors.length > 0 && (
            <div className="space-y-1">
              <p className="text-cb-caption text-cb-danger">Issues to fix</p>
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

// ── Quick Stage Modal — HubSpot Tier-1 parent company + deal ──────────────────
function QuickLocalStageModal({ initialName, onCreated, onClose }) {
  const [parentCompanyName, setParentCompanyName] = useState(initialName || '');
  const [businessName, setBusinessName] = useState(initialName || '');
  const [signerName, setSignerName] = useState('');
  const [signerEmail, setSignerEmail] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const canSave = parentCompanyName.trim() && signerName.trim() && signerEmail.includes('@') && !saving;

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && !saving) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, saving]);

  const handleCreate = async () => {
    if (!canSave) return;
    setSaving(true);
    setError('');
    try {
      const res = await base44.functions.invoke('manageStagedApplication', {
        action: 'createLocalStage',
        data: {
          parentCompanyName: parentCompanyName.trim(),
          businessName: (businessName.trim() || parentCompanyName.trim()),
          signerName: signerName.trim(),
          signerEmail: signerEmail.trim(),
        },
      });
      if (res.data?.error) throw new Error(res.data.error);
      onCreated?.(res.data);
    } catch (err) {
      setError(err?.response?.data?.error || err.message || 'Couldn’t create merchant. Check the parent company name and email, then try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[9100] flex items-center justify-center bg-black/60 px-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="local-stage-title"
        className="bg-cb-surface-raised border border-cb-border rounded-cb shadow-cb-overlay w-full max-w-md p-6"
        onClick={e => e.stopPropagation()}
      >
        <h3 id="local-stage-title" className="font-display text-cb-title text-white mb-1">Start application</h3>
        <p className="text-cb-caption text-gray-500 mb-4">
          Creates a HubSpot parent company (Tier-1) and a new deal, then opens this application so you can add owners.
        </p>

        <label className={labelCls}>Parent company name</label>
        <input
          value={parentCompanyName}
          onChange={e => {
            const v = e.target.value;
            setParentCompanyName(v);
            if (!businessName || businessName === parentCompanyName) setBusinessName(v);
          }}
          className={`${inputCls} mb-3`}
          placeholder="Island Pacific Corporation"
          autoFocus
        />
        <p className="text-cb-caption text-gray-600 -mt-2 mb-3">
          HubSpot Tier-1 Corporation. Multiple TINs and deals can hang under this parent.
        </p>

        <label className={labelCls}>Deal / store name <span className="text-gray-600 font-normal">(optional)</span></label>
        <input
          value={businessName}
          onChange={e => setBusinessName(e.target.value)}
          className={`${inputCls} mb-3`}
          placeholder="Same as parent, or a location DBA"
        />

        <label className={labelCls}>Primary owner name</label>
        <input
          value={signerName}
          onChange={e => setSignerName(e.target.value)}
          className={`${inputCls} mb-3`}
          placeholder="Jane Owner"
        />

        <label className={labelCls}>Primary owner email</label>
        <input
          type="email"
          value={signerEmail}
          onChange={e => setSignerEmail(e.target.value)}
          className={`${inputCls} mb-4`}
          placeholder="jane@example.com"
          onKeyDown={e => e.key === 'Enter' && canSave && handleCreate()}
        />

        {error && <p className="text-cb-caption text-cb-danger mb-3">{error}</p>}

        <div className="flex gap-3">
          <button
            onClick={handleCreate}
            disabled={!canSave}
            className="flex-1 flex items-center justify-center gap-2 bg-cb-accent hover:opacity-90 disabled:bg-gray-700 disabled:text-gray-500 text-cb-bg font-semibold text-cb-body py-2.5 rounded-cb transition-opacity"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
            Create in HubSpot
          </button>
          <button
            onClick={onClose}
            disabled={saving}
            className="flex-1 border border-cb-border text-gray-400 font-medium text-cb-body py-2.5 rounded-cb hover:text-white hover:border-cb-border-strong disabled:opacity-40"
          >
            Go back
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Pipeline Overview Bar ─────────────────────────────────────────────────────
function PipelineOverview({ profiles, trackMap, rowModes, loading, onRefresh, onQuickCreate }) {
  const [quickId, setQuickId] = useState('');

  const modeCounts = { prep: 0, nudge: 0, stuck: 0, underwriting: 0 };
  for (const p of profiles) {
    const cid = String(p.corporateId);
    let mode = rowModes[cid];
    if (!mode) {
      const track = trackMap[cid] || null;
      const pipeline = resolvePipelineProgress({ profile: p, track, locations: [], signers: [] });
      mode = resolveApplicationRowMode({
        profile: p,
        track,
        pipeline,
        mspErrorCount: 0,
        detailLoaded: false,
      }).mode;
    }
    if (modeCounts[mode] != null) modeCounts[mode] += 1;
  }

  const handleQuickCreate = () => {
    if (!quickId.trim()) return;
    onQuickCreate(quickId.trim());
    setQuickId('');
  };

  return (
    <div className="border-b border-cb-border bg-cb-surface px-6 py-4 flex flex-wrap items-center gap-8">
      <div className="flex items-center gap-4 min-w-0">
        <div>
          <p className="text-cb-caption text-gray-500 mb-1">Merchant applications</p>
          <div className="flex items-center gap-3">
            <span className="text-cb-title font-display text-white">{profiles.length}</span>
            {loading && <Loader2 className="w-3 h-3 text-gray-600 animate-spin" />}
          </div>
          <div className="flex items-center gap-3 mt-1.5 flex-wrap">
            <span className="inline-flex items-center gap-1.5 text-cb-caption text-gray-400">
              <span className={`w-1.5 h-1.5 rounded-full ${modeDotClass('prep')}`} />
              {modeCounts.prep} needs setup
            </span>
            <span className="inline-flex items-center gap-1.5 text-cb-caption text-gray-400">
              <span className={`w-1.5 h-1.5 rounded-full ${modeDotClass('nudge')}`} />
              {modeCounts.nudge} waiting
            </span>
            <span className="inline-flex items-center gap-1.5 text-cb-caption text-gray-400">
              <span className={`w-1.5 h-1.5 rounded-full ${modeDotClass('stuck')}`} />
              {modeCounts.stuck} stuck
            </span>
            <span className="inline-flex items-center gap-1.5 text-cb-caption text-gray-400">
              <span className={`w-1.5 h-1.5 rounded-full ${modeDotClass('underwriting')}`} />
              {modeCounts.underwriting} underwriting
            </span>
          </div>
        </div>
      </div>

      <div className="hidden sm:block w-px h-10 bg-cb-border flex-shrink-0" />

      <div className="flex-shrink-0">
        <p className="text-cb-caption text-gray-500 mb-1.5">Start application</p>
        <div className="flex gap-2 items-center">
          <input
            value={quickId}
            onChange={e => setQuickId(e.target.value)}
            placeholder="HubSpot deal ID or parent company name…"
            aria-label="HubSpot deal ID or parent company name"
            onKeyDown={e => e.key === 'Enter' && handleQuickCreate()}
            className="bg-cb-bg border border-cb-border rounded-cb px-3 py-2 text-cb-body text-white placeholder:text-gray-600 hover:border-cb-border-strong focus:outline-none focus:ring-2 focus:ring-cb-accent w-56"
          />
          <button onClick={handleQuickCreate} disabled={!quickId.trim()}
            className="flex items-center gap-1.5 bg-cb-accent hover:opacity-90 disabled:bg-gray-700 disabled:text-gray-500 text-cb-bg font-semibold text-cb-caption px-3 py-2 rounded-cb transition-opacity flex-shrink-0">
            <Zap className="w-3 h-3" /> Start
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
      <span className="relative flex-shrink-0">
        <input
          type="checkbox"
          className="peer absolute inset-0 w-4 h-4 opacity-0 cursor-pointer"
          checked={checked}
          onChange={onChange}
        />
        <span
          aria-hidden
          className={`flex w-4 h-4 rounded items-center justify-center border transition-all peer-focus-visible:ring-2 peer-focus-visible:ring-cb-accent ${checked ? 'bg-cb-accent border-cb-accent' : 'border-cb-border-strong bg-transparent'}`}
        >
          {checked && <Check className="w-2.5 h-2.5 text-cb-bg" />}
        </span>
      </span>
      {children}
    </label>
  );
}

// ── Stage Editor ──────────────────────────────────────────────────────────────
function StageEditor({ stage, corporateId, merchantName, onSaved, onPricingSaved, onClose, onRequestSend, initialTab }) {
  const hubspotDeal = isHubSpotDealId(corporateId);
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
  const [activeTab, setActiveTab]     = useState(initialTab || 'locations');
  const [pricing, setPricing]         = useState(null);

  useEffect(() => { loadData(); }, []);

  const fetchLists = async () => {
    const [locRes, conRes, sigRes, pricingRes] = await Promise.all([
      base44.functions.invoke('listLocations', { corporateId }),
      base44.functions.invoke('manageMerchantID', { action: 'list', corporateId }),
      base44.functions.invoke('manageSigner', { action: 'list', corporateId }),
      base44.functions.invoke('updatePricing', { action: 'get', corporateId }).catch(() => ({ data: null })),
    ]);
    const locs = locRes.data?.locations || [];
    const mids = conRes.data?.merchantIDs || [];
    const sigs = sigRes.data?.signers || [];
    setLocations(locs);
    setMids(mids);
    setSigners(sigs);
    if (pricingRes?.data?.pricing) setPricing(pricingRes.data.pricing);
    return { locs, mids, sigs };
  };

  const fetchQuotes = async () => {
    if (!hubspotDeal) {
      setQuotes([]);
      setSelectedQuoteId(null);
      return;
    }
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
      setError(err.message || 'Couldn’t load HubSpot quotes. Try Refresh, or check the deal in HubSpot.');
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
      if (!lists.locs.length && !lists.sigs.length && hubspotDeal) {
        setSyncMsg('Nothing in Base44 yet — pulling this deal from HubSpot…');
        const syncRes = await base44.functions.invoke('syncFromHubspot', { dealId: corporateId });
        if (syncRes.data?.error) throw new Error(syncRes.data.error);
        lists = await fetchLists();
      }
      if (!stage) selectAll(lists);
      await fetchQuotes();
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Couldn’t load merchant data. Try again in a moment.');
    } finally {
      setSyncMsg('');
      setLoading(false);
    }
  };

  const handleHubspotSync = async () => {
    if (!hubspotDeal) return;
    setLoading(true); setError('');
    setSyncMsg('Syncing from HubSpot…');
    try {
      const res = await base44.functions.invoke('syncFromHubspot', { dealId: corporateId });
      if (res.data?.error) throw new Error(res.data.error);
      const lists = await fetchLists();
      if (!stage) selectAll(lists);
      await fetchQuotes();
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Couldn’t sync from HubSpot. Check the deal ID and try again.');
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
      setError(err.message || 'Couldn’t select that quote. Try again.');
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
    { key: 'signers',   label: 'Owners',    count: selSigners.size, total: signers.length, icon: Users },
    { key: 'quotes',    label: 'Quotes',    count: selectedQuoteId ? 1 : 0, total: quotes.length, icon: FileText },
    { key: 'pricing',   label: 'Pricing',   count: isPricingComplete(pricing) ? 1 : 0, total: 1, icon: Percent },
  ];

  const formatMoney = (n) => (n == null || Number.isNaN(n) ? '—' : `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 px-6 py-4 border-b border-cb-border">
        <button onClick={onClose} className="p-1.5 text-gray-500 hover:text-white rounded-cb transition-colors" title="Close" aria-label="Close">
          <X className="w-4 h-4" />
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-cb-caption text-gray-500">{merchantName}</p>
          <p className="text-cb-body font-semibold text-white">{stage?.id ? 'Edit application' : 'Set up application'}</p>
        </div>
        {onRequestSend && (
          <button
            type="button"
            onClick={() => onRequestSend(stage)}
            title="Email the merchant their application link"
            className="flex items-center gap-1.5 text-cb-caption font-medium border px-2.5 py-2 rounded-cb transition-all text-gray-400 hover:text-white border-cb-border hover:border-cb-border-strong"
          >
            <Send className="w-3 h-3" /> Email link
          </button>
        )}
        <button onClick={handleHubspotSync} disabled={loading || saving || !hubspotDeal} title={hubspotDeal ? 'Pull the latest deal, contact, and company data from HubSpot' : 'Local merchant — no HubSpot deal'}
          className={`flex items-center gap-1.5 text-cb-caption font-medium border px-2.5 py-2 rounded-cb transition-all disabled:opacity-40 ${hubspotDeal ? 'text-gray-400 hover:text-white border-cb-border hover:border-cb-border-strong' : 'text-gray-600 border-cb-border cursor-not-allowed'}`}>
          <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} /> {hubspotDeal ? 'Sync HubSpot' : 'Local only'}
        </button>
        <button onClick={handleSave} disabled={saving}
          className="flex items-center gap-2 bg-cb-accent hover:opacity-90 disabled:bg-gray-700 disabled:text-gray-500 text-cb-bg font-semibold text-cb-body px-4 py-2 rounded-cb transition-opacity">
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
          {saving ? 'Saving…' : 'Save changes'}
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
          <div className="flex border-b border-cb-border px-6 gap-1 pt-2" role="tablist">
            {tabs.map(t => (
              <button key={t.key} type="button" role="tab" aria-selected={activeTab === t.key} onClick={() => setActiveTab(t.key)}
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
                  ? <p className="text-cb-body text-gray-600 italic py-4 text-center">No locations yet. Add them in the merchant portal.</p>
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
                <p className="text-cb-caption text-gray-500">Only selected owners get the application invite.</p>
                {signers.length === 0
                  ? <p className="text-cb-body text-gray-600 italic py-4 text-center">No owners yet. Add them in the merchant portal.</p>
                  : signers.map(s => (
                    <CheckRow key={s.id} checked={selSigners.has(s.id)} onChange={() => toggle(s.id, setSelSigners)}>
                      <Users className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-cb-body font-semibold text-white truncate">{s.firstName} {s.lastName}</p>
                        <p className="text-cb-caption text-gray-500 truncate">{s.signerEmail}</p>
                      </div>
                      <span className="inline-flex items-center gap-1.5 text-cb-caption text-gray-400 whitespace-nowrap">
                        <span className="inline-flex items-center gap-1.5 text-cb-caption text-gray-400 whitespace-nowrap">
                          <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${lifecycleDotClass(s.identityStatus)}`} />
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
                    {hubspotDeal
                      ? 'No quotes on this HubSpot deal yet. Create and publish a quote in HubSpot, then Refresh.'
                      : 'This merchant isn’t linked to HubSpot, so quotes aren’t available. Link a deal later to add equipment quotes.'}
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
            {activeTab === 'pricing' && (
              <div className="max-w-lg">
                <p className="text-cb-caption text-gray-500 mb-3">
                  Saves rates on this merchant. Open applications refresh in the background. Monthly fees stay on the MSPWare template.
                </p>
                <PricingEditorPanel
                  initialPricing={pricing}
                  saveLabel="Save pricing"
                  onSave={async (payload) => {
                    try {
                      const res = await base44.functions.invoke('updatePricing', { corporateId, ...payload });
                      const data = res?.data;
                      if (data?.error) throw new Error(data.error);
                      if (!data?.success) {
                        throw new Error(data?.error || 'Pricing save did not succeed — is updatePricing published?');
                      }
                      const nextPricing = data.pricing || null;
                      // Guard: Base44 can silently strip enum values — refuse to look "saved" if tier didn't stick.
                      if (
                        payload.pricingTier
                        && String(nextPricing?.pricingTier || '').toUpperCase() !== String(payload.pricingTier).toUpperCase()
                      ) {
                        throw new Error(
                          `Pricing did not persist (wanted ${payload.pricingTier}, got ${nextPricing?.pricingTier || 'null'}). ` +
                          `Republish MerchantCorporateProfile schema so pricingTier includes SELF_SERVE_CASH_DISCOUNT.`
                        );
                      }
                      setPricing(nextPricing);
                      setError('');
                      onPricingSaved?.(data.profile || nextPricing);
                    } catch (err) {
                      const msg =
                        err?.response?.data?.error
                        || err?.message
                        || 'Pricing save failed';
                      setError(msg);
                      throw new Error(msg);
                    }
                  }}
                />
              </div>
            )}
          </div>
          {error && (
            <div className="mx-6 mb-4 bg-cb-surface-raised border border-cb-danger/30 rounded-cb px-4 py-3 text-cb-body text-gray-300 flex items-center gap-2">
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
    } catch (err) { setError(err.message || 'Couldn’t send email. Check the address and try again.'); }
    finally { setSending(false); }
  };

  const copyLink = () => { navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 2000); };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 px-4" onClick={onClose} role="presentation">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="send-modal-title"
        className="bg-cb-surface-raised border border-cb-border rounded-cb shadow-cb-overlay w-full max-w-md p-6"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-cb bg-cb-accent-muted flex items-center justify-center"><Send className="w-4 h-4 text-cb-accent" /></div>
            <div>
              <h3 id="send-modal-title" className="font-semibold text-white text-cb-body">Email application link</h3>
              <p className="text-cb-caption text-gray-500 truncate max-w-[200px]">{stage?.label || 'Merchant portal link'}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 text-gray-500 hover:text-white rounded-cb" aria-label="Close"><X className="w-4 h-4" /></button>
        </div>
        {sent ? (
          <div className="space-y-4">
            <div className="flex items-center gap-2 bg-cb-surface border border-cb-success/30 rounded-cb px-4 py-3">
              <CheckCircle2 className="w-4 h-4 text-cb-success flex-shrink-0" />
              <p className="text-cb-body text-white font-semibold">Email sent to {email}</p>
            </div>
            <div>
              <label className={labelCls}>Application link</label>
              <div className="flex items-center gap-2 bg-cb-bg border border-cb-border rounded-cb px-3.5 py-2.5">
                <p className="text-cb-caption text-gray-400 flex-1 truncate font-mono">{link}</p>
                <button onClick={copyLink} className="flex-shrink-0 text-cb-accent hover:opacity-80" aria-label={copied ? 'Copied' : 'Copy link'}>
                  {copied ? <Check className="w-3.5 h-3.5 text-cb-success" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
                <a href={link} target="_blank" rel="noreferrer" className="flex-shrink-0 text-gray-500 hover:text-white" aria-label="Open link"><ExternalLink className="w-3.5 h-3.5" /></a>
              </div>
            </div>
            <button onClick={onClose} className="w-full border border-cb-border text-gray-400 font-medium text-cb-body py-2.5 rounded-cb hover:text-white hover:border-cb-border-strong">Done</button>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <label className={labelCls}>Recipient email</label>
              <input value={email} onChange={e => setEmail(e.target.value)} placeholder="merchant@example.com"
                className={inputCls} autoFocus onKeyDown={e => e.key === 'Enter' && handleSend()} />
            </div>
            {error && <div className="bg-cb-surface border border-cb-danger/30 rounded-cb px-4 py-3 text-cb-body text-gray-300">{error}</div>}
            <div className="flex gap-3">
              <button onClick={handleSend} disabled={sending}
                className="flex-1 flex items-center justify-center gap-2 bg-cb-accent hover:opacity-90 disabled:bg-gray-700 disabled:text-gray-500 text-cb-bg font-semibold text-cb-body py-2.5 rounded-cb transition-opacity">
                {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                {sending ? 'Sending…' : 'Send email'}
              </button>
              <button onClick={onClose} className="px-4 border border-cb-border text-gray-400 font-medium text-cb-body py-2.5 rounded-cb hover:text-white hover:border-cb-border-strong">Don’t send</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Application Row ───────────────────────────────────────────────────────────
function ApplicationRow({ corporateId, merchantName, profile, trackStage, adminStages, publicUrl, onEdit, onDeleteMerchant, onModeChange }) {
  const [expanded, setExpanded]         = useState(false);
  const [mids, setMids]                 = useState([]);
  const [locations, setLocations]       = useState([]);
  const [signers, setSigners]           = useState([]);
  const [mspStatuses, setMspStatuses]   = useState({});
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [loadingMsp, setLoadingMsp]     = useState(false);
  const [healthReady, setHealthReady]   = useState(false);
  const [detailError, setDetailError]   = useState('');
  const [copied, setCopied]             = useState(null);
  const [impersonating, setImpersonating] = useState(false);
  const [openingDashboard, setOpeningDashboard] = useState(false);
  const [signerLinkBusy, setSignerLinkBusy] = useState({});
  const [nudgeOpen, setNudgeOpen]       = useState(false);
  const [nudging, setNudging]           = useState(false);
  const [nudgeMsg, setNudgeMsg]         = useState('');
  const [nudgeMenuPos, setNudgeMenuPos] = useState(null);
  const [rowActionError, setRowActionError] = useState('');
  const nudgeWrapRef = useRef(null);

  const loadRowHealth = useCallback(async () => {
    setLoadingDetail(true);
    setDetailError('');
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
        for (let i = 0; i < midsWithApp.length; i += 3) {
          const batch = midsWithApp.slice(i, i + 3);
          await Promise.all(batch.map(async mid => {
            try {
              const res = await base44.functions.invoke('getMSPFormStatus', {
                corporateId,
                applicationNo: mid.mspApplicationNo,
                formOnly: true,
              });
              statuses[mid.mspApplicationNo] = res.data;
            } catch {
              statuses[mid.mspApplicationNo] = null;
            }
          }));
        }
        setMspStatuses(statuses);
        setLoadingMsp(false);
      }
      setHealthReady(true);
    } catch (err) {
      console.error('[ApplicationRow health]', err);
      setDetailError(err?.message || 'Couldn’t load merchant details. Try again.');
    } finally {
      setLoadingDetail(false);
    }
  }, [corporateId]);

  // Expand-only health: never auto-fetch on mount (rate-limit safe).

  const toggleExpand = () => {
    setExpanded((v) => {
      const next = !v;
      if (next && !healthReady && !loadingDetail) loadRowHealth();
      return next;
    });
  };
  const onExpandKey = (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      toggleExpand();
    }
  };

  useEffect(() => {
    if (!nudgeOpen) {
      setNudgeMenuPos(null);
      return undefined;
    }
    const place = () => {
      const el = nudgeWrapRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      setNudgeMenuPos({
        top: r.bottom + 4,
        right: window.innerWidth - r.right,
      });
    };
    place();
    const onDoc = (e) => {
      if (nudgeWrapRef.current?.contains(e.target)) return;
      if (e.target?.closest?.('[data-nudge-menu]')) return;
      setNudgeOpen(false);
    };
    const onKey = (e) => { if (e.key === 'Escape') setNudgeOpen(false); };
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    document.addEventListener('mousedown', onDoc);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
      document.removeEventListener('mousedown', onDoc);
      window.removeEventListener('keydown', onKey);
    };
  }, [nudgeOpen]);

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

  const mspValues = Object.values(mspStatuses);
  const avgMspPct = mspValues.length > 0
    ? Math.round(mspValues.reduce((s, v) => s + (v?.percent_complete != null ? parseFloat(String(v.percent_complete)) : 0), 0) / mspValues.length)
    : null;
  const mspErrCount = mspValues.reduce((s, v) => s + countMspErrors(v), 0);
  const localErrCount = mids.reduce((s, m) => s + countLocalMidIssues(m), 0);
  const totalErrors = mspErrCount + (healthReady ? localErrCount : 0);

  const rowMode = resolveApplicationRowMode({
    profile,
    track: trackStage,
    pipeline,
    mspErrorCount: totalErrors,
    detailLoaded: healthReady,
  });
  const isStuck = rowMode.mode === 'stuck';

  useEffect(() => {
    onModeChange?.(corporateId, rowMode.mode);
  }, [corporateId, rowMode.mode, onModeChange]);

  const copySignerDirectLink = async (e, signer) => {
    e?.stopPropagation?.();
    if (!signer?.id) return;
    setRowActionError('');
    setSignerLinkBusy(prev => ({ ...prev, [signer.id]: 'copy' }));
    try {
      let link = null;
      if (signer.verifyToken) {
        link = `${publicUrl}/verify?token=${encodeURIComponent(signer.verifyToken)}&intent=sign`;
      } else {
        const res = await base44.functions.invoke('manageSigner', {
          action: 'getSigningInviteLink',
          corporateId,
          signerId: signer.id,
        });
        if (res.data?.error || !res.data?.link) {
          throw new Error(res.data?.error || 'No link returned');
        }
        link = res.data.link;
      }
      await navigator.clipboard.writeText(link);
      setCopied(signer.id);
      setTimeout(() => setCopied(null), 2000);
    } catch (err) {
      console.error('[getSigningInviteLink]', err);
      const apiErr =
        err?.response?.data?.error
        || err?.data?.error
        || (typeof err?.response?.data === 'string' ? err.response.data : null)
        || err.message;
      const hint = /Unknown action/i.test(String(apiErr || ''))
        ? ' Redeploy manageSigner in Base44 (getSigningInviteLink missing).'
        : '';
      setRowActionError((apiErr || 'Could not copy owner link') + hint);
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
    setRowActionError('');
    setSignerLinkBusy(prev => ({ ...prev, [signer.id]: 'send' }));
    try {
      const res = await base44.functions.invoke('manageSigner', {
        action: 'sendSigningInvite',
        corporateId,
        signerId: signer.id,
      });
      if (res.data?.error) throw new Error(res.data.error);
      setSigners(prev => prev.map(s => (s.id === signer.id ? { ...s, ...res.data.signer } : s)));
    } catch (err) {
      console.error('[sendSigningInvite]', err);
      setRowActionError(err.message || 'Could not send invite email');
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
    if (!window.confirm(`Mark ${signer.firstName} ${signer.lastName} as Verified only?\n\nUse when identity is done but they haven’t signed the merchant agreement yet.`)) return;
    setRowActionError('');
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
      setRowActionError(err.message || 'Could not update owner status');
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
    setRowActionError('');
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
      setRowActionError(err.message || 'Could not open merchant portal');
    } finally {
      setImpersonating(false);
    }
  };

  const openPostSignDashboard = async (e) => {
    e?.stopPropagation?.();
    setRowActionError('');
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
      setRowActionError(err.message || 'Could not open post-signing dashboard');
    } finally {
      setOpeningDashboard(false);
    }
  };

  const runNudge = async (channels) => {
    setNudging(true);
    setNudgeMsg('');
    setRowActionError('');
    setNudgeOpen(false);
    writeNudgeChannelPref(channels);
    try {
      const res = await base44.functions.invoke('nudgeMerchant', { corporateId, channels });
      if (res.data?.error && !res.data?.success) {
        throw new Error(res.data.error);
      }
      const parts = [];
      if (res.data?.results?.email === 'sent') parts.push('email');
      if (res.data?.results?.sms === 'sent') parts.push('text');
      setNudgeMsg(parts.length ? `Reminder sent via ${parts.join(' + ')}` : 'Reminder sent');
      if (res.data?.warnings?.length) {
        setNudgeMsg((m) => `${m} (${res.data.warnings.join('; ')})`);
      }
      setTimeout(() => setNudgeMsg(''), 4000);
    } catch (err) {
      console.error('[nudgeMerchant]', err);
      setRowActionError(err?.response?.data?.error || err.message || 'Could not send reminder. Try email only, or check Quo settings.');
    } finally {
      setNudging(false);
    }
  };

  const borderColor = isSubmitted
    ? 'border-cb-success/25'
    : totalErrors > 0 || isStuck
      ? 'border-cb-danger/30'
      : 'border-cb-border';

  return (
    <div className={`bg-cb-surface border ${borderColor} rounded-cb overflow-hidden hover:border-cb-border-strong transition-all`}>
      {/* Header — merchant + mode CTA + one-line reason */}
      <div className="flex items-center gap-3 px-4 py-3">
        <button
          type="button"
          className="text-gray-500 flex-shrink-0 p-1 rounded-cb hover:text-white focus:outline-none focus:ring-2 focus:ring-cb-accent"
          aria-expanded={expanded}
          aria-label={expanded ? 'Collapse merchant details' : 'Expand merchant details'}
          onClick={toggleExpand}
          onKeyDown={onExpandKey}
        >
          {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </button>
        <button
          type="button"
          className="flex flex-1 min-w-0 items-center gap-3 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-cb-accent rounded-cb"
          onClick={toggleExpand}
          aria-expanded={expanded}
        >
        <div className={`w-7 h-7 rounded-cb flex items-center justify-center flex-shrink-0 ${isSubmitted ? 'bg-cb-success/15' : totalErrors > 0 || isStuck ? 'bg-cb-danger/15' : 'bg-cb-accent-muted'}`}>
          <Building2 className={`w-3.5 h-3.5 ${isSubmitted ? 'text-cb-success' : totalErrors > 0 || isStuck ? 'text-cb-danger' : 'text-cb-accent'}`} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-cb-body font-semibold text-white truncate">{merchantName || corporateId}</p>
            <span className="text-cb-caption font-mono text-gray-600">{corporateId}</span>
            {profile?.legalName && profile.legalName !== merchantName && (
              <span className="text-cb-caption text-gray-600 truncate max-w-[12rem]" title={profile.legalName}>
                {profile.legalName}
              </span>
            )}
            {rowMode.mode === 'stuck' && (
              <span className="inline-flex items-center gap-1.5 text-cb-caption text-gray-400 whitespace-nowrap">
                <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${modeDotClass('stuck')}`} />
                Stuck
              </span>
            )}
            {rowMode.mode === 'prep' && (
              <span className="inline-flex items-center gap-1.5 text-cb-caption text-gray-400 whitespace-nowrap">
                <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${modeDotClass('prep')}`} />
                Needs setup
              </span>
            )}
            {rowMode.mode === 'underwriting' && (
              <span className="inline-flex items-center gap-1.5 text-cb-caption text-gray-400 whitespace-nowrap">
                <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${modeDotClass('underwriting')}`} />
                Underwriting
              </span>
            )}
            {rowMode.mode === 'nudge' && (
              <span className="inline-flex items-center gap-1.5 text-cb-caption text-gray-400 whitespace-nowrap">
                <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${modeDotClass('nudge')}`} />
                {currentStep === 'banking' ? 'Waiting on bank' : 'Waiting on sign'}
              </span>
            )}
          </div>
          <p className="text-cb-caption text-gray-500 truncate mt-0.5" title={rowMode.blocker || rowMode.reason}>
            {rowMode.blocker || rowMode.reason}
          </p>
        </div>
        </button>

        {/* Mode-driven primary + quiet utilities */}
        <div className="flex items-center gap-1.5 flex-shrink-0 ml-1" onClick={e => e.stopPropagation()}>
          {healthReady && totalErrors > 0 && (
            <span className="inline-flex items-center gap-1.5 text-cb-caption text-cb-danger whitespace-nowrap">
              <span className="w-1.5 h-1.5 rounded-full flex-shrink-0 bg-cb-danger" />
              {totalErrors}
            </span>
          )}
          {healthReady && avgMspPct !== null && <HealthBadge score={avgMspPct} />}
          {nudgeMsg && (
            <span className="text-cb-caption text-cb-success max-w-[10rem] truncate" title={nudgeMsg}>{nudgeMsg}</span>
          )}

          {/* Mode primary CTA */}
          {rowMode.mode === 'prep' && (
            <button
              type="button"
              onClick={openMerchantView}
              disabled={impersonating || openingDashboard}
              title={rowMode.reason}
              className="flex items-center gap-1 text-cb-caption font-semibold px-2.5 py-1 rounded-cb border transition-all bg-cb-accent text-cb-bg border-cb-accent hover:opacity-90 disabled:opacity-40"
            >
              {impersonating ? <Loader2 className="w-3 h-3 animate-spin" /> : <Eye className="w-3 h-3" />}
              Open to prep
            </button>
          )}

          {rowMode.mode === 'stuck' && (
            <button
              type="button"
              onClick={openMerchantView}
              disabled={impersonating || openingDashboard}
              title={rowMode.blocker || rowMode.reason}
              className="flex items-center gap-1 text-cb-caption font-semibold px-2.5 py-1 rounded-cb border transition-all bg-cb-accent text-cb-bg border-cb-accent hover:opacity-90 disabled:opacity-40"
            >
              {impersonating ? <Loader2 className="w-3 h-3 animate-spin" /> : <Wrench className="w-3 h-3" />}
              Open to fix
            </button>
          )}

          {rowMode.mode === 'nudge' && (
            <div className="relative flex items-stretch" ref={nudgeWrapRef}>
              <button
                type="button"
                onClick={() => runNudge(readNudgeChannelPref())}
                disabled={nudging}
                title={rowMode.reason}
                className="flex items-center gap-1 text-cb-caption font-semibold pl-2.5 pr-2 py-1 rounded-l-cb border border-r-0 transition-all bg-cb-accent text-cb-bg border-cb-accent hover:opacity-90 disabled:opacity-40"
              >
                {nudging ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
                Remind
              </button>
              <button
                type="button"
                onClick={() => setNudgeOpen((o) => !o)}
                disabled={nudging}
                title="Choose text, email, or both"
                aria-expanded={nudgeOpen}
                aria-label="Reminder channel options"
                className="flex items-center px-1.5 rounded-r-cb border transition-all bg-cb-accent text-cb-bg border-cb-accent hover:opacity-90 disabled:opacity-40 border-l border-l-black/20"
              >
                <ChevronDown className="w-3 h-3" />
              </button>
              {nudgeOpen && nudgeMenuPos && createPortal(
                <div
                  data-nudge-menu
                  className="fixed z-[9999] min-w-[11rem] rounded-cb border border-cb-border bg-cb-surface-raised shadow-cb-overlay py-1"
                  style={{ top: nudgeMenuPos.top, right: nudgeMenuPos.right }}
                >
                  {[
                    { id: 'both', label: 'Text and email' },
                    { id: 'sms', label: 'Text only' },
                    { id: 'email', label: 'Email only' },
                  ].map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => runNudge(opt.id)}
                      className={`w-full text-left px-3 py-1.5 text-cb-caption hover:bg-cb-bg ${
                        readNudgeChannelPref() === opt.id ? 'text-cb-accent font-semibold' : 'text-gray-300'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>,
                document.body
              )}
            </div>
          )}

          {rowMode.mode === 'underwriting' && (
            <button
              type="button"
              onClick={openPostSignDashboard}
              disabled={impersonating || openingDashboard}
              title={rowMode.reason}
              className="flex items-center gap-1 text-cb-caption font-semibold px-2.5 py-1 rounded-cb border transition-all bg-cb-accent text-cb-bg border-cb-accent hover:opacity-90 disabled:opacity-40"
            >
              {openingDashboard ? <Loader2 className="w-3 h-3 animate-spin" /> : <LayoutDashboard className="w-3 h-3" />}
              Open dashboard
            </button>
          )}

          {/* Quiet utilities — Dashboard only when not already primary */}
          {rowMode.mode === 'underwriting' ? null : (
            <button
              type="button"
              onClick={openPostSignDashboard}
              disabled={impersonating || openingDashboard}
              title="Preview post-signing dashboard"
              aria-label="Preview post-signing dashboard"
              className="p-1.5 text-gray-600 hover:text-gray-300 rounded-cb border border-transparent hover:border-cb-border transition-all disabled:opacity-40"
            >
              {openingDashboard ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <LayoutDashboard className="w-3.5 h-3.5" />}
            </button>
          )}
          <button
            type="button"
            onClick={() => onEdit(corporateId, merchantName, linkStage)}
            title="Edit locations, owners, pricing, and quotes"
            aria-label={`Edit ${merchantName || corporateId}`}
            className="p-1.5 text-gray-600 hover:text-white rounded-cb border border-transparent hover:border-cb-border transition-all"
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => onDeleteMerchant({ corporateId, merchantName })}
            title="Permanently delete this merchant from Cliqbux"
            aria-label={`Delete ${merchantName || corporateId}`}
            className="p-1.5 text-gray-600 hover:text-cb-danger rounded-cb transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {rowActionError && (
        <div className="px-4 pb-3">
          <div className="flex items-start gap-2 bg-cb-bg border border-cb-danger/30 rounded-cb px-3 py-2">
            <AlertCircle className="w-3.5 h-3.5 text-cb-danger flex-shrink-0 mt-0.5" />
            <p className="text-cb-caption text-gray-300 flex-1">{rowActionError}</p>
            <button
              type="button"
              onClick={() => setRowActionError('')}
              className="text-gray-500 hover:text-white"
              aria-label="Dismiss error"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Expanded detail */}
      {expanded && (
        <div className="border-t border-cb-border bg-cb-bg/60">
          {loadingDetail && !healthReady ? (
            <div className="flex items-center justify-center py-6 gap-2">
              <Loader2 className="w-4 h-4 text-gray-500 animate-spin" />
              <span className="text-cb-body text-gray-500">Loading details…</span>
            </div>
          ) : detailError ? (
            <div className="p-4 flex flex-col items-center gap-2">
              <p className="text-cb-body text-cb-danger text-center">{detailError}</p>
              <button
                type="button"
                onClick={loadRowHealth}
                className="text-cb-caption font-semibold text-cb-bg bg-cb-accent px-3 py-1.5 rounded-cb"
              >
                Retry
              </button>
            </div>
          ) : (
            <div className="p-4 space-y-4">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                <p className="text-cb-caption text-gray-400">
                  <span className="text-white font-medium">Next: </span>
                  {rowMode.blocker || rowMode.reason}
                </p>
                <StepTracker currentStep={currentStep} completedSteps={completedSteps} missingByStep={missingByStep} />
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-cb-caption text-gray-600">
                {(p.signerEmail || profile?.signerEmail) && <span>{p.signerEmail || profile?.signerEmail}</span>}
                {displayPricingTier(profile, p) && <span>{displayPricingTier(profile, p)}</span>}
                {lastSeen && <span className="inline-flex items-center gap-1"><Clock className="w-2.5 h-2.5" /> {lastSeen}</span>}
              </div>
              <PortalActivityPanel activity={p.activity} />

              {/* MIDs */}
              {mids.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-cb-caption text-gray-500">
                      MIDs ({mids.length}) {loadingMsp && <Loader2 className="inline w-3 h-3 animate-spin ml-1" />}
                    </p>
                    {avgMspPct !== null && (
                      <div className="flex items-center gap-2">
                        <span className="text-cb-caption text-gray-500">Form complete:</span>
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
                  <p className="text-cb-caption text-gray-500 mb-2">Owners</p>
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
                              <span className="inline-flex items-center gap-1.5 text-cb-caption text-gray-400 whitespace-nowrap">
                                <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${lifecycleDotClass(s.identityStatus)}`} />
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
                                title="Copy verify & sign link"
                                aria-label={`Copy verify and sign link for ${s.firstName || ''} ${s.lastName || ''}`.trim()}
                                className="p-1.5 text-gray-500 hover:text-white rounded-cb transition-colors disabled:opacity-40"
                              >
                                {busy === 'copy' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : copied === s.id ? <Check className="w-3.5 h-3.5 text-cb-success" /> : <Copy className="w-3.5 h-3.5" />}
                              </button>
                              <button
                                type="button"
                                onClick={(e) => sendSignerInvite(e, s)}
                                disabled={!!busy}
                                title="Email verify & sign invite"
                                aria-label={`Email verify and sign invite to ${s.signerEmail || s.firstName || 'owner'}`}
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
                                  className="text-cb-caption font-semibold text-gray-400 hover:text-white px-1.5 py-1 rounded-cb border border-cb-border disabled:opacity-40"
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
                <p className="text-cb-body text-gray-600 text-center py-4">No MIDs or owners yet for this merchant.</p>
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
  const [loadError, setLoadError]         = useState('');
  const [rowModes, setRowModes]           = useState({});
  const [searching, setSearching]         = useState(false);
  const [jumpError, setJumpError]         = useState('');
  const [editing, setEditing]             = useState(null);
  const [sending, setSending]             = useState(null);
  const [deleteMerchantConfirm, setDeleteMerchantConfirm] = useState(null);
  const [deleteMerchantTyped, setDeleteMerchantTyped]     = useState('');
  const [deletingMerchant, setDeletingMerchant]           = useState(false);
  const [deleteMerchantError, setDeleteMerchantError]     = useState('');
  const [searchText, setSearchText]       = useState('');
  const [jumpId, setJumpId]               = useState('');
  const [localStageDraft, setLocalStageDraft] = useState(null);

  const publicUrl = (import.meta.env.VITE_PUBLIC_URL || window.location.origin).replace(/\/$/, '');

  const handleModeChange = useCallback((corporateId, mode) => {
    const key = String(corporateId);
    setRowModes((prev) => (prev[key] === mode ? prev : { ...prev, [key]: mode }));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
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
    } catch (err) {
      console.error('[ApplicationManager load]', err);
      setLoadError(err?.message || 'Couldn’t load applications. Check your connection and try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!editing && !sending && !deleteMerchantConfirm && !localStageDraft) return undefined;
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      if (deletingMerchant) return;
      if (deleteMerchantConfirm) { setDeleteMerchantConfirm(null); setDeleteMerchantTyped(''); return; }
      if (sending) { setSending(null); return; }
      if (localStageDraft) { setLocalStageDraft(null); return; }
      if (editing) setEditing(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [editing, sending, deleteMerchantConfirm, localStageDraft, deletingMerchant]);

  const handleQuickCreate = (raw) => {
    const id = String(raw || '').trim();
    if (!id) return;

    // Alphanumeric / parent company name → Quick Stage modal (creates HubSpot Tier-1 + deal)
    if (!isHubSpotDealId(id)) {
      setLocalStageDraft({ parentCompanyName: id, businessName: id });
      return;
    }

    const adminForCorp = allStages.filter(s => String(s.corporateId) === id && s.label !== '__auto_track__');
    const existing = adminForCorp.find(s => s.status === 'sent')
      || adminForCorp.find(s => s.status === 'ready')
      || adminForCorp[0]
      || null;
    setEditing({ corporateId: id, merchantName: merchantNames[id] || id, stage: existing });
  };

  const handleLocalStageCreated = (data) => {
    const cid = String(data.corporateId);
    const name = data.businessName || data.parentCompanyName || cid;
    setLocalStageDraft(null);
    setMerchantNames(prev => ({ ...prev, [cid]: name }));
    if (data.profile) {
      setProfiles(prev => {
        if (prev.find(p => String(p.corporateId) === cid)) return prev;
        return [data.profile, ...prev];
      });
    }
    if (data.stage) {
      setAllStages(prev => {
        if (prev.find(s => s.id === data.stage.id)) return prev;
        return [data.stage, ...prev];
      });
    }
    // Open StageEditor on SIGNERS so agents can add owners right away
    setEditing({ corporateId: cid, merchantName: name, stage: data.stage || null, initialTab: 'signers' });
  };

  const handleStageSaved = (stage) => {
    setAllStages(prev => {
      const idx = prev.findIndex(s => s.id === stage.id);
      if (idx >= 0) { const next = [...prev]; next[idx] = stage; return next; }
      return [stage, ...prev];
    });
    setEditing(null);
  };

  const handlePricingSaved = (profileOrPricing) => {
    if (!editing?.corporateId || !profileOrPricing) return;
    const cid = String(editing.corporateId);
    const tier = profileOrPricing.pricingTier;
    const pricingType = profileOrPricing.pricingType;
    setProfiles(prev => prev.map(p => {
      if (String(p.corporateId) !== cid) return p;
      return {
        ...p,
        ...(tier != null ? { pricingTier: tier } : {}),
        ...(pricingType != null ? { pricingType } : {}),
        ...(profileOrPricing.customMarkupPercentage !== undefined
          ? { customMarkupPercentage: profileOrPricing.customMarkupPercentage } : {}),
        ...(profileOrPricing.customPerTxFee !== undefined
          ? { customPerTxFee: profileOrPricing.customPerTxFee } : {}),
        ...(profileOrPricing.customAuthPerCard !== undefined
          ? { customAuthPerCard: profileOrPricing.customAuthPerCard } : {}),
      };
    }));
    // Keep track prefill badge in sync (server also patches this; update local list immediately).
    setAllStages(prev => prev.map(s => {
      if (String(s.corporateId) !== cid || s.label !== '__auto_track__') return s;
      const prevData = (s.prefilledData && typeof s.prefilledData === 'object') ? s.prefilledData : {};
      return {
        ...s,
        prefilledData: {
          ...prevData,
          ...(tier != null ? { pricingTier: tier } : {}),
          pricing: {
            ...(prevData.pricing || {}),
            pricingTier: tier,
            pricingType: pricingType || prevData.pricing?.pricingType,
          },
        },
      };
    }));
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
      setDeleteMerchantError(err.message || 'Couldn’t delete merchant. Try again, or refresh the page.');
    } finally {
      setDeletingMerchant(false);
    }
  };

  const handleJump = async () => {
    if (!jumpId.trim()) return;
    setSearching(true);
    setJumpError('');
    try {
      const r = await base44.functions.invoke('getMerchantData', { corporateId: jumpId.trim() });
      const name = r.data?.profile?.legalName || jumpId.trim();
      setMerchantNames(prev => ({ ...prev, [jumpId.trim()]: name }));
      setProfiles(prev => {
        if (prev.find(p => p.corporateId === jumpId.trim())) return prev;
        return [r.data?.profile || { corporateId: jumpId.trim(), legalName: name }, ...prev];
      });
      setSearchText(jumpId.trim());
    } catch (err) {
      setJumpError(err?.message || 'Merchant not found for that ID.');
      setSearchText(jumpId.trim());
    } finally {
      setSearching(false);
    }
  };

  // Build grouped map: corporateId → { profile, track, admin[] }
  // Always key by String(corporateId) — HubSpot deal ids may arrive as number or string.
  const trackMap = {};
  const adminMap = {};
  for (const s of allStages) {
    const key = s.corporateId != null ? String(s.corporateId) : '';
    if (!key) continue;
    if (s.label === '__auto_track__') trackMap[key] = s;
    else { if (!adminMap[key]) adminMap[key] = []; adminMap[key].push(s); }
  }

  const filtered = profiles.filter(p => {
    if (!searchText) return true;
    const name = (merchantNames[p.corporateId] || p.corporateId).toLowerCase();
    return name.includes(searchText.toLowerCase()) || p.corporateId?.includes(searchText);
  });

  // Sort by mode priority (stuck first), then recent activity
  const sorted = [...filtered].sort((a, b) => {
    const aKey = String(a.corporateId);
    const bKey = String(b.corporateId);
    const aTrack = trackMap[aKey];
    const bTrack = trackMap[bKey];
    const aMode = rowModes[aKey] || resolveApplicationRowMode({
      profile: a,
      track: aTrack,
      pipeline: resolvePipelineProgress({ profile: a, track: aTrack, locations: [], signers: [] }),
      mspErrorCount: 0,
      detailLoaded: false,
    }).mode;
    const bMode = rowModes[bKey] || resolveApplicationRowMode({
      profile: b,
      track: bTrack,
      pipeline: resolvePipelineProgress({ profile: b, track: bTrack, locations: [], signers: [] }),
      mspErrorCount: 0,
      detailLoaded: false,
    }).mode;
    const rankDiff = modeSortRank(aMode) - modeSortRank(bMode);
    if (rankDiff !== 0) return rankDiff;
    const aT = aTrack?.prefilledData?.lastSeenAt ? new Date(aTrack.prefilledData.lastSeenAt).getTime() : 0;
    const bT = bTrack?.prefilledData?.lastSeenAt ? new Date(bTrack.prefilledData.lastSeenAt).getTime() : 0;
    return bT - aT;
  });

  const showEditor = editing !== null;

  return (
    <div className="min-h-screen bg-cb-bg flex flex-col">
      <PipelineOverview
        profiles={profiles}
        trackMap={trackMap}
        rowModes={rowModes}
        loading={loading}
        onRefresh={load}
        onQuickCreate={handleQuickCreate}
      />

      {loadError && (
        <div className="mx-6 mt-3 bg-cb-surface border border-cb-danger/30 rounded-cb px-4 py-3 flex items-center justify-between gap-3">
          <p className="text-cb-body text-gray-300">{loadError}</p>
          <button type="button" onClick={load} className="text-cb-caption font-semibold text-cb-bg bg-cb-accent px-3 py-1.5 rounded-cb flex-shrink-0">
            Retry
          </button>
        </div>
      )}

      <div className="flex flex-1 min-h-0">
        <div className="flex flex-col flex-1 min-w-0 border-r border-cb-border">
          <div className="px-6 py-4 border-b border-cb-border flex-shrink-0">
            <p className="text-cb-caption text-cb-accent mb-1">Sales workspace</p>
            <h1 className="font-display text-cb-display text-white">Applications</h1>
          </div>

          <div className="px-4 py-3 border-b border-cb-border flex-shrink-0 flex gap-2 flex-wrap">
            <div className="relative flex-1 min-w-[12rem]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500" />
              <input value={searchText} onChange={e => setSearchText(e.target.value)}
                placeholder="Search by merchant name or ID…"
                aria-label="Search merchants"
                className={`${inputCls} pl-9 py-2`} />
            </div>
            <input value={jumpId} onChange={e => { setJumpId(e.target.value); setJumpError(''); }}
              placeholder="Jump to ID…"
              aria-label="Jump to merchant ID"
              className="bg-cb-bg border border-cb-border rounded-cb px-2.5 py-1.5 text-cb-caption text-white placeholder:text-gray-600 hover:border-cb-border-strong focus:outline-none focus:ring-2 focus:ring-cb-accent w-28"
              onKeyDown={e => e.key === 'Enter' && handleJump()} />
            <button onClick={handleJump} disabled={searching || !jumpId.trim()}
              className="flex items-center gap-1 bg-cb-accent hover:opacity-90 disabled:opacity-40 text-cb-bg font-semibold text-cb-caption px-2.5 py-1.5 rounded-cb transition-opacity flex-shrink-0">
              {searching ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Jump'}
            </button>
          </div>
          {jumpError && (
            <p className="px-4 py-2 text-cb-caption text-cb-danger border-b border-cb-border">{jumpError}</p>
          )}

          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center py-20">
                <Loader2 className="w-6 h-6 text-gray-500 animate-spin" />
              </div>
            ) : sorted.length === 0 ? (
              <div className="text-center py-16 px-8">
                <FileText className="w-7 h-7 text-gray-600 mx-auto mb-3" />
                <p className="text-gray-500 text-cb-body">
                  {loadError
                    ? 'Applications didn’t load.'
                    : profiles.length === 0
                    ? 'No merchants yet. Start one above with a HubSpot deal ID or business name.'
                    : 'No merchants match that search.'}
                </p>
              </div>
            ) : (
              <div className="px-4 py-4 space-y-2">
                {sorted.map(profile => (
                  <ApplicationRow
                    key={profile.corporateId}
                    corporateId={profile.corporateId}
                    merchantName={merchantNames[profile.corporateId] || profile.legalName || profile.corporateId}
                    profile={profile}
                    trackStage={trackMap[String(profile.corporateId)] || null}
                    adminStages={adminMap[String(profile.corporateId)] || []}
                    publicUrl={publicUrl}
                    onModeChange={handleModeChange}
                    onEdit={(corpId, name, stage) => setEditing({ corporateId: corpId, merchantName: name, stage: stage || null })}
                    onDeleteMerchant={(info) => { setDeleteMerchantConfirm(info); setDeleteMerchantTyped(''); setDeleteMerchantError(''); }}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {localStageDraft && (
        <QuickLocalStageModal
          initialName={localStageDraft.parentCompanyName || localStageDraft.businessName}
          onCreated={handleLocalStageCreated}
          onClose={() => setLocalStageDraft(null)}
        />
      )}

      {/* Edit overlay — does not shrink the applications list */}
      {showEditor && (
        <div className="fixed inset-0 z-[9000] flex justify-end bg-black/60" onClick={() => setEditing(null)}>
          <div
            className="w-full max-w-xl h-full bg-cb-surface border-l border-cb-border shadow-cb-overlay flex flex-col"
            onClick={e => e.stopPropagation()}
          >
            <StageEditor
              stage={editing.stage}
              corporateId={editing.corporateId}
              merchantName={editing.merchantName}
              initialTab={editing.initialTab}
              onSaved={handleStageSaved}
              onPricingSaved={handlePricingSaved}
              onClose={() => setEditing(null)}
              onRequestSend={(stage) => setSending({
                stage: stage || editing.stage || null,
                corporateId: editing.corporateId,
                prefillEmail: '',
              })}
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
          onClick={() => { if (!deletingMerchant) { setDeleteMerchantConfirm(null); setDeleteMerchantTyped(''); } }}
          role="presentation">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-merchant-title"
            className="bg-cb-surface-raised border border-cb-danger/30 rounded-cb shadow-cb-overlay w-full max-w-sm p-6"
            onClick={e => e.stopPropagation()}
          >
            <h3 id="delete-merchant-title" className="font-semibold text-white mb-2">Delete {deleteMerchantConfirm.merchantName}?</h3>
            <p className="text-cb-body text-gray-400 mb-1">
              ID: <span className="font-mono text-gray-300">{deleteMerchantConfirm.corporateId}</span>
            </p>
            <p className="text-cb-caption text-gray-500 mb-4">
              Removes this merchant from Cliqbux (profile, locations, MIDs, and owners). Drafts already in MSPWare are not deleted. This cannot be undone.
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
                {deletingMerchant ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Delete merchant'}
              </button>
              <button
                onClick={() => { setDeleteMerchantConfirm(null); setDeleteMerchantTyped(''); }}
                disabled={deletingMerchant}
                className="flex-1 border border-cb-border text-gray-400 font-medium text-cb-body py-2.5 rounded-cb hover:text-white hover:border-cb-border-strong disabled:opacity-40">
                Keep merchant
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
