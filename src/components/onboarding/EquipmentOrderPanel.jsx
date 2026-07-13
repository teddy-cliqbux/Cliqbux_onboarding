import { useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Package, RefreshCw, Wrench, ExternalLink, Check } from 'lucide-react';
import { invokePortalFunction } from '@/lib/merchantAuthFetch';

const STALE_MS = 10 * 60 * 1000; // 10 minutes — do not re-hit HubSpot on every re-render

function formatMoney(n) {
  if (n == null || Number.isNaN(Number(n))) return '—';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(n));
}

function StatusCaption({ label, tone = 'neutral' }) {
  const dot =
    tone === 'success' ? 'bg-cb-success' :
    tone === 'accent' ? 'bg-cb-accent' :
    tone === 'danger' ? 'bg-cb-danger' :
    'bg-gray-500';
  return (
    <span className="inline-flex items-center gap-1.5 text-cb-caption normal-case tracking-normal font-normal text-gray-400">
      <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />
      {label}
    </span>
  );
}

function LineSection({ title, icon: Icon, items }) {
  if (!items?.length) return null;
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-cb-caption uppercase text-gray-500">
        <Icon className="w-3.5 h-3.5 text-cb-accent" strokeWidth={2} />
        {title}
      </div>
      <ul className="divide-y divide-cb-border border border-cb-border rounded-cb overflow-hidden">
        {items.map((item) => (
          <li key={item.id} className="bg-cb-bg px-3 py-2.5 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-cb-body text-white font-medium truncate">{item.name || 'Line item'}</p>
              <p className="text-cb-caption normal-case tracking-normal font-normal text-gray-500 mt-0.5">
                {item.sku ? `SKU ${item.sku}` : item.recurringFrequency ? String(item.recurringFrequency) : item.description || '—'}
                {item.quantity != null ? ` · Qty ${item.quantity}` : ''}
              </p>
            </div>
            <div className="text-right shrink-0">
              <p className="text-cb-body text-white tabular-nums">{formatMoney(item.amount ?? item.price)}</p>
              {item.discountTotal > 0 && (
                <p className="text-cb-caption normal-case tracking-normal text-gray-500">−{formatMoney(item.discountTotal)}</p>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Native Equipment & Services invoice from getHubspotQuote (TanStack 10-min cache).
 * Sign & pay happen on HubSpot Payments via the quote URL (new tab) — not Stripe, not iframe.
 */
export default function EquipmentOrderPanel({ corporateId }) {
  const closedWonFired = useRef(false);

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ['hubspotQuote', corporateId],
    queryFn: async () => {
      const res = await invokePortalFunction('getHubspotQuote', { corporateId });
      if (res.data?.error) throw new Error(res.data.error);
      return res.data;
    },
    enabled: !!corporateId,
    staleTime: STALE_MS,
    refetchOnWindowFocus: false,
  });

  const paymentStatus = String(data?.paymentStatus || '').toUpperCase();
  const esignStatus = String(data?.esignStatus || '').toUpperCase();
  const isPaid = paymentStatus === 'PAID';
  const quoteUrl = data?.quoteUrl || '';

  // Fire-and-forget closed_won once when HubSpot Payments reports PAID.
  // Does NOT set MerchantMID to Active — payment ≠ Elavon go-live.
  useEffect(() => {
    if (!corporateId || !isPaid || closedWonFired.current) return;
    const key = `cb_closed_won_${corporateId}`;
    if (typeof sessionStorage !== 'undefined' && sessionStorage.getItem(key)) {
      closedWonFired.current = true;
      return;
    }
    closedWonFired.current = true;
    try {
      sessionStorage.setItem(key, '1');
    } catch { /* ignore */ }
    invokePortalFunction('pushStatusToHubspot', { corporateId, milestone: 'closed_won' }).catch(() => {});
  }, [corporateId, isPaid]);

  // After returning from HubSpot sign/pay tab, refresh once (cooldown avoids API spam)
  useEffect(() => {
    let lastFocusFetch = 0;
    const onVisibility = () => {
      if (document.visibilityState !== 'visible' || isPaid) return;
      const now = Date.now();
      if (now - lastFocusFetch < 60_000) return;
      lastFocusFetch = now;
      refetch();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [isPaid, refetch]);

  const openQuote = () => {
    if (!quoteUrl) return;
    window.open(quoteUrl, '_blank', 'noopener,noreferrer');
  };

  if (isLoading) {
    return (
      <div className="bg-cb-surface-raised rounded-cb border border-cb-border p-5 space-y-3" aria-busy="true">
        <div className="skeleton h-4 w-48 !rounded-cb" />
        <div className="skeleton h-20 w-full !rounded-cb" />
        <div className="skeleton h-20 w-full !rounded-cb" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="bg-cb-surface-raised rounded-cb border border-cb-border border-l-2 border-l-cb-danger p-5">
        <h3 className="text-cb-body font-semibold text-white mb-1">Equipment order unavailable</h3>
        <p className="text-cb-caption normal-case tracking-normal font-normal text-gray-400">
          {error?.message || 'Could not load your HubSpot quote. Try again in a moment.'}
        </p>
        <button
          type="button"
          onClick={() => refetch()}
          className="mt-3 text-cb-caption normal-case tracking-normal font-medium text-cb-accent hover:opacity-90 underline"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!data?.quoteId) {
    return (
      <div className="bg-cb-surface-raised rounded-cb border border-cb-border p-5">
        <h3 className="text-cb-body font-semibold text-white mb-1">Equipment &amp; Services</h3>
        <p className="text-cb-caption normal-case tracking-normal font-normal text-gray-500">
          Your rep is finalizing your quote. It will appear here when ready to review, sign, and pay.
        </p>
      </div>
    );
  }

  const hardware = data.hardware || [];
  const recurring = data.recurring || [];
  const services = data.oneTimeServices || [];

  return (
    <div className="bg-cb-surface-raised rounded-cb border border-cb-border p-5 space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-cb-caption uppercase text-gray-500 mb-1">Order</p>
          <h3 className="font-display text-cb-title text-white">Equipment &amp; Services Invoice</h3>
          {data.title && (
            <p className="text-cb-caption normal-case tracking-normal font-normal text-gray-500 mt-1">{data.title}</p>
          )}
        </div>
        <div className="flex flex-col items-end gap-1.5">
          {isPaid ? (
            <StatusCaption label="Paid — provisioning" tone="success" />
          ) : (
            <>
              <StatusCaption
                label={esignStatus === 'SIGNED' ? 'Signed' : esignStatus === 'PENDING_SIGNATURE' ? 'Awaiting signature' : (esignStatus || 'Quote ready')}
                tone={esignStatus === 'SIGNED' ? 'success' : 'accent'}
              />
              {data.paymentEnabled && (
                <StatusCaption
                  label={paymentStatus === 'PENDING' ? 'Payment pending' : paymentStatus === 'PROCESSING' ? 'Payment processing' : 'Pay on quote'}
                  tone="accent"
                />
              )}
            </>
          )}
          {isFetching && (
            <span className="text-cb-caption normal-case tracking-normal text-gray-600">Refreshing…</span>
          )}
        </div>
      </div>

      <div className="space-y-4">
        <LineSection title="Hardware Assets" icon={Package} items={hardware} />
        <LineSection title="Recurring Software / SaaS" icon={RefreshCw} items={recurring} />
        <LineSection title="One-time Services" icon={Wrench} items={services} />
        {!hardware.length && !recurring.length && !services.length && (
          <p className="text-cb-caption normal-case tracking-normal text-gray-500">
            No line items on this quote yet.
          </p>
        )}
      </div>

      <div className="flex items-center justify-between pt-1 border-t border-cb-border">
        <span className="text-cb-caption uppercase text-gray-500">Quote total</span>
        <span className="font-display text-cb-title text-white tabular-nums">{formatMoney(data.amount)}</span>
      </div>

      {isPaid ? (
        <div className="flex items-center gap-2 rounded-cb border border-cb-border bg-cb-bg px-3 py-3">
          <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-cb-success/15">
            <Check className="w-4 h-4 text-cb-success" strokeWidth={2.5} />
          </span>
          <div>
            <p className="text-cb-body text-white font-medium">Payment received</p>
            <p className="text-cb-caption normal-case tracking-normal text-gray-500">
              We&apos;re provisioning your equipment and services. Underwriting status is separate and updates above.
            </p>
          </div>
        </div>
      ) : quoteUrl ? (
        <div className="space-y-2">
          <button
            type="button"
            onClick={openQuote}
            className="w-full inline-flex items-center justify-center gap-2 rounded-cb bg-cb-accent text-cb-bg font-semibold text-cb-body py-3 hover:opacity-95 transition-opacity"
          >
            Review, sign &amp; pay
            <ExternalLink className="w-4 h-4" />
          </button>
          <p className="text-center text-cb-caption normal-case tracking-normal text-gray-500">
            Opens your HubSpot quote{data.paymentEnabled ? ' (HubSpot Payments)' : ''} in a new tab.
            {' '}
            <a
              href={quoteUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-cb-accent hover:opacity-90 underline font-medium"
            >
              Open in new tab
            </a>
          </p>
        </div>
      ) : null}
    </div>
  );
}
