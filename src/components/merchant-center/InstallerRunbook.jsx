import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, ChevronRight, Loader2, RefreshCw } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import {
  DEPLOYMENT_STATUSES,
  STATUS_LABELS,
  PHASES,
} from '@/lib/deploymentChecklistCatalog';

const inputCls =
  'w-full bg-cb-bg border border-cb-border rounded-cb px-3 py-2 text-cb-body text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-cb-accent';

/**
 * Deal Room installer runbook — full Template 2 phases (Excel replacement).
 * Admin-only via manageMerchantChecklist (workspace session).
 */
export default function InstallerRunbook({ corporateId, locations = [] }) {
  const queryClient = useQueryClient();
  const [locationId, setLocationId] = useState(locations[0]?.id || '');
  const [expandedPhase, setExpandedPhase] = useState('pre_installation');
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');
  const [installDate, setInstallDate] = useState('');
  const [enterprise, setEnterprise] = useState(false);
  const [spawning, setSpawning] = useState(false);

  const loc = useMemo(
    () => (locations || []).find((l) => String(l.id) === String(locationId)),
    [locations, locationId]
  );

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['deploymentRunbook', corporateId, locationId],
    queryFn: async () => {
      const res = await base44.functions.invoke('manageMerchantChecklist', {
        action: 'listDeployment',
        corporateId,
        locationId,
      });
      if (res.data?.error) throw new Error(res.data.error);
      return res.data;
    },
    enabled: !!corporateId && !!locationId,
    staleTime: 15_000,
  });

  const items = data?.items || [];
  const tallies = data?.tallies || { scheduled: 0, in_progress: 0, hold: 0, completed: 0 };
  const byPhase = data?.byPhase || {};
  const phases = data?.phases || PHASES;

  const sortedItems = (phaseId) => {
    const list = byPhase[phaseId] || items.filter((i) => i.phase === phaseId);
    const order = { hold: 0, in_progress: 1, scheduled: 2, completed: 3 };
    return [...list].sort(
      (a, b) => (order[a.status] ?? 9) - (order[b.status] ?? 9)
    );
  };

  const updateItem = async (item, patch) => {
    setBusyId(item.id);
    setError('');
    try {
      const res = await base44.functions.invoke('manageMerchantChecklist', {
        action: 'updateDeploymentItem',
        corporateId,
        itemId: item.id,
        ...patch,
      });
      if (res.data?.error) throw new Error(res.data.error);
      await queryClient.invalidateQueries({
        queryKey: ['deploymentRunbook', corporateId, locationId],
      });
    } catch (err) {
      setError(err?.message || 'Update failed');
    } finally {
      setBusyId('');
    }
  };

  const spawn = async () => {
    if (!locationId || spawning) return;
    setSpawning(true);
    setError('');
    try {
      const res = await base44.functions.invoke('manageMerchantChecklist', {
        action: 'scheduleInstall',
        corporateId,
        locationId,
        installationDate: installDate || undefined,
        enterpriseInstall: enterprise,
      });
      if (res.data?.error) throw new Error(res.data.error);
      await queryClient.invalidateQueries({
        queryKey: ['deploymentRunbook', corporateId, locationId],
      });
    } catch (err) {
      setError(err?.message || 'Could not spawn checklist');
    } finally {
      setSpawning(false);
    }
  };

  if (!locations.length) {
    return (
      <section className="bg-cb-surface border border-cb-border rounded-cb p-4 sm:p-5">
        <h2 className="font-display text-cb-title text-white mb-1">Installation checklist</h2>
        <p className="text-cb-caption normal-case tracking-normal text-gray-500">
          Add a location before spawning the POS deployment runbook.
        </p>
      </section>
    );
  }

  return (
    <section className="bg-cb-surface border border-cb-border rounded-cb p-4 sm:p-5 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-cb-title text-white">Installation checklist</h2>
          <p className="text-cb-caption normal-case tracking-normal text-gray-500 mt-0.5">
            Full POS deployment runbook — replaces the Excel onboarding checklist.
          </p>
        </div>
        <button
          type="button"
          onClick={() => refetch()}
          className="text-gray-500 hover:text-white p-1.5 rounded-cb focus:outline-none focus:ring-2 focus:ring-cb-accent"
          aria-label="Refresh checklist"
        >
          <RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <div className="flex flex-wrap gap-2 items-end">
        <label className="flex-1 min-w-[10rem]">
          <span className="text-cb-caption uppercase text-gray-500">Location</span>
          <select
            value={locationId}
            onChange={(e) => {
              setLocationId(e.target.value);
              const next = locations.find((l) => String(l.id) === e.target.value);
              setEnterprise(!!next?.enterpriseInstall);
              setInstallDate((next?.installationDate || '').slice(0, 10));
            }}
            className={`${inputCls} mt-1`}
          >
            {locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.dbaName || l.id}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="text-cb-caption uppercase text-gray-500">Install date</span>
          <input
            type="date"
            value={installDate || (loc?.installationDate || '').slice(0, 10)}
            onChange={(e) => setInstallDate(e.target.value)}
            className={`${inputCls} mt-1`}
          />
        </label>
        <label className="flex items-center gap-2 pb-2.5 text-cb-caption text-gray-300">
          <input
            type="checkbox"
            checked={enterprise || !!loc?.enterpriseInstall}
            onChange={(e) => setEnterprise(e.target.checked)}
            className="rounded border-cb-border"
          />
          Airport / enterprise pack
        </label>
        <button
          type="button"
          onClick={spawn}
          disabled={spawning || !locationId}
          className="bg-cb-accent text-cb-bg font-semibold text-cb-caption px-3 py-2.5 rounded-cb disabled:opacity-40"
        >
          {spawning ? 'Spawning…' : items.length ? 'Re-sync / update' : 'Spawn checklist'}
        </button>
      </div>

      {error && (
        <p className="text-cb-caption text-cb-danger" role="alert">{error}</p>
      )}

      {items.length > 0 && (
        <div className="flex flex-wrap gap-3 text-cb-caption normal-case tracking-normal">
          <span className="text-cb-danger">Hold {tallies.hold || 0}</span>
          <span className="text-cb-accent">In progress {tallies.in_progress || 0}</span>
          <span className="text-gray-400">Scheduled {tallies.scheduled || 0}</span>
          <span className="text-cb-success">Completed {tallies.completed || 0}</span>
        </div>
      )}

      {isLoading && (
        <div className="flex items-center gap-2 text-gray-500 text-cb-caption py-4">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading runbook…
        </div>
      )}

      {!isLoading && items.length === 0 && (
        <p className="text-cb-body text-gray-500 py-2">
          No deployment items yet. Set install date (optional), toggle enterprise if needed, then Spawn checklist.
        </p>
      )}

      <div className="space-y-2">
        {phases
          .filter((p) => {
            const id = p.id || p.phase;
            if (id === 'airport_enterprise' && !(data?.includeEnterprise || enterprise || loc?.enterpriseInstall)) {
              return false;
            }
            return true;
          })
          .map((p) => {
            const id = p.id || p.phase;
            const label = p.label || id;
            const phaseItems = sortedItems(id);
            if (!phaseItems.length && items.length) return null;
            const open = expandedPhase === id;
            const holdCount = phaseItems.filter((i) => i.status === 'hold').length;
            return (
              <div key={id} className="border border-cb-border rounded-cb overflow-hidden">
                <button
                  type="button"
                  onClick={() => setExpandedPhase(open ? '' : id)}
                  className="w-full flex items-center gap-2 px-3 py-2.5 bg-cb-bg text-left hover:bg-cb-surface-raised focus:outline-none focus-visible:ring-2 focus-visible:ring-cb-accent"
                >
                  {open ? <ChevronDown className="w-4 h-4 text-gray-500" /> : <ChevronRight className="w-4 h-4 text-gray-500" />}
                  <span className="font-medium text-cb-body text-white flex-1">{label}</span>
                  <span className="text-cb-caption text-gray-500">
                    {phaseItems.filter((i) => i.status === 'completed').length}/{phaseItems.length}
                    {holdCount > 0 ? ` · ${holdCount} hold` : ''}
                  </span>
                </button>
                {open && (
                  <ul className="divide-y divide-cb-border">
                    {phaseItems.map((item) => (
                      <li key={item.id} className="px-3 py-3 space-y-2 bg-cb-surface">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <p className="text-cb-body text-white font-medium">{item.title}</p>
                            {item.detail && (
                              <p className="text-cb-caption normal-case tracking-normal text-gray-500 mt-0.5">
                                {item.detail}
                              </p>
                            )}
                            <p className="text-cb-caption text-gray-600 mt-1">
                              {item.audience}{item.autoRule ? ` · auto: ${item.autoRule}` : ''}
                            </p>
                          </div>
                          <select
                            value={item.status === 'done' ? 'completed' : item.status}
                            disabled={busyId === item.id}
                            onChange={(e) => updateItem(item, { status: e.target.value })}
                            className="bg-cb-bg border border-cb-border rounded-cb px-2 py-1.5 text-cb-caption text-white"
                          >
                            {DEPLOYMENT_STATUSES.map((s) => (
                              <option key={s} value={s}>{STATUS_LABELS[s] || s}</option>
                            ))}
                          </select>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <input
                            type="date"
                            value={(item.targetDate || '').slice(0, 10)}
                            onChange={(e) => updateItem(item, { targetDate: e.target.value })}
                            className="bg-cb-bg border border-cb-border rounded-cb px-2 py-1 text-cb-caption text-white"
                            aria-label="Target date"
                          />
                          <input
                            type="text"
                            defaultValue={item.notes || ''}
                            key={`notes-${item.id}-${item.updated_date || item.completedAt || ''}`}
                            onBlur={(e) => {
                              if (e.target.value !== (item.notes || '')) {
                                updateItem(item, { notes: e.target.value });
                              }
                            }}
                            placeholder="Notes"
                            className="flex-1 min-w-[8rem] bg-cb-bg border border-cb-border rounded-cb px-2 py-1 text-cb-caption text-white"
                          />
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
      </div>
    </section>
  );
}
