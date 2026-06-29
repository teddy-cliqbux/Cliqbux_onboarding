import { useState, useEffect } from 'react';
import { AlertCircle, ArrowLeft, Loader2, ChevronDown, ChevronRight, Wrench } from 'lucide-react';
import { base44 } from '@/api/base44Client';

// Maps MSPWare field names → human-readable labels + which onboarding step fixes them
const FIELD_MAP = {
  // Banking step
  deposit_account_no:   { label: 'Bank Account Number',    step: 'banking',   stepLabel: 'Banking Setup' },
  deposit_account_rtg:  { label: 'Bank Routing Number',    step: 'banking',   stepLabel: 'Banking Setup' },
  deposit_account_type: { label: 'Account Type (checking/savings)', step: 'banking', stepLabel: 'Banking Setup' },
  // Locations/MID step
  mcc:                  { label: 'MCC Code',               step: 'locations', stepLabel: 'Locations & MIDs' },
  monthly_sales:        { label: 'Monthly Card Volume',    step: 'locations', stepLabel: 'Locations & MIDs' },
  average_sales:        { label: 'Average Transaction',    step: 'locations', stepLabel: 'Locations & MIDs' },
  highest_ticket:       { label: 'Highest Ticket Amount',  step: 'locations', stepLabel: 'Locations & MIDs' },
  cp_percent:           { label: 'Card-Present %',         step: 'locations', stepLabel: 'Locations & MIDs' },
  cnp_percent:          { label: 'Card-Not-Present %',     step: 'locations', stepLabel: 'Locations & MIDs' },
  pricing_method:       { label: 'Pricing Method',         step: 'locations', stepLabel: 'Locations & MIDs' },
  pricing_category:     { label: 'Pricing Category',       step: 'locations', stepLabel: 'Locations & MIDs' },
  full_dba_name:        { label: 'DBA / Store Name',       step: 'locations', stepLabel: 'Locations & MIDs' },
  industry_type:        { label: 'Industry Type',          step: 'locations', stepLabel: 'Locations & MIDs' },
  // Business details (also on locations page)
  tin:                  { label: 'Federal EIN',            step: 'locations', stepLabel: 'Business Info' },
  ownership_type:       { label: 'Business Entity Type',   step: 'locations', stepLabel: 'Business Info' },
  year_business_established: { label: 'Year Established',  step: 'locations', stepLabel: 'Business Info' },
  ownership_years:      { label: 'Years in Business',      step: 'locations', stepLabel: 'Business Info' },
  // Verification step
  owner_dob:            { label: 'Owner Date of Birth',    step: 'verify',    stepLabel: 'Identity Verification' },
  owner_id_number:      { label: 'Owner SSN',              step: 'verify',    stepLabel: 'Identity Verification' },
  owner_address:        { label: 'Owner Home Address',     step: 'verify',    stepLabel: 'Identity Verification' },
  owner_firstname:      { label: 'Owner First Name',       step: 'verify',    stepLabel: 'Identity Verification' },
  owner_lastname:       { label: 'Owner Last Name',        step: 'verify',    stepLabel: 'Identity Verification' },
  // Address
  business_address:     { label: 'Business Street Address', step: 'locations', stepLabel: 'Locations & MIDs' },
  business_city:        { label: 'Business City',          step: 'locations', stepLabel: 'Locations & MIDs' },
  business_state_usa:   { label: 'Business State',         step: 'locations', stepLabel: 'Locations & MIDs' },
  business_zipcode:     { label: 'Business ZIP Code',      step: 'locations', stepLabel: 'Locations & MIDs' },
};

const STEP_ORDER = ['locations', 'banking', 'verify'];

function categorize(errors) {
  const byStep = {};
  const unknown = [];

  for (const err of errors) {
    // Try to match a field in the error string
    const raw = typeof err === 'string' ? err : (err?.message || err?.description || JSON.stringify(err));
    const matched = Object.entries(FIELD_MAP).find(([key]) =>
      raw.toLowerCase().includes(key.toLowerCase())
    );
    if (matched) {
      const [, meta] = matched;
      if (!byStep[meta.step]) byStep[meta.step] = { stepLabel: meta.stepLabel, fields: [] };
      byStep[meta.step].fields.push({ label: meta.label, raw });
    } else {
      unknown.push(raw);
    }
  }
  return { byStep, unknown };
}

// Resolve which step to navigate to (earliest in flow that has issues)
function primaryStep(byStep) {
  for (const s of STEP_ORDER) {
    if (byStep[s]) return s;
  }
  return 'locations';
}

