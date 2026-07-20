import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Package, RefreshCw, Wrench, Check } from 'lucide-react';
import { invokePortalFunction } from '@/lib/merchantAuthFetch';
import QuoteSignModal from '@/components/onboarding/QuoteSignModal';

const STALE_MS = 10 * 60 * 1000; // 10 minutes when modal closed — parent polls at 10s while open

function formatMoney(n) {
  if (n == null || Number.isNaN(Number(n))) return '—';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(n));
}

function StatusCaption({ label, tone = 'neutral' }) {
  const dot =
    tone === 'success' ? 'bg-cb-success' :
    tone === 'accent' ? 'bg-cb-accent' :
    tone === 'amber' ? 'bg-amber-400' :
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
 * Equipment & Services invoice from getHubspotQuote.
 * Lifecycle: awaiting_signature → awaiting_payment → paid (Signed ≠ Paid).
 * Polling is owned by PostSubmissionDashboard (10s setInterval while modal open).
 */
export default function EquipmentOrderPanel({ corporateId, onModalOpenChange }) {
  const closedWonFired = useRef(false);
  const celebrateHandled = useRef(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState('sign'); // 'sign' | 'pay'
  const [celebrating, setCelebrating] = useState(false);

  const setModal = (open) => {
    setModalOpen(open);
    onModalOpenChange?.(open);
  };

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ['hubspotQuote', corporateId],
    queryFn: async () => {
      const res = await invokePortalFunction('getHubspotQuote', { corporateId });
      if (res.data?.error) throw new Error(res.data.error);
      return res.data;
    },
    enabled: !!corporateId,
    staleTime: STALE_MS,
    refetchOnWindowFocus: true,
    // Dashboard owns the 10s setInterval while modal is open
    refetchInterval: false,
  });

  const paymentStatus = String(data?.paymentStatus || '').toUpperCase();
  const esignStatus = String(data?.esignStatus || '').toUpperCase();
  const isPaid = data?.isPaid === true || paymentStatus === 'PAID' || !!data?.equipmentPaidAt;
  const isSigned =
    data?.isSigned === true ||
    esignStatus === 'SIGNED' ||
    !!data?.quoteSignedAt ||
    isPaid;
  const lifecycle =
    data?.quoteLifecycle ||
    (!isSigned ? 'awaiting_signature' : !isPaid ? 'awaiting_payment' : 'paid');
  const quoteUrl = data?.quoteUrl || '';
  const invoiceUrl = data?.invoiceUrl || quoteUrl;

  // Fire-and-forget closed_won once when HubSpot Payments reports PAID (replaces webhook).
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

  // Celebrate when the open modal's milestone is hit (data refreshed by parent poll)
  useEffect(() => {
    if (!modalOpen || celebrateHandled.current) return;
    const done =
      (modalMode === 'sign' && isSigned) ||
      (modalMode === 'pay' && isPaid);
    if (!done) return;
    celebrateHandled.current = true;
    setCelebrating(true);
    const t = setTimeout(() => {
      setModal(false);
      setCelebrating(false);
    }, 2000);
    return () => clearTimeout(t);
  }, [modalOpen, modalMode, isSigned, isPaid]);

  useEffect(() => {
    if (!modalOpen) {
      celebrateHandled.current = false;
      setCelebrating(false);
    }
  }, [modalOpen]);

  const openSign = () => {
    setModalMode('sign');
    setModal(true);
  };
  const openPay = () => {
    setModalMode('pay');
    setModal(true);
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
      <div className="bg-cb-surface-raised rounded-cb border border-cb-border border-l-2 border-l-cb-accent p-5 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-cb-caption uppercase text-gray-500 mb-1">Order</p>
            <h3 className="font-display text-cb-title text-white">Equipment quote coming</h3>
          </div>
          <StatusCaption label="Waiting on Cliqbux" tone="accent" />
        </div>
        <p className="text-cb-body text-gray-300">
          Your application is in. Your rep is attaching the equipment quote to this Merchant Center page —
          you do not need a separate HubSpot email to continue.
        </p>
        <p className="text-cb-caption normal-case tracking-normal font-normal text-gray-500">
          Stay here. When the quote is ready, you will sign it, then pay the invoice. Shipping unlocks after payment.
        </p>
        <button
          type="button"
          onClick={() => refetch()}
          className="text-cb-caption normal-case tracking-normal font-medium text-cb-accent underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cb-accent"
        >
          Check again
        </button>
      </div>
    );
  }

  const hardware = data.hardware || [];
  const recurring = data.recurring || [];
  const services = data.oneTimeServices || [];

  let badge = null;
  if (lifecycle === 'paid') {
    badge = <StatusCaption label="Paid — provisioning" tone="success" />;
  } else if (lifecycle === 'awaiting_payment') {
    badge = (
      <StatusCaption
        label={paymentStatus === 'PROCESSING' ? 'Payment processing' : 'Awaiting payment'}
        tone="amber"
      />
    );
  } else {
    badge = (
      <StatusCaption
        label={esignStatus === 'PENDING_SIGNATURE' ? 'Awaiting signature' : (esignStatus || 'Quote ready')}
        tone="accent"
      />
    );
  }

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
          {badge}
          {isFetching && modalOpen && (
            <span className="text-cb-caption normal-case tracking-normal text-gray-600">Checking status…</span>
          )}
        </div>
      </div>

      <div className="space-y-4">
        <LineSection title="Hardware Assets" icon={Package} items={hardware} />
        <LineSection title="Recurring Software / SaaS" icon={RefreshCw} items={recurring} />
        <LineSection title="One-time Services" icon={Wrench} items={services} />
        {!hardware.length && !recurring.length && !services.length && (
          data.lineItemsError ? (
            <div className="rounded-cb border border-cb-border border-l-2 border-l-cb-accent bg-cb-bg px-3 py-3 space-y-1.5">
              <p className="text-cb-body text-white font-medium">Line items unavailable</p>
              <p className="text-cb-caption normal-case tracking-normal text-gray-400">
                {data.lineItemsScopeHint ||
                  'Your HubSpot private app can read the quote, but not its line items yet.'}
              </p>
              <p className="text-cb-caption normal-case tracking-normal text-gray-500">
                You can still review and sign below. After the scope is added, hit Retry.
              </p>
              <button
                type="button"
                onClick={() => refetch()}
                className="text-cb-caption normal-case tracking-normal font-medium text-cb-accent hover:opacity-90 underline"
              >
                Retry
              </button>
            </div>
          ) : (
            <p className="text-cb-caption normal-case tracking-normal text-gray-500">
              No line items on this quote yet.
            </p>
          )
        )}
      </div>

      <div className="flex items-center justify-between pt-1 border-t border-cb-border">
        <span className="text-cb-caption uppercase text-gray-500">Quote total</span>
        <span className="font-display text-cb-title text-white tabular-nums">{formatMoney(data.amount)}</span>
      </div>

      {lifecycle === 'paid' ? (
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
      ) : lifecycle === 'awaiting_payment' ? (
        <div className="space-y-3">
          <div className="flex items-center gap-2 rounded-cb border border-cb-border bg-cb-bg px-3 py-3">
            <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-cb-success/15">
              <Check className="w-4 h-4 text-cb-success" strokeWidth={2.5} />
            </span>
            <div>
              <p className="text-cb-body text-white font-medium">Step 1 of 2 done — quote signed</p>
              <p className="text-cb-caption normal-case tracking-normal text-gray-500">
                Next: pay the invoice. Terminals ship only after payment clears.
              </p>
            </div>
          </div>
          {(invoiceUrl || quoteUrl) && (
            <div className="space-y-2">
              <button
                type="button"
                onClick={openPay}
                className="w-full inline-flex items-center justify-center gap-2 rounded-cb bg-cb-accent text-cb-bg font-semibold text-cb-body py-3 hover:opacity-95 transition-opacity focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
              >
                Step 2 — View invoice / Pay
              </button>
              <p className="text-center text-cb-caption normal-case tracking-normal text-gray-500">
                HubSpot Payments opens in a secure window on this page.
              </p>
            </div>
          )}
        </div>
      ) : quoteUrl ? (
        <div className="space-y-2">
          <p className="text-cb-caption normal-case tracking-normal text-gray-500">
            Step 1 of 2 — review the quote, then you will pay the invoice.
          </p>
          <button
            type="button"
            onClick={openSign}
            className="w-full inline-flex items-center justify-center gap-2 rounded-cb bg-cb-accent text-cb-bg font-semibold text-cb-body py-3 hover:opacity-95 transition-opacity focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          >
            Step 1 — Review &amp; sign quote
          </button>
          <p className="text-center text-cb-caption normal-case tracking-normal text-gray-500">
            Stays in the Merchant Center. No separate email link required.
          </p>
        </div>
      ) : null}

      <QuoteSignModal
        open={modalOpen}
        onOpenChange={setModal}
        quoteUrl={quoteUrl}
        invoiceUrl={invoiceUrl}
        mode={modalMode}
        amount={data.amount}
        title={data.title}
        paymentStatus={data.paymentStatus}
        celebrating={celebrating}
        celebrateLabel={modalMode === 'pay' ? 'Payment received' : 'Quote signed'}
      />
    </div>
  );
}
