import { useEffect, useRef, useState } from 'react';
import { Bell } from 'lucide-react';
import { normalizeSignerLifecycle } from '@/lib/signerLifecycle';
import { needsKyc } from '@/lib/signerRules';

/**
 * Live activity strip for remote KYC progress.
 * Compares successive roster snapshots and surfaces opened / verified events.
 */
export default function KycActivityStrip({ signers = [], maxItems = 5 }) {
  const prevRef = useRef({});
  const [events, setEvents] = useState([]);

  useEffect(() => {
    const prev = prevRef.current;
    const next = {};
    const fresh = [];

    for (const s of signers || []) {
      if (!s?.id || !needsKyc(s)) continue;
      const lifecycle = normalizeSignerLifecycle(s.identityStatus);
      next[s.id] = lifecycle;
      const before = prev[s.id];
      if (!before) continue;
      const name = `${s.firstName || ''} ${s.lastName || ''}`.trim() || s.signerEmail || 'Someone';
      if (before !== 'opened' && lifecycle === 'opened') {
        fresh.push({ id: `${s.id}-opened-${Date.now()}`, text: `${name} opened their verification email` });
      }
      if (before !== 'verified' && before !== 'application signed' && (lifecycle === 'verified' || lifecycle === 'application signed')) {
        fresh.push({ id: `${s.id}-verified-${Date.now()}`, text: `${name} finished identity verification` });
      }
    }

    prevRef.current = next;
    if (fresh.length === 0) return;
    setEvents((ev) => [...fresh, ...ev].slice(0, maxItems));
  }, [signers, maxItems]);

  if (events.length === 0) return null;

  return (
    <div className="border border-cb-border rounded-cb bg-cb-surface-raised border-l-2 border-l-cb-accent px-5 py-3">
      <div className="flex items-center gap-2 mb-2">
        <Bell className="w-3.5 h-3.5 text-cb-accent" />
        <p className="text-cb-caption normal-case tracking-normal text-cb-accent font-medium">Remote activity</p>
      </div>
      <ul className="space-y-1.5">
        {events.map((e) => (
          <li key={e.id} className="text-cb-body text-gray-300">{e.text}</li>
        ))}
      </ul>
    </div>
  );
}
