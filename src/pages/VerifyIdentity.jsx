import { useState, useEffect, useRef, useCallback } from 'react';
import { CheckCircle, Loader2, AlertTriangle, PenLine } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import CliqbuxLogo from '@/components/onboarding/CliqbuxLogo';

const MONTHS = [
  { value: '01', label: 'Jan' }, { value: '02', label: 'Feb' }, { value: '03', label: 'Mar' },
  { value: '04', label: 'Apr' }, { value: '05', label: 'May' }, { value: '06', label: 'Jun' },
  { value: '07', label: 'Jul' }, { value: '08', label: 'Aug' }, { value: '09', label: 'Sep' },
  { value: '10', label: 'Oct' }, { value: '11', label: 'Nov' }, { value: '12', label: 'Dec' },
];
const DAYS = Array.from({ length: 31 }, (_, i) => String(i + 1).padStart(2, '0'));
const currentYear = new Date().getFullYear();
const YEARS = Array.from({ length: 80 }, (_, i) => String(currentYear - 18 - i));

const POLL_MS = 5000;
const BOLDSIGN_ORIGIN = 'https://app.boldsign.com';

const inputCls = 'w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-amber-400';
const labelCls = 'text-xs font-semibold text-gray-600 block mb-1.5';

/**
 * Remote signer landing page — unified Verify + Sign loop.
 * Email links: /verify?token=…&intent=sign
 * Flow: KYC (if needed) → per-MID BoldSign iframes → markSigned → done.
 */
