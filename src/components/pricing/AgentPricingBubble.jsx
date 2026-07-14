import { useEffect, useRef, useState } from 'react';
import { SlidersHorizontal, X } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { invokePortalFunction } from '@/lib/merchantAuthFetch';
import PricingEditorPanel from '@/components/pricing/PricingEditorPanel';

/**
 * Floating gold Agent Controller — impersonation sessions only.
 * Mount only when isImpersonating is true (Welcome Hub + onboarding steps).
 */
export default function AgentPricingBubble({ corporateId, onPricingApplied }) {
  const [open, setOpen] = useState(false);
  const [pricing, setPricing] = useState(null);
  const [loadError, setLoadError] = useState('');
  const panelRef = useRef(null);

  useEffect(() => {
    if (!open || !corporateId) return;
    let cancelled = false;
    (async () => {
      setLoadError('');
      try {
        const res = await invokePortalFunction('updatePricing', {
          action: 'get',
          corporateId,
        });
        if (cancelled) return;
        if (res.data?.error) throw new Error(res.data.error);
        setPricing(res.data?.pricing || null);
      } catch (err) {
        // Fallback: workspace invoke (admin preview without merchant JWT header path)
        try {
          const res = await base44.functions.invoke('updatePricing', { action: 'get', corporateId });
          if (cancelled) return;
          if (res.data?.error) throw new Error(res.data.error);
          setPricing(res.data?.pricing || null);
        } catch (e2) {
          if (!cancelled) setLoadError(e2.message || err.message || 'Could not load pricing');
        }
      }
    })();
    return () => { cancelled = true; };
  }, [open, corporateId]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target)) {
        // Don't close when clicking the bubble button itself — handled separately
        if (e.target.closest?.('[data-agent-pricing-bubble]')) return;
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const handleSave = async (payload) => {
    let res;
    try {
      res = await invokePortalFunction('updatePricing', { corporateId, ...payload });
    } catch {
      res = await base44.functions.invoke('updatePricing', { corporateId, ...payload });
    }
    if (res.data?.error) throw new Error(res.data.error);
    setPricing(res.data?.pricing || null);
    onPricingApplied?.(res.data);
  };

  return (
    <div className="fixed top-4 right-4 z-[80]" data-agent-pricing-bubble>
      <button
        type="button"
        aria-label="Agent pricing controller"
        onClick={() => setOpen(v => !v)}
        className="w-12 h-12 rounded-full bg-cb-accent text-cb-bg shadow-cb-overlay border border-yellow-400/60 flex items-center justify-center hover:scale-105 transition-transform duration-200"
      >
        {open ? <X className="w-5 h-5" /> : <SlidersHorizontal className="w-5 h-5" />}
      </button>

      {open && (
        <div
          ref={panelRef}
          className="absolute top-14 right-0 w-[min(100vw-2rem,22rem)] bg-cb-surface-raised border border-cb-border rounded-cb shadow-cb-overlay p-4"
        >
          <div className="mb-3">
            <p className="text-cb-caption uppercase text-cb-accent font-semibold tracking-wide">Co-Pilot Mode</p>
            <p className="text-cb-body font-semibold text-white">Live Negotiation</p>
            <p className="text-cb-caption text-gray-500 mt-0.5">Rates save to the live merchant profile and refresh MSP drafts.</p>
          </div>
          {loadError && <p className="text-cb-caption text-cb-danger mb-2">{loadError}</p>}
          <PricingEditorPanel
            compact
            initialPricing={pricing}
            saveLabel="Apply & Sync"
            onSave={handleSave}
          />
        </div>
      )}
    </div>
  );
}
