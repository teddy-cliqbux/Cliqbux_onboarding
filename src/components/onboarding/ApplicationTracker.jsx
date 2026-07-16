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
    <div className="rounded-cb border border-cb-border bg-cb-surface-raised">
      <div className="p-6">
        <div className="flex items-start">
          {STEPS.map((step, idx) => {
            const isComplete = idx < activeIdx;
            const isActive = idx === activeIdx;
            const isHoldStep = isActive && isHold;
            const Icon = step.icon;

            let circleClass = 'border border-cb-border text-gray-500 bg-cb-bg';
            if (isComplete) circleClass = 'bg-cb-accent text-cb-bg border border-cb-accent';
            else if (isHoldStep) circleClass = 'bg-cb-accent-muted text-cb-accent border border-cb-accent/60';
            else if (isActive) circleClass = 'bg-cb-accent-muted text-cb-accent border border-cb-accent/60';

            let labelClass = 'text-gray-600';
            if (isComplete) labelClass = 'text-gray-300';
            else if (isHoldStep) labelClass = 'text-cb-accent';
            else if (isActive) labelClass = 'text-white';

            return (
              <div key={step.key} className={cn('flex items-center', idx < STEPS.length - 1 && 'flex-1')}>
                <div className="flex flex-col items-center gap-1.5 w-24 text-center">
                  <div className={cn('w-10 h-10 rounded-full flex items-center justify-center shrink-0 transition-colors duration-300', circleClass)}>
                    {isComplete ? (
                      <Check className="w-5 h-5" strokeWidth={2.5} />
                    ) : isHoldStep ? (
                      <AlertTriangle className="w-5 h-5" strokeWidth={2.5} />
                    ) : (
                      <Icon className="w-5 h-5" strokeWidth={2} />
                    )}
                  </div>
                  <span className={cn('text-cb-caption normal-case tracking-normal', labelClass)}>{step.label}</span>
                  <span className="text-cb-caption normal-case tracking-normal font-normal text-gray-500 leading-tight">{step.description}</span>
                </div>
                {idx < STEPS.length - 1 && (
                  <div
                    className="h-px flex-1 mx-1 mb-8 transition-colors duration-500"
                    style={{ background: idx < activeIdx ? 'var(--cb-accent)' : 'var(--cb-border)' }}
                  />
                )}
              </div>
            );
          })}
        </div>

        {isHold && (
          <div className="mt-6 flex items-start gap-3 rounded-cb border border-cb-border border-l border-l-cb-accent bg-cb-bg px-4 py-3.5">
            <AlertTriangle className="h-4 w-4 text-cb-accent flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-cb-body font-medium text-white">Action Required</p>
              <p className="text-cb-body text-gray-400 mt-0.5">
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
