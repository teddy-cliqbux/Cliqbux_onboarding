import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { AlertTriangle, CheckCircle, Download, Loader2, PenLine, Eraser } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { appParams } from '@/lib/app-params';
import CliqbuxLogo from '@/components/onboarding/CliqbuxLogo';
import { emptyW9Fields, validateW9Fields } from '@/lib/w9Model';
import {
  W9_PAD_CSS_HEIGHT,
  bitmapSizeForPad,
  mapPointerToCanvas,
} from '@/lib/w9SignaturePad';

const FN = 'completeUnderwritingRequest';

const TAX_CLASSES = [
  { value: 'individual', label: 'Individual / sole proprietor' },
  { value: 'c_corp', label: 'C Corporation' },
  { value: 's_corp', label: 'S Corporation' },
  { value: 'partnership', label: 'Partnership' },
  { value: 'trust', label: 'Trust / estate' },
  { value: 'llc', label: 'Limited liability company (LLC)' },
  { value: 'other', label: 'Other (see instructions)' },
];

const LLC_CLASSES = [
  { value: 'C', label: 'C — taxed as C corporation' },
  { value: 'S', label: 'S — taxed as S corporation' },
  { value: 'P', label: 'P — taxed as partnership' },
  { value: 'D', label: 'D — disregarded entity' },
];

const inputCls =
  'w-full text-sm border border-gray-200 rounded-cb px-3 py-2.5 bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-cb-accent/40';
const labelCls = 'text-cb-caption uppercase text-gray-500 block mb-1.5';