export default function VerifyIdentity() {
  const [token, setToken] = useState('');
  const [intentSign, setIntentSign] = useState(true); // default true for unified invites
  const [signerInfo, setSignerInfo] = useState(null);
  const [legalName, setLegalName] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [phase, setPhase] = useState('loading'); // loading | kyc | signing | done
  const [saving, setSaving] = useState(false);

  const [applications, setApplications] = useState([]);
  const [activeMidIndex, setActiveMidIndex] = useState(0);
  const [signingHint, setSigningHint] = useState('');
  const [loadingSession, setLoadingSession] = useState(false);
  const advancingRef = useRef(false);
  const pollRef = useRef(null);

  const [form, setForm] = useState({
    firstName: '', lastName: '', dobMonth: '', dobDay: '', dobYear: '',
    ssn: '', homeStreet: '', homeCity: '', homeState: '', homeZip: '', corporatePhone: ''
  });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const t = params.get('token');
    const intent = params.get('intent');
    // Legacy links without intent still support KYC-only; new invites always send intent=sign
    const wantsSign = intent !== 'kyc';
    setIntentSign(wantsSign);
    if (!t) { setError('No verification token found. Please use the link from your email.'); setLoading(false); setPhase('kyc'); return; }
    setToken(t);
    loadSigner(t, wantsSign);
  }, []);

  const loadSigningSession = useCallback(async (t) => {
    setLoadingSession(true);
    setSigningHint('');
    try {
      const res = await base44.functions.invoke('verifySignerToken', { action: 'getSigningSession', token: t });
      if (res.data?.needsKyc) {
        setPhase('kyc');
        return;
      }
      if (res.data?.error && !res.data?.success) {
        setSigningHint(res.data.error);
        setPhase('signing');
        return;
      }
      if (res.data?.allSigned) {
        setPhase('done');
        return;
      }
      const apps = res.data?.applications || [];
      setApplications(apps);
      if (res.data?.pendingPrep || apps.length === 0) {
        setSigningHint(res.data?.hint || 'Agreements are still being prepared. This page will retry automatically.');
      }
      const firstUnsigned = apps.findIndex(a => !a.signed && a.signingUrl);
      setActiveMidIndex(firstUnsigned >= 0 ? firstUnsigned : 0);
      setPhase('signing');
    } catch (err) {
      setSigningHint(err.message || 'Unable to load signing session.');
      setPhase('signing');
    } finally {
      setLoadingSession(false);
    }
  }, []);

  const markDone = useCallback(async (t) => {
    try {
      await base44.functions.invoke('verifySignerToken', { action: 'markSigned', token: t });
    } catch (err) {
      console.error('[VerifyIdentity.markSigned]', err?.message || 'Unknown error');
    }
    setPhase('done');
  }, []);

  const advanceAfterMidSigned = useCallback(async (apps, midIdx, t) => {
    if (advancingRef.current) return;
    advancingRef.current = true;
    try {
      const next = apps.findIndex((a, i) => i > midIdx && !a.signed);
      if (next >= 0) {
        setActiveMidIndex(next);
        return;
      }
      await markDone(t);
    } finally {
      setTimeout(() => { advancingRef.current = false; }, 800);
    }
  }, [markDone]);

  const loadSigner = async (t, wantsSign) => {
    setLoading(true);
    try {
      const res = await base44.functions.invoke('verifySignerToken', { action: 'get', token: t });
      if (res.data?.error) throw new Error(res.data.error);
      const s = res.data.signer;
      setSignerInfo(s);
      setLegalName(res.data.legalName || '');
      setForm({
        firstName: s.firstName || '',
        lastName: s.lastName || '',
        dobMonth: s.dobMonth || '',
        dobDay: s.dobDay || '',
        dobYear: s.dobYear || '',
        ssn: s.ssn || '',
        homeStreet: s.homeStreet || '',
        homeCity: s.homeCity || '',
        homeState: s.homeState || '',
        homeZip: s.homeZip || '',
        corporatePhone: s.corporatePhone || '',
      });

      if (s.identityStatus === 'Signed') {
        setPhase('done');
      } else if (s.identityStatus === 'Verified' && wantsSign) {
        await loadSigningSession(t);
      } else {
        setPhase('kyc');
      }
    } catch (err) {
      setError(err.message || 'Invalid or expired verification link.');
      setPhase('kyc');
    } finally {
      setLoading(false);
    }
  };

  // BoldSign postMessage (snappy) + poll (ground truth)
  useEffect(() => {
    if (phase !== 'signing' || !token) return;

    const onMessage = (event) => {
      if (event.origin !== BOLDSIGN_ORIGIN) return;
      const action = event.data?.action || event.data?.type;
      if (action !== 'onDocumentSigned') return;
      setApplications(prev => {
        const next = prev.map((a, i) => i === activeMidIndex ? { ...a, signed: true, signingUrl: null } : a);
        advanceAfterMidSigned(next, activeMidIndex, token);
        return next;
      });
    };
    window.addEventListener('message', onMessage);

    pollRef.current = setInterval(async () => {
      try {
        const res = await base44.functions.invoke('verifySignerToken', { action: 'getSigningSession', token });
        if (res.data?.allSigned) {
          await markDone(token);
          return;
        }
        const apps = res.data?.applications || [];
        if (apps.length) {
          setApplications(apps);
          const cur = apps[activeMidIndex];
          if (cur?.signed) {
            await advanceAfterMidSigned(apps, activeMidIndex, token);
          }
        }
      } catch (err) {
        console.error('[VerifyIdentity.poll]', err?.message || 'Unknown error');
      }
    }, POLL_MS);

    return () => {
      window.removeEventListener('message', onMessage);
      clearInterval(pollRef.current);
    };
  }, [phase, token, activeMidIndex, advanceAfterMidSigned, markDone]);

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.dobMonth || !form.dobDay || !form.dobYear) { setError('Date of birth is required.'); return; }
    if (!form.ssn || form.ssn.replace(/\D/g,'').length !== 9) { setError('A valid 9-digit SSN is required.'); return; }
    if (!form.homeStreet || !form.homeCity || !form.homeState || !form.homeZip) { setError('Home address is required.'); return; }
    setSaving(true);
    setError('');
    try {
      const res = await base44.functions.invoke('verifySignerToken', {
        action: 'save',
        token,
        signerData: { ...form, ssn: form.ssn.replace(/\D/g,'') }
      });
      if (res.data?.error) throw new Error(res.data.error);
      setSignerInfo(res.data.signer);
      // Unified loop: continue into signing (no second email)
      if (intentSign !== false) {
        await loadSigningSession(token);
      } else {
        setPhase('done');
      }
    } catch (err) {
      setError(err.message || 'Verification failed. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const activeApp = applications[activeMidIndex];
  const iframeUrl = activeApp && !activeApp.signed ? activeApp.signingUrl : null;

  return (
    <div style={{ background: '#111827', minHeight: '100vh', fontFamily: 'Inter, sans-serif', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '40px 16px' }}>
      <div className="mb-8">
        <CliqbuxLogo />
      </div>

      <div style={{ background: '#fff', borderRadius: 20, boxShadow: '0 25px 50px rgba(0,0,0,0.4)', width: '100%', maxWidth: phase === 'signing' ? 920 : 480, padding: phase === 'signing' ? 24 : 32, transition: 'max-width 0.2s ease' }}>
        {(loading || phase === 'loading') && (
          <div className="flex flex-col items-center gap-4 py-10">
            <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
            <p className="text-gray-500 text-sm">Loading your session...</p>
          </div>
        )}

        {!loading && error && !signerInfo && (
          <div className="flex flex-col items-center gap-4 py-6 text-center">
            <div className="w-14 h-14 rounded-full bg-red-50 flex items-center justify-center">
              <AlertTriangle className="w-7 h-7 text-red-500" />
            </div>
            <div>
              <p className="font-bold text-gray-900 mb-1">Link Invalid</p>
              <p className="text-sm text-gray-500">{error}</p>
            </div>
          </div>
        )}

        {!loading && phase === 'done' && (
          <div className="flex flex-col items-center gap-4 py-8 text-center">
            <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center">
              <CheckCircle className="w-9 h-9 text-green-600" />
            </div>
            <div>
              <p className="font-bold text-gray-900 text-lg mb-1">You&apos;re all set!</p>
              <p className="text-sm text-gray-500">
                Thank you, {signerInfo?.firstName}. Your identity is verified and your signing is complete.
              </p>
            </div>
            <p className="text-xs text-gray-400 mt-2">You may safely close this window.</p>
          </div>
        )}

        {!loading && phase === 'kyc' && signerInfo && (
          <>
            <div className="mb-6">
              <p className="text-xs font-semibold text-amber-600 uppercase tracking-widest mb-1">Secure Identity Verification</p>
              <h2 className="text-xl font-bold text-gray-900">Hello, {signerInfo.firstName}</h2>
              {legalName && (
                <p className="text-sm text-gray-500 mt-0.5">
                  You&apos;ve been added as a beneficial owner for <strong>{legalName}</strong>. Confirm your identity, then you&apos;ll sign the agreement on the next screen.
                </p>
              )}
            </div>

            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>First Name</label>
                  <input className={inputCls} value={form.firstName} onChange={e => set('firstName', e.target.value)} />
                </div>
                <div>
                  <label className={labelCls}>Last Name</label>
                  <input className={inputCls} value={form.lastName} onChange={e => set('lastName', e.target.value)} />
                </div>
              </div>

              <div>
                <label className={labelCls}>Date of Birth</label>
                <div className="flex gap-2">
                  <select className="flex-1 text-sm border border-gray-200 rounded-lg px-2 py-2.5 focus:outline-none focus:ring-2 focus:ring-amber-400 bg-white" value={form.dobMonth} onChange={e => set('dobMonth', e.target.value)}>
                    <option value="">Month</option>
                    {MONTHS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                  </select>
                  <select className="w-20 text-sm border border-gray-200 rounded-lg px-2 py-2.5 focus:outline-none focus:ring-2 focus:ring-amber-400 bg-white" value={form.dobDay} onChange={e => set('dobDay', e.target.value)}>
                    <option value="">Day</option>
                    {DAYS.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                  <select className="w-24 text-sm border border-gray-200 rounded-lg px-2 py-2.5 focus:outline-none focus:ring-2 focus:ring-amber-400 bg-white" value={form.dobYear} onChange={e => set('dobYear', e.target.value)}>
                    <option value="">Year</option>
                    {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label className={labelCls}>Social Security Number (SSN)</label>
                <input type="password" maxLength={9} className={inputCls} value={form.ssn} onChange={e => set('ssn', e.target.value.replace(/\D/g,'').slice(0,9))} placeholder="9 digits — encrypted" />
                {form.ssn.length > 0 && form.ssn.length < 9 && <p className="text-xs text-gray-400 mt-1">{form.ssn.length}/9 digits</p>}
              </div>

              <div>
                <label className={labelCls}>Home Address</label>
                <input className={inputCls} value={form.homeStreet} onChange={e => set('homeStreet', e.target.value)} placeholder="123 Main St" />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <input className={`${inputCls} col-span-1`} value={form.homeCity} onChange={e => set('homeCity', e.target.value)} placeholder="City" />
                <input className={inputCls} value={form.homeState} onChange={e => set('homeState', e.target.value)} placeholder="ST" maxLength={2} />
                <input className={inputCls} value={form.homeZip} onChange={e => set('homeZip', e.target.value)} placeholder="ZIP" />
              </div>

              <div>
                <label className={labelCls}>Phone Number</label>
                <input type="tel" className={inputCls} value={form.corporatePhone} onChange={e => set('corporatePhone', e.target.value)} placeholder="10-digit phone" />
              </div>

              {error && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}

              <button
                type="submit"
                disabled={saving}
                className="w-full flex items-center justify-center gap-2 text-sm font-bold text-white bg-gray-900 hover:bg-gray-800 disabled:bg-gray-400 py-3 rounded-xl transition-all mt-1"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                {saving ? 'Saving...' : 'Continue to Sign'}
              </button>
            </form>
          </>
        )}

        {!loading && phase === 'signing' && (
          <div className="flex flex-col gap-4">
            <div className="flex items-start gap-3">
              <PenLine className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
              <div>
                <h2 className="text-lg font-bold text-gray-900">Sign Merchant Processing Agreement</h2>
                <p className="text-sm text-gray-500 mt-0.5">
                  {legalName ? <>For <strong>{legalName}</strong> — </> : null}
                  sign each agreement below. This page advances automatically.
                </p>
              </div>
            </div>

            {applications.length > 1 && (
              <div className="flex flex-wrap gap-2">
                {applications.map((app, i) => (
                  <button
                    key={app.mspApplicationNo}
                    type="button"
                    onClick={() => setActiveMidIndex(i)}
                    className={`text-xs font-medium px-3 py-1.5 rounded-lg border ${
                      app.signed
                        ? 'border-green-200 bg-green-50 text-green-700'
                        : i === activeMidIndex
                        ? 'border-amber-300 bg-amber-50 text-amber-800'
                        : 'border-gray-200 text-gray-500'
                    }`}
                  >
                    {app.signed ? '✓ ' : ''}{app.merchantName}
                  </button>
                ))}
              </div>
            )}

            {(loadingSession || signingHint) && !iframeUrl && (
              <div className="rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm text-amber-900 flex items-start gap-2">
                {loadingSession && <Loader2 className="w-4 h-4 animate-spin flex-shrink-0 mt-0.5" />}
                <div>
                  <p>{signingHint || 'Loading signing documents…'}</p>
                  <button
                    type="button"
                    onClick={() => loadSigningSession(token)}
                    className="mt-2 text-amber-700 font-semibold hover:underline"
                  >
                    Refresh
                  </button>
                </div>
              </div>
            )}

            {iframeUrl && (
              <div className="rounded-xl border border-gray-200 overflow-hidden">
                <iframe
                  key={`${activeApp?.mspApplicationNo}-${iframeUrl}`}
                  src={iframeUrl}
                  title={`Sign — ${activeApp?.merchantName}`}
                  className="w-full"
                  style={{ height: 640, border: 'none', display: 'block' }}
                  allow="same-origin"
                />
              </div>
            )}

            {activeApp?.error && !iframeUrl && (
              <p className="text-sm text-red-600">{activeApp.error}</p>
            )}
          </div>
        )}
      </div>

      <p className="text-gray-600 text-xs mt-6">
        Secured by <span className="text-amber-500 font-semibold">Cliqbux</span> · onboarding.cliqbux.com
      </p>
    </div>
  );
}
