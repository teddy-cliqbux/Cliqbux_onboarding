import { FileText, Send, Clock, AlertTriangle, CheckCircle2, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

// Mocked, self-contained step definitions — this component owns its own
// visual data and takes no external data source, so it's safe to render
// in isolation (Storybook, design review, etc.) with just a status string.
const STEPS = [
  { key: 'DRAFT', label: 'Application Started', description: 'Merchant details drafted', icon: FileText },
  { key: 'SUBMITTED', label: 'Submitted for Review', description: 'Sent to underwriting', icon: Send },
  { key: 'UNDERWRITING_HOLD', label: 'Underwriting', description: 'Risk & compliance review', icon: Clock },
  { key: 'APPROVED', label: 'Approved', description: 'Ready to board', icon: CheckCircle2 },
];

export default function ApplicationTracker({ currentStatus = 'DRAFT' }) {
  const activeIdx = Math.max(0, STEPS.findIndex((s) => s.key === currentStatus));
  const isHold = currentStatus === 'UNDERWRITING_HOLD';

  return (
    <div className="rounded-2xl border border-white/8 bg-white/[0.02]">
      <div className="p-6">
        <div className="flex items-start">
          {STEPS.map((step, idx) => {
            const isComplete = idx < activeIdx;
            const isActive = idx === activeIdx;
            const isHoldStep = isActive && isHold;
            const Icon = step.icon;

            let circleClass = 'border border-white/12 text-gray-500 bg-white/[0.03]';
            if (isComplete) circleClass = 'bg-amber-500 text-[#0E1319] border-amber-500 shadow-lg shadow-amber-500/20';
            else if (isHoldStep) circleClass = 'bg-amber-500/15 text-amber-400 border border-amber-500/60 ring-4 ring-amber-500/15';
            else if (isActive) circleClass = 'bg-amber-500/15 text-amber-400 border border-amber-500/60 ring-4 ring-amber-500/15';

            let labelClass = 'text-gray-600';
            if (isComplete) labelClass = 'text-amber-400';
            else if (isHoldStep) labelClass = 'text-amber-400';
            else if (isActive) labelClass = 'text-white';

            return (
              <div key={step.key} className={cn('flex items-center', idx < STEPS.length - 1 && 'flex-1')}>
                <div className="flex flex-col items-center gap-1.5 w-24 text-center">
                  <div className={cn('w-10 h-10 rounded-full flex items-center justify-center shrink-0 transition-all duration-300', circleClass)}>
                    {isComplete ? (
                      <Check className="w-5 h-5" strokeWidth={2.5} />
                    ) : isHoldStep ? (
                      <AlertTriangle className="w-5 h-5" strokeWidth={2.5} />
                    ) : (
                      <Icon className="w-5 h-5" strokeWidth={2} />
                    )}
                  </div>
                  <span className={cn('text-xs font-semibold', labelClass)}>{step.label}</span>
                  <span className="text-[11px] text-gray-500 leading-tight">{step.description}</span>
                </div>
                {idx < STEPS.length - 1 && (
                  <div
                    className="h-0.5 flex-1 mx-1 mb-8 rounded-full transition-colors duration-500"
                    style={{ background: idx < activeIdx ? '#F0AD4E' : 'rgba(255,255,255,0.08)' }}
                  />
                )}
              </div>
            );
          })}
        </div>

        {isHold && (
          <div className="mt-6 flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3.5">
            <AlertTriangle className="h-4 w-4 text-amber-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-bold text-amber-300">Action Required</p>
              <p className="text-xs text-amber-200/80 mt-0.5">
                Underwriting has placed this application on hold. Please review the outstanding
                items and respond so processing can continue.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
