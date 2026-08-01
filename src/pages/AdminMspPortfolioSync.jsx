/**
 * Admin MSPWare portfolio sync — /admin/center/sync-msp
 * 1) Identity: Probe → dry run → confirm live (Owner → Legal Entity → MID)
 * 2) Volume: Probe → dry run → confirm live (statistics + last 30 batches)
 * No HubSpot. Nothing submitted to Elavon.
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, RefreshCw, Search } from 'lucide-react';
import { base44 } from '@/api/base44Client';

const LIVE_OWNER_LIMIT = 8;
const LIVE_MID_LIMIT = 12;

function rateLimit429(result) {
  return result?.rateLimit?.rateLimit429Count
    ?? result?.summary?.rateLimit429Count
    ?? 0;
}

/** Prefer server { error, stack } over generic axios "status code 500". */
function extractInvokeError(err) {
  const data = err?.response?.data
    ?? err?.data
    ?? err?.cause?.response?.data
    ?? err?.cause?.data
    ?? null;
  if (data?.error) {
    return data.stack ? `${data.error} — ${data.stack}` : String(data.error);
  }
  if (typeof data === 'string' && data.trim()) return data;
  return err?.message || 'Sync failed';
}

function mergeLiveBatch(acc, batch) {
  if (!acc) {
    return {
      ...batch,
      entities: [...(batch.entities || [])],
      summary: { ...(batch.summary || {}) },
    };
  }
  const a = acc.summary || {};
  const b = batch.summary || {};
  const sumNest = (key) => ({
    created: (a[key]?.created || 0) + (b[key]?.created || 0),
    linked: (a[key]?.linked || 0) + (b[key]?.linked || 0),
    skipped: (a[key]?.skipped || 0) + (b[key]?.skipped || 0),
    found: (a[key]?.found || 0) + (b[key]?.found || 0),
    linkedToAccount: (a[key]?.linkedToAccount || 0) + (b[key]?.linkedToAccount || 0),
    errors: (a[key]?.errors || 0) + (b[key]?.errors || 0),
  });
  return {
    ...acc,
    ...batch,
    success: !!(batch.success && acc.success),
    dryRun: false,
    confirmLive: true,
    ownerOffset: 0,
    ownersTotal: batch.ownersTotal ?? acc.ownersTotal,
    ownersProcessed: (acc.ownersProcessed || 0) + (batch.ownersProcessed || 0),
    nextOwnerOffset: batch.nextOwnerOffset,
    done: batch.done,
    rateLimit: {
      ...(acc.rateLimit || {}),
      ...(batch.rateLimit || {}),
      mspRequestCount: (acc.rateLimit?.mspRequestCount || 0) + (batch.rateLimit?.mspRequestCount || 0),
      rateLimit429Count: (acc.rateLimit?.rateLimit429Count || 0) + (batch.rateLimit?.rateLimit429Count || 0),
    },
    // Keep first-batch portfolio scan stats; accumulate write counters only
    summary: {
      ...a,
      accounts: sumNest('accounts'),
      corporateEntities: sumNest('corporateEntities'),
      locations: sumNest('locations'),
      merchantMIDs: sumNest('merchantMIDs'),
      writeErrors: (a.writeErrors || 0) + (b.writeErrors || 0),
      writeErrorDetails: [...(a.writeErrorDetails || []), ...(b.writeErrorDetails || [])],
    },
    entities: [...(acc.entities || []), ...(batch.entities || [])],
  };
}

