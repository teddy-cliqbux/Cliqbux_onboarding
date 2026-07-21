import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Loader2, Upload } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { invokePortalFunction } from '@/lib/merchantAuthFetch';

/**
 * Merchant-facing underwriting / setup checklist (auto + agent document requests).
 */
export default function MerchantChecklist({ corporateId, onOpenCountChange }) {
  const queryClient = useQueryClient();
  const [uploadingId, setUploadingId] = useState('');
  const [actionError, setActionError] = useState('');
  const fileRefs = useRef({});

  const { data, isLoading, isError, error, refetch, isFetching, isFetched } = useQuery({
    queryKey: ['merchantChecklist', corporateId],
    queryFn: async () => {
      const res = await invokePortalFunction('manageMerchantChecklist', {
        action: 'list',
        corporateId,
      });
      if (res.data?.error) throw new Error(res.data.error);
      return res.data;
    },
    enabled: !!corporateId,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    retry: 1,
  });

  const open = data?.open || [];
  const done = data?.done || [];
  const openCount = data?.openCount ?? open.length;

  useEffect(() => {
    onOpenCountChange?.(openCount);
  }, [openCount, onOpenCountChange]);

  const uploadForItem = async (item, file) => {
    if (!file) return;
    setUploadingId(item.id);
    setActionError('');
    try {
      const uploadRes = await base44.integrations.Core.UploadFile({ file });
      const fileUrl = uploadRes.file_url;
      const res = await invokePortalFunction('manageMerchantChecklist', {
        action: 'upload',
        corporateId,
        itemId: item.id,
        fileUrl,
        fileName: file.name,
      });
      if (res.data?.error) throw new Error(res.data.error);
      await queryClient.invalidateQueries({ queryKey: ['merchantChecklist', corporateId] });
    } catch (err) {
      setActionError(err?.message || 'Upload failed. Try again.');
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
      await queryClient.invalidateQueries({ queryKey: ['merchantChecklist', corporateId] });
    } catch (err) {
      setActionError(err?.message || 'Could not update item.');
    }
  };

  // Only skeleton on first load — avoid flash when remounting with cached data.
  if (isLoading && !isFetched && !data) {
    return (
      <div className="bg-cb-surface-raised rounded-cb border border-cb-border p-5 space-y-3" aria-busy="true">
        <div className="skeleton h-4 w-40 !rounded-cb" />
        <div className="skeleton h-16 w-full !rounded-cb" />
        <div className="skeleton h-16 w-full !rounded-cb" />
      </div>
    );
  }

  if (isError) {
    const missing = /ENTITY_SCHEMA_MISSING|not published/i.test(error?.message || '');
    return (
      <div className="bg-cb-surface-raised rounded-cb border border-cb-border border-l-2 border-l-cb-accent p-5">
        <h3 className="text-cb-body font-semibold text-white mb-1">Checklist unavailable</h3>
        <p className="text-cb-caption normal-case tracking-normal text-gray-400">
          {missing
            ? 'Checklist storage is not published yet. Ask Cliqbux to republish the MerchantChecklistItem entity.'
            : (error?.message || 'Could not load your checklist.')}
        </p>
        <button
          type="button"
          onClick={() => refetch()}
          className="mt-3 text-cb-caption normal-case tracking-normal font-medium text-cb-accent underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cb-accent"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="bg-cb-surface-raised rounded-cb border border-cb-border overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-cb-border">
        <div>
          <p className="text-cb-caption uppercase text-gray-500 mb-0.5">Your checklist</p>
          <p className="text-cb-body text-gray-300">
            {openCount === 0
              ? 'Nothing needs your attention right now.'
              : `${openCount} item${openCount === 1 ? '' : 's'} need${openCount === 1 ? 's' : ''} your attention.`}
          </p>
        </div>
        {isFetching && (
          <Loader2 className="w-4 h-4 text-gray-500 animate-spin" aria-label="Refreshing" />
        )}
      </div>

      {actionError && (
        <p className="px-5 pt-3 text-cb-caption normal-case tracking-normal text-cb-danger" role="alert">
          {actionError}
        </p>
      )}

      <ul className="divide-y divide-cb-border">
        {open.length === 0 && (
          <li className="px-5 py-6 flex items-center gap-3">
            <span className="inline-flex w-7 h-7 rounded-full bg-cb-success/15 items-center justify-center">
              <Check className="w-4 h-4 text-cb-success" strokeWidth={2.5} />
            </span>
            <p className="text-cb-body text-gray-400">You are caught up.</p>
          </li>
        )}
        {open.map((item) => (
          <li key={item.id} className="px-5 py-4 space-y-3">
            <div className="flex items-start gap-3">
              <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-cb-accent flex-shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-cb-body text-white font-medium">{item.title}</p>
                {item.detail && (
                  <p className="text-cb-caption normal-case tracking-normal font-normal text-gray-500 mt-1">
                    {item.detail}
                  </p>
                )}
                {item.dueAt && (
                  <p className="text-cb-caption normal-case tracking-normal text-gray-600 mt-1">
                    Due {new Date(item.dueAt).toLocaleDateString()}
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
                    className="inline-flex items-center gap-1.5 rounded-cb bg-cb-accent text-cb-bg font-semibold text-cb-caption px-3 py-2 hover:opacity-95 disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cb-accent"
                  >
                    {uploadingId === item.id ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Upload className="w-3.5 h-3.5" />
                    )}
                    Upload
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => markDone(item)}
                  className="inline-flex items-center gap-1.5 rounded-cb border border-cb-border-strong text-gray-300 font-medium text-cb-caption px-3 py-2 hover:border-cb-accent hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cb-accent"
                >
                  Mark done
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>

      {done.length > 0 && (
        <div className="border-t border-cb-border px-5 py-3">
          <p className="text-cb-caption uppercase text-gray-600 mb-2">Completed</p>
          <ul className="space-y-1.5">
            {done.slice(0, 8).map((item) => (
              <li key={item.id} className="flex items-center gap-2 text-cb-caption normal-case tracking-normal text-gray-500">
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