export default function SigningErrorGuide({ app, onNavigate }) {
  const [checking, setChecking] = useState(false);
  const [details, setDetails] = useState(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (app?.mspApplicationNo && app?.error) {
      loadDetails(app.mspApplicationNo);
    }
  }, [app?.mspApplicationNo]);

  const loadDetails = async (appNo) => {
    setChecking(true);
    try {
      const res = await base44.functions.invoke('getMSPFormStatus', {
        applicationNo: appNo,
        corporateId: app.corporateId,
      });
      const data = res.data;
      if (data) {
        const allErrors = [
          ...(data.completion_errors || []),
          ...(data.data_errors || []),
          ...(data.rule_violations || []),
        ];
        setDetails({ allErrors, percentComplete: data.percent_complete ?? null });
      }
    } catch (_) {
      // non-fatal
    } finally {
      setChecking(false);
    }
  };

  const { byStep, unknown } = details ? categorize(details.allErrors) : { byStep: {}, unknown: [] };
  const targetStep = primaryStep(byStep);
  const hasDetails = details && (Object.keys(byStep).length > 0 || unknown.length > 0);

  const STEP_COLORS = {
    locations: 'text-amber-400 bg-amber-500/10 border-amber-500/30',
    banking:   'text-blue-400 bg-blue-500/10 border-blue-500/30',
    verify:    'text-purple-400 bg-purple-500/10 border-purple-500/30',
  };

  return (
    <div className="border border-red-500/30 bg-red-500/8 rounded-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-start gap-3 px-5 py-4">
        <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-red-300">
            {app.conceptName} — Form Incomplete
          </p>
          <p className="text-xs text-red-400/80 mt-0.5">
            {app.error || 'Unable to prepare signing package: Merchant application is not complete.'}
          </p>

          {/* Loading details */}
          {checking && (
            <div className="flex items-center gap-1.5 mt-2">
              <Loader2 className="w-3 h-3 text-gray-400 animate-spin" />
              <span className="text-xs text-gray-500">Checking what's missing…</span>
            </div>
          )}

          {/* Guidance once we have details */}
          {!checking && hasDetails && (
            <div className="mt-3 space-y-2">
              {/* Step-grouped missing fields */}
              {Object.entries(byStep).map(([step, { stepLabel, fields }]) => (
                <div key={step} className={`rounded-lg border px-3 py-2 ${STEP_COLORS[step] || 'text-gray-400 bg-white/5 border-white/10'}`}>
                  <p className="text-[11px] font-bold uppercase tracking-wider mb-1">{stepLabel}</p>
                  <ul className="space-y-0.5">
                    {fields.map((f, i) => (
                      <li key={i} className="text-[11px] flex items-center gap-1">
                        <span className="w-1 h-1 rounded-full bg-current flex-shrink-0" />
                        {f.label}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}

              {/* Unknown/raw errors toggle */}
              {unknown.length > 0 && (
                <div>
                  <button onClick={() => setExpanded(e => !e)}
                    className="flex items-center gap-1 text-[11px] text-gray-500 hover:text-gray-300 transition-colors">
                    {expanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                    {unknown.length} additional validation issue{unknown.length > 1 ? 's' : ''}
                  </button>
                  {expanded && (
                    <ul className="mt-1 space-y-0.5 pl-2">
                      {unknown.map((e, i) => (
                        <li key={i} className="text-[10px] text-gray-500 font-mono break-all">{e}</li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              {/* Completion % */}
              {details.percentComplete !== null && (
                <p className="text-[11px] text-gray-500">
                  Form {Math.round(details.percentComplete)}% complete
                </p>
              )}
            </div>
          )}

          {/* No details — generic guidance */}
          {!checking && !hasDetails && (
            <p className="text-xs text-red-400/70 mt-1">
              Some required fields are missing. Go back to Locations &amp; MIDs or Banking to complete them.
            </p>
          )}
        </div>
      </div>

      {/* Fix button */}
      {!checking && onNavigate && (
        <div className="border-t border-red-500/20 px-5 py-3 flex items-center gap-3">
          <button
            onClick={() => onNavigate(targetStep)}
            className="flex items-center gap-2 text-xs font-bold text-black bg-amber-500 hover:bg-amber-400 px-4 py-2 rounded-lg transition-all"
          >
            <Wrench className="w-3.5 h-3.5" />
            Fix in {byStep[targetStep]?.stepLabel || 'Locations & MIDs'}
          </button>
          <span className="text-[11px] text-gray-500">Fill in the missing fields, then return here to sign.</span>
        </div>
      )}
    </div>
  );
}