function mergeVolumeLive(acc, batch) {
  if (!acc) {
    return {
      ...batch,
      entities: [...(batch.entities || [])],
      summary: { ...(batch.summary || {}) },
    };
  }
  const a = acc.summary || {};
  const b = batch.summary || {};
  return {
    ...acc,
    ...batch,
    success: !!(batch.success && acc.success),
    dryRun: false,
    confirmLive: true,
    midOffset: 0,
    midsProcessed: (acc.midsProcessed || 0) + (batch.midsProcessed || 0),
    nextMidOffset: batch.nextMidOffset,
    done: batch.done,
    rateLimit: {
      ...(acc.rateLimit || {}),
      ...(batch.rateLimit || {}),
      mspRequestCount: (acc.rateLimit?.mspRequestCount || 0) + (batch.rateLimit?.mspRequestCount || 0),
      rateLimit429Count: (acc.rateLimit?.rateLimit429Count || 0) + (batch.rateLimit?.rateLimit429Count || 0),
    },
    summary: {
      ...a,
      eligibleCount: b.eligibleCount ?? a.eligibleCount,
      midsProcessed: (a.midsProcessed || 0) + (b.midsProcessed || 0),
      statsOk: (a.statsOk || 0) + (b.statsOk || 0),
      statsFail: (a.statsFail || 0) + (b.statsFail || 0),
      batchesOk: (a.batchesOk || 0) + (b.batchesOk || 0),
      batchesFail: (a.batchesFail || 0) + (b.batchesFail || 0),
      batchRowsUpserted: (a.batchRowsUpserted || 0) + (b.batchRowsUpserted || 0),
      batchRowsDeleted: (a.batchRowsDeleted || 0) + (b.batchRowsDeleted || 0),
      writeErrors: (a.writeErrors || 0) + (b.writeErrors || 0),
      writeErrorDetails: [...(a.writeErrorDetails || []), ...(b.writeErrorDetails || [])],
      mspRequestCount: (a.mspRequestCount || 0) + (b.mspRequestCount || 0),
      rateLimit429Count: (a.rateLimit429Count || 0) + (b.rateLimit429Count || 0),
    },
    entities: [...(acc.entities || []), ...(batch.entities || [])],
  };
}

