import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Loader2, Upload } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { invokePortalFunction } from '@/lib/merchantAuthFetch';
import { STATUS_LABELS } from '@/lib/deploymentChecklistCatalog';

function isSchemaMissing(message) {
  return /ENTITY_SCHEMA_MISSING|not published|MerchantChecklistItem/i.test(String(message || ''));
}

/**
 * Merchant-facing "Before we install" pack — audience merchant|shared only.
 * Stays on this card after start — items appear in place (no route change).
 */
export default function MerchantBeforeInstall({ corporateId, locationId, onOpenCountChange }) {
  const queryClient = useQueryClient();
  const [uploadingId, setUploadingId] = useState('');
  const [actionError, setActionError] = useState('');
  const [scheduling, setScheduling] = useState(false);
  const fileRefs = useRef({});

  const enabled = !!corporateId && !!locationId;

  const { data, isLoading, isError, error, refetch, isFetching, isFetched } = useQuery({
    queryKey: ['deploymentMerchantPack', corporateId, locationId],
    queryFn: async () => {
      const res = await invokePortalFunction('manageMerchantChecklist', {
        action: 'listDeployment',
        corporateId,
        locationId,
      });
      if (res.data?.error) {
        const err = new Error(res.data.error);
        err.code = res.data.code;
        throw err;
      }
      return res.data;
    },
    enabled,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    retry: 1,
  });

  const items = data?.items || [];
  const open = items.filter((i) => i.status !== 'completed' && i.status !== 'done');
  const done = items.filter((i) => i.status === 'completed' || i.status === 'done');
  const openCount = open.length;
  const schemaMissing = isSchemaMissing(error?.message) || error?.code === 'ENTITY_SCHEMA_MISSING';

  useEffect(() => {
    onOpenCountChange?.(openCount);
  }, [openCount, onOpenCountChange]);

  const scheduleInstall = async () => {
    setScheduling(true);
    setActionError('');
    try {
      const res = await invokePortalFunction('manageMerchantChecklist', {
        action: 'scheduleInstall',
        corporateId,
        locationId,
      });
      if (res.data?.error) throw new Error(res.data.error);
      await queryClient.invalidateQueries({
        queryKey: ['deploymentMerchantPack', corporateId, locationId],
      });
    } catch (err) {
      setActionError(err?.message || 'Could not start the install checklist.');
    } finally {
      setScheduling(false);
    }
  };

  const uploadForItem = async (item, file) => {
    if (!file) return;
    setUploadingId(item.id);
    setActionError('');
    try {
      const uploadRes = await base44.integrations.Core.UploadFile({ file });
      const res = await invokePortalFunction('manageMerchantChecklist', {
        action: 'upload',
        corporateId,
        itemId: item.id,
        fileUrl: uploadRes.file_url,
        fileName: file.name,
      });
      if (res.data?.error) throw new Error(res.data.error);
      await queryClient.invalidateQueries({
        queryKey: ['deploymentMerchantPack', corporateId, locationId],
      });
    } catch (err) {
      setActionError(err?.message || 'Upload failed.');
    } finally {
      setUploadingId('');
    }
  };

  const markDone = async (item) => {
    setActionError('');
    try {
      const res = await invokePortalFunction('manageMerchantChecklist', {
        action: 'markDone',
        corporateId,
        itemId: item.id,
      });
      if (res.data?.error) throw new Error(res.data.error);
      await queryClient.invalidateQueries({
        queryKey: ['deploymentMerchantPack', corporateId, locationId],
      });
    } catch (err) {
      setActionError(err?.message || 'Could not update item.');
    }
  };

  if (!locationId) {
    return (
      <div className="bg-cb-surface-raised rounded-cb border border-cb-border p-5">
        <h3 className="font-display text-cb-title text-white mb-1">Before we install</h3>
        <p className="text-cb-body text-gray-400">
          Add a location first, then we will ask only for what your store needs to provide before install day.
        </p>
      </div>
    );
  }

  // Only full skeleton on first load — keep prior content visible while refetching.
  if (isLoading && !isFetched) {
    return (
      <div className="bg-cb-surface-raised rounded-cb border border-cb-border p-5 space-y-3" aria-busy="true">
        <div className="skeleton h-4 w-48 !rounded-cb" />
        <div className="skeleton h-16 w-full !rounded-cb" />
      </div>
    );
  }

  if (isError && schemaMissing) {
    return (
      <div className="bg-cb-surface-raised rounded-cb border border-cb-border border-l-2 border-l-cb-accent p-5">
        <h3 className="font-display text-cb-title text-white mb-1">Install checklist unavailable</h3>
        <p className="text-cb-body text-gray-400">
          Checklist storage is not published yet. Ask Cliqbux to republish the MerchantChecklistItem entity,
          then click Retry.
        </p>
        {actionError && <p className="text-cb-caption text-cb-danger mt-2" role="alert">{actionError}</p>}
        <button
          type="button"
          onClick={() => refetch()}
          className="mt-3 text-cb-caption font-medium text-cb-accent underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cb-accent"
        >
          Retry
        </button>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="bg-cb-surface-raised rounded-cb border border-cb-border border-l-2 border-l-cb-accent p-5 space-y-3">
        <h3 className="font-display text-cb-title text-white">Before we install</h3>
        <p className="text-cb-body text-gray-400">
          {error?.message || 'Could not load install checklist.'}
        </p>
        {actionError && <p className="text-cb-caption text-cb-danger" role="alert">{actionError}</p>}
        <button
          type="button"
          onClick={() => refetch()}
          className="text-cb-caption font-medium text-cb-accent underline"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!items.length) {
    return (
      <div className="bg-cb-surface-raised rounded-cb border border-cb-border border-l-2 border-l-cb-accent p-5 space-y-3">
        <h3 className="font-display text-cb-title text-white">Before we install</h3>
        <p className="text-cb-body text-gray-400">
          Start the install checklist when you are ready. Items appear here on this page — you will only see
          what your store needs to provide (hours, menu, staff list, sign-off).
        </p>
        {actionError && (
          <p className="text-cb-caption text-cb-danger" role="alert">
            {isSchemaMissing(actionError)
              ? 'Checklist storage is not published yet. Ask Cliqbux to republish MerchantChecklistItem, then try again.'
              : actionError}
          </p>
        )}
        <button
          type="button"
          onClick={scheduleInstall}
          disabled={scheduling || isSchemaMissing(actionError)}
          className="rounded-cb bg-cb-accent text-cb-bg font-semibold text-cb-body px-4 py-2.5 disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cb-accent"
        >
          {scheduling ? 'Starting…' : 'Start install checklist'}
        </button>
      </div>
    );
  }

  return (
    <div className="bg-cb-surface-raised rounded-cb border border-cb-border overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-cb-border">
        <div>
          <p className="text-cb-caption uppercase text-gray-500 mb-0.5">Before we install</p>
          <p className="text-cb-body text-gray-300">
            {openCount === 0
              ? 'Store prep is complete.'
              : `${openCount} item${openCount === 1 ? '' : 's'} still need${openCount === 1 ? 's' : ''} your input.`}
          </p>
        </div>
        {isFetching && <Loader2 className="w-4 h-4 text-gray-500 animate-spin" aria-label="Refreshing" />}
      </div>

      {actionError && (
        <p className="px-5 pt-3 text-cb-caption text-cb-danger" role="alert">{actionError}</p>
      )}

      <ul className="divide-y divide-cb-border">
        {open.map((item) => (
          <li key={item.id} className="px-5 py-4 space-y-3">
            <div className="flex items-start gap-3">
              <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-cb-accent flex-shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-cb-body text-white font-medium">{item.title}</p>
                {(item.detail || item.description) && (
                  <p className="text-cb-caption normal-case tracking-normal text-gray-500 mt-1">
                    {item.detail || item.description}
                  </p>
                )}
                {item.status && item.status !== 'scheduled' && (
                  <p className="text-cb-caption text-gray-600 mt-1">
                    {STATUS_LABELS[item.status] || item.status}
                  </p>
                )}
              </div>
            </div>
            <div className="pl-4 flex flex-wrap gap-2">
              {item.requiresUpload ? (
                <>
                  <input
                    ref={(el) => { fileRefs.current[item.id] = el; }}
                    type="file"
                    className="sr-only"
                    accept=".pdf,.png,.jpg,.jpeg,.csv,.xlsx"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) uploadForItem(item, f);
                      e.target.value = '';
                    }}
                  />
                  <button
                    type="button"
                    disabled={uploadingId === item.id}
                    onClick={() => fileRefs.current[item.id]?.click()}
                    className="inline-flex items-center gap-1.5 rounded-cb bg-cb-accent text-cb-bg font-semibold text-cb-caption px-3 py-2 disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cb-accent"
                  >
                    {uploadingId === item.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                    Upload
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => markDone(item)}
                  className="inline-flex items-center gap-1.5 rounded-cb border border-cb-border-strong text-gray-300 font-medium text-cb-caption px-3 py-2 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cb-accent"
                >
                  Mark done
                </button>
              )}
            </div>
          </li>
        ))}
        {open.length === 0 && (
          <li className="px-5 py-6 flex items-center gap-3">
            <span className="inline-flex w-7 h-7 rounded-full bg-cb-success/15 items-center justify-center">
              <Check className="w-4 h-4 text-cb-success" strokeWidth={2.5} />
            </span>
            <p className="text-cb-body text-gray-400">You are ready for install day.</p>
          </li>
        )}
      </ul>

      {done.length > 0 && (
        <div className="border-t border-cb-border px-5 py-3">
          <p className="text-cb-caption uppercase text-gray-600 mb-2">Completed</p>
          <ul className="space-y-1.5">
            {done.slice(0, 12).map((item) => (
              <li key={item.id} className="flex items-center gap-2 text-cb-caption text-gray-500">
                <Check className="w-3 h-3 text-cb-success flex-shrink-0" strokeWidth={2.5} />
                <span className="truncate">{item.title}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
