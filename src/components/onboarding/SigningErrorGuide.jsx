import { useState, useEffect } from 'react';
import { AlertCircle, Loader2, ChevronDown, ChevronRight, Wrench, ShieldAlert } from 'lucide-react';
import { invokePortalFunction } from '@/lib/merchantAuthFetch';

// Maps MSPWare field names → human-readable labels + which onboarding step fixes them
const FIELD_MAP = {
  deposit_account_no:        { label: 'Bank Account Number',           step: 'banking',   stepLabel: 'Banking Setup' },
  deposit_account_rtg:       { label: 'Bank Routing Number',           step: 'banking',   stepLabel: 'Banking Setup' },
  deposit_account_type:      { label: 'Account Type (checking/savings)',step: 'banking',   stepLabel: 'Banking Setup' },
  mcc:                       { label: 'MCC Code',                      step: 'locations', stepLabel: 'Locations & MIDs' },
  monthly_sales:             { label: 'Monthly Card Volume',           step: 'locations', stepLabel: 'Locations & MIDs' },
  average_sales:             { label: 'Average Transaction',           step: 'locations', stepLabel: 'Locations & MIDs' },
  highest_ticket:            { label: 'Highest Ticket Amount',         step: 'locations', stepLabel: 'Locations & MIDs' },
  cp_percent:                { label: 'Card-Present %',                step: 'locations', stepLabel: 'Locations & MIDs' },
  pricing_method:            { label: 'Pricing Method',                step: 'locations', stepLabel: 'Locations & MIDs' },
  pricing_category:          { label: 'Pricing Category',              step: 'locations', stepLabel: 'Locations & MIDs' },
  full_dba_name:             { label: 'DBA / Store Name',              step: 'locations', stepLabel: 'Locations & MIDs' },
  industry_type:             { label: 'Industry Type',                 step: 'locations', stepLabel: 'Locations & MIDs' },
  tin:                       { label: 'Federal EIN',                   step: 'locations', stepLabel: 'Business Info' },
  ownership_type:            { label: 'Business Entity Type',          step: 'locations', stepLabel: 'Business Info' },
  year_business_established: { label: 'Year Established',              step: 'locations', stepLabel: 'Business Info' },
  ownership_years:           { label: 'Years in Business',             step: 'locations', stepLabel: 'Business Info' },
  owner_dob:                 { label: 'Owner Date of Birth',           step: 'verify',    stepLabel: 'Identity Verification' },
  owner_id_number:           { label: 'Owner SSN',                     step: 'verify',    stepLabel: 'Identity Verification' },
  owner_address:             { label: 'Owner Home Address',            step: 'verify',    stepLabel: 'Identity Verification' },
  owner_firstname:           { label: 'Owner First Name',              step: 'verify',    stepLabel: 'Identity Verification' },
  owner_lastname:            { label: 'Owner Last Name',               step: 'verify',    stepLabel: 'Identity Verification' },
  business_address:          { label: 'Business Street Address',       step: 'locations', stepLabel: 'Locations & MIDs' },
  business_city:             { label: 'Business City',                 step: 'locations', stepLabel: 'Locations & MIDs' },
  business_state_usa:        { label: 'Business State',                step: 'locations', stepLabel: 'Locations & MIDs' },
  business_zipcode:          { label: 'Business ZIP Code',             step: 'locations', stepLabel: 'Locations & MIDs' },
};

const STEP_ORDER = ['verify', 'locations', 'banking'];

// Detect known bad data patterns from the raw form that MSPWare won't surface as field errors
function detectRawFormIssues(rawForm) {
  const issues = [];
  if (!rawForm) return issues;

  const owners = rawForm.owners || [];
  for (const owner of owners) {
    // Detect sequential SSN (e.g. 123456789, 987654321, 111111111)
    const ssn = String(owner.owner_id_number || '').replace(/\D/g, '');
    if (ssn.length === 9) {
      const isSequential = /^(012345678|123456789|234567890|987654321|876543210|111111111|222222222|333333333|444444444|555555555|666666666|777777777|888888888|999999999|000000000|123123123|000000001)$/.test(ssn);
      if (isSequential) {
        issues.push({
          field: 'owner_id_number',
          label: 'Owner SSN appears to be test/sequential data',
          detail: 'The SSN on file is not valid. Please re-enter your real Social Security Number in Identity Verification.',
          step: 'verify',
          stepLabel: 'Identity Verification',
          severity: 'critical',
        });
      }
    }
    // Detect missing DOB
    if (!owner.owner_dob) {
      issues.push({ field: 'owner_dob', label: 'Owner Date of Birth is missing', step: 'verify', stepLabel: 'Identity Verification', severity: 'error' });
    }
    // Detect missing SSN
    if (!ssn) {
      issues.push({ field: 'owner_id_number', label: 'Owner SSN is missing', step: 'verify', stepLabel: 'Identity Verification', severity: 'error' });
    }
  }

  // Detect business address missing house number (just a street name)
  const addr = rawForm.business_address || '';
  if (addr && !/^\d/.test(addr.trim())) {
    issues.push({
      field: 'business_address',
      label: 'Business address is missing street number',
      detail: `"${addr}" does not start with a house/building number. Please re-enter the full address.`,
      step: 'locations',
      stepLabel: 'Locations & MIDs',
      severity: 'error',
    });
  }

  // Detect missing bank account
  if (!rawForm.deposit_account_no || !rawForm.deposit_account_rtg) {
    issues.push({ field: 'deposit_account_no', label: 'Bank account not linked', step: 'banking', stepLabel: 'Banking Setup', severity: 'error' });
  }

  return issues;
}

