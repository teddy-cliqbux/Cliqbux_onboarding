import { useState } from 'react';
import { Landmark, ClipboardList, CheckCircle, Loader2, ChevronDown, ShieldCheck } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import ManualEntryForm from './ManualEntryForm';

export default function Step2Verification({ profile, onVerified }) {
  const [mode, setMode] = useState(profile?.isManualMode ? 'manual' : 'plaid'); // 'plaid' | 'manual'
  const [plaidState, setPlaidState] = useState('idle'); // 'idle' | 'loading' | 'linked'
  const [plaidAccounts, setPlaidAccounts] = useState([]);
  const [linkToken, setLinkToken] = useState(null);
  const [error, setError] = useState('');

  const initPlaid = async () => {
    if (plaidState !== 'idle') return;
    setPlaidState('loading');
    setError('');
    try {
      const res = await base44.functions.invoke('createPlaidLinkToken', { corporateId: profile?.corporateId });
      const token = res.data?.link_token;
      if (!token) throw new Error('Could not initialize Plaid. Please try again.');
      setLinkToken(token);
      openPlaidLink(token);
    } catch (err) {
      setError(err.message || 'Plaid initialization failed.');
      setPlaidState('idle');
    }
  };

  const openPlaidLink = (token) => {
    if (!window.Plaid) {
      setError('Plaid is not available in this browser. Please use manual entry.');
      setPlaidState('idle');
      return;
    }
    const handler = window.Plaid.create({
      token,
      onSuccess: async (publicToken, metadata) => {
        try {
          // Fetch bank account details — account_id may be null for multi-account flows
          const bankRes = await base44.functions.invoke('exchangePlaidToken', {
            publicToken,
            accountId: metadata.account_id || ''
          });

          if (bankRes.data?.error) throw new Error(bankRes.data.error);

          const accounts = bankRes.data?.accounts || [];
          setPlaidAccounts(accounts);

          // Best-effort IDV fetch — never block the success flow if this fails
          let identity = null;
          const idvId = metadata.identity_verification_id;
          if (idvId) {
            try {
              const idvRes = await base44.functions.invoke('exchangePlaidToken', {
                identityVerificationId: idvId
              });
              identity = idvRes.data?.identity || null;
            } catch (_) { /* non-critical */ }
          }

          // Persist identity fields if present
          if (identity) {
            const updatePayload = { corporateId: profile?.corporateId };
            const fields = ['firstName','lastName','dobYear','dobMonth','dobDay','ssn','homeStreet','homeCity','homeState','homeZip'];
            fields.forEach(f => { if (identity[f]) updatePayload[f] = identity[f]; });
            try {
              await base44.functions.invoke('updateMerchantProfile', updatePayload);
            } catch (_) { /* non-critical */ }
          }

          setPlaidState('linked');
          onVerified({ plaidAccounts: accounts, identity });
        } catch (err) {
          setError('Failed to retrieve account details. Please try manual entry.');
          setPlaidState('idle');
        }
      },
      onExit: (err) => {
        setPlaidState('idle');
        if (err) setError('Bank connection cancelled. Try again or enter details manually.');
      }
    });
    handler.open();
  };

  const switchToManual = async () => {
    setMode('manual');
    await base44.functions.invoke('updateMerchantProfile', {
      corporateId: profile?.corporateId,
      isManualMode: true
    });
  };

  const handleManualSaved = (formData) => {
    onVerified({ plaidAccounts: [], identity: formData, isManual: true });
  };

  return (
    <div className="flex flex-col">
      <div className="px-8 pt-8 pb-6 border-b border-gray-100">
        <div className="inline-flex items-center gap-2 bg-blue-50 text-blue-700 text-xs font-semibold px-3 py-1.5 rounded-full mb-3">
          <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
          STEP 2 OF 3 — IDENTITY & BANK VERIFICATION
        </div>
        <h2 className="text-2xl font-bold text-gray-900 mb-1.5">Verify Your Identity & Banking</h2>
        <p className="text-gray-500 text-sm">
          Securely connect your bank to auto-fill your identity details, or enter them manually.
        </p>
      </div>

      <div className="px-8 py-8 flex flex-col gap-6">
        {mode === 'plaid' && plaidState !== 'linked' && (
          <>
            {/* Primary Plaid CTA */}
            <button
              onClick={initPlaid}
              disabled={plaidState === 'loading'}
              className="w-full flex flex-col items-center justify-center gap-4 bg-gray-900 hover:bg-gray-800 disabled:bg-gray-700 text-white rounded-2xl p-8 transition-all shadow-xl"
            >
              {plaidState === 'loading' ? (
                <Loader2 className="w-10 h-10 animate-spin text-amber-400" />
              ) : (
                <div className="w-16 h-16 rounded-2xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center">
                  <Landmark className="w-8 h-8 text-amber-400" />
                </div>
              )}
              <div className="text-center">
                <p className="text-xl font-bold mb-1">
                  {plaidState === 'loading' ? 'Opening Plaid...' : 'Connect Bank Fast via Plaid'}
                </p>
                <p className="text-gray-400 text-sm">
                  Securely authenticates your identity and bank accounts in under 2 minutes
                </p>
              </div>
              <div className="flex items-center gap-6 text-xs text-gray-400">
                <span className="flex items-center gap-1.5"><ShieldCheck className="w-3.5 h-3.5 text-green-400" /> Bank-level encryption</span>
                <span className="flex items-center gap-1.5"><CheckCircle className="w-3.5 h-3.5 text-green-400" /> Auto-fills your info</span>
              </div>
            </button>

            {error && (
              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">{error}</p>
            )}

            {/* Manual fallback link */}
            <div className="text-center">
              <button
                onClick={switchToManual}
                className="text-sm text-gray-400 hover:text-gray-600 underline underline-offset-2 transition-colors"
              >
                Enter Details Manually
              </button>
            </div>
          </>
        )}

        {/* Plaid linked success */}
        {mode === 'plaid' && plaidState === 'linked' && (
          <div className="flex flex-col items-center gap-4 py-8">
            <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center">
              <CheckCircle className="w-8 h-8 text-green-600" />
            </div>
            <div className="text-center">
              <p className="text-lg font-bold text-gray-900">Bank Connected!</p>
              <p className="text-gray-500 text-sm mt-1">
                {plaidAccounts.length} account{plaidAccounts.length !== 1 ? 's' : ''} found. Proceeding to locations setup…
              </p>
            </div>
          </div>
        )}

        {/* Manual entry */}
        {mode === 'manual' && (
          <div>
            <div className="flex items-center gap-3 mb-6">
              <div className="w-9 h-9 rounded-lg bg-blue-100 flex items-center justify-center flex-shrink-0">
                <ClipboardList className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <p className="font-semibold text-gray-800 text-sm">Manual Information Entry</p>
                <p className="text-xs text-gray-400">All fields are encrypted and used only for processor enrollment.</p>
              </div>
              <button
                onClick={() => setMode('plaid')}
                className="ml-auto text-xs text-blue-600 hover:underline"
              >
                ← Use Plaid instead
              </button>
            </div>
            <ManualEntryForm corporateId={profile?.corporateId} onSaved={handleManualSaved} />
          </div>
        )}
      </div>
    </div>
  );
}