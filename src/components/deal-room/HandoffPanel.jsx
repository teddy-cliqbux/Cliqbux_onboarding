import { useCallback, useEffect, useState } from 'react';
import { Loader2, ArrowRight, Check, X } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { HANDOFF_STAGE_LABELS, FACT_KEY_LABELS } from '@/lib/onboardingFacts';

const inputCls =
  'w-full bg-cb-bg border border-cb-border rounded-cb px-3 py-2 text-cb-body text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-cb-accent';

/**
 * Deal Room handoff strip: stage, missing/gathered for this stage, advance CTA,
 * and call-notes inbox (paste → suggest → Accept/Reject).
 */
export default function HandoffPanel({ corporateId }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [data, setData] = useState(null);
  const [advancing, setAdvancing] = useState(false);
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [overrideReason, setOverrideReason] = useState('');

  const [transcripts, setTranscripts] = useState([]);
  const [pasteBody, setPasteBody] = useState('');
  const [callType, setCallType] = useState('implementation');
  const [ingesting, setIngesting] = useState(false);
  const [busySug, setBusySug] = useState('');
  const [editValues, setEditValues] = useState({});

  const load = useCallback(async () => {
    if (!corporateId) return;
    setLoading(true);
    setError('');
    try {
      const [handRes, txRes] = await Promise.all([
        base44.functions.invoke('manageHandoff', { action: 'get', corporateId }),
        base44.functions.invoke('manageHandoff', { action: 'listTranscripts', corporateId }),
      ]);
      if (handRes.data?.error) throw new Error(handRes.data.error);
      if (txRes.data?.error && txRes.data?.code !== 'ENTITY_SCHEMA_MISSING') {
        console.warn('[HandoffPanel] transcripts', txRes.data.error);
      }
      setData(handRes.data);
      setTranscripts(txRes.data?.transcripts || []);
    } catch (err) {
      setError(err?.message || 'Could not load handoff');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [corporateId]);

  useEffect(() => {
    load();
  }, [load]);

  const advance = async ({ override = false } = {}) => {
    if (!data?.nextStage) return;
    setAdvancing(true);
    setError('');
    try {
      const res = await base44.functions.invoke('manageHandoff', {
        action: 'advanceStage',
        corporateId,
        toStage: data.nextStage,
        override,
        overrideReason: override ? overrideReason : undefined,
      });
      if (res.data?.code === 'STAGE_BLOCKED') {
        setError(res.data.error || 'Cannot advance — blockers remain.');
        setOverrideOpen(true);
        setAdvancing(false);
        return;
      }
      if (res.data?.error) throw new Error(res.data.error);
      setOverrideOpen(false);
      setOverrideReason('');
      await load();
    } catch (err) {
      setError(err?.message || 'Advance failed');
    } finally {
      setAdvancing(false);
    }
  };

  const ingest = async () => {
    const text = pasteBody.trim();
    if (!text) return;
    setIngesting(true);
    setError('');
    try {
      const res = await base44.functions.invoke('manageHandoff', {
        action: 'ingestTranscript',
        corporateId,
        body: text,
        callType,
      });
      if (res.data?.error) throw new Error(res.data.error);
      setPasteBody('');
      await load();
    } catch (err) {
      setError(err?.message || 'Could not save transcript');
    } finally {
      setIngesting(false);
    }
  };

  const reviewSuggestion = async (transcriptId, suggestionId, action, value) => {
    const key = `${transcriptId}:${suggestionId}`;
    setBusySug(key);
    setError('');
    try {
      const res = await base44.functions.invoke('manageHandoff', {
        action,
        corporateId,
        transcriptId,
        suggestionId,
        ...(value != null ? { value } : {}),
      });
      if (res.data?.error) throw new Error(res.data.error);
      await load();
    } catch (err) {
      setError(err?.message || 'Could not update suggestion');
    } finally {
      setBusySug('');
    }
  };

  if (loading && !data) {
    return (
      <section className="bg-cb-surface border border-cb-border rounded-cb p-4 sm:p-5">
        <div className="flex items-center gap-2 text-cb-caption text-gray-500">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading handoff…
        </div>
      </section>
    );
  }

  const stage = data?.handoffStage || 'sales';
  const stageLabel = data?.stageLabel || HANDOFF_STAGE_LABELS[stage] || stage;
  const missing = data?.missingFacts || [];
  const gathered = data?.gathered || [];
  const blockers = data?.blockers || [];
  const warnings = data?.warnings || [];
  const nextLabel = data?.nextStage
    ? HANDOFF_STAGE_LABELS[data.nextStage] || data.nextStage
    : null;

  const pendingInbox = transcripts.flatMap((t) =>
    (t.suggestions || [])
      .filter((s) => s.status === 'pending')
      .map((s) => ({ ...s, transcriptId: t.id, transcriptTitle: t.title }))
  );

  return (
    <section className="bg-cb-surface border border-cb-border rounded-cb p-4 sm:p-5 space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-cb-caption text-gray-500 mb-0.5">Handoff</p>
          <h2 className="font-display text-cb-title text-white">
            {stageLabel}
            <span className="text-cb-caption font-sans font-normal text-gray-500 ml-2">
              {missing.length} missing for this stage
            </span>
          </h2>
        </div>
        {nextLabel && (
          <div className="flex flex-col items-end gap-2">
            <button
              type="button"
              disabled={advancing}
              onClick={() => advance({ override: false })}
              className="inline-flex items-center gap-1.5 text-cb-caption font-semibold px-3 py-2 rounded-cb bg-cb-accent text-cb-bg hover:opacity-90 disabled:opacity-40"
            >
              {advancing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ArrowRight className="w-3.5 h-3.5" />}
              Hand off to {nextLabel}
            </button>
            {overrideOpen && (
              <div className="w-full max-w-xs space-y-2">
                <p className="text-cb-caption text-gray-400">Override blockers?</p>
                <input
                  className={inputCls}
                  value={overrideReason}
                  onChange={(e) => setOverrideReason(e.target.value)}
                  placeholder="Reason (required for audit)"
                />
                <button
                  type="button"
                  disabled={advancing || !overrideReason.trim()}
                  onClick={() => advance({ override: true })}
                  className="text-cb-caption font-medium px-2.5 py-1.5 rounded-cb border border-cb-border text-gray-300 hover:text-white disabled:opacity-40"
                >
                  Override & advance
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {error && (
        <p className="text-cb-caption text-cb-danger border-l-2 border-cb-danger pl-3">{error}</p>
      )}

      {(blockers.length > 0 || warnings.length > 0) && (
        <div className="space-y-1.5">
          {blockers.map((b) => (
            <p key={b.code} className="text-cb-caption text-cb-danger">
              Blocks advance: {b.message}
            </p>
          ))}
          {warnings.map((w) => (
            <p key={w.code} className="text-cb-caption text-gray-400">
              Note: {w.message}
            </p>
          ))}
        </div>
      )}

      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <p className="text-cb-caption text-gray-500 mb-2">Still needed</p>
          {missing.length === 0 ? (
            <p className="text-cb-caption text-gray-600">Nothing missing for this stage’s fact focus.</p>
          ) : (
            <ul className="space-y-1">
              {missing.map((m) => (
                <li key={m.factKey} className="text-cb-body text-gray-300 flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-cb-accent flex-shrink-0" />
                  {m.label}
                </li>
              ))}
            </ul>
          )}
          {typeof data?.openImplMerchant === 'number' && stage === 'implementation' && data.openImplMerchant > 0 && (
            <p className="text-cb-caption text-gray-500 mt-2">
              {data.openImplMerchant} merchant prep checklist item(s) open
            </p>
          )}
          {typeof data?.holdItems === 'number' && stage === 'installation' && data.holdItems > 0 && (
            <p className="text-cb-caption text-gray-500 mt-2">{data.holdItems} item(s) on Hold</p>
          )}
        </div>
        <div>
          <p className="text-cb-caption text-gray-500 mb-2">Already gathered</p>
          {gathered.length === 0 ? (
            <p className="text-cb-caption text-gray-600">No facts stored yet.</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {gathered.slice(0, 24).map((f) => (
                <span
                  key={`${f.factKey}-${f.locationId || ''}`}
                  className="text-cb-caption text-gray-400 border border-cb-border rounded-cb px-2 py-0.5"
                  title={f.value || f.source}
                >
                  {f.label || FACT_KEY_LABELS[f.factKey] || f.factKey}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Call notes inbox */}
      <div className="border-t border-cb-border pt-4 space-y-3">
        <div>
          <h3 className="font-display text-cb-title text-white text-base">Call notes inbox</h3>
          <p className="text-cb-caption text-gray-500 mt-0.5">
            Paste a Gemini (or other) transcript. Suggestions need Accept before checklist items or facts update.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 items-end">
          <label className="text-cb-caption text-gray-500">
            Call type
            <select
              className={`${inputCls} mt-1 w-auto min-w-[10rem]`}
              value={callType}
              onChange={(e) => setCallType(e.target.value)}
            >
              <option value="discovery">Discovery</option>
              <option value="demo">Demo</option>
              <option value="implementation">Implementation</option>
              <option value="install">Install</option>
              <option value="other">Other</option>
            </select>
          </label>
        </div>
        <textarea
          className={`${inputCls} min-h-[7rem]`}
          placeholder="Paste call transcript here…"
          value={pasteBody}
          onChange={(e) => setPasteBody(e.target.value)}
        />
        <button
          type="button"
          disabled={ingesting || !pasteBody.trim()}
          onClick={ingest}
          className="text-cb-caption font-semibold px-3 py-2 rounded-cb bg-cb-accent text-cb-bg hover:opacity-90 disabled:opacity-40"
        >
          {ingesting ? 'Scanning…' : 'Add & suggest checkoffs'}
        </button>

        {pendingInbox.length > 0 && (
          <div className="space-y-2">
            <p className="text-cb-caption text-gray-500">
              {pendingInbox.length} suggestion(s) awaiting review
            </p>
            {pendingInbox.map((s) => {
              const key = `${s.transcriptId}:${s.id}`;
              const val = editValues[key] ?? s.suggestedValue ?? '';
              return (
                <div
                  key={key}
                  className="bg-cb-surface-raised border border-cb-border rounded-cb px-3 py-2.5 flex flex-wrap gap-2 items-start justify-between"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-cb-body text-white">{s.title}</p>
                    <p className="text-cb-caption text-gray-500">
                      Matched “{s.matchPhrase}”
                      {s.factKey ? ` · fact: ${FACT_KEY_LABELS[s.factKey] || s.factKey}` : ''}
                    </p>
                    <input
                      className={`${inputCls} mt-1.5 max-w-md`}
                      value={val}
                      onChange={(e) => setEditValues((prev) => ({ ...prev, [key]: e.target.value }))}
                      placeholder="Value to store (optional)"
                    />
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <button
                      type="button"
                      disabled={busySug === key}
                      onClick={() => reviewSuggestion(s.transcriptId, s.id, 'acceptSuggestion', val)}
                      className="inline-flex items-center gap-1 text-cb-caption font-medium px-2.5 py-1.5 rounded-cb bg-cb-accent text-cb-bg disabled:opacity-40"
                    >
                      {busySug === key ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                      Accept
                    </button>
                    <button
                      type="button"
                      disabled={busySug === key}
                      onClick={() => reviewSuggestion(s.transcriptId, s.id, 'rejectSuggestion')}
                      className="inline-flex items-center gap-1 text-cb-caption px-2.5 py-1.5 rounded-cb border border-cb-border text-gray-400 hover:text-white disabled:opacity-40"
                    >
                      <X className="w-3.5 h-3.5" /> Reject
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {transcripts.length > 0 && pendingInbox.length === 0 && (
          <p className="text-cb-caption text-gray-600">
            {transcripts.length} transcript(s) on file — no pending suggestions.
          </p>
        )}
      </div>
    </section>
  );
}