export default function AdminMspPortfolioSync() {
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [liveProgress, setLiveProgress] = useState('');
  const [probeResult, setProbeResult] = useState(null);
  const [dryResult, setDryResult] = useState(null);
  const [liveResult, setLiveResult] = useState(null);

  const [volBusy, setVolBusy] = useState('');
  const [volError, setVolError] = useState('');
  const [volProgress, setVolProgress] = useState('');
  const [volProbe, setVolProbe] = useState(null);
  const [volDry, setVolDry] = useState(null);
  const [volLive, setVolLive] = useState(null);

  const runProbe = async () => {
    setBusy('probe');
    setError('');
    try {
      const res = await base44.functions.invoke('probeMSPMerchantData', { sampleSize: 8 });
      if (res.data?.error) throw new Error(res.data.error);
      setProbeResult(res.data);
    } catch (err) {
      console.error('[AdminMspPortfolioSync] probe', err);
      setError(extractInvokeError(err));
    } finally {
      setBusy('');
    }
  };

  const runDry = async () => {
    setBusy('dry');
    setError('');
    setLiveResult(null);
    setLiveProgress('');
    try {
      const res = await base44.functions.invoke('importMSPPortfolio', { dryRun: true });
      if (res.data?.error) throw new Error(res.data.error);
      setDryResult(res.data);
    } catch (err) {
      console.error('[AdminMspPortfolioSync] dry', err);
      setError(extractInvokeError(err));
    } finally {
      setBusy('');
    }
  };

  const runLive = async () => {
    setBusy('live');
    setError('');
    setLiveProgress('');
    let offset = 0;
    let merged = null;
    let batchNum = 0;
    try {
      while (true) {
        batchNum += 1;
        setLiveProgress(`Writing batch ${batchNum} (owners ${offset + 1}–…)…`);
        const res = await base44.functions.invoke('importMSPPortfolio', {
          confirmLive: true,
          dryRun: false,
          ownerOffset: offset,
          ownerLimit: LIVE_OWNER_LIMIT,
        });
        if (res.data?.error) throw new Error(res.data.error);
        const batch = res.data;
        merged = mergeLiveBatch(merged, batch);
        setLiveResult({ ...merged });
        const total = batch.ownersTotal || 0;
        const next = batch.nextOwnerOffset ?? (offset + (batch.ownersProcessed || LIVE_OWNER_LIMIT));
        setLiveProgress(
          batch.done
            ? `Done — ${merged.ownersProcessed || next}/${total} owners`
            : `Batch ${batchNum} done — ${next}/${total} owners…`,
        );
        if (batch.done) break;
        if (next <= offset) {
          throw new Error('Live sync did not advance ownerOffset — aborting to avoid infinite loop');
        }
        offset = next;
      }
      if (merged?.summary?.writeErrors > 0) {
        const details = (merged.summary.writeErrorDetails || []).slice(0, 5).join('; ');
        setError(
          `${merged.summary.writeErrors} owner write error(s)${details ? `: ${details}` : ''}`,
        );
      }
    } catch (err) {
      console.error('[AdminMspPortfolioSync] live', err);
      setError(extractInvokeError(err));
    } finally {
      setBusy('');
    }
  };

  const runVolProbe = async () => {
    setVolBusy('probe');
    setVolError('');
    try {
      const res = await base44.functions.invoke('syncMSPMerchantStats', {
        probe: true,
        sampleSize: 3,
      });
      if (res.data?.error) throw new Error(res.data.error);
      setVolProbe(res.data);
    } catch (err) {
      console.error('[AdminMspPortfolioSync] vol probe', err);
      setVolError(extractInvokeError(err));
    } finally {
      setVolBusy('');
    }
  };

  const runVolDry = async () => {
    setVolBusy('dry');
    setVolError('');
    setVolLive(null);
    setVolProgress('');
    try {
      const res = await base44.functions.invoke('syncMSPMerchantStats', {
        dryRun: true,
        midOffset: 0,
        midLimit: LIVE_MID_LIMIT,
      });
      if (res.data?.error) throw new Error(res.data.error);
      setVolDry(res.data);
    } catch (err) {
      console.error('[AdminMspPortfolioSync] vol dry', err);
      setVolError(extractInvokeError(err));
    } finally {
      setVolBusy('');
    }
  };

  const runVolLive = async () => {
    setVolBusy('live');
    setVolError('');
    setVolProgress('');
    let offset = 0;
    let merged = null;
    let batchNum = 0;
    try {
      while (true) {
        batchNum += 1;
        setVolProgress(`Volume batch ${batchNum} (MIDs ${offset + 1}–…)…`);
        const res = await base44.functions.invoke('syncMSPMerchantStats', {
          confirmLive: true,
          midOffset: offset,
          midLimit: LIVE_MID_LIMIT,
        });
        if (res.data?.error) throw new Error(res.data.error);
        const batch = res.data;
        merged = mergeVolumeLive(merged, batch);
        setVolLive({ ...merged });
        const total = batch.midsTotal || 0;
        const next = batch.nextMidOffset ?? (offset + (batch.midsProcessed || LIVE_MID_LIMIT));
        setVolProgress(
          batch.done
            ? `Done — ${merged.midsProcessed || next}/${total} MIDs`
            : `Batch ${batchNum} done — ${next}/${total} MIDs…`,
        );
        if (batch.done) break;
        if (next <= offset) {
          throw new Error('Volume sync did not advance midOffset — aborting');
        }
        offset = next;
      }
      if (merged?.summary?.writeErrors > 0) {
        const details = (merged.summary.writeErrorDetails || []).slice(0, 5).join('; ');
        setVolError(
          `${merged.summary.writeErrors} MID write error(s)${details ? `: ${details}` : ''}`,
        );
      }
    } catch (err) {
      console.error('[AdminMspPortfolioSync] vol live', err);
      setVolError(extractInvokeError(err));
    } finally {
      setVolBusy('');
    }
  };

  const display = liveResult || dryResult;
  const summary = display?.summary;
  const entities = display?.entities || [];
  const cov = probeResult?.coverage;
  const owners = probeResult?.ownerClustering;
  const probe429 = rateLimit429(probeResult);
  const sync429 = rateLimit429(display);
  const any429 = probe429 + sync429;

  const volDisplay = volLive || volDry;
  const volSummary = volDisplay?.summary;
  const vol429 = rateLimit429(volProbe) + rateLimit429(volDisplay);
  const pageBusy = !!busy || !!volBusy;

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="font-display text-cb-display text-white">Sync from MSPWare</h1>
        <p className="text-cb-body-lg text-gray-400 mt-1 max-w-2xl">
          Identity import builds{' '}
          <span className="text-gray-300">Owner → Legal Entity → MID</span>
          . Volume sync pulls processing statistics and the last 30 commission batches per MID.
          Throttled to ≤8 MSP calls/sec. No HubSpot. Nothing submitted to Elavon.
        </p>
      </div>

      <div className="bg-cb-surface border border-cb-border rounded-cb px-4 py-4 space-y-3">
        <h2 className="font-display text-cb-title text-white">1. Identity portfolio</h2>
        <p className="text-cb-caption text-gray-500">
          Probe first (owner clustering), then dry-run, then confirm live. Live runs in chunks of {LIVE_OWNER_LIMIT} owners.
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={pageBusy}
            onClick={runProbe}
            className="inline-flex items-center gap-2 text-cb-caption font-semibold px-3 py-2 rounded-cb border border-cb-border text-gray-300 hover:text-white disabled:opacity-40"
          >
            {busy === 'probe' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
            Probe MSP data
          </button>
          <button
            type="button"
            disabled={pageBusy}
            onClick={runDry}
            className="inline-flex items-center gap-2 text-cb-caption font-semibold px-3 py-2 rounded-cb border border-cb-border text-gray-300 hover:text-white disabled:opacity-40"
          >
            {busy === 'dry' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            Dry run
          </button>
          <button
            type="button"
            disabled={pageBusy || !dryResult?.success}
            onClick={() => {
              if (!window.confirm(
                'Live sync will create Merchant Accounts (by owner email), legal entities, locations, and MIDs in batches. HubSpot will not be touched. Continue?',
              )) return;
              runLive();
            }}
            className="inline-flex items-center gap-2 text-cb-caption font-semibold px-3 py-2 rounded-cb bg-cb-accent text-cb-bg hover:opacity-90 disabled:opacity-40"
          >
            {busy === 'live' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
            Confirm live sync
          </button>
          <Link
            to="/admin/center/merchants"
            className="inline-flex items-center text-cb-caption font-medium px-3 py-2 rounded-cb border border-cb-border text-gray-400 hover:text-white"
          >
            View Merchants
          </Link>
        </div>
        {busy === 'live' && liveProgress && (
          <p className="text-cb-caption text-cb-accent">{liveProgress}</p>
        )}
        {!busy && liveProgress && liveResult && (
          <p className="text-cb-caption text-gray-500">{liveProgress}</p>
        )}
      </div>

      <div className="bg-cb-surface border border-cb-border rounded-cb px-4 py-4 space-y-3">
        <h2 className="font-display text-cb-title text-white">2. Volume &amp; batches</h2>
        <p className="text-cb-caption text-gray-500">
          For each MID with an Elavon ID: pull MSP statistics (MTD / prior / YTD) and up to 30 recent batches
          (6-month window). Statements are probed only — not stored yet. Live chunks of {LIVE_MID_LIMIT} MIDs.
          Republish <span className="text-gray-300">MerchantMID</span> fields and publish{' '}
          <span className="text-gray-300">MerchantMidBatch</span> before live writes.
          Optional env <span className="font-mono text-gray-400">MSP_SALESTEAM_NO</span> if batches require a team number.
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={pageBusy}
            onClick={runVolProbe}
            className="inline-flex items-center gap-2 text-cb-caption font-semibold px-3 py-2 rounded-cb border border-cb-border text-gray-300 hover:text-white disabled:opacity-40"
          >
            {volBusy === 'probe' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
            Probe volume
          </button>
          <button
            type="button"
            disabled={pageBusy}
            onClick={runVolDry}
            className="inline-flex items-center gap-2 text-cb-caption font-semibold px-3 py-2 rounded-cb border border-cb-border text-gray-300 hover:text-white disabled:opacity-40"
          >
            {volBusy === 'dry' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            Dry run volume
          </button>
          <button
            type="button"
            disabled={pageBusy || !volDry?.success}
            onClick={() => {
              if (!window.confirm(
                'Live volume sync will write statistics onto MerchantMIDs and upsert up to 30 MerchantMidBatch rows per MID. Continue?',
              )) return;
              runVolLive();
            }}
            className="inline-flex items-center gap-2 text-cb-caption font-semibold px-3 py-2 rounded-cb bg-cb-accent text-cb-bg hover:opacity-90 disabled:opacity-40"
          >
            {volBusy === 'live' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
            Confirm live volume
          </button>
        </div>
        {volBusy === 'live' && volProgress && (
          <p className="text-cb-caption text-cb-accent">{volProgress}</p>
        )}
        {!volBusy && volProgress && volLive && (
          <p className="text-cb-caption text-gray-500">{volProgress}</p>
        )}
      </div>

      {error && (
        <p className="text-cb-caption text-cb-danger border-l-2 border-cb-danger pl-3 whitespace-pre-wrap break-words">{error}</p>
      )}
      {volError && (
        <p className="text-cb-caption text-cb-danger border-l-2 border-cb-danger pl-3 whitespace-pre-wrap break-words">{volError}</p>
      )}

      {any429 > 0 && (
        <p className="text-cb-caption text-amber-400 border-l-2 border-amber-500 bg-cb-surface pl-3 py-2 rounded-r-cb">
          Identity sync: MSP returned {any429}× HTTP 429 (rate limit). Results may be incomplete.
        </p>
      )}
      {vol429 > 0 && (
        <p className="text-cb-caption text-amber-400 border-l-2 border-amber-500 bg-cb-surface pl-3 py-2 rounded-r-cb">
          Volume sync: MSP returned {vol429}× HTTP 429 (rate limit). Results may be incomplete.
        </p>
      )}

      {volProbe?.success && (
        <section className="space-y-3">
          <h2 className="font-display text-cb-title text-white">Volume probe</h2>
          <p className="text-cb-caption text-gray-500">
            Eligible MIDs: {volProbe.eligibleCount ?? '—'}
            {' · '}
            Sample: {volProbe.sampleSize ?? '—'}
            {' · '}
            MSP requests: {volProbe.rateLimit?.mspRequestCount ?? '—'}
            {' · '}
            Sales team env: {volProbe.salesteamnoConfigured ? 'set' : 'empty'}
          </p>
          <ul className="space-y-2">
            {(volProbe.results || []).map((r) => (
              <li
                key={r.merchantMidId || r.elavonMID}
                className="bg-cb-surface border border-cb-border rounded-cb px-4 py-3"
              >
                <p className="text-cb-body font-semibold text-white">
                  {r.dbaName || r.elavonMID}
                </p>
                <p className="text-cb-caption text-gray-500 mt-0.5 font-mono">{r.elavonMID}</p>
                <p className="text-cb-caption text-gray-400 mt-1">
                  Stats: {r.statistics?.ok ? 'OK' : `fail (${r.statistics?.status})`}
                  {r.statistics?.mapped?.volumeCurrentMonth != null
                    ? ` · MTD $${r.statistics.mapped.volumeCurrentMonth}`
                    : ''}
                  {r.statistics?.error ? ` — ${r.statistics.error}` : ''}
                </p>
                <p className="text-cb-caption text-gray-400">
                  Batches: {r.batches?.ok ? 'OK' : `fail (${r.batches?.status})`}
                  {r.batches?.rowCount != null ? ` · ${r.batches.rowCount} rows` : ''}
                  {r.batches?.error ? ` — ${r.batches.error}` : ''}
                </p>
                <p className="text-cb-caption text-gray-500">
                  Statements probe: {r.statements?.ok ? 'OK' : `HTTP ${r.statements?.status}`}
                  {' '}(not stored)
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {volSummary && (
        <section className="space-y-3">
          <div className="flex flex-wrap items-baseline gap-2">
            <h2 className="font-display text-cb-title text-white">
              {volDisplay?.dryRun ? 'Volume dry-run' : 'Volume live summary'}
            </h2>
            {volDisplay?.dryRun && <span className="text-cb-caption text-cb-accent">No writes</span>}
            {!volDisplay?.dryRun && <span className="text-cb-caption text-cb-success">Written</span>}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {[
              { label: 'Eligible MIDs', value: volSummary.eligibleCount },
              { label: 'MIDs processed', value: volSummary.midsProcessed },
              { label: 'Stats OK', value: volSummary.statsOk },
              { label: 'Stats fail', value: volSummary.statsFail },
              { label: 'Batches OK', value: volSummary.batchesOk },
              { label: 'Batches fail', value: volSummary.batchesFail },
              { label: 'Batch rows upserted', value: volSummary.batchRowsUpserted },
              { label: 'Batch rows deleted', value: volSummary.batchRowsDeleted },
              { label: 'Write errors', value: volSummary.writeErrors },
              { label: 'MSP requests', value: volSummary.mspRequestCount ?? volDisplay?.rateLimit?.mspRequestCount },
              { label: 'HTTP 429', value: volSummary.rateLimit429Count ?? volDisplay?.rateLimit?.rateLimit429Count ?? 0 },
            ].map((k) => (
              <div key={k.label} className="bg-cb-surface border border-cb-border rounded-cb px-3 py-2">
                <p className="text-cb-caption text-gray-500">{k.label}</p>
                <p className="font-display text-cb-title text-white tabular-nums mt-0.5">{k.value ?? 0}</p>
              </div>
            ))}
          </div>
          {volSummary.writeErrorDetails?.length > 0 && (
            <details className="text-cb-caption text-cb-danger" open>
              <summary className="cursor-pointer hover:underline">
                Write errors ({volSummary.writeErrorDetails.length})
              </summary>
              <ul className="mt-2 space-y-1 list-disc pl-4 text-gray-400">
                {volSummary.writeErrorDetails.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
            </details>
          )}
        </section>
      )}

      {probeResult?.success && (
        <section className="space-y-3">
          <h2 className="font-display text-cb-title text-white">Identity probe report</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {[
              { label: 'Merchants API total', value: probeResult.merchants?.total },
              { label: 'Detail OK %', value: cov?.detailOkPct != null ? `${cov.detailOkPct}%` : '—' },
              { label: 'MSP requests', value: probeResult.rateLimit?.mspRequestCount },
              { label: 'HTTP 429 count', value: probeResult.rateLimit?.rateLimit429Count ?? 0 },
              { label: 'Unique owner emails', value: owners?.uniqueEmails },
              { label: 'Emails w/ 2+ MIDs', value: owners?.emailsWithMultipleMids },
              { label: 'With federal_tax_id', value: owners?.withFederalTaxId },
              { label: 'Forms w/ SSN signal', value: probeResult.formTinSupplement?.withSsnSignal },
              { label: 'Merchant fetch errors', value: cov?.merchantFetchErrors },
              { label: 'Apps Approved+MID', value: probeResult.applications?.approvedWithMid },
              { label: 'Signatures OK / miss', value: `${probeResult.formTinSupplement?.signaturesOk ?? 0} / ${probeResult.formTinSupplement?.signaturesMiss ?? 0}` },
              { label: 'Emails w/ 2+ corps', value: owners?.emailsWithMultipleCorps },
            ].map((k) => (
              <div key={k.label} className="bg-cb-surface border border-cb-border rounded-cb px-3 py-2">
                <p className="text-cb-caption text-gray-500">{k.label}</p>
                <p className="font-display text-cb-title text-white tabular-nums mt-0.5">{k.value ?? '—'}</p>
              </div>
            ))}
          </div>
          {owners?.topMultiMid?.length > 0 && (
            <div className="bg-cb-surface border border-cb-border rounded-cb px-4 py-3 space-y-2">
              <p className="text-cb-caption text-gray-500">Top multi-MID owners (by email)</p>
              <ul className="space-y-1">
                {owners.topMultiMid.map((o) => (
                  <li key={o.emailHint} className="text-cb-caption text-gray-400">
                    <span className="text-white">{o.contact || o.emailHint}</span>
                    {' · '}{o.midCount} MID(s) · {o.corpCount} corp(s)
                    {o.corps?.length ? ` — ${o.corps.join(', ')}` : ''}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

      {summary && (
        <section className="space-y-3">
          <div className="flex flex-wrap items-baseline gap-2">
            <h2 className="font-display text-cb-title text-white">
              {display?.dryRun ? 'Dry-run summary' : 'Live sync summary'}
            </h2>
            {display?.dryRun && <span className="text-cb-caption text-cb-accent">No writes</span>}
            {!display?.dryRun && <span className="text-cb-caption text-cb-success">Written to Base44</span>}
            <span className="text-cb-caption text-gray-500">Owner → Legal Entity → MID</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {[
              { label: 'Merchants importable', value: summary.importableMerchants },
              { label: 'Owner accounts', value: summary.ownerGroups ?? summary.groups },
              { label: 'Legal entities', value: summary.legalEntityGroups },
              { label: 'Detail OK', value: summary.detailOk },
              { label: 'With EIN', value: summary.withEin },
              { label: 'With SSN', value: summary.withSsn },
              { label: 'Tax ID unavailable', value: summary.taxIdUnavailable ?? summary.tinUnavailable },
              { label: 'MSP requests', value: summary.mspRequestCount ?? display?.rateLimit?.mspRequestCount },
              { label: 'HTTP 429 count', value: summary.rateLimit429Count ?? display?.rateLimit?.rateLimit429Count ?? 0 },
              { label: 'Merchant fetch errors', value: summary.merchantFetchErrors },
              { label: 'Merged by tax ID', value: summary.mergedByTaxId },
              { label: 'Merged by corp name', value: summary.mergedByCorporateName },
              { label: 'MIDs create', value: summary.merchantMIDs?.created },
              { label: 'Accounts create', value: summary.accounts?.created },
              { label: 'Write errors', value: summary.writeErrors },
              { label: 'Apps matched by MID', value: summary.applicationsMatchedByMid },
              { label: 'Unique owner emails', value: summary.uniqueOwnerEmails },
            ].map((k) => (
              <div key={k.label} className="bg-cb-surface border border-cb-border rounded-cb px-3 py-2">
                <p className="text-cb-caption text-gray-500">{k.label}</p>
                <p className="font-display text-cb-title text-white tabular-nums mt-0.5">{k.value ?? 0}</p>
              </div>
            ))}
          </div>
          {summary.mergeNotes?.length > 0 && (
            <details className="text-cb-caption text-gray-500">
              <summary className="cursor-pointer text-gray-400 hover:text-white">
                Merge notes ({summary.mergeNotes.length})
              </summary>
              <ul className="mt-2 space-y-1 list-disc pl-4">
                {summary.mergeNotes.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
            </details>
          )}
          {summary.writeErrorDetails?.length > 0 && (
            <details className="text-cb-caption text-cb-danger" open>
              <summary className="cursor-pointer hover:underline">
                Write errors ({summary.writeErrorDetails.length})
              </summary>
              <ul className="mt-2 space-y-1 list-disc pl-4 text-gray-400">
                {summary.writeErrorDetails.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
            </details>
          )}
        </section>
      )}

      {entities.length > 0 && (
        <section>
          <h2 className="font-display text-cb-title text-white mb-3">Owners</h2>
          <ul className="space-y-2">
            {entities.map((e) => (
              <li
                key={e.ownerKey || e.groupKey}
                className="bg-cb-surface border border-cb-border rounded-cb px-4 py-3"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-cb-body font-semibold text-white">
                      {e.ownerContact || e.legalName || e.ownerKey || 'Owner'}
                      {e.result === 'error' ? (
                        <span className="ml-2 text-cb-caption font-normal text-cb-danger">write failed</span>
                      ) : null}
                      {e.skipSuggested ? (
                        <span className="ml-2 text-cb-caption font-normal text-amber-400">test MID?</span>
                      ) : null}
                    </p>
                    <p className="text-cb-caption text-gray-500 mt-0.5">
                      {e.error ? (
                        <span className="text-cb-danger">{e.error}</span>
                      ) : (
                        <>
                          {e.ownerEmail || 'no email'}
                          {e.emailSource ? ` (${e.emailSource})` : ''}
                          {e.alternateEmails?.length ? ` · also ${e.alternateEmails.join(', ')}` : ''}
                          {' · '}
                          {e.legalEntityCount ?? e.legalEntities?.length ?? 0} legal entit(y/ies)
                          {' · '}
                          {e.midCount ?? 0} MID(s)
                          {e.mergedBy?.length ? ` · merged via ${e.mergedBy.join('+')}` : ''}
                          {e.accountCreated ? ' · new account' : e.merchantAccountId ? ' · existing account' : ''}
                        </>
                      )}
                    </p>
                    {(e.legalEntities || []).length > 0 && (
                      <ul className="mt-2 space-y-1 border-l border-cb-border pl-3">
                        {e.legalEntities.map((le) => (
                          <li key={le.legalKey} className="text-cb-caption text-gray-400">
                            <span className="text-gray-300">{le.legalName}</span>
                            {' · '}{le.taxIdLabel || (le.tin ? `Tax ID ${le.tin}` : 'Tax ID —')}
                            {le.tinSource ? ` (${le.tinSource})` : ''}
                            {' · '}{le.midCount} MID(s)
                            {le.mergedBy ? ` · ${le.mergedBy}` : ''}
                            {(le.mids || []).slice(0, 4).map((m) => m.dba).filter(Boolean).length > 0 && (
                              <span className="text-gray-600">
                                {' — '}
                                {(le.mids || []).slice(0, 4).map((m) => m.dba).filter(Boolean).join(', ')}
                                {(le.mids || []).length > 4 ? '…' : ''}
                              </span>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  {!display?.dryRun && e.merchantAccountId && !String(e.merchantAccountId).startsWith('[') && (
                    <Link
                      to={`/admin/center/accounts/${encodeURIComponent(e.merchantAccountId)}`}
                      className="text-cb-caption font-semibold text-cb-accent hover:underline flex-shrink-0"
                    >
                      Open account
                    </Link>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
