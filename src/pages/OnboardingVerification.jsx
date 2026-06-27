import { useState } from 'react';
import { ArrowLeft, Lock, Loader2, CheckCircle2, AlertCircle, ShieldCheck } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import SignerRoster from '@/components/onboarding/SignerRoster';

export default function OnboardingVerification({ profile, locations, onBack, onComplete }) {
  const [signers, setSigners] = useState([]);
  const [allVerified, setAllVerified] = useState(false);
  const [totalOwnership, setTotalOwnership] = useState(0);

  // Board submission state
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  // Note: listDocuments / getDocuments (Elavon direct API) are not used in the MSPWare flow.
  // After submitToMSP fires, MSPWare/PulsePoint generates the Merchant Processing Agreement
  // and sends it to the merchant for e-signature directly via email.

  // Called when merchant clicks "I Have Reviewed — Submit Application"
  const handleSigningComplete = async () => {
    if (submitting) return;
    setSubmitting(true);
    setSubmitError('');
    try {
      const res = await base44.functions.invoke('submitToMSP', { corporateId: profile.corporateId });
      const data = res.data;
      if (data?.allSubmitted || data?.success) {
        onComplete();
      } else {
        setSubmitError('Submission encountered errors. Our team has been notified — please contact support if this persists.');
      }
    } catch (err) {
      setSubmitError(err.message || 'Submission failed. Please contact support.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRosterChange = (valid, totalPct) => {
    setAllVerified(valid);
    setTotalOwnership(totalPct);
  };

  return (
    <div className="flex flex-col">
      {/* Header */}
      <div className="px-8 pt-8 pb-6 border-b border-white/10">
        <div className="inline-flex items-center gap-2 bg-purple-500/15 text-purple-300 text-xs font-semibold px-3 py-1.5 rounded-full mb-3">
          <span className="w-1.5 h-1.5 rounded-full bg-purple-400" />
          STEP 3 OF 3 — IDENTITY &amp; SIGNING
        </div>
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold text-white mb-1.5">Principal &amp; Corporate Verification</h2>
            <p className="text-gray-400 text-sm">Verify all beneficial owners, then review and sign your processing agreement.</p>
          </div>
          <button
            onClick={onBack}
            className="flex-shrink-0 flex items-center gap-2 text-sm font-medium text-gray-400 border border-white/15 hover:border-white/30 hover:bg-white/5 px-4 py-2 rounded-xl transition-all"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </button>
        </div>
      </div>

      <div className="px-8 py-6 flex flex-col gap-8">
        {/* Signer Roster */}
        <SignerRoster
          profile={profile}
          onValidChange={handleRosterChange}
        />

        {/* Submit Section */}
        <div className="flex flex-col gap-4">

          {/* Locked: signers not yet verified */}
          {!allVerified && (
            <div className="border-2 border-dashed border-white/10 rounded-xl flex flex-col items-center justify-center py-14 gap-3 bg-white/5">
              <div className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center">
                <Lock className="w-6 h-6 text-gray-500" />
              </div>
              <p className="text-sm font-semibold text-gray-400">Submission Locked</p>
              <p className="text-xs text-gray-500 text-center max-w-xs">
                All beneficial owners with ≥25% ownership must be verified or have a pending invitation before proceeding.
              </p>
            </div>
          )}

          {/* Consent block — shown once signers are verified */}
          {allVerified && (
            <div className="border border-green-500/30 bg-green-500/10 rounded-xl flex items-start gap-3 px-5 py-4">
              <ShieldCheck className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-green-300">Ready to Submit</p>
                <p className="text-xs text-green-400 mt-1">
                  By clicking the button below you authorize Cliqbux to submit your merchant processing
                  application to Elavon on your behalf. You will receive your Merchant Processing Agreement
                  and Operating Guide for electronic signature by email after submission.
                </p>
              </div>
            </div>
          )}

          {/* Submit button */}
          {allVerified && (
            <div className="flex flex-col gap-2">
              {submitError && (
                <div className="flex items-start gap-3 bg-red-500/10 border border-red-500/30 rounded-xl px-5 py-4">
                  <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-red-300">{submitError}</p>
                </div>
              )}
              <button
                onClick={handleSigningComplete}
                disabled={submitting}
                className="w-full flex items-center justify-center gap-2 text-sm font-bold text-white bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 disabled:from-gray-600 disabled:to-gray-600 disabled:text-gray-400 py-3.5 rounded-xl transition-all shadow-lg shadow-green-900/30"
              >
                {submitting ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Submitting application...</>
                ) : (
                  <><CheckCircle2 className="w-4 h-4" /> I Agree — Submit Application</>
                )}
              </button>
              <p className="text-center text-xs text-gray-500">
                Your e-signature documents will be sent by email after submission
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}