async function invokeUw(payload) {
  const viaFetch = async () => {
    const res = await fetch(`/api/apps/${appParams.appId}/functions/${FN}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    let data = null;
    try {
      data = await res.json();
    } catch {
      /* ignore */
    }
    if (!res.ok) {
      const err = new Error(data?.error || `Request failed (${res.status})`);
      err.status = res.status;
      err.code = data?.code;
      throw err;
    }
    return { data };
  };

  try {
    const res = await base44.functions.invoke(FN, payload);
    if (res?.data?.error && !res?.data?.success) {
      const err = new Error(res.data.error);
      err.code = res.data.code;
      throw err;
    }
    return res;
  } catch (first) {
    try {
      return await viaFetch();
    } catch (second) {
      throw second.status ? second : first;
    }
  }
}

function isExpiredError(err) {
  if (!err) return false;
  if (err.status === 410) return true;
  const code = String(err.code || '').toUpperCase();
  return code === 'TOKEN_EXPIRED' || code === 'TOKEN_CANCELLED';
}

function formatTinDisplay(tin, tinType) {
  const d = String(tin || '').replace(/\D/g, '').slice(0, 9);
  if (d.length !== 9) return d;
  if (String(tinType).toLowerCase() === 'ssn') {
    return `${d.slice(0, 3)}-${d.slice(3, 5)}-${d.slice(5)}`;
  }
  return `${d.slice(0, 2)}-${d.slice(2)}`;
}

function typedSignatureToDataUrl(name) {
  const text = String(name || '').trim();
  if (!text) return null;
  const canvas = document.createElement('canvas');
  canvas.width = 560;
  canvas.height = 120;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#111827';
  ctx.font = 'italic 32px Georgia, "Times New Roman", serif';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 16, canvas.height / 2);
  return canvas.toDataURL('image/png');
}

export default function UnderwritingW9Sign() {
  const { token: routeToken } = useParams();
  const [phase, setPhase] = useState('loading');
  const [fields, setFields] = useState(emptyW9Fields());
  const [agentNote, setAgentNote] = useState('');
  const [midLabel, setMidLabel] = useState('');
  const [recipientName, setRecipientName] = useState('');
  const [signedPdfUrl, setSignedPdfUrl] = useState('');
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState([]);
  const [submitting, setSubmitting] = useState(false);

  const [signMode, setSignMode] = useState('draw');
  const [typedName, setTypedName] = useState('');
  const canvasRef = useRef(null);
  const drawingRef = useRef(false);
  const hasInkRef = useRef(false);
  const pointerIdRef = useRef(null);

  const rawToken = String(routeToken || '').trim();

  const loadRequest = useCallback(async () => {
    if (!rawToken) {
      setError('No link token found. Please use the link from your email or text message.');
      setPhase('error');
      return;
    }
    setPhase('loading');
    setError('');
    try {
      const res = await invokeUw({ action: 'get', token: rawToken });
      const data = res.data || {};
      setFields({ ...emptyW9Fields(), ...(data.fields || {}) });
      setAgentNote(data.agentNote || '');
      setMidLabel(data.midLabel || '');
      setRecipientName(data.recipientName || '');

      if (data.viewOnly || data.signedPdfUrl) {
        setSignedPdfUrl(data.signedPdfUrl || '');
        setPhase('signed');
        return;
      }

      setPhase('form');
    } catch (err) {
      if (isExpiredError(err)) {
        setError(err.message || 'This W-9 link has expired.');
        setPhase('expired');
        return;
      }
      setError(err.message || 'Unable to load this W-9 request.');
      setPhase('error');
    }
  }, [rawToken]);

  useEffect(() => {
    loadRequest();
  }, [loadRequest]);

  const setField = (key, value) => setFields((prev) => ({ ...prev, [key]: value }));

  const prepCanvasSurface = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const cssWidth = canvas.clientWidth || canvas.parentElement?.clientWidth || 560;
    const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
    const { width, height, dpr: ratio } = bitmapSizeForPad(cssWidth, W9_PAD_CSS_HEIGHT, dpr);
    canvas.width = width;
    canvas.height = height;
    canvas.style.height = `${W9_PAD_CSS_HEIGHT}px`;
    const ctx = canvas.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(ratio, ratio);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, cssWidth, W9_PAD_CSS_HEIGHT);
    ctx.strokeStyle = '#111827';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    hasInkRef.current = false;
  }, []);

  useEffect(() => {
    if (phase !== 'sign' || signMode !== 'draw') return undefined;
    const id = requestAnimationFrame(() => prepCanvasSurface());
    const onResize = () => {
      // Resize clears ink — only while idle (not mid-stroke)
      if (!drawingRef.current) prepCanvasSurface();
    };
    window.addEventListener('resize', onResize);
    return () => {
      cancelAnimationFrame(id);
      window.removeEventListener('resize', onResize);
    };
  }, [phase, signMode, prepCanvasSurface]);

  const handleContinue = (e) => {
    e.preventDefault();
    const validation = validateW9Fields(fields);
    if (!validation.ok) {
      setFieldErrors(validation.errors);
      return;
    }
    setFieldErrors([]);
    setTypedName(fields.signatureName || fields.name || '');
    setPhase('sign');
    hasInkRef.current = false;
  };

  const startDraw = (evt) => {
    if (signMode !== 'draw') return;
    if (evt.button != null && evt.button !== 0) return;
    evt.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    drawingRef.current = true;
    pointerIdRef.current = evt.pointerId;
    try {
      canvas.setPointerCapture(evt.pointerId);
    } catch { /* some browsers */ }
    const ctx = canvas.getContext('2d');
    const rect = canvas.getBoundingClientRect();
    const { x, y } = mapPointerToCanvas(evt, rect, {
      width: rect.width,
      height: rect.height,
    });
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const draw = (evt) => {
    if (!drawingRef.current || signMode !== 'draw') return;
    if (pointerIdRef.current != null && evt.pointerId !== pointerIdRef.current) return;
    evt.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const rect = canvas.getBoundingClientRect();
    const { x, y } = mapPointerToCanvas(evt, rect, {
      width: rect.width,
      height: rect.height,
    });
    ctx.lineTo(x, y);
    ctx.stroke();
    hasInkRef.current = true;
  };

  const endDraw = (evt) => {
    if (pointerIdRef.current != null && evt?.pointerId != null && evt.pointerId !== pointerIdRef.current) {
      return;
    }
    const canvas = canvasRef.current;
    if (canvas && pointerIdRef.current != null) {
      try {
        if (canvas.hasPointerCapture?.(pointerIdRef.current)) {
          canvas.releasePointerCapture(pointerIdRef.current);
        }
      } catch { /* ignore */ }
    }
    pointerIdRef.current = null;
    drawingRef.current = false;
  };

  const clearCanvas = () => {
    prepCanvasSurface();
  };

  const handleSubmitSignature = async () => {
    setSubmitting(true);
    setError('');
    try {
      let signatureDataUrl = null;
      if (signMode === 'draw') {
        if (!hasInkRef.current) {
          setError('Please draw your signature or switch to type mode.');
          setSubmitting(false);
          return;
        }
        signatureDataUrl = canvasRef.current?.toDataURL('image/png') || null;
      } else {
        signatureDataUrl = typedSignatureToDataUrl(typedName);
        if (!signatureDataUrl) {
          setError('Please type your name to sign.');
          setSubmitting(false);
          return;
        }
      }

      const payloadFields = {
        ...fields,
        signatureName: signMode === 'type' ? typedName.trim() : fields.name,
      };

      const res = await invokeUw({
        action: 'submitSignature',
        token: rawToken,
        fields: payloadFields,
        signatureDataUrl,
      });

      const url = res.data?.signedPdfUrl;
      if (!url) throw new Error(res.data?.error || 'Signing failed — no PDF returned.');
      setSignedPdfUrl(url);
      setPhase('signed');
    } catch (err) {
      if (isExpiredError(err)) {
        setPhase('expired');
        setError(err.message || 'This W-9 link has expired.');
      } else {
        setError(err.message || 'Could not submit your signature. Please try again.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const cardCls =
    'bg-white text-gray-900 border border-gray-200 rounded-cb shadow-cb-overlay w-full max-w-lg p-8';

  return (
    <div className="portal-bg min-h-screen flex flex-col items-center px-4 py-10">
      <div className="mb-8">
        <CliqbuxLogo />
      </div>

      <div className={cardCls}>
        {phase === 'loading' && (
          <div className="flex flex-col items-center gap-4 py-10">
            <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
            <p className="text-cb-body text-gray-500">Loading your W-9 request…</p>
          </div>
        )}

        {phase === 'expired' && (
          <div className="flex flex-col items-center gap-4 py-6 text-center">
            <div className="w-14 h-14 rounded-full bg-amber-50 flex items-center justify-center">
              <AlertTriangle className="w-7 h-7 text-amber-600" />
            </div>
            <div>
              <p className="font-display text-cb-title text-gray-900 mb-1">Link expired</p>
              <p className="text-cb-body text-gray-500">{error}</p>
            </div>
          </div>
        )}

        {phase === 'error' && (
          <div className="flex flex-col items-center gap-4 py-6 text-center">
            <div className="w-14 h-14 rounded-full bg-red-50 flex items-center justify-center">
              <AlertTriangle className="w-7 h-7 text-cb-danger" />
            </div>
            <div>
              <p className="font-display text-cb-title text-gray-900 mb-1">Unable to open</p>
              <p className="text-cb-body text-gray-500">{error}</p>
            </div>
          </div>
        )}

        {phase === 'signed' && (
          <div className="flex flex-col items-center gap-4 py-6 text-center">
            <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center">
              <CheckCircle className="w-9 h-9 text-cb-success" />
            </div>
            <div>
              <p className="font-display text-cb-title text-gray-900 mb-1">W-9 signed</p>
              <p className="text-cb-body text-gray-500">
                Thank you{recipientName ? `, ${recipientName}` : ''}. Your signed W-9 has been saved.
                {midLabel ? ` (${midLabel})` : ''}
              </p>
            </div>
            {signedPdfUrl ? (
              <a
                href={signedPdfUrl}
                target="_blank"
                rel="noopener noreferrer"
                download
                className="inline-flex items-center gap-2 text-sm font-semibold text-white bg-cb-accent hover:opacity-90 px-5 py-2.5 rounded-cb transition-opacity"
              >
                <Download className="w-4 h-4" />
                Download signed W-9
              </a>
            ) : (
              <p className="text-cb-caption text-gray-400">Download link unavailable — contact CliqBux.</p>
            )}
            <p className="text-cb-caption text-gray-400 mt-2">You may safely close this window.</p>
          </div>
        )}

        {phase === 'form' && (
          <>
            <div className="mb-6">
              <p className="text-cb-caption uppercase text-cb-accent mb-1">Underwriting · Form W-9</p>
              <h1 className="font-display text-cb-title text-gray-900">Review your tax information</h1>
              <p className="text-cb-body text-gray-500 mt-1">
                Confirm the details below, then sign electronically.
                {midLabel ? <> For <strong>{midLabel}</strong>.</> : null}
              </p>
              {agentNote ? (
                <p className="text-cb-body text-gray-600 mt-3 p-3 rounded-cb bg-gray-50 border border-gray-100">
                  <span className="text-cb-caption uppercase text-gray-400 block mb-1">Note from CliqBux</span>
                  {agentNote}
                </p>
              ) : null}
            </div>

            <form onSubmit={handleContinue} className="flex flex-col gap-4">
              <div>
                <label className={labelCls}>Name (as shown on income tax return)</label>
                <input className={inputCls} value={fields.name} onChange={(e) => setField('name', e.target.value)} />
              </div>
              <div>
                <label className={labelCls}>Business name / DBA (optional)</label>
                <input
                  className={inputCls}
                  value={fields.businessName}
                  onChange={(e) => setField('businessName', e.target.value)}
                />
              </div>
              <div>
                <label className={labelCls}>Federal tax classification</label>
                <select
                  className={inputCls}
                  value={fields.taxClassification}
                  onChange={(e) => setField('taxClassification', e.target.value)}
                >
                  <option value="">Select…</option>
                  {TAX_CLASSES.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
              {fields.taxClassification === 'llc' && (
                <div>
                  <label className={labelCls}>LLC tax classification (C, S, P, or D)</label>
                  <select
                    className={inputCls}
                    value={fields.llcTaxClass}
                    onChange={(e) => setField('llcTaxClass', e.target.value)}
                  >
                    <option value="">Select…</option>
                    {LLC_CLASSES.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>
              )}
              {fields.taxClassification === 'other' && (
                <div>
                  <label className={labelCls}>Other classification</label>
                  <input
                    className={inputCls}
                    value={fields.otherClassification}
                    onChange={(e) => setField('otherClassification', e.target.value)}
                  />
                </div>
              )}
              <div>
                <label className={labelCls}>Street address</label>
                <input className={inputCls} value={fields.address} onChange={(e) => setField('address', e.target.value)} />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-1">
                  <label className={labelCls}>City</label>
                  <input className={inputCls} value={fields.city} onChange={(e) => setField('city', e.target.value)} />
                </div>
                <div>
                  <label className={labelCls}>State</label>
                  <input
                    className={inputCls}
                    value={fields.state}
                    onChange={(e) => setField('state', e.target.value.toUpperCase().slice(0, 2))}
                    maxLength={2}
                  />
                </div>
                <div>
                  <label className={labelCls}>ZIP</label>
                  <input className={inputCls} value={fields.zip} onChange={(e) => setField('zip', e.target.value)} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>TIN type</label>
                  <select
                    className={inputCls}
                    value={fields.tinType}
                    onChange={(e) => setField('tinType', e.target.value)}
                  >
                    <option value="ein">EIN</option>
                    <option value="ssn">SSN</option>
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Taxpayer ID (9 digits)</label>
                  <input
                    type="password"
                    data-private="tin"
                    className={inputCls}
                    value={fields.tin}
                    onChange={(e) => setField('tin', e.target.value.replace(/\D/g, '').slice(0, 9))}
                    placeholder="•••••••••"
                    autoComplete="off"
                  />
                  {fields.tin.length === 9 && (
                    <p className="text-xs text-gray-400 mt-1">{formatTinDisplay(fields.tin, fields.tinType)}</p>
                  )}
                </div>
              </div>

              {fieldErrors.length > 0 && (
                <ul className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-cb px-3 py-2 list-disc pl-5">
                  {fieldErrors.map((msg) => (
                    <li key={msg}>{msg}</li>
                  ))}
                </ul>
              )}

              <button
                type="submit"
                className="w-full flex items-center justify-center gap-2 text-sm font-bold text-gray-900 bg-cb-accent hover:opacity-90 py-3 rounded-cb transition-opacity mt-1"
              >
                Continue to sign
              </button>
            </form>
          </>
        )}

        {phase === 'sign' && (
          <div className="flex flex-col gap-4">
            <div className="flex items-start gap-3">
              <PenLine className="w-5 h-5 text-cb-accent flex-shrink-0 mt-0.5" />
              <div>
                <h2 className="font-display text-cb-title text-gray-900">Sign Form W-9</h2>
                <p className="text-cb-body text-gray-500 mt-0.5">
                  Under penalties of perjury, I certify the information is correct. Draw or type your signature below.
                </p>
              </div>
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setSignMode('draw')}
                className={`flex-1 text-sm py-2 rounded-cb border ${
                  signMode === 'draw'
                    ? 'border-cb-accent bg-cb-accent-muted text-gray-900 font-semibold'
                    : 'border-gray-200 text-gray-500'
                }`}
              >
                Draw
              </button>
              <button
                type="button"
                onClick={() => setSignMode('type')}
                className={`flex-1 text-sm py-2 rounded-cb border ${
                  signMode === 'type'
                    ? 'border-cb-accent bg-cb-accent-muted text-gray-900 font-semibold'
                    : 'border-gray-200 text-gray-500'
                }`}
              >
                Type name
              </button>
            </div>

            {signMode === 'draw' ? (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className={labelCls}>Signature</span>
                  <button
                    type="button"
                    onClick={clearCanvas}
                    className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700"
                  >
                    <Eraser className="w-3.5 h-3.5" />
                    Clear
                  </button>
                </div>
                <canvas
                  ref={canvasRef}
                  className="w-full border border-gray-300 rounded-cb touch-none bg-white cursor-crosshair"
                  style={{ height: W9_PAD_CSS_HEIGHT, touchAction: 'none' }}
                  onPointerDown={startDraw}
                  onPointerMove={draw}
                  onPointerUp={endDraw}
                  onPointerCancel={endDraw}
                />
              </div>
            ) : (
              <div>
                <label className={labelCls}>Type your full name</label>
                <input
                  className={`${inputCls} font-serif italic text-lg`}
                  value={typedName}
                  onChange={(e) => setTypedName(e.target.value)}
                  placeholder="Legal signature"
                />
              </div>
            )}

            {error && (
              <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-cb px-3 py-2">{error}</p>
            )}

            <div className="flex gap-2 mt-1">
              <button
                type="button"
                onClick={() => setPhase('form')}
                disabled={submitting}
                className="flex-1 text-sm font-medium text-gray-600 border border-gray-200 py-3 rounded-cb hover:bg-gray-50"
              >
                Back
              </button>
              <button
                type="button"
                onClick={handleSubmitSignature}
                disabled={submitting}
                className="flex-[2] flex items-center justify-center gap-2 text-sm font-bold text-gray-900 bg-cb-accent hover:opacity-90 disabled:opacity-50 py-3 rounded-cb"
              >
                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <PenLine className="w-4 h-4" />}
                {submitting ? 'Submitting…' : 'Submit signed W-9'}
              </button>
            </div>
          </div>
        )}
      </div>

      <p className="text-gray-600 text-cb-caption mt-6">
        Secured by <span className="text-cb-accent font-semibold">Cliqbux</span>
      </p>
    </div>
  );
}