function categorize(errors) {
  const byStep = {};
  const unknown = [];
  for (const err of errors) {
    const raw = typeof err === 'string' ? err : (err?.message || err?.description || JSON.stringify(err));
    const matched = Object.entries(FIELD_MAP).find(([key]) => raw.toLowerCase().includes(key.toLowerCase()));
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

function primaryStep(byStep, rawIssues) {
  // Prioritize steps with raw issues first
  for (const s of STEP_ORDER) {
    if (rawIssues?.some(i => i.step === s)) return s;
    if (byStep[s]) return s;
  }
  return 'locations';
}

// Step color-coding retired (token restraint pass): the container already frames
// this as an error, so each affected step reads as one quiet neutral group.
const STEP_COLORS = {
  locations: 'text-gray-300 bg-cb-bg border-cb-border',
  banking:   'text-gray-300 bg-cb-bg border-cb-border',
  verify:    'text-gray-300 bg-cb-bg border-cb-border',
};

export default function SigningErrorGuide({ app, onNavigate, onRetry }) {
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
      const res = await invokePortalFunction('getMSPFormStatus', {
        applicationNo: appNo,
        corporateId: app.corporateId,
      });
      const data = res.data;
      if (data) {
        const allErrors = [
          ...(data.completion_errors || []),
          ...(data.data_errors || []),
          ...(data.rule_violations || []),
          ...(data.errors || []),
        ];
        const rawIssues = detectRawFormIssues(data.rawForm);
        setDetails({
          allErrors,
          rawIssues,
          percentComplete: data.percent_complete ?? null,
          signaturesError: data.signaturesError || null,
        });
      }
    } catch (err) {
      // non-fatal — message only, never log raw form data (may contain SSN/bank values)
      console.error('[SigningErrorGuide.loadDetails]', err?.message || 'Unknown error');
    } finally {
      setChecking(false);
    }
  };

  // Per-field rejections surfaced by signApplication from the PUT response —
  // when MSPWare rolls the form back, these are the ACTUAL cause and the
  // raw-form heuristics below misleadingly report everything as missing.
  const processorErrors = (app?.formErrors || []).filter(e => typeof e === 'string' && e.trim());

  const { byStep, unknown } = details ? categorize(details.allErrors) : { byStep: {}, unknown: [] };
  const rawIssues = details?.rawIssues || [];
  const targetStep = primaryStep(byStep, rawIssues);
  const hasDetails = details && (Object.keys(byStep).length > 0 || unknown.length > 0 || rawIssues.length > 0);

  // Group raw issues by step
  const rawByStep = {};
  for (const issue of rawIssues) {
    if (!rawByStep[issue.step]) rawByStep[issue.step] = { stepLabel: issue.stepLabel, issues: [] };
    rawByStep[issue.step].issues.push(issue);
  }

  return (
    <div className="border border-cb-border border-l-2 border-l-cb-danger bg-cb-surface-raised rounded-cb overflow-hidden">
      {/* Header */}
      <div className="flex items-start gap-3 px-5 py-4">
        <AlertCircle className="w-5 h-5 text-cb-danger flex-shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="text-cb-body font-semibold text-white">
            {app.merchantName} — Form Incomplete
          </p>
          <p className="text-cb-body text-gray-400 mt-0.5">
            {app.error || 'Unable to prepare signing package: Merchant application is not complete.'}
          </p>

          {checking && (
            <div className="flex items-center gap-1.5 mt-2">
              <Loader2 className="w-3 h-3 text-gray-400 animate-spin" />
              <span className="text-cb-caption normal-case tracking-normal font-normal text-gray-500">Checking what's missing…</span>
            </div>
          )}

          {/* Actual processor rejections — shown first and always, since they are
              the true cause; the heuristic lists below can be rollback noise */}
          {processorErrors.length > 0 && (
            <div className="mt-3 rounded-cb border px-3 py-2 text-cb-danger bg-cb-bg border-cb-border">
              <p className="text-cb-caption uppercase mb-1.5">Processor Validation Errors</p>
              <ul className="space-y-1">
                {processorErrors.map((e, i) => (
                  <li key={i} className="text-cb-caption normal-case tracking-normal font-normal flex items-start gap-1.5">
                    <ShieldAlert className="w-3 h-3 flex-shrink-0 mt-0.5" /> {e}
                  </li>
                ))}
              </ul>
              <p className="text-cb-caption normal-case tracking-normal font-normal text-gray-500 mt-1.5">
                Note: when the processor rejects any value, it may temporarily report other
                fields as missing below — fix the errors above first, then retry.
              </p>
            </div>
          )}

          {!checking && hasDetails && (
            <div className="mt-3 space-y-2">
              {/* Raw issues detected from form data — most actionable, shown first */}
              {Object.entries(rawByStep).map(([step, { stepLabel, issues }]) => (
                <div key={`raw-${step}`} className={`rounded-cb border px-3 py-2 ${STEP_COLORS[step] || 'text-gray-300 bg-cb-bg border-cb-border'}`}>
                  <p className="text-cb-caption uppercase text-gray-500 mb-1.5">{stepLabel}</p>
                  <ul className="space-y-1.5">
                    {issues.map((issue, i) => (
                      <li key={i}>
                        <div className="flex items-start gap-1.5">
                          <ShieldAlert className="w-3 h-3 flex-shrink-0 mt-0.5 text-cb-danger" />
                          <div>
                            <p className="text-cb-caption normal-case tracking-normal font-medium">{issue.label}</p>
                            {issue.detail && <p className="text-cb-caption normal-case tracking-normal font-normal text-gray-500 mt-0.5">{issue.detail}</p>}
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}

              {/* MSPWare field errors (when surfaced) */}
              {Object.entries(byStep).map(([step, { stepLabel, fields }]) => (
                <div key={step} className={`rounded-cb border px-3 py-2 ${STEP_COLORS[step] || 'text-gray-300 bg-cb-bg border-cb-border'}`}>
                  <p className="text-cb-caption uppercase text-gray-500 mb-1">{stepLabel}</p>
                  <ul className="space-y-0.5">
                    {fields.map((f, i) => (
                      <li key={i} className="text-cb-caption normal-case tracking-normal font-normal flex items-center gap-1.5">
                        <span className="w-1 h-1 rounded-full bg-gray-500 flex-shrink-0" />
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
                    className="flex items-center gap-1 text-cb-caption normal-case tracking-normal font-normal text-gray-500 hover:text-white transition-colors">
                    {expanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                    {unknown.length} additional validation issue{unknown.length > 1 ? 's' : ''}
                  </button>
                  {expanded && (
                    <ul className="mt-1 space-y-0.5 pl-2">
                      {unknown.map((e, i) => (
                        <li key={i} className="text-cb-caption normal-case tracking-normal font-normal text-gray-500 font-mono break-all">{e}</li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              {details.percentComplete !== null && (
                <p className="text-cb-caption normal-case tracking-normal font-normal text-gray-500">
                  Form {Math.round(details.percentComplete)}% complete — fix the issues above, then retry signing.
                </p>
              )}
            </div>
          )}

          {/* No field errors but MSPWare still blocked signing */}
          {!checking && !hasDetails && details?.signaturesError && (
            <div className="mt-2 bg-cb-bg border border-cb-border rounded-cb px-3 py-2">
              <p className="text-cb-caption normal-case tracking-normal font-medium text-cb-danger">MSPWare validation error:</p>
              <p className="text-cb-caption normal-case tracking-normal font-normal text-gray-400 mt-0.5">{details.signaturesError}</p>
              <p className="text-cb-caption normal-case tracking-normal font-normal text-gray-500 mt-1">
                Contact Cliqbux support if this persists after verifying all fields are correct.
              </p>
            </div>
          )}

          {!checking && !hasDetails && !details?.signaturesError && (
            <p className="text-cb-body text-gray-400 mt-1">
              Some required fields are missing. Go back to Locations &amp; MIDs or Banking to complete them.
            </p>
          )}
        </div>
      </div>

      {/* Fix buttons — one per affected step */}
      {!checking && (hasDetails || details?.signaturesError) && (
        <div className="border-t border-cb-border px-5 py-3 flex flex-wrap items-center gap-2">
          {onNavigate && STEP_ORDER.filter(s => rawByStep[s] || byStep[s]).map(step => (
            step === 'verify' ? (
              <button key={step}
                onClick={() => onNavigate('verify')}
                className="flex items-center gap-2 text-cb-body font-semibold text-cb-bg bg-cb-accent hover:opacity-90 px-4 py-2 rounded-cb transition-opacity"
              >
                <Wrench className="w-3.5 h-3.5" />
                Update Identity Info Above
              </button>
            ) : (
              <button key={step}
                onClick={() => onNavigate(step)}
                className="flex items-center gap-2 text-cb-body font-semibold text-cb-bg bg-cb-accent hover:opacity-90 px-4 py-2 rounded-cb transition-opacity"
              >
                <Wrench className="w-3.5 h-3.5" />
                Fix in {rawByStep[step]?.stepLabel || byStep[step]?.stepLabel}
              </button>
            )
          ))}
          {onRetry && (
            <button
              onClick={onRetry}
              className="flex items-center gap-2 text-cb-body font-medium text-gray-200 border border-cb-border-strong hover:text-white px-4 py-2 rounded-cb transition-colors"
            >
              Retry Signing
            </button>
          )}
        </div>
      )}
    </div>
  );
}